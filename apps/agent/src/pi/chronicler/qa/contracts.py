"""Immutable contracts for the DB-free mention-to-answer retrieval slice.

The Q&A package deliberately starts after authorization and body projection.
``PublicDocument.public_body`` is therefore an anonymous, effective body supplied
by a source adapter; it is not an ORM object and must never be populated from a
raw private body in this package.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ChatRole = Literal["system", "user", "assistant"]


@dataclass(frozen=True, slots=True)
class PublicDocument:
    """Anonymous public projection of one published document.

    Publication, visibility, deletion, and policy checks belong to the source
    adapter. Keeping those fields out of this contract prevents a caller from
    accidentally handing raw database state to retrieval or inference.
    """

    document_id: str
    kind: str
    category: str | None
    slug: str
    title: str
    public_body: str
    authority: str | None = None
    edition: str | None = None
    source_version: str | None = None
    locator: str | None = None
    language: str = "en"

    def __post_init__(self) -> None:
        for name in ("document_id", "kind", "slug", "title"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} must be a non-empty string")
        if not self.language.strip():
            raise ValueError("language must be a non-empty string")


@dataclass(frozen=True, slots=True)
class CanonicalRoute:
    """Trusted application route for one eligible public document."""

    document_id: str
    kind: str
    category: str | None
    slug: str
    path: str
    url: str

    @property
    def source_id(self) -> str:
        return self.document_id


@dataclass(frozen=True, slots=True)
class DocumentChunk:
    """One deterministic passage derived from a :class:`PublicDocument`."""

    chunk_id: str
    document_id: str
    kind: str
    category: str | None
    slug: str
    title: str
    heading_path: tuple[str, ...]
    text: str
    body_hash: str
    ordinal: int
    authority: str | None = None
    edition: str | None = None
    source_version: str | None = None
    locator: str | None = None
    language: str = "en"

    @property
    def source_id(self) -> str:
        """Stable source identifier used by citation validation."""

        return self.document_id


# Short alias for call sites that speak in terms of QA evidence.
QAChunk = DocumentChunk


@dataclass(frozen=True, slots=True)
class RankedChunk:
    """A chunk with a score and one-based rank in one retrieval channel."""

    chunk: DocumentChunk
    score: float
    rank: int


@dataclass(frozen=True, slots=True)
class FusedChunk:
    """A chunk ranked after deterministic reciprocal-rank fusion."""

    chunk: DocumentChunk
    score: float
    rank: int
    lexical_score: float = 0.0
    semantic_score: float = 0.0


@dataclass(frozen=True, slots=True)
class ChatMessage:
    """A role/content pair accepted by the local OpenAI-compatible adapter."""

    role: ChatRole
    content: str

    def __post_init__(self) -> None:
        if self.role not in {"system", "user", "assistant"}:
            raise ValueError("unsupported chat role")
        if not self.content:
            raise ValueError("chat content must be non-empty")


@dataclass(frozen=True, slots=True)
class SourceCitation:
    """A trusted citation assembled from an evidence chunk and route."""

    chunk_id: str
    source_id: str
    title: str
    url: str
    authority: str | None = None
    edition: str | None = None
    source_version: str | None = None
    locator: str | None = None


@dataclass(frozen=True, slots=True)
class GroundedAnswer:
    """Validated answer text and trusted citations.

    ``used_source_only_fallback`` distinguishes an honest source-only response
    from model-generated prose without making fallback text itself a contract.
    """

    text: str
    citations: tuple[SourceCitation, ...]
    used_source_only_fallback: bool = False


__all__ = [
    "CanonicalRoute",
    "ChatMessage",
    "DocumentChunk",
    "FusedChunk",
    "GroundedAnswer",
    "PublicDocument",
    "QAChunk",
    "RankedChunk",
    "SourceCitation",
]
