from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from pi.chronicler.qa.chunking import (
    ChunkingConfig,
    ChunkingError,
    chunk_document,
    public_body_hash,
)
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import (
    canonical_route_for,
    is_eligible_public_document,
)


def _document(
    document_id: str = "doc-1",
    *,
    kind: str = "rule",
    category: str | None = None,
    slug: str = "concentration-guide",
    body: str | None = None,
) -> PublicDocument:
    return PublicDocument(
        document_id=document_id,
        kind=kind,
        category=category,
        slug=slug,
        title="Concentration Guide",
        public_body=(
            body
            if body is not None
            else "# Concentration\n\n"
            + "A creature maintains concentration while taking a check. " * 20
            + "\n## Exceptions\n\nSome effects end concentration immediately."
        ),
    )


def test_chunks_are_frozen_deterministic_bounded_and_hash_the_exact_body() -> None:
    document = _document()
    config = ChunkingConfig(max_chars=96, overlap_chars=16)
    first = chunk_document(document, config)
    second = chunk_document(document, config)

    assert first == second
    assert first
    assert all(len(chunk.text) <= 96 for chunk in first)
    assert all(
        chunk.body_hash == public_body_hash(document.public_body) for chunk in first
    )
    assert first[0].heading_path == ("Concentration",)
    assert any(chunk.heading_path == ("Concentration", "Exceptions") for chunk in first)
    with pytest.raises(FrozenInstanceError):
        first[0].text = "mutated"  # type: ignore[misc]

    changed = chunk_document(
        _document(body=document.public_body + "\nA changed public sentence."), config
    )
    assert changed[0].body_hash != first[0].body_hash
    assert changed[0].chunk_id != first[0].chunk_id


def test_chunking_rejects_oversized_public_body_and_invalid_overlap() -> None:
    with pytest.raises(ChunkingError, match="exceeds"):
        chunk_document(_document(body="x" * 10), ChunkingConfig(max_body_bytes=9))
    with pytest.raises(ValueError, match="overlap"):
        ChunkingConfig(max_chars=64, overlap_chars=64)


def test_routes_allow_only_supported_public_rule_and_codex_categories() -> None:
    guide = _document()
    ruling = _document("ruling", category="ruling", slug="table-ruling")
    event = _document("event", kind="codex_entry", category="world_event", slug="storm")
    artifact = _document(
        "artifact-id", kind="codex_entry", category="artifact", slug="moon-blade"
    )
    unsupported = _document(
        "location", kind="codex_entry", category="location/geographic", slug="ridge"
    )
    malicious_slug = _document("safe", slug="../not-a-route")

    assert canonical_route_for(guide, public_origin="https://example.test").url == (
        "https://example.test/rules/guides/concentration-guide"
    )
    assert canonical_route_for(ruling).path == "/rules/rulings/table-ruling"
    assert canonical_route_for(event).path == "/codex/event/event"
    assert canonical_route_for(artifact).path == "/codex/artifact/moon-blade"
    assert canonical_route_for(unsupported) is None
    assert canonical_route_for(malicious_slug).path == "/rules/guides/..%2Fnot-a-route"
    assert not is_eligible_public_document(_document("empty", body=""))
