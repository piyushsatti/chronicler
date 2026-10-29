"""Anonymous GraphQL revalidation for the Archive read model.

Only the public ``documentById`` projection is consumed. The
adapter has no credential option by design, so the isolated service cannot
accidentally gain production database or authenticated-document access.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import cast
from urllib.parse import urlsplit

import httpx

from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import is_eligible_public_document

_FIELDS = """
id slug kind category status visibility title updatedAt frontmatter effectiveBody
"""
_MAX_RESPONSE_BYTES = 8 * 1024 * 1024


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
        self.url = url
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

    async def revalidate_projections(
        self, expected_document_ids: Sequence[str]
    ) -> dict[str, PublicDocument]:
        ids = tuple(dict.fromkeys(expected_document_ids))
        if not ids:
            return {}
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
            projection = _project(item)
            if projection is not None and projection.document_id == expected_id:
                admitted[expected_id] = projection
        return admitted

    async def aclose(self) -> None:
        if self._owns_client:
            await self.client.aclose()

    async def __aenter__(self) -> AnonymousGraphqlSource:
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()


__all__ = ["AnonymousGraphqlSource", "PublicSourceError"]
