"""Deterministic, heading-aware chunking for public document projections."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from pi.chronicler.qa.contracts import DocumentChunk, PublicDocument

DEFAULT_MAX_CHARS: Final = 1_800
DEFAULT_OVERLAP_CHARS: Final = 200
DEFAULT_MAX_BODY_BYTES: Final = 256 * 1024

_HEADING_RE: Final = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$")


class ChunkingError(ValueError):
    """Raised when a document cannot be chunked within configured bounds."""


@dataclass(frozen=True, slots=True)
class ChunkingConfig:
    """Hard bounds for deterministic passage construction."""

    max_chars: int = DEFAULT_MAX_CHARS
    overlap_chars: int = DEFAULT_OVERLAP_CHARS
    max_body_bytes: int = DEFAULT_MAX_BODY_BYTES

    def __post_init__(self) -> None:
        if self.max_chars < 64:
            raise ValueError("max_chars must be at least 64")
        if self.overlap_chars < 0 or self.overlap_chars >= self.max_chars:
            raise ValueError("overlap_chars must be in [0, max_chars)")
        if self.max_body_bytes <= 0:
            raise ValueError("max_body_bytes must be positive")


@dataclass(frozen=True, slots=True)
class _Section:
    heading_path: tuple[str, ...]
    body: str


def public_body_hash(public_body: str) -> str:
    """Return the SHA-256 hash of the exact supplied public body bytes."""

    return hashlib.sha256(public_body.encode("utf-8")).hexdigest()


def _normalise_lines(body: str) -> str:
    """Normalize line endings without changing substantive public text."""

    return body.replace("\r\n", "\n").replace("\r", "\n")


def _sections(body: str) -> tuple[_Section, ...]:
    """Split Markdown into sections while retaining the active heading path."""

    lines = _normalise_lines(body).split("\n")
    sections: list[_Section] = []
    current_path: list[str] = []
    current_lines: list[str] = []

    def flush() -> None:
        text = "\n".join(current_lines).strip()
        if text or current_path:
            sections.append(_Section(tuple(current_path), text))

    for line in lines:
        match = _HEADING_RE.match(line)
        if match is None:
            current_lines.append(line)
            continue

        flush()
        level = len(match.group(1))
        heading = match.group(2).strip()
        current_path = [*current_path[: level - 1], heading]
        current_lines = []

    flush()
    return tuple(sections)


def _windows(text: str, max_chars: int, overlap_chars: int) -> tuple[str, ...]:
    """Split text into bounded windows, preferring Markdown whitespace breaks."""

    cleaned = text.strip()
    if not cleaned:
        return ()
    if len(cleaned) <= max_chars:
        return (cleaned,)

    pieces: list[str] = []
    start = 0
    while start < len(cleaned):
        hard_end = min(start + max_chars, len(cleaned))
        end = hard_end
        if hard_end < len(cleaned):
            newline_break = cleaned.rfind("\n", start + 1, hard_end + 1)
            space_break = cleaned.rfind(" ", start + 1, hard_end + 1)
            candidate = max(newline_break, space_break)
            # Do not produce a tiny prefix merely because the first word is
            # unusually long; the hard bound remains the final authority.
            if candidate > start + max_chars // 2:
                end = candidate

        piece = cleaned[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(cleaned):
            break

        next_start = max(start + 1, end - overlap_chars)
        if next_start <= start:
            raise ChunkingError("chunk window did not make progress")
        start = next_start

    return tuple(pieces)


def _section_windows(section: _Section, config: ChunkingConfig) -> tuple[str, ...]:
    """Chunk one section and repeat its heading context in every passage."""

    prefix = "\n".join(f"# {heading}" for heading in section.heading_path)
    separator = "\n" if prefix and section.body else ""

    if prefix and len(prefix) >= config.max_chars:
        # A pathological heading is still bounded and remains represented in
        # the chunk's structured heading_path field.
        return _windows(
            prefix + separator + section.body, config.max_chars, config.overlap_chars
        )

    available = config.max_chars - len(prefix) - len(separator)
    if not section.body:
        return _windows(prefix, config.max_chars, config.overlap_chars)
    if available <= 0:
        raise ChunkingError("heading context leaves no room for body text")

    overlap = min(config.overlap_chars, max(0, available - 1))
    return tuple(
        f"{prefix}{separator}{piece}" if prefix else piece
        for piece in _windows(section.body, available, overlap)
    )


def chunk_document(
    document: PublicDocument, config: ChunkingConfig | None = None
) -> tuple[DocumentChunk, ...]:
    """Build deterministic bounded chunks from an anonymous public body.

    IDs include the source ID, exact public-body hash, ordinal, heading path and
    passage digest. Updating the public projection therefore invalidates every
    affected chunk without consulting a database or private body.
    """

    options = config or ChunkingConfig()
    body_bytes = len(document.public_body.encode("utf-8"))
    if body_bytes > options.max_body_bytes:
        raise ChunkingError(f"public body exceeds {options.max_body_bytes} bytes")

    body_hash = public_body_hash(document.public_body)
    chunks: list[DocumentChunk] = []
    ordinal = 0
    for section in _sections(document.public_body):
        for text in _section_windows(section, options):
            if len(text) > options.max_chars:
                raise ChunkingError("chunk exceeds configured character bound")
            digest_input = "\x00".join(
                (
                    document.document_id,
                    body_hash,
                    str(ordinal),
                    "\x1f".join(section.heading_path),
                    text,
                )
            )
            digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()
            chunk_id = (
                f"chunk:{document.document_id}:{body_hash[:16]}:"
                f"{ordinal:04d}:{digest[:16]}"
            )
            chunks.append(
                DocumentChunk(
                    chunk_id=chunk_id,
                    document_id=document.document_id,
                    kind=document.kind,
                    category=document.category,
                    slug=document.slug,
                    title=document.title,
                    heading_path=section.heading_path,
                    text=text,
                    body_hash=body_hash,
                    ordinal=ordinal,
                    authority=document.authority,
                    edition=document.edition,
                    source_version=document.source_version,
                    locator=document.locator,
                    language=document.language,
                )
            )
            ordinal += 1
    return tuple(chunks)


def chunk_documents(
    documents: Iterable[PublicDocument],
    config: ChunkingConfig | None = None,
) -> tuple[DocumentChunk, ...]:
    """Chunk documents in stable source-ID order, independent of input order."""

    chunks: list[DocumentChunk] = []
    for document in sorted(documents, key=lambda item: item.document_id):
        chunks.extend(chunk_document(document, config))
    return tuple(chunks)


__all__ = [
    "DEFAULT_MAX_BODY_BYTES",
    "DEFAULT_MAX_CHARS",
    "DEFAULT_OVERLAP_CHARS",
    "ChunkingConfig",
    "ChunkingError",
    "chunk_document",
    "chunk_documents",
    "public_body_hash",
]
