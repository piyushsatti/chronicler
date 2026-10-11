from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import httpx
import pytest

from pi.chronicler.agent import worker
from pi.chronicler.agent.harness import AgentHarness, Answer, AnswerSource
from pi.chronicler.agent.settings import AgentSettings
from pi.chronicler.agent.worker import (
    ClaimedQuestion,
    Lease,
    LeaseLost,
    QuestionJob,
    WorkerAuthenticationError,
    WorkerContractError,
    _LeaseState,
    _local_times,
    claim_job,
    completed_payload,
    freeze_result,
    parse_job,
    parse_lease,
    process_claim,
    retry_job,
)

JOB_ID = "00000000-0000-4000-8000-000000000001"
SERVER_START = datetime(2000, 1, 1, tzinfo=UTC)
SERVER_DEADLINE = SERVER_START + timedelta(seconds=100)


def _settings(tmp_path) -> AgentSettings:
    return AgentSettings(
        api_url="http://api.test",
        ingest_secret="secret",
        claim_interval_seconds=0.01,
        litellm_base_url="https://model.test",
        litellm_api_key="fake",
        model="answer",
        archive_mcp_url="https://archive.test",
        archive_mcp_token="fake",
        context="Rules",
        tokenizer_path=tmp_path,
        tokenizer_sha256="fake",
        tokenizer_config_sha256="fake",
        chat_template_sha256="fake",
        http_timeout_seconds=0.2,
    )


def _wire_lease(*, remaining=100.0, elapsed=0.0) -> dict[str, object]:
    return {
        "token": "7",
        "attempt": 2,
        "expires_at": min(
            SERVER_START + timedelta(seconds=elapsed + 30), SERVER_DEADLINE
        ).isoformat(),
        "renew_after_seconds": 10,
        "attempt_deadline_at": SERVER_DEADLINE.isoformat(),
        "remaining_budget_seconds": remaining,
    }


def _wire_claim(**changes) -> dict[str, object]:
    return {
        "version": 1,
        "type": "question.requested",
        "job_id": JOB_ID,
        "question": "How does Graze work?",
        "lease": _wire_lease(),
        "question_deadline_at": SERVER_DEADLINE.isoformat(),
        **changes,
    }


def _claim(*, age=0.0, remaining=100.0, lease_end=30.0) -> ClaimedQuestion:
    return ClaimedQuestion(
        QuestionJob(JOB_ID, "How does Graze work?"),
        Lease(
            "7",
            2,
            SERVER_START + timedelta(seconds=lease_end),
            10,
            SERVER_DEADLINE,
            remaining,
        ),
        SERVER_DEADLINE,
        asyncio.get_running_loop().time() - age,
        0.0,
    )


class ImmediateHarness:
    def __init__(self, answer=None):
        self.calls = 0
        self.result = answer or Answer(
            "answered", "Grounded answer", (), {"outcome": "answered"}
        )

    async def answer(self, *args, **kwargs):
        self.calls += 1
        return self.result


class BlockingCall:
    def __init__(self):
        self.started = asyncio.Event()
        self.joined = asyncio.Event()

    async def call(self):
        self.started.set()
        try:
            await asyncio.Event().wait()
        finally:
            # Joining matters: release must follow cancellation cleanup.
            await asyncio.sleep(0)
            self.joined.set()


class BlockingHarness:
    def __init__(self, nested):
        self.nested = nested

    async def answer(self, *args, **kwargs):
        await self.nested.call()
        raise AssertionError("blocking operation must have been cancelled")


@pytest.mark.parametrize(
    "key,value",
    [
        ("token", "0"),
        ("token", "01"),
        ("token", "+1"),
        ("token", 1),
        ("token", "9223372036854775808"),
        ("token", "1" * 100),
        ("attempt", True),
        ("attempt", 1.0),
        ("attempt", 0),
        ("renew_after_seconds", 9),
        ("renew_after_seconds", 10.0),
        ("remaining_budget_seconds", True),
        ("remaining_budget_seconds", -1),
        ("remaining_budget_seconds", 100.01),
        ("remaining_budget_seconds", float("nan")),
        ("remaining_budget_seconds", float("inf")),
        ("expires_at", "2026-10-10T00:00:00"),
        ("expires_at", "not-a-time"),
        ("expires_at", (SERVER_DEADLINE + timedelta(seconds=1)).isoformat()),
    ],
)
def test_receipt_rejects_wrong_types_ranges_and_timestamps(key, value):
    with pytest.raises(ValueError):
        parse_lease({**_wire_lease(), key: value})


@pytest.mark.parametrize("raw", [None, [], {}, {**_wire_lease(), "extra": True}])
def test_receipt_requires_exact_fields(raw):
    with pytest.raises(ValueError):
        parse_lease(raw)


def test_receipt_accepts_max_int64_and_zero_remaining_budget():
    lease = parse_lease(
        {**_wire_lease(), "token": "9223372036854775807", "remaining_budget_seconds": 0}
    )
    assert lease.token == "9223372036854775807"
    assert lease.remaining_budget_seconds == 0


def test_local_deadline_subtracts_rtt_without_worker_wall_clock():
    lease = parse_lease(_wire_lease())
    assert _local_times(lease, 500.0, 2.0) == (598.0, 528.0, 508.0)
    # Advancing the server calendar by decades has no effect on local durations.
    skewed = replace(
        lease,
        expires_at=lease.expires_at + timedelta(days=20000),
        attempt_deadline_at=lease.attempt_deadline_at + timedelta(days=20000),
    )
    assert _local_times(skewed, 500.0, 2.0) == (598.0, 528.0, 508.0)


async def test_claim_records_request_rtt_and_protocol(tmp_path):
    async def handler(request):
        assert json.loads(request.content) == {"lease_protocol": 1}
        assert request.headers["X-Ingest-Secret"] == "secret"
        await asyncio.sleep(0.02)
        return httpx.Response(200, json=_wire_claim())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        claim = await claim_job(client, _settings(tmp_path))
    assert claim is not None
    assert claim.request_seconds >= 0.015
    assert _LeaseState.from_claim(claim).deadline <= claim.received_at + 99.985


@pytest.mark.parametrize(
    "body",
    [
        {
            "version": 1,
            "type": "question.requested",
            "job_id": JOB_ID,
            "question": "Rules?",
        },
        _wire_claim(lease=None),
        _wire_claim(job_id="bad"),
        _wire_claim(
            question_deadline_at=(SERVER_DEADLINE + timedelta(seconds=1)).isoformat()
        ),
    ],
)
async def test_old_wire_and_unusable_receipts_stop_without_completion(tmp_path, body):
    paths = []

    def handler(request):
        paths.append(request.url.path)
        return httpx.Response(200, json=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(WorkerContractError, match="invalid receipt"):
            await claim_job(client, _settings(tmp_path))
    assert paths == ["/v1/agent/questions/claim"]


@pytest.mark.parametrize(
    "content", [b"{", b"[]", b"\xff", b'{"job_id":"a","job_id":"b"}', b" " * 65537]
)
async def test_malformed_claim_body_leaves_recovery_to_expiry(tmp_path, content):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, content=content))
    ) as client:
        with pytest.raises(WorkerContractError):
            await claim_job(client, _settings(tmp_path))


@pytest.mark.parametrize(
    "changes",
    [
        {"question": []},
        {"question": ""},
        {"question": "x" * 601},
        {"version": True},
        {"extra": "unapproved"},
        {"history": {"messages": [], "incomplete": "no"}},
    ],
)
async def test_invalid_payload_with_valid_receipt_is_safely_failed(tmp_path, changes):
    sent = []
    harness = ImmediateHarness()

    def handler(request):
        if request.url.path.endswith("/claim"):
            return httpx.Response(200, json=_wire_claim(**changes))
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        claim = await claim_job(client, _settings(tmp_path))
        assert claim is not None and claim.payload_error is not None
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, harness), claim
            )
            == "acknowledged"
        )
    assert harness.calls == 0
    assert len(sent) == 1
    assert sent[0]["type"] == "question.failed"
    assert sent[0]["lease_token"] == "7"
    assert sent[0]["message"] == worker.FAILURE_MESSAGE


@pytest.mark.parametrize(
    "status,expected",
    [
        (401, WorkerAuthenticationError),
        (403, WorkerAuthenticationError),
        (422, WorkerContractError),
    ],
)
async def test_run_stops_claiming_on_auth_or_contract_failure(
    tmp_path, monkeypatch, status, expected
):
    requests = []
    closed = []
    original_client = httpx.AsyncClient

    def handler(request):
        requests.append(request.url.path)
        return httpx.Response(status)

    class Model:
        def __init__(self, *args, **kwargs):
            pass

        async def close(self):
            closed.append(True)

    monkeypatch.setattr(worker, "LiteLlmChat", Model)
    monkeypatch.setattr(worker, "ArchiveClient", lambda *args, **kwargs: object())
    monkeypatch.setattr(
        worker, "AgentHarness", lambda *args, **kwargs: ImmediateHarness()
    )
    monkeypatch.setattr(AgentSettings, "budget", lambda self: object())
    monkeypatch.setattr(
        worker.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(
            transport=httpx.MockTransport(handler), **kwargs
        ),
    )
    with pytest.raises(expected):
        await worker.run(_settings(tmp_path))
    assert requests == ["/v1/agent/questions/claim"]
    assert closed == [True]


@pytest.mark.parametrize("operation", ["model", "archive"])
@pytest.mark.parametrize("renew_status", [409, 503, "read_error"])
async def test_renew_failure_cancels_and_joins_nested_work(
    tmp_path, operation, renew_status
):
    call = BlockingCall()
    sent = []

    async def handler(request):
        assert call.started.is_set()
        sent.append(request.url.path)
        assert request.url.path.endswith("/renew")
        assert json.loads(request.content) == {"lease_token": "7"}
        if renew_status == "read_error":
            raise httpx.ReadError("renewal response lost", request=request)
        return httpx.Response(renew_status)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await process_claim(
            client,
            _settings(tmp_path),
            cast(AgentHarness, BlockingHarness(call)),
            _claim(age=9.99),
        )
    assert result == "lost"
    assert call.joined.is_set(), operation
    assert len(sent) == 1


async def test_renew_receipt_retains_fence_and_only_tightens_budget():
    state = _LeaseState.from_claim(_claim())
    original = state.deadline
    state.accept_renewal(
        parse_lease(_wire_lease(remaining=95, elapsed=10)),
        state.claim.received_at + 10,
        0.1,
    )
    assert state.deadline == original
    assert state.expires_at > state.claim.received_at + 30
    state.accept_renewal(
        parse_lease(_wire_lease(remaining=80, elapsed=20)),
        state.claim.received_at + 19,
        1,
    )
    assert state.deadline == state.claim.received_at + 98
    for changed in (
        replace(state.claim.lease, token="8"),
        replace(state.claim.lease, attempt=3),
        replace(
            state.claim.lease,
            attempt_deadline_at=SERVER_DEADLINE + timedelta(seconds=1),
        ),
    ):
        with pytest.raises(WorkerContractError, match="changed"):
            state.accept_renewal(changed, state.claim.received_at + 20, 0.1)


async def test_malformed_renew_receipt_cancels_work_and_surfaces_contract(tmp_path):
    call = BlockingCall()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda req: httpx.Response(
                200, json={"lease": _wire_lease(remaining=90, elapsed=10)}
            )
        )
    ) as client:
        with pytest.raises(WorkerContractError, match="invalid receipt"):
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, BlockingHarness(call)),
                _claim(age=9.99),
            )
    assert call.joined.is_set()


async def test_terminal_ack_cancels_and_joins_pending_renew_request(tmp_path):
    renewing = BlockingCall()

    class Harness:
        async def answer(self, *args, **kwargs):
            await renewing.started.wait()
            return Answer("answered", "Grounded", ())

    async def handler(request):
        if request.url.path.endswith("/renew"):
            await renewing.call()
            raise AssertionError("pending renewal should be cancelled")
        assert request.url.path.endswith("/complete")
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, Harness()),
                _claim(age=9.99),
            )
            == "acknowledged"
        )
    assert renewing.joined.is_set()


async def test_lease_loss_cancels_and_joins_pending_delivery(tmp_path):
    delivering = BlockingCall()
    payloads = []

    async def handler(request):
        if request.url.path.endswith("/complete"):
            payloads.append(json.loads(request.content))
            await delivering.call()
            raise AssertionError("pending delivery should be cancelled")
        assert request.url.path.endswith("/renew")
        assert delivering.started.is_set()
        return httpx.Response(409)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness()),
                _claim(age=9.99),
            )
            == "lost"
        )
    assert delivering.joined.is_set()
    assert [payload["type"] for payload in payloads] == ["question.completed"]


@pytest.mark.parametrize("lost_response", ["read_error", "http_503", "timeout"])
async def test_uncertain_success_replays_exact_frozen_bytes(
    tmp_path, monkeypatch, lost_response
):
    monkeypatch.setattr(worker, "DELIVERY_RETRY_SECONDS", 0.001)
    sent = []
    answer = Answer("answered", "Read-backed answer", (), {"outcome": "answered"})
    harness = ImmediateHarness(answer)

    async def handler(request):
        assert request.url.path.endswith("/complete")
        sent.append(request.content)
        if len(sent) == 1:
            # Pretend the API committed before its response was lost. Mutation of
            # the caller's diagnostics must not affect the frozen replay.
            answer.diagnostics["late_mutation"] = "must not reach the API"
            if lost_response == "read_error":
                raise httpx.ReadError("lost ack", request=request)
            if lost_response == "timeout":
                await asyncio.sleep(0.3)
            return httpx.Response(503)
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, harness), _claim()
            )
            == "acknowledged"
        )
    assert harness.calls == 1
    assert len(sent) == 2 and sent[0] == sent[1]
    assert json.loads(sent[0])["type"] == "question.completed"
    assert "late_mutation" not in json.loads(sent[1])["diagnostics"]


async def test_stale_completion_stops_without_failure_conversion(tmp_path):
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(409)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness()),
                _claim(),
            )
            == "lost"
        )
    assert [payload["type"] for payload in sent] == ["question.completed"]


async def test_shutdown_joins_work_before_releasing_receipt(tmp_path):
    call = BlockingCall()
    releases = []

    def handler(request):
        assert call.joined.is_set()
        assert request.url.path.endswith("/retry")
        releases.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        task = asyncio.create_task(
            process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, BlockingHarness(call)),
                _claim(),
            )
        )
        await call.started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert releases == [{"lease_token": "7", "reason": "worker_shutdown"}]


async def test_shutdown_with_uncertain_success_does_not_release_or_fail(tmp_path):
    delivery = BlockingCall()
    paths = []

    async def handler(request):
        paths.append(request.url.path)
        await delivery.call()
        raise AssertionError("pending completion must be cancelled")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        task = asyncio.create_task(
            process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness()),
                _claim(),
            )
        )
        await delivery.started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert delivery.joined.is_set()
    assert paths == [f"/v1/agent/questions/{JOB_ID}/complete"]


async def test_processing_deadline_cancels_work_with_five_second_delivery_reserve(
    tmp_path,
):
    call = BlockingCall()
    sent = []
    loop = asyncio.get_running_loop()
    claim = _claim(remaining=5.03, lease_end=100)

    def handler(request):
        assert call.joined.is_set()
        sent.append((loop.time(), json.loads(request.content)))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, BlockingHarness(call)),
                claim,
            )
            == "acknowledged"
        )
    assert call.joined.is_set()
    assert sent[0][1]["type"] == "question.failed"
    assert claim.received_at + 0.02 <= sent[0][0] < claim.received_at + 0.2


async def test_deadline_cancels_pending_delivery_and_never_posts_late_success(tmp_path):
    delivery = BlockingCall()
    sent = []
    harness = ImmediateHarness()

    async def handler(request):
        sent.append(json.loads(request.content))
        await delivery.call()
        raise AssertionError("deadline must cancel pending delivery")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, harness),
                _claim(remaining=0.03, lease_end=100),
            )
            == "lost"
        )
    assert harness.calls == 0
    assert delivery.joined.is_set()
    assert [payload["type"] for payload in sent] == ["question.failed"]


async def test_expired_receipt_invokes_no_model_or_http(tmp_path):
    harness = ImmediateHarness()

    def handler(request):
        raise AssertionError("expired claim must not send")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, harness), _claim(age=31)
            )
            == "expired"
        )
    assert harness.calls == 0


async def test_transient_model_error_releases_instead_of_publishing_result(tmp_path):
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            raise httpx.ConnectError("transient model connection failure")

    def handler(request):
        assert request.url.path.endswith("/retry")
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, Harness()), _claim()
            )
            == "released"
        )
    assert sent == [{"lease_token": "7", "reason": "transient_error"}]


async def test_retry_lost_response_then_released_receipt_conflict_stops(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(worker, "DELIVERY_RETRY_SECONDS", 0.001)
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            raise httpx.ConnectError("transient")

    def handler(request):
        assert request.url.path.endswith("/retry")
        sent.append(request.content)
        if len(sent) == 1:
            raise httpx.ReadError("release committed; ack lost", request=request)
        return httpx.Response(409)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, Harness()), _claim()
            )
            == "lost"
        )
    assert len(sent) == 2 and sent[0] == sent[1]


async def test_old_released_retry_receipt_conflicts(tmp_path):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(409))
    ) as client:
        with pytest.raises(LeaseLost):
            await retry_job(
                client, _settings(tmp_path), _claim(), "transient_error", seconds=0.1
            )


@pytest.mark.parametrize(
    "key,value",
    [
        ("answer", "x" * 16001),
        ("sources", [{}] * 101),
        ("sources", [None]),
        ("message", "x" * 1001),
        ("error", "x" * 1001),
        ("diagnostics", {"text": "x" * 16384}),
        ("diagnostics", []),
        ("lease_token", None),
        ("version", True),
        ("extra", "invalid"),
    ],
)
def test_completion_payload_bounds(key, value):
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"), Answer("answered", "text", ()), "7"
    )
    with pytest.raises(ValueError):
        freeze_result({**payload, key: value})


def test_existing_sources_and_null_defaults_remain_compatible():
    source = AnswerSource(
        "document", "Title", "https://docs.test/title", "v1", "passage"
    )
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"), Answer("answered", "text", (source,)), "7"
    )
    assert json.loads(freeze_result(payload))["sources"] == [
        {
            "document_id": "document",
            "title": "Title",
            "url": "https://docs.test/title",
            "content_version": "v1",
            "passage_id": "passage",
        }
    ]
    assert (
        json.loads(freeze_result({**payload, "sources": None, "diagnostics": None}))[
            "sources"
        ]
        is None
    )
    payload.pop("sources")
    payload.pop("diagnostics")
    assert freeze_result(payload)


def test_completion_total_utf8_byte_limit_and_diagnostics_utf8_limit():
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"), Answer("answered", "🪐" * 16000, ()), "7"
    )
    # The individual character limit passes; UTF-8 expansion trips the body cap.
    with pytest.raises(ValueError, match="byte limit"):
        freeze_result({**payload, "sources": [{"text": "x" * 2000}]})
    with pytest.raises(ValueError, match="diagnostics"):
        freeze_result({**payload, "diagnostics": {"text": "🪐" * 4096}})


def test_question_and_history_limits_keep_unicode_character_and_byte_semantics():
    body = {
        "version": 1,
        "type": "question.requested",
        "job_id": JOB_ID,
        "question": "🪐" * 600,
    }
    assert parse_job(body).question == "🪐" * 600
    history = {
        "messages": [{"role": "user", "content": "🪐" * 2048}],
        "incomplete": False,
    }
    assert parse_job({**body, "history": history}).history
    history["messages"][0]["content"] += "x"
    with pytest.raises(ValueError, match="byte limit"):
        parse_job({**body, "history": history})


async def test_confirmed_renewal_allows_existing_work_to_finish(tmp_path):
    renewed = asyncio.Event()
    paths = []

    class Harness:
        async def answer(self, *args, **kwargs):
            await renewed.wait()
            await asyncio.sleep(0)
            return Answer("answered", "Grounded after renewal", ())

    def handler(request):
        paths.append(request.url.path)
        if request.url.path.endswith("/renew"):
            assert json.loads(request.content) == {"lease_token": "7"}
            renewed.set()
            return httpx.Response(200, json=_wire_lease(remaining=90, elapsed=10))
        assert request.url.path.endswith("/complete")
        assert json.loads(request.content)["answer"] == "Grounded after renewal"
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, Harness()),
                _claim(age=9.99),
            )
            == "acknowledged"
        )
    assert len(paths) == 2


async def test_model_returning_after_processing_cancellation_cannot_publish_success(
    tmp_path,
):
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                # A provider finishing while cancellation propagates must still
                # pass the worker's independent monotonic deadline check.
                return Answer("answered", "Late result must not be sent", ())

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, Harness()),
                _claim(remaining=5.02, lease_end=100),
            )
            == "acknowledged"
        )
    assert [payload["type"] for payload in sent] == ["question.failed"]


async def test_invalid_local_result_trace_still_delivers_safe_failure(tmp_path):
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            error = RuntimeError("provider failure")
            error.qa_diagnostics = {"text": "x" * 16384}
            raise error

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client, _settings(tmp_path), cast(AgentHarness, Harness()), _claim()
            )
            == "acknowledged"
        )
    assert sent[0]["type"] == "question.failed"
    assert "diagnostics" not in sent[0]


@pytest.mark.parametrize("content", ["\x00" * 8192, "<>&" * 2730 + "<>"])
async def test_claim_response_preserves_max_history_with_escaping_and_multibyte_question(
    tmp_path, content
):
    question = "🪐" * 600
    body = (
        json.dumps(
            _wire_claim(
                question=question,
                history={
                    "messages": [{"role": "user", "content": content}],
                    "incomplete": False,
                },
            )
        )
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .encode()
    )
    assert 16384 < len(body) <= 65536
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, content=body))
    ) as client:
        claim = await claim_job(client, _settings(tmp_path))
    assert claim is not None and claim.payload_error is None
    assert claim.job.question == question
    assert claim.job.history[0].content == content
    assert len(claim.job.history[0].content.encode("utf-8")) == 8192


@pytest.mark.parametrize("size", [65536, 65537])
async def test_claim_response_encoded_byte_boundary(tmp_path, size):
    original = json.dumps(_wire_claim()).encode()
    body = original + b" " * (size - len(original))
    assert len(body) == size
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, content=body))
    ) as client:
        if size == 65536:
            assert await claim_job(client, _settings(tmp_path)) is not None
        else:
            with pytest.raises(WorkerContractError, match="invalid receipt"):
                await claim_job(client, _settings(tmp_path))


async def test_oversized_renew_response_cancels_work(tmp_path):
    call = BlockingCall()
    original = json.dumps(_wire_lease(remaining=90, elapsed=10)).encode()
    body = original + b" " * (16385 - len(original))
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, content=body))
    ) as client:
        with pytest.raises(WorkerContractError, match="invalid receipt"):
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, BlockingHarness(call)),
                _claim(age=9.99),
            )
    assert call.joined.is_set()


def test_completion_character_bound_does_not_override_encoded_escaping_cap():
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"), Answer("answered", "\x00" * 16000, ()), "7"
    )
    with pytest.raises(ValueError, match="byte limit"):
        freeze_result(payload)


async def test_oversized_validated_sources_are_failed_without_truncation(tmp_path):
    source = AnswerSource("document", "<>&" * 30000, "https://docs.test/title", "v1")
    answer = Answer("answered", "Grounded answer", (source,))
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness(answer)),
                _claim(),
            )
            == "acknowledged"
        )
    assert sent[0]["type"] == "question.failed"
    assert source.title == "<>&" * 30000
    assert answer.sources == (source,)


async def test_renew_arriving_during_processing_timeout_cleanup_keeps_failure_delivery(
    tmp_path,
):
    call = BlockingCall()
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            call.started.set()
            try:
                await asyncio.Event().wait()
            finally:
                # The renewal reply lands after the processing timeout fires,
                # while the cancelled provider is still joining its cleanup.
                await asyncio.sleep(0.04)
                call.joined.set()

    async def handler(request):
        if request.url.path.endswith("/renew"):
            await asyncio.sleep(0.045)
            return httpx.Response(200, json=_wire_lease(remaining=5.0, elapsed=95))
        assert call.joined.is_set()
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, Harness()),
                _claim(age=9.99, remaining=15.04, lease_end=100),
            )
            == "acknowledged"
        )
    assert [payload["type"] for payload in sent] == ["question.failed"]


@pytest.mark.parametrize("renew_status", [503, 409, 401, 403, 422])
@pytest.mark.parametrize("after_cancel", ["answer", "transport_error"])
async def test_F2_provider_returning_after_renew_failure_cannot_send_result(
    tmp_path, renew_status, after_cancel
):
    joined = asyncio.Event()
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                joined.set()
                if after_cancel == "transport_error":
                    raise httpx.ConnectError("revoked cleanup failed") from None
                return Answer("answered", "Returned during revoked cleanup", ())

    def handler(request):
        sent.append(request.url.path)
        return httpx.Response(
            renew_status if request.url.path.endswith("/renew") else 204
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        if renew_status in {401, 403, 422}:
            expected = (
                WorkerContractError
                if renew_status == 422
                else WorkerAuthenticationError
            )
            with pytest.raises(expected):
                await process_claim(
                    client,
                    _settings(tmp_path),
                    cast(AgentHarness, Harness()),
                    _claim(age=9.99),
                )
        else:
            assert (
                await process_claim(
                    client,
                    _settings(tmp_path),
                    cast(AgentHarness, Harness()),
                    _claim(age=9.99),
                )
                == "lost"
            )
    assert joined.is_set()
    assert sent == [f"/v1/agent/questions/{JOB_ID}/renew"]


@pytest.mark.parametrize("provider_after_cancel", ["answer", "transport_error"])
async def test_F2_shutdown_suppressed_cancel_only_allows_explicit_shutdown_release(
    tmp_path, provider_after_cancel
):
    started = asyncio.Event()
    joined = asyncio.Event()
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                joined.set()
                if provider_after_cancel == "transport_error":
                    raise httpx.ConnectError("cleanup failed") from None
                return Answer("answered", "Returned during shutdown", ())

    def handler(request):
        assert joined.is_set()
        sent.append((request.url.path, json.loads(request.content)))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        task = asyncio.create_task(
            process_claim(
                client, _settings(tmp_path), cast(AgentHarness, Harness()), _claim()
            )
        )
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert joined.is_set()
    assert sent == [
        (
            f"/v1/agent/questions/{JOB_ID}/retry",
            {"lease_token": "7", "reason": "worker_shutdown"},
        )
    ]


@pytest.mark.parametrize("after_cancel", ["answer", "transport_error"])
async def test_F2_lease_expiry_suppressed_cancel_cannot_send_result_or_retry(
    tmp_path, after_cancel
):
    joined = asyncio.Event()
    sent = []

    class Harness:
        async def answer(self, *args, **kwargs):
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                joined.set()
                if after_cancel == "transport_error":
                    raise httpx.ConnectError("cancelled provider") from None
                return Answer("answered", "Lease expired", ())

    def handler(request):
        sent.append(request.url.path)
        return httpx.Response(204)

    # Expiry precedes renewal and processing cutoff; only the lease watchdog cancels work.
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, Harness()),
                _claim(lease_end=0.02),
            )
            == "lost"
        )
    assert joined.is_set()
    assert sent == []


def test_F3_diagnostics_html_escaping_counterexample_rejected_before_send():
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"),
        Answer("answered", "ok", (), {"text": "<" * 3000}),
        "7",
    )
    with pytest.raises(ValueError, match="diagnostics"):
        freeze_result(payload)


async def test_F3_invalid_go_diagnostics_becomes_safe_failure_before_any_success_send(
    tmp_path,
):
    diagnostics = {"text": "<" * 3000}
    answer = Answer("answered", "Read-backed answer unchanged", (), diagnostics)
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(204)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness(answer)),
                _claim(),
            )
            == "acknowledged"
        )
    assert [payload["type"] for payload in sent] == ["question.failed"]
    assert answer.text == "Read-backed answer unchanged"
    assert answer.diagnostics is diagnostics and diagnostics["text"] == "<" * 3000


_GO_DIAGNOSTICS_FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "worker-go-diagnostics-v1.json").read_text()
)


@pytest.mark.parametrize(
    "case", _GO_DIAGNOSTICS_FIXTURE["cases"], ids=lambda case: case["name"]
)
def test_F3_matches_frozen_go_normalization_bytes_and_digest(case):
    diagnostics = {"text": case["unit"] * case["repeat"] + case["padding"]}
    normalized = worker._go_diagnostics_json(diagnostics)
    assert len(normalized) == case["go_normalized_bytes"]
    assert hashlib.sha256(normalized).hexdigest() == case["go_normalized_sha256"]
    payload = completed_payload(
        QuestionJob(JOB_ID, "q"), Answer("answered", "ok", (), diagnostics), "7"
    )
    if case["valid"]:
        assert json.loads(freeze_result(payload))["diagnostics"] == diagnostics
    else:
        with pytest.raises(ValueError, match="diagnostics"):
            freeze_result(payload)


@pytest.mark.parametrize("suppressed_response", [204, 503, "read_error"])
async def test_F2_pending_delivery_suppressing_cancel_cannot_start_another_send(
    tmp_path, suppressed_response
):
    joined = asyncio.Event()
    sent = []

    async def handler(request):
        sent.append(request.url.path)
        if request.url.path.endswith("/renew"):
            return httpx.Response(503)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            joined.set()
            if suppressed_response == "read_error":
                raise httpx.ReadError(
                    "cancelled pending delivery", request=request
                ) from None
            return httpx.Response(suppressed_response)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (
            await process_claim(
                client,
                _settings(tmp_path),
                cast(AgentHarness, ImmediateHarness()),
                _claim(age=9.99),
            )
            == "lost"
        )
    assert joined.is_set()
    assert sent == [
        f"/v1/agent/questions/{JOB_ID}/complete",
        f"/v1/agent/questions/{JOB_ID}/renew",
    ]
