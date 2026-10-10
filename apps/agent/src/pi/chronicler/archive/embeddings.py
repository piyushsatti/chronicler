from __future__ import annotations

from collections.abc import Sequence
from typing import cast

import httpx

from pi.chronicler.archive.chunking import TokenChunker

BGE_EN_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class LiteLlmEmbeddings:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        dimensions: int,
        chunker: TokenChunker,
        query_prefix: str = BGE_EN_QUERY_PREFIX,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        self._chunker = chunker
        self._model = model
        self._dimensions = dimensions
        self._query_prefix = query_prefix

    async def close(self) -> None:
        await self._client.aclose()

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return await self._embed(texts)

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed((f"{self._query_prefix}{text}",)))[0]

    async def _embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        for text in texts:
            self._chunker.validate(text)
        response = await self._client.post(
            "/v1/embeddings",
            json={
                "model": self._model,
                "input": list(texts),
            },
        )
        response.raise_for_status()
        payload = cast("dict[str, object]", response.json())
        data = payload.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise ValueError("LiteLLM embedding response count mismatch")
        ordered = sorted(
            (cast("dict[str, object]", item) for item in data),
            key=lambda item: int(cast("int", item["index"])),
        )
        if [item.get("index") for item in ordered] != list(range(len(texts))):
            raise ValueError("LiteLLM embedding indices must match input positions")
        vectors: list[list[float]] = []
        for item in ordered:
            raw = item.get("embedding")
            if not isinstance(raw, list) or len(raw) != self._dimensions:
                raise ValueError("LiteLLM embedding dimension mismatch")
            vector = [float(value) for value in raw]
            if not all(value == value and abs(value) < 1e6 for value in vector):
                raise ValueError("LiteLLM embedding contained an invalid value")
            vectors.append(vector)
        return vectors
