"""Canonical routes and eligibility for anonymous public documents."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Final
from urllib.parse import quote, urlsplit

from pi.chronicler.qa.contracts import CanonicalRoute, PublicDocument

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


__all__ = [
    "CODEX_ID_ROUTE_CATEGORIES",
    "CODEX_ROUTE_CATEGORIES",
    "CODEX_ROUTE_SEGMENTS",
    "RULE_ROUTE_CATEGORIES",
    "canonical_route_for",
    "is_eligible_public_document",
]
