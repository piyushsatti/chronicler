import hashlib
import json
from collections.abc import Sequence
from dataclasses import asdict, replace
from pathlib import Path

import httpx
import pytest

from pi.chronicler.archive.source import ArchiveSource, SnapshotSource
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.remote_source import AnonymousGraphqlSource


class Projection:
    def __init__(self) -> None:
        self.identifiers = tuple(f"d{index}" for index in range(13))

    async def all_document_ids(self) -> tuple[str, ...]:
        return self.identifiers

    async def eligible_document_ids(
        self, document_ids: Sequence[str]
    ) -> tuple[str, ...]:
        return tuple(item for item in document_ids if item in self.identifiers)

    async def close(self) -> None:
        return None


class PublicSource:
    def __init__(self) -> None:
        self.batches: list[tuple[str, ...]] = []
        self.documents: dict[str, PublicDocument] | None = None

    async def revalidate_projections(
        self, expected_document_ids: Sequence[str]
    ) -> dict[str, PublicDocument]:
        batch = tuple(expected_document_ids)
        self.batches.append(batch)
        if self.documents is not None:
            return {
                item: self.documents[item] for item in batch if item in self.documents
            }
        return {
            item: PublicDocument(item, "rule", None, item, item, "Current public text")
            for item in batch
            if item != "d1"
        }

    async def aclose(self) -> None:
        return None


class CountedProjection(Projection):
    def __init__(self, identifiers: Sequence[str]) -> None:
        self.identifiers = tuple(identifiers)


def _snapshot(path: Path, count: int = 3) -> tuple[PublicDocument, ...]:
    documents = tuple(
        PublicDocument(
            f"snapshot-{index}",
            "rule",
            None,
            f"snapshot-{index}",
            f"Snapshot {index}",
            f"Frozen public text {index}",
        )
        for index in range(count)
    )
    path.write_text(
        "".join(
            json.dumps(asdict(document), sort_keys=True) + "\n"
            for document in documents
        )
    )
    return documents


@pytest.mark.asyncio
async def test_bootstrap_withdrawal_is_not_readable_or_indexable(
    tmp_path: Path,
) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path, count=2)
    snapshot = SnapshotSource(
        snapshot_path,
        expected_sha256=hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
        expected_document_count=2,
    )
    public = PublicSource()
    public.documents = {expected[0].document_id: expected[0]}
    source = ArchiveSource(
        CountedProjection((expected[0].document_id,)),
        public,
        snapshot,
        2,
        tmp_path / "promoted.json",
    )

    assert await source.documents((expected[1].document_id,)) == ()
    assert await source.all_documents() == (expected[0],)
    assert source.using_bootstrap is True


@pytest.mark.asyncio
async def test_promoted_source_accepts_edits_and_withdrawals_after_restart(
    tmp_path: Path,
) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    projection = CountedProjection(tuple(document.document_id for document in expected))
    public = PublicSource()
    public.documents = {document.document_id: document for document in expected}
    marker = tmp_path / "promoted.json"
    source = ArchiveSource(projection, public, snapshot, 3, marker)

    documents = await source.all_documents()
    assert documents == expected
    assert source.using_bootstrap is False
    assert marker.exists()
    changed = replace(expected[0], public_body="Edited after promotion")
    projection.identifiers = (changed.document_id,)
    public.documents = {changed.document_id: changed}
    assert await source.documents(("snapshot-1",)) == ()

    restarted = ArchiveSource(projection, public, snapshot, 3, marker)
    assert restarted.using_bootstrap is False
    assert await restarted.all_documents() == (changed,)
    assert await restarted.documents((changed.document_id, "snapshot-1")) == (changed,)
    projection.identifiers = ()
    assert await restarted.all_documents() == ()
    assert restarted.using_bootstrap is False


@pytest.mark.asyncio
async def test_changed_live_corpus_can_promote_at_configured_minimum(
    tmp_path: Path,
) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    current = (
        replace(expected[0], public_body="Changed public text"),
        replace(expected[1], document_id="new-document", slug="new-document"),
    )
    projection = CountedProjection(tuple(document.document_id for document in current))
    public = PublicSource()
    public.documents = {document.document_id: document for document in current}
    marker = tmp_path / "promoted.json"
    source = ArchiveSource(projection, public, snapshot, 2, marker)

    assert await source.all_documents() == current
    assert source.using_bootstrap is False
    assert marker.exists()


@pytest.mark.asyncio
async def test_bootstrap_reads_current_projection_after_public_body_changes(
    tmp_path: Path,
) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    changed = replace(expected[0], public_body="Current anonymous body")
    projection = CountedProjection((changed.document_id, "live-only"))
    public = PublicSource()
    public.documents = {
        changed.document_id: changed,
        "live-only": replace(changed, document_id="live-only", slug="live-only"),
    }
    source = ArchiveSource(projection, public, snapshot, 3, tmp_path / "promoted.json")

    assert await source.documents((changed.document_id, "live-only")) == (changed,)
    assert await source.all_documents() == (changed,)
    assert source.using_bootstrap is True


@pytest.mark.asyncio
async def test_live_promotion_requires_public_revalidation(tmp_path: Path) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    projection = CountedProjection(tuple(document.document_id for document in expected))
    public = PublicSource()
    public.documents = {expected[0].document_id: expected[0]}
    source = ArchiveSource(projection, public, snapshot, 3, tmp_path / "promoted.json")

    assert await source.all_documents() == (expected[0],)
    assert source.using_bootstrap is True
    assert await source.documents(("snapshot-1",)) == ()


@pytest.mark.asyncio
async def test_promotion_marker_is_bound_to_snapshot(tmp_path: Path) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    first = SnapshotSource(snapshot_path, expected_document_count=3)
    projection = CountedProjection(tuple(document.document_id for document in expected))
    public = PublicSource()
    public.documents = {document.document_id: document for document in expected}
    marker = tmp_path / "promoted.json"
    source = ArchiveSource(projection, public, first, 3, marker)
    assert await source.all_documents() == expected

    _snapshot(snapshot_path, count=2)
    second = SnapshotSource(snapshot_path, expected_document_count=2)
    with pytest.raises(ValueError, match="did not match"):
        ArchiveSource(projection, public, second, 2, marker)


def test_snapshot_rejects_bad_hash_count_and_schema(tmp_path: Path) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    _snapshot(snapshot_path)
    with pytest.raises(ValueError, match="SHA-256"):
        SnapshotSource(snapshot_path, expected_sha256="0" * 64)
    with pytest.raises(ValueError, match="document count"):
        SnapshotSource(snapshot_path, expected_document_count=451)
    snapshot_path.write_text('{"document_id":"one"}\n')
    with pytest.raises(ValueError, match="omitted fields"):
        SnapshotSource(snapshot_path)


@pytest.mark.asyncio
async def test_candidate_ids_are_batched_and_canonically_revalidated() -> None:
    public = PublicSource()
    source = ArchiveSource(Projection(), public)

    documents = await source.all_documents()

    assert [len(batch) for batch in public.batches] == [4, 4, 4, 1]
    assert "d1" not in {document.document_id for document in documents}
    assert len(documents) == 12


@pytest.mark.asyncio
async def test_requested_document_must_still_be_a_projection_candidate() -> None:
    public = PublicSource()
    source = ArchiveSource(Projection(), public)

    documents = await source.documents(("d2", "not-eligible"))

    assert [document.document_id for document in documents] == ["d2"]
    assert public.batches == [("d2",)]


@pytest.mark.asyncio
@pytest.mark.parametrize("count", (13, 24))
async def test_requested_documents_are_batched_through_real_public_adapter(
    count: int,
) -> None:
    identifiers = tuple(f"d{index}" for index in range(count))
    batches: list[tuple[str, ...]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        variables = json.loads(request.content)["variables"]
        batch = tuple(variables.values())
        batches.append(batch)
        return httpx.Response(
            200,
            json={
                "data": {
                    f"d{index}": {
                        "id": document_id,
                        "slug": document_id,
                        "kind": "rule",
                        "category": None,
                        "status": "published",
                        "visibility": "public",
                        "title": document_id,
                        "frontmatter": {},
                        "effectiveBody": "Current anonymous body",
                    }
                    for index, document_id in enumerate(batch)
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        public = AnonymousGraphqlSource("https://example.test/graphql", client=client)
        source = ArchiveSource(CountedProjection(identifiers), public)
        documents = await source.documents((*identifiers, "not-eligible"))

    assert tuple(document.document_id for document in documents) == identifiers
    assert tuple(item for batch in batches for item in batch) == identifiers
    assert all(1 <= len(batch) <= 4 for batch in batches)
