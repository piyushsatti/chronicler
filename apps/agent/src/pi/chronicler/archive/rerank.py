from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import cast

import httpx


@dataclass(frozen=True, slots=True)
class RerankScore:
    index: int
    score: float


class HttpReranker:
    """Bounded client for a Cohere-compatible ``/v1/rerank`` endpoint."""

    def __init__(
        self, base_url: str, api_key: str, model: str, instruction: str = ""
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
        self._model = model
        self._instruction = instruction.strip()

    async def close(self) -> None:
        await self._client.aclose()

    async def rerank(
        self, query: str, documents: Sequence[str], limit: int
    ) -> tuple[RerankScore, ...]:
        if not documents:
            return ()
        if limit <= 0 or limit > len(documents):
            raise ValueError("rerank limit must be within the candidate count")
        payload: dict[str, object] = {
            "model": self._model,
            "query": query,
            "documents": list(documents),
            "top_n": limit,
        }
        if self._instruction:
            payload["instruction"] = self._instruction
        response = await self._client.post("/v1/rerank", json=payload)
        response.raise_for_status()
        payload = cast("dict[str, object]", response.json())
        raw_results = payload.get("results")
        if not isinstance(raw_results, list) or len(raw_results) != limit:
            raise ValueError("reranker response count mismatch")

        results: list[RerankScore] = []
        seen: set[int] = set()
        for item in raw_results:
            if not isinstance(item, dict):
                raise ValueError("reranker result must be an object")
            index = item.get("index")
            raw_score = item.get("relevance_score")
            if (
                not isinstance(index, int)
                or isinstance(index, bool)
                or not 0 <= index < len(documents)
                or index in seen
                or not isinstance(raw_score, int | float)
                or isinstance(raw_score, bool)
                or not math.isfinite(float(raw_score))
            ):
                raise ValueError("reranker returned invalid index or score")
            seen.add(index)
            results.append(RerankScore(index, float(raw_score)))
        return tuple(results)


__all__ = ["HttpReranker", "RerankScore"]
