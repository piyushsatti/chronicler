"""Pure projection helpers for Archive digests (no ORM / Go-API DB access)."""

from __future__ import annotations

import hashlib
import json

from pi.chronicler.qa.contracts import CanonicalRoute, PublicDocument


def projection_digest(document: PublicDocument, route: CanonicalRoute) -> str:
    """Hash every canonical field retained by retrieval or citation delivery."""
    payload = json.dumps(
        {
            "document_id": document.document_id,
            "kind": document.kind,
            "category": document.category,
            "slug": document.slug,
            "title": document.title,
            "body": document.public_body,
            "authority": document.authority,
            "edition": document.edition,
            "source_version": document.source_version,
            "locator": document.locator,
            "language": document.language,
            "url": route.url,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()
