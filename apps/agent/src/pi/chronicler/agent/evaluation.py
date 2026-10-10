from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import statistics
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from pi.chronicler.agent.archive import ArchiveClient
from pi.chronicler.agent.harness import AgentHarness, Answer, ReplyHistoryMessage
from pi.chronicler.agent.model import LiteLlmChat
from pi.chronicler.agent.settings import AgentSettings
from pi.chronicler.agent.worker import QuestionJob, answer_job


@dataclass(frozen=True, slots=True)
class GoldSource:
    document_id: str
    content_version: str
    passage_id: str | None = None
    url: str | None = None


@dataclass(frozen=True, slots=True)
class GoldCase:
    case_id: str
    slice_name: str
    question: str
    answerability: Literal["answerable", "grounded", "routed", "unsupported"]
    required_patterns: tuple[str, ...]
    forbidden_patterns: tuple[str, ...]
    accepted_sources: tuple[GoldSource, ...]
    critical: bool
    history: tuple[ReplyHistoryMessage, ...] = ()
    history_incomplete: bool = False


@dataclass(frozen=True, slots=True)
class CaseScore:
    case_id: str
    slice_name: str
    passed: bool
    failures: tuple[str, ...]
    elapsed_ms: int
    answer_hash: str
    source_ids: tuple[str, ...]
    # The receipt carries the answer and citation evidence so an offline gate can
    # recompute the result.  Questions are deliberately not copied into receipts.
    answerability: Literal["answerable", "grounded", "routed", "unsupported"] = (
        "unsupported"
    )
    status: str = "error"
    answer_text: str = ""
    citations: tuple[dict[str, str], ...] = ()
    required_matches: tuple[bool, ...] = ()
    forbidden_matches: tuple[bool, ...] = ()


def _strings(raw: dict[str, object], name: str) -> tuple[str, ...]:
    value = raw.get(name, [])
    if not isinstance(value, list):
        raise ValueError(f"evaluation {name} schema mismatch")
    values = tuple(item for item in value if isinstance(item, str))
    if len(values) != len(value):
        raise ValueError(f"evaluation {name} schema mismatch")
    for pattern in values:
        try:
            re.compile(pattern)
        except re.error as error:
            raise ValueError(f"evaluation {name} contains invalid regex") from error
    return values


def _gold_sources(raw: object) -> tuple[GoldSource, ...]:
    if not isinstance(raw, list):
        raise ValueError("evaluation sources schema mismatch")
    sources: list[GoldSource] = []
    for value in raw:
        if not isinstance(value, dict):
            raise ValueError("evaluation source schema mismatch")
        source = cast("dict[str, object]", value)
        document_id = source.get("document_id")
        content_version = source.get("content_version")
        if (
            not isinstance(document_id, str)
            or not document_id.strip()
            or not isinstance(content_version, str)
            or not content_version.strip()
        ):
            raise ValueError("evaluation source schema mismatch")
        passage_id = source.get("passage_id")
        url = source.get("url")
        if passage_id is not None and (
            not isinstance(passage_id, str) or not passage_id.strip()
        ):
            raise ValueError("evaluation source passage schema mismatch")
        if url is not None and (not isinstance(url, str) or not url.strip()):
            raise ValueError("evaluation source URL schema mismatch")
        sources.append(GoldSource(document_id, content_version, passage_id, url))
    if len({(source.document_id, source.content_version) for source in sources}) != len(
        sources
    ):
        raise ValueError("evaluation source IDs must be unique")
    return tuple(sources)


def load_cases(path: Path) -> tuple[GoldCase, ...]:
    payload = cast("dict[str, object]", json.loads(path.read_text(encoding="utf-8")))
    if payload.get("version") != 1 or not isinstance(payload.get("cases"), list):
        raise ValueError("evaluation corpus schema mismatch")
    cases: list[GoldCase] = []
    for raw_case in cast("list[object]", payload["cases"]):
        if not isinstance(raw_case, dict):
            raise ValueError("evaluation case schema mismatch")
        raw = cast("dict[str, object]", raw_case)
        case_id = raw.get("id")
        slice_name = raw.get("slice")
        question = raw.get("question")
        if (
            not isinstance(case_id, str)
            or not case_id.strip()
            or not isinstance(slice_name, str)
            or not slice_name.strip()
            or not isinstance(question, str)
            or not question.strip()
        ):
            raise ValueError("evaluation case identity/schema mismatch")
        sources = _gold_sources(raw.get("accepted_sources"))
        answerability = raw.get("answerability")
        if answerability not in {
            "answerable",
            "grounded",
            "routed",
            "unsupported",
        }:
            raise ValueError("evaluation answerability was invalid")
        raw_history = raw.get("history", [])
        if not isinstance(raw_history, list):
            raise ValueError("evaluation history schema mismatch")
        history: list[ReplyHistoryMessage] = []
        for message in raw_history:
            if (
                not isinstance(message, dict)
                or message.get("role") not in {"user", "assistant"}
                or not isinstance(message.get("content"), str)
                or not message["content"].strip()
            ):
                raise ValueError("evaluation history message schema mismatch")
            history.append(
                ReplyHistoryMessage(
                    cast('Literal["user", "assistant"]', message["role"]),
                    cast("str", message["content"]),
                )
            )
        history_incomplete = raw.get("history_incomplete", False)
        if not isinstance(history_incomplete, bool):
            raise ValueError("evaluation history completeness schema mismatch")
        critical = raw.get("critical", False)
        if not isinstance(critical, bool):
            raise ValueError("evaluation critical flag schema mismatch")

        case = GoldCase(
            case_id=case_id,
            slice_name=slice_name,
            question=question,
            answerability=cast(
                "Literal['answerable', 'grounded', 'routed', 'unsupported']",
                answerability,
            ),
            required_patterns=_strings(raw, "required_patterns"),
            forbidden_patterns=_strings(raw, "forbidden_patterns"),
            accepted_sources=sources,
            critical=critical,
            history=tuple(history),
            history_incomplete=history_incomplete,
        )
        if case.answerability == "answerable" and not case.accepted_sources:
            raise ValueError(
                f"answerable case {case.case_id} requires accepted sources"
            )
        cases.append(case)
    if len({case.case_id for case in cases}) != len(cases):
        raise ValueError("evaluation case IDs must be unique")
    return tuple(cases)


def score_answer(case: GoldCase, answer: Answer, elapsed_ms: int) -> CaseScore:
    failures: list[str] = []
    expected_status = (
        "unsupported" if case.answerability == "unsupported" else "answered"
    )
    if answer.status != expected_status:
        failures.append(f"status:{answer.status}")
    required_matches = tuple(
        re.search(pattern, answer.text, re.IGNORECASE) is not None
        for pattern in case.required_patterns
    )
    for pattern, matched in zip(case.required_patterns, required_matches, strict=True):
        if not matched:
            failures.append(f"missing:{pattern}")
    forbidden_matches = tuple(
        re.search(pattern, answer.text, re.IGNORECASE) is not None
        for pattern in case.forbidden_patterns
    )
    for pattern, matched in zip(
        case.forbidden_patterns, forbidden_matches, strict=True
    ):
        if matched:
            failures.append(f"forbidden:{pattern}")

    actual_sources = {
        (source.document_id, source.content_version) for source in answer.sources
    }
    accepted_sources = {
        (source.document_id, source.content_version) for source in case.accepted_sources
    }
    if case.answerability == "answerable":
        if not actual_sources:
            failures.append("citation:missing")
        elif not actual_sources.issubset(accepted_sources):
            failures.append("citation:unexpected")
    elif case.answerability == "grounded":
        if not actual_sources:
            failures.append("citation:missing")
        elif accepted_sources and not actual_sources.issubset(accepted_sources):
            failures.append("citation:unexpected")
    elif actual_sources:
        failures.append("citation:unsupported")

    return CaseScore(
        case_id=case.case_id,
        slice_name=case.slice_name,
        passed=not failures,
        failures=tuple(failures),
        elapsed_ms=elapsed_ms,
        answer_hash=hashlib.sha256(answer.text.encode("utf-8")).hexdigest(),
        source_ids=tuple(source.document_id for source in answer.sources),
        answerability=case.answerability,
        status=answer.status,
        answer_text=answer.text,
        citations=tuple(
            {
                **{
                    "document_id": source.document_id,
                    "content_version": source.content_version,
                    "url": source.url,
                },
                **(
                    {"passage_id": source.passage_id}
                    if source.passage_id is not None
                    else {}
                ),
            }
            for source in answer.sources
        ),
        required_matches=required_matches,
        forbidden_matches=forbidden_matches,
    )


def summarize(
    scores: list[CaseScore], cases: tuple[GoldCase, ...]
) -> dict[str, object]:
    case_by_id = {case.case_id: case for case in cases}
    by_slice: dict[str, list[CaseScore]] = {}
    by_answerability: dict[str, list[CaseScore]] = {}
    for score in scores:
        by_slice.setdefault(score.slice_name, []).append(score)
        by_answerability.setdefault(score.answerability, []).append(score)
    elapsed = sorted(score.elapsed_ms for score in scores)
    p95_index = max(0, (95 * len(elapsed) + 99) // 100 - 1)
    critical_pass = all(
        score.passed for score in scores if case_by_id[score.case_id].critical
    )
    slice_rates = {
        name: sum(score.passed for score in items) / len(items)
        for name, items in sorted(by_slice.items())
    }
    answerability_rates = {
        name: sum(score.passed for score in items) / len(items)
        for name, items in sorted(by_answerability.items())
    }
    return {
        "cases": len(cases),
        "samples": len(scores),
        "passed": sum(score.passed for score in scores),
        "critical_pass": critical_pass,
        "slice_pass_rates": slice_rates,
        "answerability_pass_rates": answerability_rates,
        "latency_ms": {
            "p50": round(statistics.median(elapsed)) if elapsed else None,
            "p95": elapsed[p95_index] if elapsed else None,
        },
    }


async def run_evaluation(
    cases: tuple[GoldCase, ...],
    harness: AgentHarness,
    repeats: int,
    settings: AgentSettings | None = None,
) -> tuple[list[CaseScore], dict[str, object]]:
    scores: list[CaseScore] = []
    for repeat in range(repeats):
        for case in cases:
            started = time.perf_counter()
            try:
                if settings is None:
                    answer = await harness.answer(
                        case.question,
                        history=case.history,
                        history_incomplete=case.history_incomplete,
                        job_id=f"eval:{case.case_id}:{repeat + 1}",
                    )
                else:
                    job_id = str(
                        uuid.uuid5(
                            uuid.NAMESPACE_URL,
                            f"chronicler:eval:{case.case_id}:{repeat + 1}",
                        )
                    )
                    answer = await answer_job(
                        QuestionJob(
                            job_id,
                            case.question,
                            case.history,
                            case.history_incomplete,
                        ),
                        harness,
                        settings,
                    )
                elapsed_ms = round((time.perf_counter() - started) * 1_000)
                scores.append(score_answer(case, answer, elapsed_ms))
            except Exception as error:
                scores.append(
                    CaseScore(
                        case_id=case.case_id,
                        slice_name=case.slice_name,
                        passed=False,
                        failures=(f"operational:{type(error).__name__}",),
                        elapsed_ms=round((time.perf_counter() - started) * 1_000),
                        answer_hash="",
                        source_ids=(),
                        answerability=case.answerability,
                        status="error",
                        answer_text="",
                        citations=(),
                        required_matches=(),
                        forbidden_matches=(),
                    )
                )
    return scores, summarize(scores, cases)


async def _run(args: argparse.Namespace) -> int:
    settings = AgentSettings.from_env()
    cases = load_cases(Path(args.corpus))
    if args.slice:
        cases = tuple(case for case in cases if case.slice_name in args.slice)
    if args.critical_only:
        cases = tuple(case for case in cases if case.critical)
    if not cases:
        raise ValueError("evaluation selection contained no cases")
    model = LiteLlmChat(
        settings.litellm_base_url,
        settings.litellm_api_key,
        args.model or settings.model,
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
    try:
        harness = AgentHarness(model, archive, settings.context)
        for warmup in range(args.warmups):
            await harness.answer(cases[0].question, job_id=f"eval:warmup:{warmup + 1}")
        scores, summary = await run_evaluation(
            cases, harness, args.repeats, settings=settings
        )
    finally:
        await model.close()
    receipt = {
        "version": 1,
        "model": args.model or settings.model,
        "corpus_sha256": hashlib.sha256(Path(args.corpus).read_bytes()).hexdigest(),
        "summary": summary,
        "max_p95_ms": args.max_p95_ms,
        "scores": [
            {
                "case_id": score.case_id,
                "slice": score.slice_name,
                "passed": score.passed,
                "failures": list(score.failures),
                "elapsed_ms": score.elapsed_ms,
                "answer_hash": score.answer_hash,
                "source_ids": list(score.source_ids),
                "answerability": score.answerability,
                "status": score.status,
                "answer_text": score.answer_text,
                "answer": score.answer_text,
                "citations": [dict(citation) for citation in score.citations],
                "required_matches": list(score.required_matches),
                "forbidden_matches": list(score.forbidden_matches),
            }
            for score in scores
        ],
    }
    print(json.dumps(receipt, separators=(",", ":"), sort_keys=True))
    return 0 if evaluation_passes(summary, args.max_p95_ms) else 1


def evaluation_passes(
    summary: dict[str, object], max_p95_ms: int | None = None
) -> bool:
    if max_p95_ms is not None and max_p95_ms <= 0:
        raise ValueError("Optional p95 threshold must be positive")
    p95 = cast("dict[str, object]", summary["latency_ms"])["p95"]
    answerability_rates = cast(
        "dict[str, float]",
        summary.get("answerability_pass_rates", summary["slice_pass_rates"]),
    )
    latency_passes = max_p95_ms is None or (isinstance(p95, int) and p95 <= max_p95_ms)
    return (
        bool(summary["critical_pass"])
        and all(rate >= 0.95 for rate in answerability_rates.values())
        and latency_passes
    )


def _positive_ms(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("p95 threshold must be positive")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate grounded Chronicler answers")
    parser.add_argument("corpus")
    parser.add_argument("--model")
    parser.add_argument(
        "--max-p95-ms",
        type=_positive_ms,
        help="Optional latency gate; latency is report-only by default",
    )
    parser.add_argument("--repeats", type=int, default=3, choices=range(1, 6))
    parser.add_argument("--warmups", type=int, default=3, choices=range(0, 6))
    parser.add_argument("--slice", action="append")
    parser.add_argument("--critical-only", action="store_true")
    raise SystemExit(asyncio.run(_run(parser.parse_args())))
