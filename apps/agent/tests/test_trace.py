from __future__ import annotations

import pytest

from pi.chronicler.agent.harness import AnswerSource
from pi.chronicler.agent.trace import (
    TraceRecorder,
    normalize_query,
    normalized_arguments_hash,
    normalized_query_hash,
)


def test_query_and_arguments_hashes_are_normalized_without_plaintext() -> None:
    query = "  Extra\u00a0Attack   FIGHTER "
    equivalent = "extra attack fighter"

    assert normalize_query(query) == equivalent
    assert normalized_query_hash(query) == normalized_query_hash(equivalent)
    assert normalized_arguments_hash({"query": query}) == normalized_arguments_hash(
        {"query": equivalent}
    )


@pytest.mark.parametrize(
    ("query", "normalized", "expected_hash"),
    [
        (
            "EXTRA ATTACK FIGHTER",
            "extra attack fighter",
            "902740567c189e1cb8f339d1d28dd34becbba82f4541fca47f815882c19b715b",
        ),
        (
            "  Straße  ",
            "straße",
            "787f4770613d3824cbc89b6d5da90a123e41b07b90b45ea3738c216b14616140",
        ),
        (
            "  Café\u00a0PLAYER ",
            "café player",
            "f98d37267807d3ba5aee84f154a8a0121538658161f410fd1e99b316558763b0",
        ),
        (
            "\uff26\uff29\uff32\uff25\u3000BALL",
            "fire ball",
            "bad50a8f4012d4883f47059f61e41fcff9950228d10d966e4b333fe132fa6637",
        ),
    ],
)
def test_unicode_query_hash_matches_the_bot_runtime_contract(
    query: str, normalized: str, expected_hash: str
) -> None:
    assert normalize_query(query) == normalized
    assert normalized_query_hash(query) == expected_hash


def test_trace_snapshot_has_safe_timing_and_evidence_fields() -> None:
    trace = TraceRecorder("Who is the secret NPC?", model="luna", build_sha="abc123")
    trace.record_model(12, prompt_tokens=20, completion_tokens=4)
    trace.record_archive("search_documents", {"query": "secret NPC"}, 8)
    trace.select_evidence(
        (AnswerSource("doc-1", "Rules", "https://example.test", "v7"),)
    )

    diagnostics = trace.snapshot("answered")

    assert diagnostics["outcome"] == "answered"
    assert diagnostics["build_sha"] == "abc123"
    assert diagnostics["validation_attempts"] == 0
    assert diagnostics["model_timings"] == [
        {
            "elapsed_ms": 12,
            "model": "luna",
            "status": "ok",
            "prompt_tokens": 20,
            "completion_tokens": 4,
        }
    ]
    archive_timing = diagnostics["archive_timings"][0]
    assert archive_timing["tool"] == "search_documents"
    assert archive_timing["query_hash"] == normalized_query_hash("secret NPC")
    assert "secret NPC" not in str(diagnostics)
    assert diagnostics["selected_evidence"] == [
        {"document_id": "doc-1", "content_version": "v7"}
    ]
