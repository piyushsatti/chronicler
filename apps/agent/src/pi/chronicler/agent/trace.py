from __future__ import annotations

import hashlib
import json
import time
import unicodedata
from collections.abc import Mapping
from typing import Literal

Outcome = Literal[
    "answered",
    "unsupported",
    "routed",
    "archive_timeout",
    "archive_error",
    "model_timeout",
    "model_error",
    "validation_exhausted",
    "context_exhausted",
]


# Keep the v1 whitespace set explicit instead of relying on Python's broader
# str.split() whitespace table. This is the ECMAScript whitespace/line
# terminator set used by the bot's equivalent code-point predicate.
def _is_hash_whitespace(character: str) -> bool:
    code_point = ord(character)
    return (
        0x0009 <= code_point <= 0x000D
        or code_point
        in {
            0x0020,
            0x00A0,
            0x1680,
            0x2028,
            0x2029,
            0x202F,
            0x205F,
            0x3000,
            0xFEFF,
        }
        or 0x2000 <= code_point <= 0x200A
    )


def _collapse_hash_whitespace(value: str) -> str:
    parts: list[str] = []
    current: list[str] = []
    for character in value:
        if _is_hash_whitespace(character):
            if current:
                parts.append("".join(current))
                current = []
        else:
            current.append(character)
    if current:
        parts.append("".join(current))
    return " ".join(parts)


def is_timeout_error(error: BaseException) -> bool:
    """Recognize asyncio and HTTP client timeout exception families."""

    return isinstance(error, TimeoutError) or (
        "timeout" in type(error).__name__.casefold()
    )


def normalize_query(query: str) -> str:
    """Return the v1 privacy-safe canonical form used for query identity.

    The hash contract is NFKC, default Unicode lowercase (not full case
    folding), and collapsed whitespace from a fixed cross-runtime set. In
    particular, the lowercase operation preserves ``ß`` instead of expanding
    it to ``ss``.
    """

    # Keep this deliberately aligned with JavaScript's Unicode toLowerCase().
    # Case folding would turn German ß into "ss" and break cross-runtime joins.
    normalized = unicodedata.normalize("NFKC", query).lower()
    return _collapse_hash_whitespace(normalized)


def normalized_query_hash(query: str) -> str:
    return hashlib.sha256(normalize_query(query).encode("utf-8")).hexdigest()


def _normalized_value(value: object, *, key: str | None = None) -> object:
    if isinstance(value, Mapping):
        return {
            str(item_key): _normalized_value(item_value, key=str(item_key))
            for item_key, item_value in sorted(
                value.items(), key=lambda item: str(item[0])
            )
        }
    if isinstance(value, (list, tuple)):
        return [_normalized_value(item) for item in value]
    if isinstance(value, str) and key == "query":
        return normalize_query(value)
    return value


def normalized_arguments_hash(arguments: Mapping[str, object]) -> str:
    canonical = json.dumps(
        _normalized_value(arguments),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class TraceRecorder:
    """Small in-memory trace for one Q&A job.

    Trace payloads deliberately contain identifiers and hashes only. In particular,
    Archive search text is never copied into a diagnostics result or exception.
    """

    def __init__(
        self,
        question: str,
        *,
        model: str = "unknown",
        build_sha: str = "unknown",
    ) -> None:
        self.started = time.perf_counter()
        self.model = model or "unknown"
        self.build_sha = build_sha or "unknown"
        self.question_hash = normalized_query_hash(question)
        self.validation_attempts = 0
        self.model_timings: list[dict[str, object]] = []
        self.archive_timings: list[dict[str, object]] = []
        self.selected_evidence: list[dict[str, str]] = []

    def record_model(
        self,
        elapsed_ms: int,
        *,
        status: Literal["ok", "error"] = "ok",
        request_id: str | None = None,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        provider_elapsed_ms: int | None = None,
        failure: str | None = None,
    ) -> None:
        timing: dict[str, object] = {
            "elapsed_ms": max(0, elapsed_ms),
            "model": self.model,
            "status": status,
        }
        if request_id:
            timing["request_id"] = request_id
        if prompt_tokens is not None:
            timing["prompt_tokens"] = prompt_tokens
        if completion_tokens is not None:
            timing["completion_tokens"] = completion_tokens
        if provider_elapsed_ms is not None:
            timing["provider_elapsed_ms"] = max(0, provider_elapsed_ms)
        if failure:
            timing["failure"] = failure
        self.model_timings.append(timing)

    def mark_last_model_error(self, failure: str) -> None:
        if self.model_timings:
            self.model_timings[-1]["status"] = "error"
            self.model_timings[-1]["failure"] = failure

    def record_archive(
        self,
        name: str,
        arguments: Mapping[str, object],
        elapsed_ms: int,
        *,
        status: Literal["ok", "error"] = "ok",
        failure: str | None = None,
    ) -> None:
        timing: dict[str, object] = {
            "tool": name,
            "elapsed_ms": max(0, elapsed_ms),
            "arguments_hash": normalized_arguments_hash(arguments),
            "status": status,
        }
        query = arguments.get("query")
        if isinstance(query, str):
            timing["query_hash"] = normalized_query_hash(query)
        if failure:
            timing["failure"] = failure
        self.archive_timings.append(timing)

    def mark_last_archive_error(self, failure: str) -> None:
        if self.archive_timings:
            self.archive_timings[-1]["status"] = "error"
            self.archive_timings[-1]["failure"] = failure

    def select_evidence(self, sources: object) -> None:
        selected: list[dict[str, str]] = []
        for source in sources if isinstance(sources, (list, tuple)) else ():
            document_id = getattr(source, "document_id", None)
            content_version = getattr(source, "content_version", None)
            if isinstance(document_id, str) and isinstance(content_version, str):
                selected.append(
                    {"document_id": document_id, "content_version": content_version}
                )
        self.selected_evidence = selected

    def snapshot(self, outcome: Outcome) -> dict[str, object]:
        return {
            "schema_version": 1,
            "outcome": outcome,
            "build_sha": self.build_sha,
            "model": self.model,
            "question_hash": self.question_hash,
            "validation_attempts": self.validation_attempts,
            "elapsed_ms": round((time.perf_counter() - self.started) * 1_000),
            "model_timings": [dict(item) for item in self.model_timings],
            "archive_timings": [dict(item) for item in self.archive_timings],
            "selected_evidence": [dict(item) for item in self.selected_evidence],
        }
