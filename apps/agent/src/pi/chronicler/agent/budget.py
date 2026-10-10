from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Protocol, cast

from transformers import AutoTokenizer


class ContextLimitError(ValueError):
    """The complete request plus output reserve exceeds model context."""


class TokenCounter(Protocol):
    def count(
        self, messages: list[dict[str, object]], tools: list[dict[str, object]]
    ) -> int: ...


class ChatTokenizer:
    """Offline tokenizer and template pinned to the serving model's assets."""

    def __init__(
        self,
        path: Path,
        tokenizer_sha256: str,
        config_sha256: str,
        template_sha256: str,
    ) -> None:
        for filename, expected in (
            ("tokenizer.json", tokenizer_sha256),
            ("tokenizer_config.json", config_sha256),
        ):
            if hashlib.sha256((path / filename).read_bytes()).hexdigest() != expected:
                raise ValueError(f"Agent tokenizer hash mismatch: {filename}")
        self._tokenizer = AutoTokenizer.from_pretrained(
            str(path), local_files_only=True, trust_remote_code=False
        )
        template = self._tokenizer.chat_template
        if not isinstance(template, str) or not template:
            raise ValueError("Agent requires one explicit matching chat template")
        if hashlib.sha256(template.encode()).hexdigest() != template_sha256:
            raise ValueError("Agent chat template hash mismatch")

    def count(
        self, messages: list[dict[str, object]], tools: list[dict[str, object]]
    ) -> int:
        # OpenAI wire arguments are JSON strings. vLLM renders parsed objects.
        normalized = copy.deepcopy(messages)
        for message in normalized:
            for call in cast("list[dict[str, object]]", message.get("tool_calls", [])):
                function = cast("dict[str, object]", call["function"])
                arguments = function.get("arguments")
                if isinstance(arguments, str):
                    function["arguments"] = json.loads(arguments)
        tokens = self._tokenizer.apply_chat_template(
            normalized,
            tools=tools or None,
            tokenize=True,
            add_generation_prompt=True,
        )
        return len(tokens)


class ContextBudget:
    def __init__(
        self,
        counter: TokenCounter,
        total_tokens: int = 32_768,
        completion_tokens: int = 2_048,
    ) -> None:
        if total_tokens <= 0 or not 0 < completion_tokens < total_tokens:
            raise ValueError("Completion reserve must be positive and below context")
        self.counter = counter
        self.total_tokens = total_tokens
        self.completion_tokens = completion_tokens

    def fits(
        self, messages: list[dict[str, object]], tools: list[dict[str, object]]
    ) -> bool:
        return (
            self.counter.count(messages, tools) + self.completion_tokens
            <= self.total_tokens
        )

    def require_fit(
        self, messages: list[dict[str, object]], tools: list[dict[str, object]]
    ) -> None:
        if not self.fits(messages, tools):
            raise ContextLimitError("Request and output reserve exceed model context")
