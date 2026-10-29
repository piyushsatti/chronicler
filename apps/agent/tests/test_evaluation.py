import json
from pathlib import Path

import pytest

from pi.chronicler.agent.evaluation import (
    GoldCase,
    load_cases,
    run_evaluation,
    score_answer,
    summarize,
)
from pi.chronicler.agent.harness import Answer, AnswerSource, ReplyHistoryMessage


@pytest.mark.parametrize(
    "misconception",
    [
        "Knocking the creature Prone moves it out of your reach, so moving away "
        "cannot provoke an Opportunity Attack.",
        "Because the target is Prone, it cannot make an Opportunity Attack.",
        "While Prone, Opportunity Attacks are not possible.",
        "A prone target has no available Reaction for an Opportunity Attack.",
        "Prone prevents Opportunity Attacks is not true, but Prone prevents "
        "Opportunity Attacks.",
        "Disengage still provokes an Opportunity Attack.",
        "You do not need to be able to see the target.",
        "Opportunity Attacks do not require a Reaction.",
        "A Prone creature does not have Disadvantage on its attack rolls.",
        "The Opportunity Attack does not have Disadvantage.",
        "Prone removes the target from your reach.",
        "Leaving reach does not provoke an Opportunity Attack.",
    ],
)
def test_compound_quality_expectation_lives_in_fixture(misconception: str) -> None:
    cases = {
        case.case_id: case
        for case in load_cases(
            Path(__file__).parent / "fixtures" / "answer-quality-v1.json"
        )
    }
    case = cases["combat-shove-prone-opportunity"]
    assert case.accepted_sources == tuple(
        cases[case_id].accepted_sources[0]
        for case_id in ("definition-shove", "condition-prone", "combat-opportunity")
    )
    sources = tuple(
        AnswerSource(
            source.document_id,
            "Rule source",
            "https://example.test/rules",
            source.content_version,
        )
        for source in case.accepted_sources
    )
    text = (
        "Shove lets you choose either to push the target 5 feet away or cause it to "
        "be Prone. Choosing Prone does not move the target or change its reach. "
        "A Prone creature's movement is restricted to crawling or spending half "
        "its Speed to stand, and its attack rolls have Disadvantage. If you move "
        "out of the target's reach while it can see you, it can use its Reaction "
        "to make an Opportunity Attack; Disengage avoids that Opportunity Attack. "
        "Prone does not remove the Reaction, but the target's Opportunity Attack "
        "attack roll is made with Disadvantage."
    )

    assert score_answer(case, Answer("answered", text, sources), 1).passed
    score = score_answer(
        case, Answer("answered", f"{text} {misconception}", sources), 1
    )
    assert not score.passed
    assert any(failure.startswith("forbidden:") for failure in score.failures)


def test_load_and_score_grounded_case(tmp_path: Path) -> None:
    corpus = tmp_path / "cases.json"
    corpus.write_text(
        json.dumps(
            {
                "version": 1,
                "cases": [
                    {
                        "id": "jump-1",
                        "slice": "numeric",
                        "question": "Jump?",
                        "answerability": "answerable",
                        "required_patterns": ["15 feet", "3 \\+ 2 = 5"],
                        "forbidden_patterns": ["not specified"],
                        "accepted_sources": [
                            {"document_id": "doc-1", "content_version": "v1"}
                        ],
                        "critical": True,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    case = load_cases(corpus)[0]
    answer = Answer(
        "answered",
        "Long jump is 15 feet; high jump is 3 + 2 = 5 feet.",
        (AnswerSource("doc-1", "Jumping", "https://example.test", "v1"),),
    )

    score = score_answer(case, answer, 100)

    assert score.passed
    assert score.status == "answered"
    assert score.answer_text == answer.text
    assert score.citations == (
        {
            "document_id": "doc-1",
            "content_version": "v1",
            "url": "https://example.test",
        },
    )
    assert score.required_matches == (True, True)
    assert score.forbidden_matches == (False,)
    assert summarize([score], (case,))["critical_pass"] is True


def test_score_rejects_wrong_source_and_forbidden_claim(tmp_path: Path) -> None:
    corpus = tmp_path / "cases.json"
    corpus.write_text(
        json.dumps(
            {
                "version": 1,
                "cases": [
                    {
                        "id": "jump-1",
                        "slice": "numeric",
                        "question": "Jump?",
                        "answerability": "answerable",
                        "required_patterns": ["15 feet"],
                        "forbidden_patterns": ["not specified"],
                        "accepted_sources": [
                            {"document_id": "doc-1", "content_version": "v1"}
                        ],
                        "critical": True,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    case = load_cases(corpus)[0]
    answer = Answer(
        "answered",
        "The distance is not specified.",
        (AnswerSource("wrong", "Wrong", "https://example.test", "v1"),),
    )

    score = score_answer(case, answer, 100)

    assert not score.passed
    assert "missing:15 feet" in score.failures
    assert "forbidden:not specified" in score.failures
    assert "citation:unexpected" in score.failures


def test_answerable_case_requires_gold_sources(tmp_path: Path) -> None:
    corpus = tmp_path / "cases.json"
    corpus.write_text(
        json.dumps(
            {
                "version": 1,
                "cases": [
                    {
                        "id": "bad",
                        "slice": "numeric",
                        "question": "Jump?",
                        "answerability": "answerable",
                        "accepted_sources": [],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="requires accepted sources"):
        load_cases(corpus)


def test_routed_and_grounded_cases_have_distinct_citation_contracts(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "cases.json"
    corpus.write_text(
        json.dumps(
            {
                "version": 1,
                "cases": [
                    {
                        "id": "route-1",
                        "slice": "admission",
                        "question": "What can you do?",
                        "answerability": "routed",
                        "required_patterns": ["public"],
                        "accepted_sources": [],
                        "history": [{"role": "user", "content": "Earlier question"}],
                        "history_incomplete": True,
                    },
                    {
                        "id": "lore-1",
                        "slice": "lore",
                        "question": "Tell me lore",
                        "answerability": "grounded",
                        "accepted_sources": [],
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    routed, grounded = load_cases(corpus)

    assert routed.history == (ReplyHistoryMessage("user", "Earlier question"),)
    assert routed.history_incomplete
    assert score_answer(routed, Answer("answered", "Public help", ()), 1).passed
    assert score_answer(
        grounded,
        Answer(
            "answered",
            "Grounded lore",
            (AnswerSource("doc", "Lore", "https://example.test", "v1"),),
        ),
        1,
    ).passed
    assert not score_answer(grounded, Answer("answered", "Uncited lore", ()), 1).passed


@pytest.mark.asyncio
async def test_evaluation_records_operational_failure_instead_of_aborting() -> None:
    class BrokenHarness:
        async def answer(self, question: str, **kwargs: object) -> Answer:
            del question, kwargs
            raise TimeoutError

    case = GoldCase("case-1", "numeric", "Question?", "unsupported", (), (), (), True)

    scores, summary = await run_evaluation((case,), BrokenHarness(), 1)  # type: ignore[arg-type]

    assert scores[0].failures == ("operational:TimeoutError",)
    assert summary["critical_pass"] is False


def test_latency_is_report_only_unless_explicit_gate_requested() -> None:
    from pi.chronicler.agent.evaluation import evaluation_passes

    summary = {
        "critical_pass": True,
        "slice_pass_rates": {"rules": 1.0},
        "latency_ms": {"p95": 70000},
    }
    assert evaluation_passes(summary)
    assert not evaluation_passes(summary, max_p95_ms=60000)
    assert evaluation_passes(summary, max_p95_ms=70000)
    summary["critical_pass"] = False
    assert not evaluation_passes(summary)
    with pytest.raises(ValueError):
        evaluation_passes(summary, max_p95_ms=0)
