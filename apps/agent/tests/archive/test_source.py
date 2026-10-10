import hashlib
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path

import pytest

from pi.chronicler.archive.source import ArchiveSource, SnapshotSource
from pi.chronicler.qa.contracts import PublicDocument


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
            return {item: self.documents[item] for item in batch if item in self.documents}
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
        "".join(json.dumps(asdict(document), sort_keys=True) + "\n" for document in documents)
    )
    return documents


@pytest.mark.asyncio
async def test_partial_live_projection_uses_frozen_snapshot_for_both_reads(
    tmp_path: Path,
) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(
        snapshot_path,
        expected_sha256=hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
        expected_document_count=3,
    )
    public = PublicSource()
    source = ArchiveSource(
        CountedProjection(("live-only",)),
        public,
        snapshot,
        3,
        tmp_path / "promoted.json",
    )

    assert await source.all_documents() == expected
    assert await source.documents(("snapshot-1", "live-only")) == (expected[1],)
    assert public.batches == []


@pytest.mark.asyncio
async def test_full_live_projection_promotes_and_never_falls_back(
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
    projection.identifiers = ("only-live",)
    assert await source.documents(("snapshot-1",)) == ()

    restarted = ArchiveSource(projection, public, snapshot, 3, marker)
    assert restarted.using_bootstrap is False
    with pytest.raises(RuntimeError, match="drifted"):
        await restarted.all_documents()


@pytest.mark.asyncio
async def test_live_count_alone_cannot_replace_frozen_identities(tmp_path: Path) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    projection = CountedProjection(("unrelated-0", "unrelated-1", "unrelated-2"))
    public = PublicSource()
    source = ArchiveSource(
        projection, public, snapshot, 3, tmp_path / "promoted.json"
    )

    assert await source.all_documents() == expected
    assert public.batches == []


@pytest.mark.asyncio
async def test_live_promotion_requires_public_revalidation(tmp_path: Path) -> None:
    snapshot_path = tmp_path / "public.jsonl"
    expected = _snapshot(snapshot_path)
    snapshot = SnapshotSource(snapshot_path, expected_document_count=3)
    projection = CountedProjection(tuple(document.document_id for document in expected))
    public = PublicSource()
    public.documents = {expected[0].document_id: expected[0]}
    source = ArchiveSource(
        projection, public, snapshot, 3, tmp_path / "promoted.json"
    )

    assert await source.all_documents() == expected
    assert source.using_bootstrap is True
    assert await source.documents(("snapshot-1",)) == (expected[1],)


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
