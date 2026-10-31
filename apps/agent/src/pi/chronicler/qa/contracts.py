"""Immutable contracts for anonymous public-document projections.

The Q&A package deliberately starts after authorization and body projection.
``PublicDocument.public_body`` is therefore an anonymous, effective body supplied
by a source adapter; it is not an ORM object and must never be populated from a
raw private body in this package.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PublicDocument:
    """Anonymous public projection of one published document.

    Publication, visibility, deletion, and policy checks belong to the source
    adapter. Keeping those fields out of this contract prevents a caller from
    accidentally handing raw database state to Archive.
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
        """Stable source identifier for the public document."""

        return self.document_id


__all__ = ["CanonicalRoute", "DocumentChunk", "PublicDocument"]
