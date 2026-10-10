"""Build a fresh development index from an authorized public JSONL snapshot."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from dataclasses import asdict
from pathlib import Path

from pi.chronicler.archive.chunking import (
    DEFAULT_CHUNK_TOKENS,
    DEFAULT_MAX_INPUT_TOKENS,
    DEFAULT_OVERLAP_TOKENS,
    LEGACY_BGE_TOKENIZER_SHA256,
    TokenChunker,
)
from pi.chronicler.archive.embeddings import LiteLlmEmbeddings
from pi.chronicler.archive.index import Indexer, LanceStore
from pi.chronicler.archive.settings import LEGACY_BGE_QUERY_PREFIX, embedding_contract
from pi.chronicler.archive.source import SnapshotSource


async def rebuild(snapshot: Path, destination: Path) -> None:
    # Never open an existing index, including an empty existing production mount.
    if destination.exists():
        raise ValueError("development index destination must not already exist")
    model = os.environ["EMBEDDING_MODEL"]
    revision = os.environ["EMBEDDING_REVISION"]
    dimensions = int(os.environ.get("EMBEDDING_DIMENSIONS", "384"))
    if dimensions <= 0:
        raise ValueError("EMBEDDING_DIMENSIONS must be positive")
    tokenizer_sha256 = os.environ.get(
        "EMBEDDING_TOKENIZER_SHA256", LEGACY_BGE_TOKENIZER_SHA256
    )
    max_input_tokens = int(
        os.environ.get("EMBEDDING_MAX_INPUT_TOKENS", str(DEFAULT_MAX_INPUT_TOKENS))
    )
    chunk_tokens = int(
        os.environ.get("ARCHIVE_CHUNK_TOKENS", str(DEFAULT_CHUNK_TOKENS))
    )
    overlap_tokens = int(
        os.environ.get("ARCHIVE_CHUNK_OVERLAP_TOKENS", str(DEFAULT_OVERLAP_TOKENS))
    )
    query_prefix = os.environ.get("EMBEDDING_QUERY_PREFIX", LEGACY_BGE_QUERY_PREFIX)
    chunker = TokenChunker.from_file(
        os.environ["EMBEDDING_TOKENIZER_PATH"],
        revision,
        expected_revision=revision,
        expected_sha256=tokenizer_sha256,
        max_input_tokens=max_input_tokens,
        chunk_tokens=chunk_tokens,
        overlap_tokens=overlap_tokens,
    )
    source = SnapshotSource(snapshot)
    embedder = LiteLlmEmbeddings(
        os.environ["DEV_LITELLM_BASE_URL"],
        os.environ["DEV_LITELLM_API_KEY"],
        model,
        dimensions,
        chunker,
        query_prefix,
    )
    try:
        destination.mkdir(parents=True, exist_ok=False)
        indexer = Indexer(
            source,
            embedder,
            LanceStore(str(destination), dimensions),
            os.environ["PUBLIC_SITE_URL"],
            embedding_contract(
                model,
                revision,
                dimensions,
                tokenizer_sha256=tokenizer_sha256,
                max_input_tokens=max_input_tokens,
                chunk_tokens=chunk_tokens,
                overlap_tokens=overlap_tokens,
                query_prefix=query_prefix,
            ),
            chunker,
        )
        print(json.dumps(asdict(await indexer.sync())))
    finally:
        await embedder.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("public_snapshot", type=Path)
    parser.add_argument("new_index_directory", type=Path)
    args = parser.parse_args()
    asyncio.run(rebuild(args.public_snapshot, args.new_index_directory))


if __name__ == "__main__":
    main()
