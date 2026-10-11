from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import signal
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast

import httpx

from pi.chronicler.agent.admission import admit_question
from pi.chronicler.agent.archive import ArchiveClient
from pi.chronicler.agent.harness import AgentHarness, Answer, ReplyHistoryMessage
from pi.chronicler.agent.model import LiteLlmChat
from pi.chronicler.agent.settings import AgentSettings
from pi.chronicler.agent.trace import Outcome, TraceRecorder, is_timeout_error

logger = logging.getLogger(__name__)
FAILURE_MESSAGE = "I couldn't finish this request. Please try again."
MAX_REPLY_HISTORY_MESSAGES = 12
MAX_REPLY_HISTORY_CONTENT_BYTES = 8 * 1024
MAX_JOB_BYTES = 16 * 1024
MAX_RESULT_BYTES = 64 * 1024
MAX_CLAIM_RESPONSE_BYTES = 64 * 1024
MAX_QUESTION_SECONDS = 100.0
LEASE_SECONDS = 30.0
DELIVERY_RESERVE_SECONDS = 5.0
DELIVERY_RETRY_SECONDS = 0.25
_FAILURE_OUTCOMES: frozenset[Outcome] = frozenset(
    {
        "archive_timeout",
        "archive_error",
        "model_timeout",
        "model_error",
        "validation_exhausted",
        "context_exhausted",
    }
)


@dataclass(frozen=True, slots=True)
class QuestionJob:
    job_id: str
    question: str
    history: tuple[ReplyHistoryMessage, ...] = ()
    history_incomplete: bool = False


def _failure_diagnostics(
    error: BaseException, job: QuestionJob, settings: AgentSettings
) -> dict[str, object]:
    existing = getattr(error, "qa_diagnostics", None)
    if isinstance(existing, dict):
        return existing
    outcome = getattr(error, "qa_outcome", None)
    if outcome not in _FAILURE_OUTCOMES:
        outcome = "model_timeout" if is_timeout_error(error) else "model_error"
    trace = TraceRecorder(
        job.question, model=settings.model, build_sha=settings.build_sha
    )
    return trace.snapshot(cast(Outcome, outcome))


def parse_job(raw: Mapping[str, object], *, body_len: int | None = None) -> QuestionJob:
    if body_len is not None and body_len > MAX_JOB_BYTES:
        raise ValueError("job exceeded byte limit")
    job_id = raw.get("job_id")
    question = raw.get("question")
    if (
        set(raw) - {"version", "type", "job_id", "question", "history"}
        or type(raw.get("version")) is not int
        or raw.get("version") != 1
        or raw.get("type") != "question.requested"
        or not isinstance(job_id, str)
        or not isinstance(question, str)
        or not question.strip()
        or len(question) > 600
    ):
        raise ValueError("job schema mismatch")
    uuid.UUID(job_id)
    question.encode("utf-8")
    if "history" not in raw or raw["history"] is None:
        return QuestionJob(job_id, question)
    raw_history = raw["history"]
    if not isinstance(raw_history, dict) or set(raw_history) != {
        "messages",
        "incomplete",
    }:
        raise ValueError("job history schema mismatch")
    history = cast("Mapping[str, object]", raw_history)
    raw_messages = history["messages"]
    incomplete = history["incomplete"]
    if (
        not isinstance(raw_messages, list)
        or len(raw_messages) > MAX_REPLY_HISTORY_MESSAGES
        or not isinstance(incomplete, bool)
    ):
        raise ValueError("job history schema mismatch")
    messages: list[ReplyHistoryMessage] = []
    content_bytes = 0
    for raw_message in raw_messages:
        if not isinstance(raw_message, dict) or set(raw_message) != {
            "role",
            "content",
        }:
            raise ValueError("job history message schema mismatch")
        history_message = cast("Mapping[str, object]", raw_message)
        role = history_message["role"]
        content = history_message["content"]
        if (
            not isinstance(role, str)
            or role not in {"user", "assistant"}
            or not isinstance(content, str)
            or not content.strip()
        ):
            raise ValueError("job history message schema mismatch")
        content_bytes += len(content.encode("utf-8"))
        if content_bytes > MAX_REPLY_HISTORY_CONTENT_BYTES:
            raise ValueError("job history exceeded content byte limit")
        messages.append(
            ReplyHistoryMessage(cast('Literal["user", "assistant"]', role), content)
        )
    return QuestionJob(job_id, question, tuple(messages), incomplete)


def completed_payload(
    job: QuestionJob, answer: Answer, lease_token: str
) -> dict[str, object]:
    return {
        "version": 1,
        "type": "question.completed",
        "job_id": job.job_id,
        "lease_token": lease_token,
        "answer": answer.text,
        "sources": [
            {
                **{
                    "document_id": source.document_id,
                    "title": source.title,
                    "url": source.url,
                },
                **(
                    {"passage_id": source.passage_id}
                    if source.passage_id is not None
                    else {}
                ),
                "content_version": source.content_version,
            }
            for source in answer.sources
        ],
        "diagnostics": answer.diagnostics,
    }


def failed_payload(
    job: QuestionJob, settings: AgentSettings, error: BaseException, lease_token: str
) -> dict[str, object]:
    return {
        "version": 1,
        "type": "question.failed",
        "job_id": job.job_id,
        "lease_token": lease_token,
        "message": FAILURE_MESSAGE,
        "diagnostics": _failure_diagnostics(error, job, settings),
    }


async def answer_job(
    job: QuestionJob, harness: AgentHarness, settings: AgentSettings
) -> Answer:
    """Route stable capability answers before invoking model-backed retrieval."""

    decision = admit_question(job.question)
    if decision.should_retrieve:
        return await harness.answer(
            job.question,
            history=job.history,
            history_incomplete=job.history_incomplete,
            job_id=job.job_id,
        )
    if decision.response is None:  # pragma: no cover - AdmissionDecision invariant
        raise ValueError("admission route did not provide a response")
    trace = TraceRecorder(
        job.question, model=settings.model, build_sha=settings.build_sha
    )
    diagnostics = trace.snapshot("routed")
    diagnostics["admission_category"] = decision.category
    return Answer("answered", decision.response, (), diagnostics)


class WorkerAuthenticationError(RuntimeError):
    """The worker must stop claiming until its credentials are repaired."""


class WorkerContractError(RuntimeError):
    """A protocol mismatch must be surfaced instead of repeatedly claiming."""


class LeaseLost(RuntimeError):
    """The worker no longer has confirmed ownership of this attempt."""


class TransientHTTPError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Lease:
    token: str
    attempt: int
    expires_at: datetime
    renew_after_seconds: int
    attempt_deadline_at: datetime
    remaining_budget_seconds: float


@dataclass(frozen=True, slots=True)
class ClaimedQuestion:
    job: QuestionJob
    lease: Lease
    question_deadline_at: datetime
    received_at: float
    request_seconds: float
    payload_error: ValueError | None = None


@dataclass(slots=True)
class _LeaseState:
    claim: ClaimedQuestion
    deadline: float
    expires_at: float
    renew_at: float
    frozen_result: bytes | None = None
    work_timeout: asyncio.Timeout | None = None
    stopped: bool = False

    def check_active(self) -> None:
        if self.stopped:
            raise LeaseLost("attempt has stopped")
        if asyncio.get_running_loop().time() >= min(self.deadline, self.expires_at):
            self.stopped = True
            raise LeaseLost("attempt deadline or lease expiry reached")

    @classmethod
    def from_claim(cls, claim: ClaimedQuestion) -> _LeaseState:
        deadline, expires_at, renew_at = _local_times(
            claim.lease, claim.received_at, claim.request_seconds
        )
        return cls(claim, deadline, expires_at, renew_at)

    def accept_renewal(
        self, lease: Lease, received_at: float, request_seconds: float
    ) -> None:
        original = self.claim.lease
        if (
            lease.token != original.token
            or lease.attempt != original.attempt
            or lease.attempt_deadline_at != original.attempt_deadline_at
        ):
            raise WorkerContractError("renewal changed the attempt receipt")
        deadline, expires_at, renew_at = _local_times(
            lease, received_at, request_seconds
        )
        # RTT subtraction can only tighten the original whole-question budget.
        self.deadline = min(self.deadline, deadline)
        self.expires_at = min(self.deadline, expires_at)
        self.renew_at = renew_at
        if self.work_timeout is not None and not self.work_timeout.expired():
            self.work_timeout.reschedule(self.deadline - DELIVERY_RESERVE_SECONDS)


def _local_times(
    lease: Lease, received_at: float, request_seconds: float
) -> tuple[float, float, float]:
    remaining = max(0.0, lease.remaining_budget_seconds - request_seconds)
    deadline = received_at + remaining
    # Both timestamps use the server clock. Their difference needs no client
    # wall-clock comparison, even when the worker's clock is badly skewed.
    until_deadline = (lease.attempt_deadline_at - lease.expires_at).total_seconds()
    expires_at = min(deadline, received_at + LEASE_SECONDS, deadline - until_deadline)
    renew_at = received_at + max(0.0, lease.renew_after_seconds - request_seconds)
    return deadline, expires_at, renew_at


def _timestamp(raw: object) -> datetime:
    if not isinstance(raw, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", raw
    ):
        raise ValueError("receipt timestamp must be RFC3339")
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def _token(raw: object) -> str:
    if (
        not isinstance(raw, str)
        or re.fullmatch(r"[1-9][0-9]{0,18}", raw) is None
        or int(raw) > 2**63 - 1
    ):
        raise ValueError("lease token must be a positive decimal int64 string")
    return raw


def parse_lease(raw: object) -> Lease:
    if not isinstance(raw, dict) or set(raw) != {
        "token",
        "attempt",
        "expires_at",
        "renew_after_seconds",
        "attempt_deadline_at",
        "remaining_budget_seconds",
    }:
        raise ValueError("lease receipt schema mismatch")
    receipt = cast("Mapping[str, object]", raw)
    attempt = receipt["attempt"]
    renew_after = receipt["renew_after_seconds"]
    remaining = receipt["remaining_budget_seconds"]
    if (
        type(attempt) is not int
        or cast(int, attempt) < 1
        or type(renew_after) is not int
        or renew_after != 10
        or type(remaining) not in {int, float}
        or not math.isfinite(cast(float, remaining))
        or not 0 <= cast(float, remaining) <= MAX_QUESTION_SECONDS
    ):
        raise ValueError("lease receipt budget mismatch")
    lease = Lease(
        _token(receipt["token"]),
        cast(int, attempt),
        _timestamp(receipt["expires_at"]),
        cast(int, renew_after),
        _timestamp(receipt["attempt_deadline_at"]),
        float(cast(float, remaining)),
    )
    if lease.expires_at > lease.attempt_deadline_at:
        raise ValueError("lease expiry exceeds question deadline")
    return lease


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON field")
        result[key] = value
    return result


def _invalid_number(raw: str) -> object:
    raise ValueError(f"nonfinite JSON number: {raw}")


def _decode_response(
    response: httpx.Response, *, maximum_bytes: int = MAX_JOB_BYTES
) -> dict[str, object]:
    if len(response.content) > maximum_bytes:
        raise ValueError("receipt body exceeded byte limit")
    decoded: object = json.loads(
        response.content.decode("utf-8"),
        object_pairs_hook=_unique_object,
        parse_constant=_invalid_number,
    )
    if not isinstance(decoded, dict):
        raise ValueError("receipt body must be an object")
    return cast("dict[str, object]", decoded)


def _check_status(response: httpx.Response, expected: int, operation: str) -> None:
    status = response.status_code
    if status == expected:
        return
    if status in {401, 403}:
        raise WorkerAuthenticationError(f"{operation}: HTTP {status}")
    if status == 422:
        raise WorkerContractError(f"{operation}: HTTP 422")
    if status == 409:
        raise LeaseLost(f"{operation}: receipt is no longer current")
    if status == 429 or status >= 500:
        raise TransientHTTPError(f"{operation}: HTTP {status}")
    raise WorkerContractError(f"{operation}: unexpected HTTP {status}")


async def _post(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    path: str,
    content: bytes,
    *,
    seconds: float | None = None,
) -> httpx.Response:
    limit = settings.http_timeout_seconds
    if seconds is not None:
        limit = min(limit, seconds)
    if limit <= 0:
        raise LeaseLost("attempt deadline or lease expiry reached")
    async with asyncio.timeout(limit):
        return await client.post(
            f"{settings.api_url}/v1/agent/questions{path}",
            headers={
                "X-Ingest-Secret": settings.ingest_secret,
                "Content-Type": "application/json",
            },
            content=content,
            timeout=limit,
        )


async def claim_job(
    client: httpx.AsyncClient, settings: AgentSettings
) -> ClaimedQuestion | None:
    loop = asyncio.get_running_loop()
    started = loop.time()
    response = await _post(client, settings, "/claim", b'{"lease_protocol":1}')
    received_at = loop.time()
    if response.status_code == 204:
        return None
    _check_status(response, 200, "claim")
    try:
        raw = _decode_response(response, maximum_bytes=MAX_CLAIM_RESPONSE_BYTES)
        job_id = raw.get("job_id")
        if not isinstance(job_id, str):
            raise ValueError("missing job id")
        uuid.UUID(job_id)
        lease = parse_lease(raw.get("lease"))
        question_deadline = _timestamp(raw.get("question_deadline_at"))
        if question_deadline != lease.attempt_deadline_at:
            raise ValueError("attempt and question deadlines differ")
    except (ValueError, OverflowError) as error:
        # Without a usable receipt no completion or retry is safe. The server
        # expiry/sweeper owns recovery; stop and surface the contract failure.
        raise WorkerContractError("claim returned an invalid receipt") from error
    payload_error = None
    try:
        job = parse_job(
            {
                key: value
                for key, value in raw.items()
                if key not in {"lease", "question_deadline_at"}
            }
        )
    except (ValueError, UnicodeError) as error:
        payload_error = ValueError("claim returned an invalid question payload")
        payload_error.__cause__ = error
        job = QuestionJob(job_id, "")
    return ClaimedQuestion(
        job, lease, question_deadline, received_at, received_at - started, payload_error
    )


def _go_diagnostics_json(diagnostics: Mapping[str, object]) -> bytes:
    """Size the API's json.Marshal form before any delivery can begin."""
    compact = json.dumps(
        diagnostics,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    for character, escaped in (
        ("<", "\\u003c"),
        (">", "\\u003e"),
        ("&", "\\u0026"),
        ("\u2028", "\\u2028"),
        ("\u2029", "\\u2029"),
    ):
        compact = compact.replace(character, escaped)
    return compact.encode("utf-8")


def freeze_result(payload: Mapping[str, object]) -> bytes:
    if (
        set(payload)
        - {
            "version",
            "type",
            "job_id",
            "lease_token",
            "answer",
            "sources",
            "message",
            "error",
            "diagnostics",
        }
        or type(payload.get("version")) is not int
        or payload.get("version") != 1
    ):
        raise ValueError("completion schema mismatch")
    _token(payload.get("lease_token"))
    job_id = payload.get("job_id")
    if not isinstance(job_id, str):
        raise ValueError("completion job id missing")
    uuid.UUID(job_id)
    result_type = payload.get("type")
    required = "answer" if result_type == "question.completed" else "message"
    if not isinstance(result_type, str) or result_type not in {
        "question.completed",
        "question.failed",
    }:
        raise ValueError("completion type mismatch")
    for key, maximum in (("answer", 16_000), ("message", 1_000), ("error", 1_000)):
        value = payload.get(key)
        if value is not None and (not isinstance(value, str) or len(value) > maximum):
            raise ValueError(f"completion {key} exceeded limit")
    required_value = payload.get(required)
    if not isinstance(required_value, str) or not required_value.strip():
        raise ValueError(f"completion {required} must be nonempty")
    sources = payload.get("sources")
    if sources is not None and (
        not isinstance(sources, list)
        or len(sources) > 100
        or any(not isinstance(source, dict) for source in sources)
    ):
        raise ValueError("completion sources exceeded limit")
    diagnostics = payload.get("diagnostics")
    if diagnostics is not None and (
        not isinstance(diagnostics, dict)
        or len(_go_diagnostics_json(diagnostics)) > MAX_JOB_BYTES
    ):
        raise ValueError("completion diagnostics exceeded byte limit")
    # Serialize once, before the first send. No success-to-failure conversion is
    # allowed once delivery starts: a lost response may conceal a committed result.
    body = json.dumps(
        payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")
    if len(body) > MAX_RESULT_BYTES:
        raise ValueError("completion exceeded byte limit")
    return body


async def complete_job(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    payload: Mapping[str, object] | bytes,
    *,
    seconds: float | None = None,
) -> None:
    body = payload if isinstance(payload, bytes) else freeze_result(payload)
    decoded = cast("dict[str, object]", json.loads(body))
    job_id = cast(str, decoded["job_id"])
    response = await _post(
        client, settings, f"/{job_id}/complete", body, seconds=seconds
    )
    _check_status(response, 204, "complete")


async def retry_job(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    claim: ClaimedQuestion,
    reason: Literal["transient_error", "worker_shutdown"],
    *,
    seconds: float,
) -> None:
    body = json.dumps(
        {"lease_token": claim.lease.token, "reason": reason}, separators=(",", ":")
    ).encode()
    response = await _post(
        client, settings, f"/{claim.job.job_id}/retry", body, seconds=seconds
    )
    _check_status(response, 204, "retry")


async def _renew_loop(
    client: httpx.AsyncClient, settings: AgentSettings, state: _LeaseState
) -> None:
    loop = asyncio.get_running_loop()
    while True:
        await asyncio.sleep(
            max(
                0.0, min(state.renew_at, state.expires_at, state.deadline) - loop.time()
            )
        )
        remaining = min(state.deadline, state.expires_at) - loop.time()
        state.check_active()
        started = loop.time()
        body = json.dumps({"lease_token": state.claim.lease.token}).encode()
        try:
            response = await _post(
                client,
                settings,
                f"/{state.claim.job.job_id}/renew",
                body,
                seconds=remaining,
            )
            _check_status(response, 200, "renew")
            lease = parse_lease(_decode_response(response))
            state.accept_renewal(lease, loop.time(), loop.time() - started)
        except (WorkerAuthenticationError, WorkerContractError, LeaseLost):
            state.stopped = True
            raise
        except (ValueError, UnicodeError, OverflowError) as error:
            state.stopped = True
            raise WorkerContractError("renew returned an invalid receipt") from error
        except (httpx.TransportError, TimeoutError, TransientHTTPError) as error:
            # A failed renewal does not confirm a fresh ownership window. Stop
            # all siblings immediately and let the current lease expire safely.
            state.stopped = True
            raise LeaseLost("renewal could not confirm ownership") from error


def _transient_work_error(error: BaseException) -> bool:
    return isinstance(error, httpx.TransportError) or (
        isinstance(error, httpx.HTTPStatusError)
        and (error.response.status_code == 429 or error.response.status_code >= 500)
    )


async def _deliver_result(
    client: httpx.AsyncClient, settings: AgentSettings, state: _LeaseState
) -> str:
    assert state.frozen_result is not None
    loop = asyncio.get_running_loop()
    while True:
        state.check_active()
        remaining = min(state.deadline, state.expires_at) - loop.time()
        try:
            await complete_job(client, settings, state.frozen_result, seconds=remaining)
            state.check_active()
            return "acknowledged"
        except (httpx.TransportError, TimeoutError, TransientHTTPError):
            state.check_active()
            remaining = min(state.deadline, state.expires_at) - loop.time()
            if remaining <= 0:
                raise LeaseLost("terminal response uncertain at deadline") from None
            await asyncio.sleep(min(DELIVERY_RETRY_SECONDS, remaining))


async def _release_attempt(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    state: _LeaseState,
    reason: Literal["transient_error", "worker_shutdown"],
    *,
    limit: float | None = None,
    shutdown_release: bool = False,
) -> None:
    if shutdown_release and reason != "worker_shutdown":
        raise ValueError("stopped attempt permits only explicit shutdown release")
    loop = asyncio.get_running_loop()
    release_deadline = min(state.deadline, state.expires_at)
    if limit is not None:
        release_deadline = min(release_deadline, loop.time() + limit)
    while True:
        if not shutdown_release:
            state.check_active()
        remaining = (
            min(release_deadline, state.deadline, state.expires_at) - loop.time()
        )
        if remaining <= 0:
            raise LeaseLost("retry release deadline reached")
        try:
            await retry_job(client, settings, state.claim, reason, seconds=remaining)
            if not shutdown_release:
                state.check_active()
            return
        except (httpx.TransportError, TimeoutError, TransientHTTPError):
            if not shutdown_release:
                state.check_active()
            remaining = (
                min(release_deadline, state.deadline, state.expires_at) - loop.time()
            )
            if remaining <= 0:
                raise LeaseLost("retry release response uncertain") from None
            await asyncio.sleep(min(DELIVERY_RETRY_SECONDS, remaining))


async def _work_attempt(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    harness: AgentHarness,
    state: _LeaseState,
) -> str:
    claim = state.claim
    try:
        state.check_active()
        if claim.payload_error is not None:
            raise claim.payload_error
        if (
            asyncio.get_running_loop().time()
            >= state.deadline - DELIVERY_RESERVE_SECONDS
        ):
            raise TimeoutError("processing budget exhausted")
        try:
            async with asyncio.timeout_at(
                state.deadline - DELIVERY_RESERVE_SECONDS
            ) as guard:
                state.work_timeout = guard
                answer = await answer_job(claim.job, harness, settings)
                state.check_active()
                payload = completed_payload(claim.job, answer, claim.lease.token)
                body = freeze_result(payload)
                if (
                    asyncio.get_running_loop().time()
                    >= state.deadline - DELIVERY_RESERVE_SECONDS
                ):
                    raise TimeoutError("processing budget exhausted")
        finally:
            state.work_timeout = None
    except (asyncio.CancelledError, LeaseLost):
        raise
    except Exception as error:
        state.check_active()
        if _transient_work_error(error):
            await _release_attempt(client, settings, state, "transient_error")
            return "released"
        logger.warning(
            "Q&A attempt failed job_id=%s error_type=%s",
            claim.job.job_id,
            type(error).__name__,
        )
        state.check_active()
        payload = failed_payload(claim.job, settings, error, claim.lease.token)
        try:
            body = freeze_result(payload)
        except (ValueError, TypeError, OverflowError):
            # A classified trace may itself be malformed/oversized. Its omission
            # keeps the safe failure deliverable without truncating evidence.
            payload.pop("diagnostics", None)
            body = freeze_result(payload)
    state.check_active()
    state.frozen_result = body
    return await _deliver_result(client, settings, state)


async def process_claim(
    client: httpx.AsyncClient,
    settings: AgentSettings,
    harness: AgentHarness,
    claim: ClaimedQuestion,
) -> str:
    """Run one fenced attempt, joining every child before relinquishing ownership."""
    state = _LeaseState.from_claim(claim)
    if min(state.deadline, state.expires_at) <= asyncio.get_running_loop().time():
        return "expired"
    work = asyncio.create_task(
        _work_attempt(client, settings, harness, state),
        name=f"question:{claim.job.job_id}",
    )
    renew = asyncio.create_task(
        _renew_loop(client, settings, state), name=f"lease:{claim.job.job_id}"
    )
    tasks = (work, renew)
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        # Renew failures win over a sibling result, so no fresh work follows a
        # revoked/malformed receipt. Completion bytes remain immutable regardless.
        if renew in done:
            state.stopped = True
            await renew
            raise LeaseLost("renewal stopped")  # pragma: no cover
        return await work
    except LeaseLost:
        state.stopped = True
        return "lost"
    except (WorkerAuthenticationError, WorkerContractError):
        state.stopped = True
        raise
    except asyncio.CancelledError:
        was_active = not state.stopped
        state.stopped = True
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if was_active and state.frozen_result is None:
            remaining = (
                min(state.deadline, state.expires_at)
                - asyncio.get_running_loop().time()
            )
            if remaining > 0:
                try:
                    await _release_attempt(
                        client,
                        settings,
                        state,
                        "worker_shutdown",
                        limit=DELIVERY_RESERVE_SECONDS,
                        shutdown_release=True,
                    )
                except Exception:
                    logger.warning(
                        "Shutdown release unconfirmed job_id=%s", claim.job.job_id
                    )
        raise
    finally:
        state.stopped = True
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def run(settings: AgentSettings) -> None:
    model = LiteLlmChat(
        settings.litellm_base_url,
        settings.litellm_api_key,
        settings.model,
        settings.budget(),
        timeout_seconds=settings.model_timeout_seconds,
        temperature=settings.model_temperature,
        top_p=settings.model_top_p,
        presence_penalty=settings.model_presence_penalty,
        seed=settings.model_seed,
        enable_thinking=settings.model_enable_thinking,
    )
    archive = ArchiveClient(
        settings.archive_mcp_url,
        settings.archive_mcp_token,
        timeout_seconds=settings.archive_timeout_seconds,
    )
    harness = AgentHarness(
        model,
        archive,
        settings.context,
        allow_passage_reads=settings.archive_passage_reads,
        model_identity=settings.model,
        build_sha=settings.build_sha,
    )
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        try:
            while True:
                try:
                    claim = await claim_job(client, settings)
                except asyncio.CancelledError:
                    raise
                except (WorkerAuthenticationError, WorkerContractError):
                    raise
                except Exception:
                    logger.exception("Claim poll failed")
                    await asyncio.sleep(settings.claim_interval_seconds)
                    continue
                if claim is None:
                    await asyncio.sleep(settings.claim_interval_seconds)
                    continue
                outcome = await process_claim(client, settings, harness, claim)
                logger.info(
                    "qa_attempt_finished job_id=%s outcome=%s",
                    claim.job.job_id,
                    outcome,
                )
        finally:
            await model.close()


async def _main() -> None:
    settings = AgentSettings.from_env()
    task = asyncio.create_task(run(settings))
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, task.cancel)
    await task


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(_main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Agent stopped by operator")


if __name__ == "__main__":
    main()
