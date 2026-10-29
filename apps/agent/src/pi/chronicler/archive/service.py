from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Protocol

from pi.chronicler.archive.index import Embedder, Passage, RetrievedPassage, Store
from pi.chronicler.archive.rerank import RerankScore
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import canonical_route_for
from pi.chronicler.qa.source import projection_digest

_PDF_PAGE_SLUG_RE = re.compile(r"^(?P<prefix>.+-pdf-page-)(?P<page>\d+)$")


class CurrentSource(Protocol):
    async def documents(
        self, document_ids: Sequence[str]
    ) -> tuple[PublicDocument, ...]: ...


class Reranker(Protocol):
    async def rerank(
        self, query: str, documents: Sequence[str], limit: int
    ) -> tuple[RerankScore, ...]: ...


class ArchiveService:
    def __init__(
        self,
        source: CurrentSource,
        embedder: Embedder,
        store: Store,
        public_site_url: str,
        embedding_contract: str,
        reranker: Reranker | None = None,
        candidate_limit: int = 24,
        result_limit: int = 12,
    ) -> None:
        if candidate_limit < result_limit or result_limit <= 0:
            raise ValueError("candidate_limit must cover a positive result_limit")
        self._source = source
        self._embedder = embedder
        self._store = store
        self._public_site_url = public_site_url
        self._embedding_contract = embedding_contract
        self._reranker = reranker
        self._candidate_limit = candidate_limit
        self._result_limit = result_limit

    async def search_documents(self, query: str) -> dict[str, object]:
        clean_query = " ".join(query.split())
        if not clean_query or len(clean_query) > 600:
            raise ValueError("query must contain 1 to 600 characters")
        vector = await self._embedder.embed_query(clean_query)
        candidates = await self._store.search(
            clean_query, vector, self._candidate_limit
        )
        current = await self._current_versions(
            tuple(dict.fromkeys(item.passage.document_id for item in candidates))
        )
        eligible: list[tuple[RetrievedPassage, tuple[PublicDocument, str, str]]] = []
        for candidate in candidates:
            passage = candidate.passage
            document = current.get(passage.document_id)
            if (
                document is None
                or passage.embedding_contract != self._embedding_contract
                or passage.content_version != document[1]
            ):
                continue
            eligible.append((candidate, document))

        ranked: list[
            tuple[
                RetrievedPassage,
                tuple[PublicDocument, str, str],
                float | None,
            ]
        ]
        if self._reranker is not None and eligible:
            scores = await self._reranker.rerank(
                clean_query,
                [item[0].passage.rerank_text for item in eligible],
                len(eligible),
            )
            ranked = [(*eligible[score.index], score.score) for score in scores]
        else:
            ranked = [(*item, None) for item in eligible]

        hits: list[dict[str, object]] = []
        for candidate, item, rerank_score in ranked:
            passage = candidate.passage
            document, version, url = item
            hits.append(
                _search_hit(
                    document,
                    passage,
                    version,
                    url,
                    output_rank=len(hits) + 1,
                    hybrid=candidate,
                    rerank_score=rerank_score,
                )
            )
            if len(hits) == self._result_limit:
                break
        return {"hits": hits}

    async def read_document(
        self, document_id: str, passage_id: str | None = None
    ) -> dict[str, object]:
        current = await self._current_versions((document_id,))
        item = current.get(document_id)
        if item is None:
            return {"unavailable": True}
        document, version, url = item
        result: dict[str, object] = {
            "document_id": document.document_id,
            "title": document.title,
            "public_text": document.public_body,
            "url": url,
            "content_version": version,
            "document": _document_envelope(document, version, url),
        }
        if passage_id is not None:
            passages = sorted(
                (
                    p
                    for p in await self._store.document_passages(document_id)
                    if p.content_version == version
                    and p.embedding_contract == self._embedding_contract
                ),
                key=lambda p: p.ordinal,
            )
            match = next(
                (i for i, p in enumerate(passages) if p.passage_id == passage_id), None
            )
            if match is None:
                return {"unavailable": True}
            # Include two passages on each side. Table headers and the requested
            # row often straddle four 256-token chunks after PDF extraction; a
            # one-neighbor window can expose the header but silently omit the row.
            neighbors = passages[max(0, match - 2) : match + 3]
            result.update(
                public_text="\n\n".join(p.excerpt for p in neighbors),
                passage_id=passage_id,
                included_passage_ids=[p.passage_id for p in neighbors],
                # `public_text` is the sole evidence-text copy. Passage envelopes
                # retain boundaries and identity without doubling the model prompt.
                passages=[_passage_envelope(p, include_text=False) for p in neighbors],
                scope="passage",
            )
            continuation = await self._next_page_continuation(document, passages, match)
            if continuation is not None:
                result["continuations"] = [continuation]
        return result

    async def _next_page_continuation(
        self,
        document: PublicDocument,
        passages: Sequence[Passage],
        match: int,
    ) -> dict[str, object] | None:
        """Attach one revalidated next PDF page when a focused read hits page end."""

        if match != len(passages) - 1:
            return None
        slug_match = _PDF_PAGE_SLUG_RE.fullmatch(document.slug)
        if slug_match is None:
            return None
        page = slug_match.group("page")
        next_slug = slug_match.group("prefix") + str(int(page) + 1).zfill(len(page))
        candidates = tuple(
            passage
            for passage in await self._store.slug_passages(next_slug)
            if passage.embedding_contract == self._embedding_contract
            and passage.authority == document.authority
            and passage.edition == document.edition
            and passage.source_version == document.source_version
            and passage.language == document.language
        )
        document_ids = tuple(
            dict.fromkeys(passage.document_id for passage in candidates)
        )
        if len(document_ids) != 1:
            return None
        current = await self._current_versions(document_ids)
        item = current.get(document_ids[0])
        if item is None:
            return None
        next_document, version, url = item
        current_passages = sorted(
            (passage for passage in candidates if passage.content_version == version),
            key=lambda passage: passage.ordinal,
        )
        if not current_passages:
            return None
        first = current_passages[0]
        return {
            "relation": "next_source_page",
            "document_id": next_document.document_id,
            "title": next_document.title,
            "public_text": first.excerpt,
            "url": url,
            "content_version": version,
            "passage_id": first.passage_id,
            "document": _document_envelope(next_document, version, url),
            "passage": _passage_envelope(first, include_text=False),
        }

    async def read_document_by_url(self, url: str) -> dict[str, object]:
        """Resolve one exact indexed canonical URL without dereferencing it."""

        clean_url = url.strip()
        if not clean_url or len(clean_url) > 1_000 or clean_url != url:
            return {"unavailable": True}
        candidates = tuple(
            passage
            for passage in await self._store.url_passages(clean_url)
            if passage.embedding_contract == self._embedding_contract
        )
        document_ids = tuple(
            dict.fromkeys(passage.document_id for passage in candidates)
        )
        if len(document_ids) != 1:
            return {"unavailable": True}
        current = await self._current_versions(document_ids)
        item = current.get(document_ids[0])
        if item is None:
            return {"unavailable": True}
        _, version, canonical_url = item
        if canonical_url != clean_url or not any(
            passage.content_version == version for passage in candidates
        ):
            return {"unavailable": True}
        return await self.read_document(document_ids[0])

    async def _current_versions(
        self, document_ids: Sequence[str]
    ) -> dict[str, tuple[PublicDocument, str, str]]:
        documents = await self._source.documents(document_ids)
        current: dict[str, tuple[PublicDocument, str, str]] = {}
        for document in documents:
            route = canonical_route_for(document, public_origin=self._public_site_url)
            if route is not None:
                current[document.document_id] = (
                    document,
                    projection_digest(document, route),
                    route.url,
                )
        return current


def _document_envelope(
    document: PublicDocument, content_version: str, url: str
) -> dict[str, object]:
    return {
        "document_id": document.document_id,
        "title": document.title,
        "kind": document.kind,
        "category": document.category,
        "slug": document.slug,
        "url": url,
        "content_version": content_version,
        "authority": document.authority,
        "edition": document.edition,
        "source_version": document.source_version,
        "locator": document.locator,
        "language": document.language,
    }


def _passage_envelope(
    passage: Passage, *, include_text: bool = True
) -> dict[str, object]:
    envelope: dict[str, object] = {
        "passage_id": passage.passage_id,
        "ordinal": passage.ordinal,
        "heading_path": list(passage.heading_path),
    }
    if include_text:
        envelope["text"] = passage.excerpt
    return envelope


def _search_hit(
    document: PublicDocument,
    passage: Passage,
    content_version: str,
    url: str,
    *,
    output_rank: int,
    hybrid: RetrievedPassage,
    rerank_score: float | None,
) -> dict[str, object]:
    strategy = "hybrid_rrf_cross_encoder" if rerank_score is not None else "hybrid_rrf"
    return {
        # Keep the flat discovery keys for the existing Agent tool contract.
        "document_id": passage.document_id,
        "title": passage.title,
        "passage_id": passage.passage_id,
        "excerpt": passage.excerpt,
        "url": url,
        "content_version": content_version,
        # The structured envelopes prevent a passage from losing document identity.
        "document": _document_envelope(document, content_version, url),
        # `excerpt` is the sole text copy in discovery results. The nested envelope
        # preserves document/passage identity without doubling prompt payload.
        "passage": _passage_envelope(passage, include_text=False),
        "retrieval": {
            "strategy": strategy,
            "rank": output_rank,
            "hybrid_rank": hybrid.rank,
            "hybrid_score": hybrid.relevance_score,
            "vector_distance": hybrid.vector_distance,
            "lexical_score": hybrid.lexical_score,
            "rerank_score": rerank_score,
        },
    }
