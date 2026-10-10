import json

import httpx
import pytest

from pi.chronicler.archive.rerank import HttpReranker


@pytest.mark.asyncio
async def test_reranker_sends_bounded_documents_and_preserves_scores() -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "results": [
                    {"index": 1, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.4},
                ]
            },
        )

    reranker = HttpReranker(
        "https://model.test",
        "token",
        "rerank-model",
        "Retrieve rules that answer the question.",
    )
    await reranker._client.aclose()
    reranker._client = httpx.AsyncClient(
        base_url="https://model.test", transport=httpx.MockTransport(handler)
    )
    try:
        scores = await reranker.rerank("fireball level", ["First", "Second"], 2)
    finally:
        await reranker.close()

    assert [(score.index, score.score) for score in scores] == [(1, 0.9), (0, 0.4)]
    assert requests == [
        {
            "model": "rerank-model",
            "query": "fireball level",
            "documents": ["First", "Second"],
            "top_n": 2,
            "instruction": "Retrieve rules that answer the question.",
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "results",
    [
        [{"index": 0, "relevance_score": 0.9}],
        [
            {"index": 0, "relevance_score": 0.9},
            {"index": 0, "relevance_score": 0.8},
        ],
        [
            {"index": 0, "relevance_score": 0.9},
            {"index": 4, "relevance_score": 0.8},
        ],
    ],
)
async def test_reranker_rejects_incomplete_or_invalid_results(
    results: list[dict[str, object]],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": results})

    reranker = HttpReranker("https://model.test", "token", "rerank-model")
    await reranker._client.aclose()
    reranker._client = httpx.AsyncClient(
        base_url="https://model.test", transport=httpx.MockTransport(handler)
    )
    try:
        with pytest.raises(ValueError):
            await reranker.rerank("query", ["First", "Second"], 2)
    finally:
        await reranker.close()
