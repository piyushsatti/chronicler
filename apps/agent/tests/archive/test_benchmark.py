from __future__ import annotations

import importlib
import json

import httpx
import pytest

from pi.chronicler.archive import benchmark
from pi.chronicler.archive.benchmark import (
    EMBEDDING_ALIAS,
    EMBEDDING_DIMENSIONS,
    LITELLM_BASE_URL,
    QWEN_QUERY_PREFIX,
    Case,
    Embeddings,
    _score_row,
    _summary,
)


def test_benchmark_uses_environment_origins_with_safe_defaults(monkeypatch) -> None:
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_SITE_URL", raising=False)
    importlib.reload(benchmark)
    assert benchmark.LITELLM_BASE_URL == "http://127.0.0.1:4000"
    assert benchmark.PUBLIC_SITE_URL == "https://chronicler.smokebombstudios.com"

    with monkeypatch.context() as configured:
        configured.setenv("LITELLM_BASE_URL", "http://gateway.test:4000/")
        configured.setenv("PUBLIC_SITE_URL", "https://site.test/")
        importlib.reload(benchmark)
        assert benchmark.LITELLM_BASE_URL == "http://gateway.test:4000"
        assert benchmark.PUBLIC_SITE_URL == "https://site.test"
    importlib.reload(benchmark)


@pytest.mark.asyncio
async def test_embedding_runner_uses_archive_scoped_bearer_and_preserves_indices(
    chunker, monkeypatch
) -> None:
    secret = "archive-only-secret"
    monkeypatch.setenv("LITELLM_ARCHIVE_API_KEY", secret)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload = json.loads(request.content)
        assert payload["model"] == EMBEDDING_ALIAS
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0.2] * EMBEDDING_DIMENSIONS},
                    {"index": 0, "embedding": [0.1] * EMBEDDING_DIMENSIONS},
                ]
            },
        )

    embedder = Embeddings(
        LITELLM_BASE_URL,
        EMBEDDING_ALIAS,
        EMBEDDING_DIMENSIONS,
        chunker,
        QWEN_QUERY_PREFIX,
    )
    headers = embedder.client.headers
    await embedder.client.aclose()
    embedder.client = httpx.AsyncClient(
        base_url="https://model.test",
        headers=headers,
        transport=httpx.MockTransport(handler),
    )
    try:
        vectors = await embedder.embed(["first", "second"])
    finally:
        await embedder.close()

    assert vectors[0][0] == 0.1
    assert vectors[1][0] == 0.2
    assert requests[0].headers["authorization"] == f"Bearer {secret}"
    assert secret not in json.dumps(requests[0].content.decode())


@pytest.mark.asyncio
async def test_embedding_runner_rejects_nonfinite_vectors(chunker, monkeypatch) -> None:
    monkeypatch.setenv("LITELLM_ARCHIVE_API_KEY", "archive-only-secret")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "index": 0,
                        "embedding": ["nan"] * EMBEDDING_DIMENSIONS,
                    }
                ]
            },
        )

    embedder = Embeddings(
        LITELLM_BASE_URL,
        EMBEDDING_ALIAS,
        EMBEDDING_DIMENSIONS,
        chunker,
        QWEN_QUERY_PREFIX,
    )
    headers = embedder.client.headers
    await embedder.client.aclose()
    embedder.client = httpx.AsyncClient(
        base_url="https://model.test",
        headers=headers,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(ValueError, match="non-number"):
            await embedder.embed(["one"])
    finally:
        await embedder.close()


def test_score_receipt_preserves_24_ranked_candidates() -> None:
    case = Case(
        "case-1",
        "rules",
        "question",
        frozenset({"doc-23"}),
        "held_out",
    )
    row = _score_row(
        case,
        [f"doc-{index}" for index in range(24)],
        {"query_embedding_ms": 1.0, "search_ms": 2.0, "total_retrieval_ms": 3.0},
        [f"passage-{index}" for index in range(24)],
    )
    assert len(row["candidate_document_ids"]) == 24
    assert len(row["candidate_passage_ids"]) == 24
    assert row["recall_at_10"] is False


def test_summary_averages_boolean_metrics_but_rejects_boolean_latency() -> None:
    rows = [
        {
            "recall_at_10": True,
            "source_coverage_at_10": 1.0,
            "all_sources_at_10": True,
            "reciprocal_rank_at_10": 0.5,
            "total_retrieval_ms": 10.0,
        },
        {
            "recall_at_10": False,
            "source_coverage_at_10": 0.5,
            "all_sources_at_10": False,
            "reciprocal_rank_at_10": 0.0,
            "total_retrieval_ms": 20.0,
        },
    ]

    summary = _summary(rows)
    assert summary["recall_at_10"] == 0.5
    assert summary["all_sources_at_10"] == 0.5
    rows[0]["total_retrieval_ms"] = True
    with pytest.raises(ValueError, match="total_retrieval_ms must be numeric"):
        _summary(rows)


def test_embedding_runner_requires_scoped_key(chunker, monkeypatch) -> None:
    monkeypatch.delenv("LITELLM_ARCHIVE_API_KEY", raising=False)
    with pytest.raises(ValueError, match="LITELLM_ARCHIVE_API_KEY"):
        Embeddings(
            LITELLM_BASE_URL,
            EMBEDDING_ALIAS,
            EMBEDDING_DIMENSIONS,
            chunker,
            QWEN_QUERY_PREFIX,
        )


def test_embedding_runner_rejects_untrusted_endpoint(chunker, monkeypatch) -> None:
    monkeypatch.setenv("LITELLM_ARCHIVE_API_KEY", "archive-only-secret")
    with pytest.raises(ValueError, match="LITELLM_BASE_URL"):
        Embeddings(
            "https://attacker.example",
            EMBEDDING_ALIAS,
            EMBEDDING_DIMENSIONS,
            chunker,
            QWEN_QUERY_PREFIX,
        )
