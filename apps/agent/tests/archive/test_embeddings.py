import json

import httpx
import pytest

from pi.chronicler.archive.embeddings import BGE_EN_QUERY_PREFIX, LiteLlmEmbeddings


@pytest.mark.asyncio
async def test_query_prefix_and_model_input_contract(chunker) -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={"data": [{"index": 0, "embedding": [0.1, 0.2, 0.3]}]},
        )

    embeddings = LiteLlmEmbeddings(
        "https://model.test/v1", "token", "alias", 3, chunker
    )
    await embeddings._client.aclose()
    embeddings._client = httpx.AsyncClient(
        base_url="https://model.test/v1", transport=httpx.MockTransport(handler)
    )

    vector = await embeddings.embed_query("shove")
    await embeddings.close()

    assert vector == [0.1, 0.2, 0.3]
    assert requests == [
        {
            "model": "alias",
            "input": [f"{BGE_EN_QUERY_PREFIX}shove"],
        }
    ]


@pytest.mark.asyncio
async def test_overflow_fails_before_http_request(chunker) -> None:
    calls = []

    def handler(request):
        calls.append(request)
        raise AssertionError("overflow must not be sent")

    embeddings = LiteLlmEmbeddings(
        "https://model.test/v1", "token", "alias", 3, chunker
    )
    await embeddings._client.aclose()
    embeddings._client = httpx.AsyncClient(
        base_url="https://model.test/v1", transport=httpx.MockTransport(handler)
    )
    try:
        with pytest.raises(ValueError, match="exceeds 512 tokens"):
            await embeddings.embed_documents(["1 " * 700])
        with pytest.raises(ValueError, match="exceeds 512 tokens"):
            await embeddings.embed_query("1 " * 700)
        assert calls == []
    finally:
        await embeddings.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("indices", [[1, 0], [0, 0]])
async def test_embedding_positions_do_not_silently_mismatch_passages(
    chunker, indices
) -> None:
    def handler(request):
        return httpx.Response(
            200,
            json={
                "data": [{"index": i, "embedding": [float(i), 0, 0]} for i in indices]
            },
        )

    embeddings = LiteLlmEmbeddings(
        "https://model.test/v1", "token", "alias", 3, chunker
    )
    await embeddings._client.aclose()
    embeddings._client = httpx.AsyncClient(
        base_url="https://model.test/v1", transport=httpx.MockTransport(handler)
    )
    try:
        if indices == [0, 0]:
            with pytest.raises(ValueError, match="indices must match"):
                await embeddings.embed_documents(["First", "Second"])
        else:
            assert await embeddings.embed_documents(["First", "Second"]) == [
                [0, 0, 0],
                [1, 0, 0],
            ]
    finally:
        await embeddings.close()
