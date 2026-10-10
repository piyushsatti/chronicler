from __future__ import annotations

import asyncio
import json
import logging
import signal
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
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
        raw.get("version") != 1
        or raw.get("type") != "question.requested"
        or not isinstance(job_id, str)
        or not isinstance(question, str)
        or not question.strip()
        or len(question) > 600
    ):
        raise ValueError("job schema mismatch")
    uuid.UUID(job_id)
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


def completed_payload(job: QuestionJob, answer: Answer) -> dict[str, object]:
    return {
        "version": 1,
        "type": "question.completed",
        "job_id": job.job_id,
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
    job: QuestionJob, settings: AgentSettings, error: BaseException
) -> dict[str, object]:
    return {
        "version": 1,
        "type": "question.failed",
        "job_id": job.job_id,
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


async def claim_job(
    client: httpx.AsyncClient, settings: AgentSettings
) -> QuestionJob | None:
    response = await client.post(
        f"{settings.api_url}/v1/agent/questions/claim",
        headers={"X-Ingest-Secret": settings.ingest_secret},
    )
    if response.status_code == 204:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"claim failed: HTTP {response.status_code}")
    if len(response.content) > MAX_JOB_BYTES:
        raise ValueError("job exceeded byte limit")
    decoded = response.json()
    if not isinstance(decoded, dict):
        raise ValueError("job schema mismatch")
    return parse_job(
        cast("Mapping[str, object]", decoded),
        body_len=len(response.content),
    )


async def complete_job(
    client: httpx.AsyncClient, settings: AgentSettings, payload: dict[str, object]
) -> None:
    job_id = cast(str, payload["job_id"])
    response = await client.post(
        f"{settings.api_url}/v1/agent/questions/{job_id}/complete",
        headers={
            "X-Ingest-Secret": settings.ingest_secret,
            "Content-Type": "application/json",
        },
        content=json.dumps(payload, separators=(",", ":")),
    )
    if response.status_code != 204:
        raise RuntimeError(f"complete failed: HTTP {response.status_code}")


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
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            while True:
                try:
                    job = await claim_job(client, settings)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("Claim poll failed")
                    await asyncio.sleep(settings.claim_interval_seconds)
                    continue
                if job is None:
                    await asyncio.sleep(settings.claim_interval_seconds)
                    continue
                try:
                    started = time.perf_counter()
                    answer = await answer_job(job, harness, settings)
                    await complete_job(client, settings, completed_payload(job, answer))
                    logger.info(
                        "qa_job_complete job_id=%s status=%s "
                        "source_count=%d elapsed_ms=%d",
                        job.job_id,
                        answer.status,
                        len(answer.sources),
                        round((time.perf_counter() - started) * 1_000),
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    logger.exception("Q&A job failed", extra={"job_id": job.job_id})
                    try:
                        await complete_job(
                            client, settings, failed_payload(job, settings, error)
                        )
                    except Exception:
                        logger.exception(
                            "Failed to post question.failed",
                            extra={"job_id": job.job_id},
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
