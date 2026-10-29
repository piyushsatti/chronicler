"""Anonymous GraphQL source for an isolated Q&A read model.

Only the public ``documents``/``documentById`` projections are consumed.  The
adapter has no credential option by design, so the isolated service cannot
accidentally gain production database or authenticated-document access.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import cast
from urllib.parse import urlsplit

import httpx

from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import is_eligible_public_document

_FIELDS = """
id slug kind category status visibility title updatedAt frontmatter effectiveBody
"""
_MAX_RESPONSE_BYTES = 8 * 1024 * 1024
# A 256 KiB accepted body can expand to six JSON bytes per input byte when it
# consists entirely of escaped control characters. Four bodies stay below the
# 8 MiB transport ceiling with room for the GraphQL envelope and metadata.
_MAX_PAGE_SIZE = 4
# The public directory's historical ordering is not stable when many rows share
# one updatedAt value. Request the complete bounded ID directory in one page so
# an offset boundary cannot repeat one ID while omitting another. The second
# snapshot below still detects membership changes during the scan.
_SNAPSHOT_PAGE_SIZE = 1_000
_SNAPSHOT_QUERY = """
query PublicQaDocumentIds($kind: String!, $limit: Int!, $offset: Int!) {
  documents(filters: {kind: $kind, status: "published", visibility: "public"},
            limit: $limit, offset: $offset) {
    total
    items { id updatedAt }
  }
}
"""


class PublicSourceError(RuntimeError):
    """The anonymous canonical source could not be safely projected."""


def _text(mapping: Mapping[str, object], key: str) -> str | None:
    value = mapping.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _nested_text(mapping: Mapping[str, object], group: str, key: str) -> str | None:
    nested = mapping.get(group)
    if not isinstance(nested, dict):
        return None
    value = cast("Mapping[str, object]", nested).get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, int):
        return str(value)
    return None


def _project(raw: object) -> PublicDocument | None:
    if not isinstance(raw, dict):
        raise PublicSourceError("document projection was not an object")
    item = cast("Mapping[str, object]", raw)
    if item.get("status") != "published" or item.get("visibility") != "public":
        return None
    body = item.get("effectiveBody")
    frontmatter_raw = item.get("frontmatter")
    if not isinstance(body, str) or not isinstance(frontmatter_raw, dict):
        return None
    frontmatter = cast("Mapping[str, object]", frontmatter_raw)
    required = {key: item.get(key) for key in ("id", "kind", "slug", "title")}
    if any(not isinstance(value, str) for value in required.values()):
        raise PublicSourceError("document projection omitted a required field")
    raw_category = item.get("category")
    category = raw_category if isinstance(raw_category, str) else None
    document = PublicDocument(
        document_id=cast("str", required["id"]),
        kind=cast("str", required["kind"]),
        category=category,
        slug=cast("str", required["slug"]),
        title=cast("str", required["title"]),
        public_body=body,
        authority=(
            _text(frontmatter, "authority")
            or _nested_text(frontmatter, "source", "publisher")
            or _nested_text(frontmatter, "source", "title")
        ),
        edition=_text(frontmatter, "edition"),
        source_version=(
            _text(frontmatter, "source_version")
            or _text(frontmatter, "version")
            or _nested_text(frontmatter, "source", "version")
        ),
        locator=(
            _text(frontmatter, "locator")
            or _text(frontmatter, "page")
            or _nested_text(frontmatter, "source", "page")
            or _nested_text(frontmatter, "page_locator", "display")
        ),
        language=_text(frontmatter, "language") or "en",
    )
    return document if is_eligible_public_document(document) else None


class AnonymousGraphqlSource:
    """Bounded anonymous reader for the canonical public GraphQL surface."""

    def __init__(
        self,
        url: str,
        *,
        timeout_seconds: float = 8.0,
        page_size: int = _MAX_PAGE_SIZE,
        snapshot_page_size: int = _SNAPSHOT_PAGE_SIZE,
        max_documents: int = 1_000,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        parsed = urlsplit(url)
        local_http = parsed.scheme == "http" and parsed.hostname in {
            "localhost",
            "127.0.0.1",
            "::1",
            "host.docker.internal",
        }
        if (
            (parsed.scheme != "https" and not local_http)
            or not parsed.hostname
            or parsed.port == 0
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"/v1/graphql", "/graphql"}
            or "?" in url
            or "#" in url
            or "\\" in url
            or any(
                character.isspace() or ord(character) < 32 or ord(character) == 127
                for character in url
            )
        ):
            raise ValueError(
                "public GraphQL source must be an anonymous HTTPS /graphql URL"
            )
        if (
            not 1 <= page_size <= _MAX_PAGE_SIZE
            or not 1 <= snapshot_page_size <= _SNAPSHOT_PAGE_SIZE
            or max_documents < max(page_size, snapshot_page_size)
        ):
            raise ValueError("invalid public GraphQL pagination bounds")
        self.url = url
        self.page_size = page_size
        self.snapshot_page_size = snapshot_page_size
        self.max_documents = max_documents
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=False,
            headers={"user-agent": "chronicler-qa-index/1"},
        )

    async def _query(
        self, query: str, variables: Mapping[str, object]
    ) -> Mapping[str, object]:
        try:
            async with self.client.stream(
                "POST",
                self.url,
                json={"query": query, "variables": dict(variables)},
                follow_redirects=False,
            ) as response:
                response.raise_for_status()
                declared_size = response.headers.get("content-length")
                if (
                    declared_size is not None
                    and int(declared_size) > _MAX_RESPONSE_BYTES
                ):
                    raise PublicSourceError(
                        "anonymous public source response too large"
                    )
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > _MAX_RESPONSE_BYTES:
                        raise PublicSourceError(
                            "anonymous public source response too large"
                        )
            raw_payload: object = json.loads(body)
        except (httpx.HTTPError, ValueError) as exc:
            raise PublicSourceError("anonymous public source request failed") from exc
        if not isinstance(raw_payload, dict):
            raise PublicSourceError("anonymous public source rejected the query")
        payload = cast("Mapping[str, object]", raw_payload)
        if payload.get("errors"):
            raise PublicSourceError("anonymous public source rejected the query")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise PublicSourceError("anonymous public source omitted data")
        return cast("Mapping[str, object]", data)

    async def _snapshot_ids(self, kind: str) -> tuple[str, ...]:
        offset = 0
        total: int | None = None
        identifiers: list[str] = []
        while total is None or offset < total:
            data = await self._query(
                _SNAPSHOT_QUERY,
                {
                    "kind": kind,
                    "limit": self.snapshot_page_size,
                    "offset": offset,
                },
            )
            directory = data.get("documents")
            if not isinstance(directory, dict):
                raise PublicSourceError("documents result was malformed")
            result = cast("Mapping[str, object]", directory)
            raw_total = result.get("total")
            raw_items = result.get("items")
            if (
                not isinstance(raw_total, int)
                or isinstance(raw_total, bool)
                or raw_total < 0
                or not isinstance(raw_items, list)
            ):
                raise PublicSourceError("documents page was malformed")
            items = cast("list[object]", raw_items)
            if total is None:
                total = raw_total
            elif raw_total != total:
                raise PublicSourceError("documents total changed during snapshot")
            if (
                total > self.max_documents
                or len(items) > self.snapshot_page_size
                or offset + len(items) > total
            ):
                raise PublicSourceError("public document ceiling exceeded")
            if not items and offset < total:
                raise PublicSourceError("documents scan ended before reported total")
            for raw in items:
                if not isinstance(raw, dict):
                    raise PublicSourceError(
                        "document snapshot omitted a required field"
                    )
                item = cast("Mapping[str, object]", raw)
                if not isinstance(item.get("id"), str):
                    raise PublicSourceError(
                        "document snapshot omitted a required field"
                    )
                identifiers.append(cast("str", item["id"]))
            offset += len(items)
        if len(set(identifiers)) != len(identifiers):
            raise PublicSourceError("document snapshot repeated an ID")
        # GraphQL may return an equivalent set in a different order while rows
        # share the same sort key. Membership, not presentation order, defines
        # the snapshot used for exact-ID revalidation.
        return tuple(sorted(identifiers))

    async def iter_public_documents(self) -> AsyncIterator[PublicDocument]:
        observed = 0
        seen_ids: set[str] = set()
        for kind in ("rule", "codex_entry"):
            first_snapshot = await self._snapshot_ids(kind)
            stable_snapshot = await self._snapshot_ids(kind)
            if stable_snapshot != first_snapshot:
                raise PublicSourceError("documents changed during snapshot")
            if observed + len(stable_snapshot) > self.max_documents:
                raise PublicSourceError("public document ceiling exceeded")
            observed += len(stable_snapshot)
            for start in range(0, len(stable_snapshot), self.page_size):
                batch = stable_snapshot[start : start + self.page_size]
                present, admitted = await self._fetch_projections(batch)
                if present != set(batch):
                    raise PublicSourceError("documents changed after snapshot")
                for document_id in batch:
                    if document_id in seen_ids:
                        raise PublicSourceError("documents scan repeated an ID")
                    seen_ids.add(document_id)
                    projection = admitted.get(document_id)
                    if projection is not None:
                        yield projection

    async def _fetch_projections(
        self, expected_document_ids: Sequence[str]
    ) -> tuple[set[str], dict[str, PublicDocument]]:
        ids = tuple(dict.fromkeys(expected_document_ids))
        if not ids:
            return set(), {}
        if len(ids) > 12:
            raise PublicSourceError("revalidation candidate ceiling exceeded")
        declarations = ", ".join(f"$id{index}: ID!" for index in range(len(ids)))
        selections = "\n".join(
            f"d{index}: documentById(id: $id{index}) {{ {_FIELDS} }}"
            for index in range(len(ids))
        )
        query = f"query PublicQaRevalidate({declarations}) {{\n{selections}\n}}"
        data = await self._query(
            query, {f"id{index}": value for index, value in enumerate(ids)}
        )
        present: set[str] = set()
        admitted: dict[str, PublicDocument] = {}
        for index, expected_id in enumerate(ids):
            raw = data.get(f"d{index}")
            if raw is None:
                continue
            if not isinstance(raw, dict):
                raise PublicSourceError("revalidation returned an unexpected document")
            item = cast("Mapping[str, object]", raw)
            if item.get("id") != expected_id:
                raise PublicSourceError("revalidation returned an unexpected document")
            present.add(expected_id)
            projection = _project(item)
            if projection is not None and projection.document_id == expected_id:
                admitted[expected_id] = projection
        return present, admitted

    async def revalidate_projections(
        self, expected_document_ids: Sequence[str]
    ) -> dict[str, PublicDocument]:
        _present, admitted = await self._fetch_projections(expected_document_ids)
        return admitted

    async def aclose(self) -> None:
        if self._owns_client:
            await self.client.aclose()

    async def __aenter__(self) -> AnonymousGraphqlSource:
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()


__all__ = ["AnonymousGraphqlSource", "PublicSourceError"]
