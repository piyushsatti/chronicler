from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import cast

import httpx

from pi.chronicler.agent.budget import ContextBudget

GROUNDED_RESPONSE_FORMAT: dict[str, object] = {
    "type": "json_schema",
    "json_schema": {
        "name": "grounded_answer",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["answered", "unsupported"]},
                "answer": {"type": "string", "maxLength": 1_200},
                "source_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "maxItems": 3,
                },
            },
            "required": ["status", "answer", "source_ids"],
            "additionalProperties": False,
        },
    },
}


@dataclass(frozen=True, slots=True)
class ToolCall:
    call_id: str
    name: str
    arguments: str


@dataclass(frozen=True, slots=True)
class ModelTurn:
    content: str | None
    tool_calls: tuple[ToolCall, ...]
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    request_id: str | None = None
    elapsed_ms: int | None = None


class LiteLlmChat:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        budget: ContextBudget,
        *,
        timeout_seconds: float = 60.0,
        temperature: float = 0,
        top_p: float | None = None,
        presence_penalty: float | None = None,
        seed: int | None = None,
        enable_thinking: bool | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(timeout_seconds, connect=3.0),
        )
        self._timeout_seconds = timeout_seconds
        self._model = model
        self._temperature = temperature
        self._top_p = top_p
        self._presence_penalty = presence_penalty
        self._seed = seed
        self._enable_thinking = enable_thinking
        self.budget = budget

    async def close(self) -> None:
        await self._client.aclose()

    async def complete(
        self,
        messages: list[dict[str, object]],
        tools: list[dict[str, object]],
        *,
        tool_choice: str = "auto",
        json_response: bool = False,
    ) -> ModelTurn:
        self.budget.require_fit(messages, tools)
        request: dict[str, object] = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
            "max_tokens": self.budget.completion_tokens,
        }
        if self._top_p is not None:
            request["top_p"] = self._top_p
        if self._presence_penalty is not None:
            request["presence_penalty"] = self._presence_penalty
        if self._seed is not None:
            request["seed"] = self._seed
        if self._enable_thinking is not None:
            request["chat_template_kwargs"] = {"enable_thinking": self._enable_thinking}
        if tools:
            request["tools"] = tools
            request["tool_choice"] = tool_choice
        if json_response:
            request["response_format"] = GROUNDED_RESPONSE_FORMAT
        started = time.perf_counter()
        async with asyncio.timeout(self._timeout_seconds):
            response = await self._client.post("/chat/completions", json=request)
        elapsed_ms = round((time.perf_counter() - started) * 1_000)
        response.raise_for_status()
        payload = cast("dict[str, object]", response.json())
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("LiteLLM chat response omitted choices")
        choice = cast("dict[str, object]", choices[0])
        message = choice.get("message")
        if not isinstance(message, dict):
            raise ValueError("LiteLLM chat response omitted its message")
        raw = cast("dict[str, object]", message)
        calls: list[ToolCall] = []
        raw_calls = raw.get("tool_calls", [])
        if raw_calls is not None:
            if not isinstance(raw_calls, list):
                raise ValueError("LiteLLM tool_calls schema mismatch")
            for item in raw_calls:
                if not isinstance(item, dict):
                    raise ValueError("LiteLLM tool call schema mismatch")
                call = cast("dict[str, object]", item)
                function = call.get("function")
                if not isinstance(function, dict):
                    raise ValueError("LiteLLM tool call function mismatch")
                function_data = cast("dict[str, object]", function)
                if not all(
                    isinstance(value, str)
                    for value in (
                        call.get("id"),
                        function_data.get("name"),
                        function_data.get("arguments"),
                    )
                ):
                    raise ValueError("LiteLLM tool call fields mismatch")
                calls.append(
                    ToolCall(
                        call_id=cast("str", call["id"]),
                        name=cast("str", function_data["name"]),
                        arguments=cast("str", function_data["arguments"]),
                    )
                )
        content = raw.get("content")
        if content is not None and not isinstance(content, str):
            raise ValueError("LiteLLM message content mismatch")
        usage = payload.get("usage")
        usage_data = cast("dict[str, object]", usage) if isinstance(usage, dict) else {}

        def token_count(name: str) -> int | None:
            value = usage_data.get(name)
            return value if isinstance(value, int) and value >= 0 else None

        finish_reason = choice.get("finish_reason")
        return ModelTurn(
            cast("str | None", content),
            tuple(calls),
            finish_reason=finish_reason if isinstance(finish_reason, str) else None,
            prompt_tokens=token_count("prompt_tokens"),
            completion_tokens=token_count("completion_tokens"),
            request_id=response.headers.get("x-request-id"),
            elapsed_ms=elapsed_ms,
        )
