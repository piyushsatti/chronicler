"""Pure lexical, hybrid-rank, route, and citation primitives for Q&A."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Final, cast
from urllib.parse import quote, urlsplit

from pi.chronicler.qa.contracts import (
    CanonicalRoute,
    DocumentChunk,
    FusedChunk,
    GroundedAnswer,
    PublicDocument,
    RankedChunk,
    SourceCitation,
)

ELIGIBLE_KINDS: Final[frozenset[str]] = frozenset({"rule", "codex_entry"})
# Isolated-corpus calibration on 2026-09-13 placed the accepted semantic-only
# Dwendalian probe at 0.7318, the observed Nightshore lookalike at 0.6704, and
# unrelated controls at or below 0.5740. Lexical and exact-title paths remain
# independent of this semantic admission boundary.
MIN_SEMANTIC_SCORE: Final[float] = 0.68
RULE_ROUTE_CATEGORIES: Final[frozenset[str | None]] = frozenset({None, "ruling"})
CODEX_ROUTE_CATEGORIES: Final[frozenset[str]] = frozenset(
    {"artifact", "world_event", "lore", "npc", "faction"}
)
CODEX_ROUTE_SEGMENTS: Final[Mapping[str, str]] = {
    "artifact": "artifact",
    "world_event": "event",
    "lore": "lore",
    "npc": "npc",
    "faction": "faction",
}
CODEX_ID_ROUTE_CATEGORIES: Final[frozenset[str]] = frozenset({"world_event", "lore"})

_TOKEN_RE: Final = re.compile(r"[^\W_]+", re.UNICODE)
_CITATION_RE: Final = re.compile(r"\[(?:cite|citation):([^\]]+)\]")
_STOPWORDS: Final[frozenset[str]] = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "be",
        "by",
        "for",
        "from",
        "how",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "the",
        "to",
        "what",
        "when",
        "where",
        "which",
        "with",
    }
)


class CitationValidationError(ValueError):
    """Raised when generated text cites unsupported or fabricated evidence."""


class RetrievalInputError(ValueError):
    """Raised when a retrieval bound or score input is invalid."""


@dataclass(frozen=True, slots=True)
class _Scored:
    chunk: DocumentChunk
    score: float


def _route_path(document: PublicDocument) -> str | None:
    if document.kind == "rule":
        if document.category not in RULE_ROUTE_CATEGORIES:
            return None
        segment = "rulings" if document.category == "ruling" else "guides"
        return f"/rules/{segment}/{quote(document.slug, safe='')}"
    if document.kind == "codex_entry" and document.category in CODEX_ROUTE_CATEGORIES:
        segment = CODEX_ROUTE_SEGMENTS[document.category]
        identifier = (
            document.document_id
            if document.category in CODEX_ID_ROUTE_CATEGORIES
            else document.slug
        )
        return f"/codex/{segment}/{quote(identifier, safe='')}"
    return None


def _origin_url(public_origin: str, path: str) -> str:
    origin = public_origin.strip()
    if not origin:
        return path
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("public_origin must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("public_origin must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("public_origin must not contain query or fragment")
    return origin.rstrip("/") + path


def canonical_route_for(
    document: PublicDocument, *, public_origin: str = ""
) -> CanonicalRoute | None:
    """Build a route only for the backend's supported public kind/category map.

    The slug is encoded here, while an answer model never receives authority to
    supply either a URL or a route segment. Unsupported Codex taxonomy paths
    intentionally return ``None`` until a real public detail route exists.
    """

    path = _route_path(document)
    if path is None:
        return None
    return CanonicalRoute(
        document_id=document.document_id,
        kind=document.kind,
        category=document.category,
        slug=document.slug,
        path=path,
        url=_origin_url(public_origin, path),
    )


def is_eligible_public_document(document: PublicDocument) -> bool:
    """Return whether a supplied anonymous projection is indexable in this slice."""

    return canonical_route_for(document) is not None and bool(
        document.public_body.strip()
    )


def build_canonical_routes(
    documents: Iterable[PublicDocument], *, public_origin: str = ""
) -> tuple[CanonicalRoute, ...]:
    """Return stable route metadata for supported documents only."""

    routes = [
        route
        for document in documents
        if is_eligible_public_document(document)
        and (route := canonical_route_for(document, public_origin=public_origin))
        is not None
    ]
    return tuple(
        sorted(
            routes,
            key=lambda route: (
                route.kind,
                route.category or "",
                route.slug,
                route.document_id,
            ),
        )
    )


def citation_ids_from_text(text: str) -> tuple[str, ...]:
    """Extract only the explicit ``[cite:ID]`` / ``[citation:ID]`` syntax."""

    return tuple(
        match.group(1).strip()
        for match in _CITATION_RE.finditer(text)
        if match.group(1).strip()
    )


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(token.casefold() for token in _TOKEN_RE.findall(value))


def _stem(token: str) -> str:
    """Small deterministic suffix normalizer, not a language model or thesaurus."""

    if len(token) > 7 and token.endswith("ies"):
        return token[:-3] + "y"
    for suffix in (
        "ingly",
        "edly",
        "ation",
        "ments",
        "ment",
        "ing",
        "ers",
        "ed",
        "es",
        "s",
    ):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _trigram_similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    if len(left) < 4 or len(right) < 4:
        return SequenceMatcher(None, left, right).ratio()
    left_grams = {left[index : index + 3] for index in range(len(left) - 2)}
    right_grams = {right[index : index + 3] for index in range(len(right) - 2)}
    union = left_grams | right_grams
    return len(left_grams & right_grams) / len(union) if union else 0.0


def _lexical_score(query: str, chunk: DocumentChunk) -> float:
    query_tokens = tuple(
        _stem(token) for token in _tokens(query) if token not in _STOPWORDS
    )
    if not query_tokens:
        return 0.0

    title_tokens = tuple(_stem(token) for token in _tokens(chunk.title))
    heading_tokens = tuple(
        _stem(token) for token in _tokens(" ".join(chunk.heading_path))
    )
    body_tokens = tuple(_stem(token) for token in _tokens(chunk.text))
    all_tokens = title_tokens + heading_tokens + body_tokens
    if not all_tokens:
        return 0.0

    score = 0.0
    for query_token in query_tokens:
        title_count = title_tokens.count(query_token)
        heading_count = heading_tokens.count(query_token)
        body_count = body_tokens.count(query_token)
        score += 3.0 * title_count + 2.0 * heading_count + float(body_count)
        if title_count + heading_count + body_count:
            continue
        # A restrained character-level allowance keeps related inflections
        # useful while avoiding any claim of semantic understanding.
        best_similarity = max(
            (_trigram_similarity(query_token, token) for token in all_tokens),
            default=0.0,
        )
        if best_similarity >= 0.55:
            score += best_similarity * 0.35

    query_phrase = " ".join(_tokens(query))
    searchable = " ".join(_tokens(chunk.title + " " + chunk.text))
    if query_phrase and query_phrase in searchable:
        score += 1.5
    return score


def _rank(scored: Iterable[_Scored], limit: int) -> tuple[RankedChunk, ...]:
    if limit <= 0:
        raise RetrievalInputError("limit must be positive")
    ordered = sorted(
        (item for item in scored if math.isfinite(item.score) and item.score > 0),
        key=lambda item: (-item.score, item.chunk.chunk_id),
    )[:limit]
    return tuple(
        RankedChunk(chunk=item.chunk, score=item.score, rank=index)
        for index, item in enumerate(ordered, start=1)
    )


def lexical_search(
    query: str, chunks: Sequence[DocumentChunk], *, limit: int = 8
) -> tuple[RankedChunk, ...]:
    """Rank chunks using deterministic title/heading/body lexical evidence."""

    return _rank(
        (_Scored(chunk=chunk, score=_lexical_score(query, chunk)) for chunk in chunks),
        limit,
    )


def rank_by_scores(
    chunks: Sequence[DocumentChunk],
    scores: Mapping[str, float],
    *,
    limit: int = 8,
) -> tuple[RankedChunk, ...]:
    """Turn externally computed (e.g. embedding) scores into stable ranks."""

    return _rank(
        (
            _Scored(chunk=chunk, score=scores.get(chunk.chunk_id, 0.0))
            for chunk in chunks
            if semantic_score_is_relevant(scores.get(chunk.chunk_id, 0.0))
        ),
        limit,
    )


def semantic_score_is_relevant(score: float) -> bool:
    """Apply the calibrated cosine-similarity admission boundary."""

    return math.isfinite(score) and score >= MIN_SEMANTIC_SCORE


def reciprocal_rank_fusion(
    lexical: Sequence[RankedChunk],
    semantic: Sequence[RankedChunk],
    *,
    k: int = 60,
    limit: int = 8,
) -> tuple[FusedChunk, ...]:
    """Fuse two ranked lists with deterministic reciprocal-rank scores."""

    if k <= 0:
        raise RetrievalInputError("k must be positive")
    if limit <= 0:
        raise RetrievalInputError("limit must be positive")

    entries: dict[str, tuple[DocumentChunk, float, float, float]] = {}
    for channel_index, channel in enumerate((lexical, semantic)):
        for position, hit in enumerate(channel, start=1):
            old = entries.get(hit.chunk.chunk_id)
            lexical_score = old[1] if old is not None else 0.0
            semantic_score = old[2] if old is not None else 0.0
            fused_score = old[3] if old is not None else 0.0
            if channel_index == 0:
                lexical_score = hit.score
            else:
                semantic_score = hit.score
            entries[hit.chunk.chunk_id] = (
                hit.chunk,
                lexical_score,
                semantic_score,
                fused_score + 1.0 / (k + position),
            )

    ordered = sorted(entries.values(), key=lambda item: (-item[3], item[0].chunk_id))[
        :limit
    ]
    return tuple(
        FusedChunk(
            chunk=item[0],
            score=item[3],
            rank=index,
            lexical_score=item[1],
            semantic_score=item[2],
        )
        for index, item in enumerate(ordered, start=1)
    )


def _chunk_from_evidence(
    evidence: DocumentChunk | RankedChunk | FusedChunk,
) -> DocumentChunk:
    if isinstance(evidence, DocumentChunk):
        return evidence
    return evidence.chunk


def _route_map(
    routes: Mapping[str, CanonicalRoute] | Iterable[CanonicalRoute],
) -> dict[str, CanonicalRoute]:
    if isinstance(routes, Mapping):
        mapping = cast("Mapping[str, CanonicalRoute]", routes)
        return dict(mapping)
    return {route.document_id: route for route in routes}


def build_source_only_citations(
    evidence: Sequence[DocumentChunk | RankedChunk | FusedChunk],
    routes: Mapping[str, CanonicalRoute] | Iterable[CanonicalRoute],
    *,
    max_citations: int = 3,
) -> tuple[SourceCitation, ...]:
    """Select at most one trusted citation per source for honest fallback."""

    if max_citations <= 0:
        raise CitationValidationError("max_citations must be positive")
    route_by_source = _route_map(routes)
    selected: list[SourceCitation] = []
    seen_sources: set[str] = set()
    for item in evidence:
        chunk = _chunk_from_evidence(item)
        if chunk.source_id in seen_sources:
            continue
        route = route_by_source.get(chunk.source_id)
        if route is None:
            continue
        seen_sources.add(chunk.source_id)
        selected.append(
            SourceCitation(
                chunk_id=chunk.chunk_id,
                source_id=chunk.source_id,
                title=chunk.title,
                url=route.url,
                authority=chunk.authority,
                edition=chunk.edition,
                source_version=chunk.source_version,
                locator=chunk.locator,
            )
        )
        if len(selected) >= max_citations:
            break
    return tuple(selected)


def source_only_fallback(
    evidence: Sequence[DocumentChunk | RankedChunk | FusedChunk],
    routes: Mapping[str, CanonicalRoute] | Iterable[CanonicalRoute],
    *,
    max_citations: int = 3,
    max_output_chars: int = 1_200,
) -> GroundedAnswer:
    """Return bounded, non-generative fallback text with trusted source links."""

    if max_output_chars <= 0:
        raise CitationValidationError("max_output_chars must be positive")
    text = "I could not generate a grounded answer. Please review these sources."
    if len(text) > max_output_chars:
        raise CitationValidationError("fallback text exceeds output bound")
    return GroundedAnswer(
        text=text,
        citations=build_source_only_citations(
            evidence, routes, max_citations=max_citations
        ),
        used_source_only_fallback=True,
    )


def validate_citations(
    answer_text: str,
    citation_ids: Sequence[str],
    evidence: Sequence[DocumentChunk | RankedChunk | FusedChunk],
    routes: Mapping[str, CanonicalRoute] | Iterable[CanonicalRoute],
    *,
    max_output_chars: int = 1_200,
    max_citations: int = 3,
    allow_source_only: bool = False,
) -> GroundedAnswer:
    """Validate generated citations against the exact retrieved evidence set.

    A source-only ref uses the explicit ``source:<document-id>`` form and is
    opt-in. Unknown IDs, missing routes, blank output, and cap violations fail
    closed instead of silently returning ungrounded prose.
    """

    if not answer_text.strip():
        raise CitationValidationError("answer text must be non-empty")
    if max_output_chars <= 0 or len(answer_text) > max_output_chars:
        raise CitationValidationError("answer exceeds output bound")
    if max_citations <= 0:
        raise CitationValidationError("max_citations must be positive")
    if len(citation_ids) > max_citations:
        raise CitationValidationError("too many citations")

    route_by_source = _route_map(routes)
    chunks_by_id = {
        chunk.chunk_id: chunk
        for chunk in (_chunk_from_evidence(item) for item in evidence)
    }
    chunks_by_source: dict[str, DocumentChunk] = {}
    for chunk in chunks_by_id.values():
        chunks_by_source.setdefault(chunk.source_id, chunk)

    citations: list[SourceCitation] = []
    seen_sources: set[str] = set()
    used_source_only = False
    for raw_id in citation_ids:
        citation_id = raw_id.strip()
        if not citation_id:
            raise CitationValidationError("citation ID must be non-empty")
        chunk = chunks_by_id.get(citation_id)
        if chunk is None and citation_id.startswith("source:"):
            if not allow_source_only:
                raise CitationValidationError("source-only citation is disabled")
            source_id = citation_id.removeprefix("source:")
            chunk = chunks_by_source.get(source_id)
            used_source_only = True
        if chunk is None:
            raise CitationValidationError(f"unknown citation ID: {citation_id}")
        if chunk.source_id in seen_sources:
            continue
        route = route_by_source.get(chunk.source_id)
        if route is None:
            raise CitationValidationError(
                f"no trusted route for source: {chunk.source_id}"
            )
        seen_sources.add(chunk.source_id)
        citations.append(
            SourceCitation(
                chunk_id=chunk.chunk_id,
                source_id=chunk.source_id,
                title=chunk.title,
                url=route.url,
                authority=chunk.authority,
                edition=chunk.edition,
                source_version=chunk.source_version,
                locator=chunk.locator,
            )
        )
    return GroundedAnswer(
        text=answer_text,
        citations=tuple(citations),
        used_source_only_fallback=used_source_only,
    )


__all__ = [
    "CODEX_ID_ROUTE_CATEGORIES",
    "CODEX_ROUTE_CATEGORIES",
    "CODEX_ROUTE_SEGMENTS",
    "ELIGIBLE_KINDS",
    "RULE_ROUTE_CATEGORIES",
    "CitationValidationError",
    "RetrievalInputError",
    "build_canonical_routes",
    "build_source_only_citations",
    "canonical_route_for",
    "citation_ids_from_text",
    "is_eligible_public_document",
    "lexical_search",
    "rank_by_scores",
    "reciprocal_rank_fusion",
    "source_only_fallback",
    "validate_citations",
]
