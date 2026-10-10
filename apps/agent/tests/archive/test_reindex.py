import json
from pathlib import Path

import pytest

from pi.chronicler.archive.reindex import SnapshotSource, rebuild


@pytest.mark.asyncio
async def test_rebuild_rejects_existing_destination_before_credentials(
    tmp_path: Path,
) -> None:
    with pytest.raises(ValueError, match="must not already exist"):
        await rebuild(tmp_path / "missing.jsonl", tmp_path)


def test_snapshot_rejects_duplicate_document_ids(tmp_path: Path) -> None:
    row = {
        "document_id": "one",
        "kind": "rule",
        "category": None,
        "slug": "one",
        "title": "One",
        "public_body": "Public",
    }
    snapshot = tmp_path / "public.jsonl"
    snapshot.write_text(json.dumps(row) + "\n" + json.dumps(row) + "\n")
    with pytest.raises(ValueError, match="duplicate document IDs"):
        SnapshotSource(snapshot)
