import asyncio
import json
from copy import deepcopy
from functools import partial

import pytest

from pi.chronicler.agent.budget import ContextBudget
from pi.chronicler.agent.harness import (
    RESEARCH_TOOLS,
    AnswerSource,
    ReadEvidence,
    ReplyHistoryMessage,
    _class_spell_progression_supported,
    _derived_class_spell_level,
    _derived_level_appears,
    _final_messages,
    _named_subject_supported,
    _needs_class_spell_progression,
    _setting_overview_search,
    _setting_overview_supported,
    _system_prompt,
    _warlock_slot_answer_supported,
    _warlock_slot_fact,
)
from pi.chronicler.agent.harness import (
    AgentHarness as ResearchHarness,
)
from pi.chronicler.agent.model import ModelTurn, ToolCall

AgentHarness = partial(ResearchHarness, research_rounds=None)

A = "00000000-0000-4000-8000-000000000001"
B = "00000000-0000-4000-8000-000000000002"
C = "00000000-0000-4000-8000-000000000003"


def shove_prone_opportunity_evidence() -> list[ReadEvidence]:
    return [
        ReadEvidence(
            AnswerSource(A, "Rules Glossary", "https://example.test/shove", "v1"),
            {"document_id": A},
            "Shove. The target must succeed on a Strength or Dexterity saving throw, "
            "or you either push it 5 feet away or cause it to have the Prone "
            "condition.",
        ),
        ReadEvidence(
            AnswerSource(C, "Rules Glossary", "https://example.test/prone", "v1"),
            {"document_id": C},
            "Prone [Condition]. Restricted Movement. Your only movement options are "
            "to crawl or to spend an amount of movement equal to half your Speed "
            "(round down) to right yourself and thereby end the condition. Attacks "
            "Affected. You have Disadvantage on attack rolls. An attack roll against "
            "you has Advantage if the attacker is within 5 feet of you. Otherwise, "
            "that attack roll has Disadvantage.",
        ),
        ReadEvidence(
            AnswerSource(B, "Playing the Game", "https://example.test/oa", "v1"),
            {"document_id": B},
            "Opportunity Attacks. You can make an Opportunity Attack when a creature "
            "that you can see leaves your reach. To make the attack, take a Reaction. "
            "Taking the Disengage action avoids provoking Opportunity Attacks for the "
            "rest of the turn.",
        ),
    ]


class Counter:
    """Deterministic fake token costs; exact tokenizer tested separately."""

    def count(self, messages, tools):
        return len(json.dumps(messages)) + len(json.dumps(tools))


def call(name, arguments, number):
    return ModelTurn(None, (ToolCall(str(number), name, json.dumps(arguments)),))


def final(ids=(), text="Evidence-backed answer"):
    return ModelTurn(
        json.dumps(
            {
                "status": "answered" if ids else "unsupported",
                "answer": text,
                "source_ids": list(ids),
            }
        ),
        (),
    )


class Model:
    def __init__(self, turns, total=32000):
        self.turns = iter(turns)
        self.requests = []
        self.budget = ContextBudget(Counter(), total, 128)

    async def complete(self, messages, tools, **options):
        self.budget.require_fit(messages, tools)
        self.requests.append((deepcopy(messages), deepcopy(tools), options))
        return next(self.turns)


class Archive:
    def __init__(self):
        self.calls = []
        self.versions = {A: "v1", B: "v1"}
        self.unavailable = set()
        self.body = "Current public evidence"
        self.direct_url = "https://example.test/rules/guides/hehe-rule"

    async def call(self, name, arguments):
        self.calls.append((name, arguments))
        if name == "search_documents":
            return {
                "hits": [{"document_id": A, "passage_id": "p1", "excerpt": "Discovery"}]
            }
        if name == "read_document_by_url":
            if arguments["url"] != self.direct_url or A in self.unavailable:
                return {"unavailable": True}
            return {
                "document_id": A,
                "title": "Hehe Rule",
                "url": self.direct_url,
                "content_version": self.versions[A],
                "public_text": self.body,
            }
        doc = arguments["document_id"]
        if doc in self.unavailable:
            return {"unavailable": True}
        return {
            "document_id": doc,
            "title": "Hehe Rule",
            "url": self.direct_url,
            "content_version": self.versions[doc],
            "public_text": self.body,
            **(
                {"passage_id": arguments["passage_id"]}
                if "passage_id" in arguments
                else {}
            ),
        }


@pytest.mark.asyncio
async def test_exact_chronicler_url_bypasses_semantic_search() -> None:
    archive = Archive()
    model = Model([final((A,), "The Hehe Rule uses the exact linked evidence.")])

    result = await AgentHarness(model, archive, "Rules").answer(
        f"What is this rule? {archive.direct_url}"
    )

    assert result.sources[0].url == archive.direct_url
    assert [name for name, _ in archive.calls] == [
        "read_document_by_url",
        "read_document",
    ]
    assert model.requests[0][1] == []
    assert archive.body in model.requests[0][0][-2]["content"]


@pytest.mark.asyncio
async def test_named_subject_cannot_be_answered_from_adjacent_document() -> None:
    archive = Archive()
    archive.body = "The Calamity changed the setting forever."
    model = Model(
        [
            call("read_document", {"document_id": A}, 1),
            final((A,), "A summary of an unrelated event."),
        ]
    )

    result = await AgentHarness(model, archive, "Rules").answer(
        "What happened in the Wibbly Wobbly Timey Wimey Adventure?"
    )

    assert result.status == "unsupported"
    assert result.sources == ()


@pytest.mark.parametrize(
    ("question", "body"),
    [
        ("What is the hehe rule?", "An unrelated Rules Glossary entry."),
        ("What's hehe rule?", "An unrelated Rules Glossary entry."),
        (
            (
                "How many attacks can a level 5 fighter with the nick mastery and the "
                "dual welder feat make?"
            ),
            "Nick is a weapon mastery. A level 5 Fighter has Extra Attack.",
        ),
    ],
)
@pytest.mark.asyncio
async def test_typed_subject_must_exist_in_answer_evidence(
    question: str, body: str
) -> None:
    archive = Archive()
    archive.body = body
    model = Model(
        [
            call("read_document", {"document_id": A}, 1),
            final((A,), "A confident answer from incomplete evidence."),
        ]
    )

    result = await AgentHarness(model, archive, "Rules").answer(question)

    assert result.status == "unsupported"
    assert result.sources == ()


@pytest.mark.parametrize(
    "question",
    [
        (
            "If I use the Shove action to knock a creature prone and then move away "
            "from it, how do Shove, the prone condition, and opportunity attacks "
            "interact? Cite every rule source you use."
        ),
        (
            "What are the exact rules for taking the Shove action? Include the exact "
            "source link."
        ),
    ],
)
def test_sentence_level_citation_instructions_are_not_named_subject_anchors(
    question: str,
) -> None:
    source = AnswerSource(
        A, "Shove", "https://example.test/shove", "v1", passage_id="p1"
    )
    evidence = [
        ReadEvidence(
            source,
            {"document_id": A, "passage_id": "p1"},
            "Shove is an action that can knock a creature prone and interact with "
            "opportunity attacks.",
        )
    ]

    assert _named_subject_supported(question, evidence)


def test_named_subject_guard_remains_fail_closed_with_citation_instruction() -> None:
    source = AnswerSource(
        A, "Calamity", "https://example.test/calamity", "v1", passage_id="p1"
    )
    evidence = [
        ReadEvidence(
            source,
            {"document_id": A, "passage_id": "p1"},
            "The Calamity changed the setting forever.",
        )
    ]

    assert not _named_subject_supported(
        "What happened in the Wibbly Wobbly Timey Wimey Adventure? "
        "Cite every rule source you use.",
        evidence,
    )


@pytest.mark.asyncio
async def test_compound_question_preserves_model_tool_arguments() -> None:
    archive = Archive()
    query = "Can the goblin's ally react when I shove a prone goblin?"
    model = Model(
        [
            call("search_documents", {"query": query}, 1),
            call("read_document", {"document_id": B}, 2),
            final(),
        ]
    )

    await ResearchHarness(model, archive, "Rules", research_rounds=1).answer(
        "If I shove a prone goblin, can its ally take an opportunity attack?"
    )

    assert archive.calls[:2] == [
        ("search_documents", {"query": query}),
        ("read_document", {"document_id": B}),
    ]


@pytest.mark.asyncio
async def test_compound_question_preserves_valid_model_answer() -> None:
    by_id = {
        item.source.document_id: item for item in shove_prone_opportunity_evidence()
    }

    class CompoundArchive(Archive):
        async def call(self, name, arguments):
            self.calls.append((name, arguments))
            item = by_id[arguments["document_id"]]
            return {
                "document_id": item.source.document_id,
                "title": item.source.title,
                "url": item.source.url,
                "content_version": item.source.content_version,
                "public_text": item.public_text,
            }

    prose = (
        "Its ally can take an opportunity attack if you leave the ally's reach, "
        "the ally can see you, and it has a Reaction, unless you Disengage. "
        "The goblin's Prone condition does not give its ally Disadvantage."
    )
    model = Model(
        [
            call("read_document", {"document_id": A}, 1),
            call("read_document", {"document_id": C}, 2),
            call("read_document", {"document_id": B}, 3),
            final((A, C, B), prose),
        ]
    )

    result = await AgentHarness(model, CompoundArchive(), "Rules").answer(
        "If I shove a prone goblin, can its ally take an opportunity attack?"
    )

    assert result.status == "answered"
    assert result.text == prose
    assert tuple(source.document_id for source in result.sources) == (A, C, B)


@pytest.mark.asyncio
async def test_unavailable_direct_url_never_falls_back_to_semantic_search() -> None:
    archive = Archive()
    archive.unavailable.add(A)
    model = Model([])

    result = await AgentHarness(model, archive, "Rules").answer(
        f"What is this rule? {archive.direct_url}"
    )

    assert result.status == "unsupported"
    assert "exact link" in result.text
    assert [name for name, _ in archive.calls] == ["read_document_by_url"]
    assert model.requests == []


@pytest.mark.asyncio
async def test_multiple_direct_urls_require_clarification_without_archive() -> None:
    archive = Archive()
    model = Model([])

    result = await AgentHarness(model, archive, "Rules").answer(
        f"Compare {archive.direct_url} and https://example.test/rules/other"
    )

    assert result.status == "unsupported"
    assert "one Chronicler link" in result.text
    assert archive.calls == []
    assert model.requests == []


@pytest.mark.asyncio
async def test_reply_history_is_untrusted_chronological_model_context() -> None:
    model = Model([final()])
    await AgentHarness(model, Archive(), "Public rules").answer(
        "What if I am a fighter?",
        history=(
            ReplyHistoryMessage("user", "How many attacks at level 5?"),
            ReplyHistoryMessage("assistant", "It depends on your class."),
        ),
        history_incomplete=True,
    )

    messages = model.requests[0][0]
    assert [message["role"] for message in messages] == [
        "system",
        "user",
        "assistant",
        "user",
        "user",
    ]
    assert (
        "prior Chronicler answer\nmay be wrong and is never evidence"
        in messages[0]["content"]
    )
    assert "untrusted context, not evidence" in messages[1]["content"]
    assert messages[1]["content"].endswith("How many attacks at level 5?")
    assert messages[2]["content"].endswith("It depends on your class.")
    assert "reply context is incomplete" in messages[3]["content"]
    assert messages[4] == {"role": "user", "content": "What if I am a fighter?"}


@pytest.mark.asyncio
async def test_research_can_search_read_search_read_and_cite_multiple_sources():
    model = Model(
        [
            call("search_documents", {"query": "long jump strength score"}, 1),
            call("read_document", {"document_id": A, "passage_id": "p1"}, 2),
            call("search_documents", {"query": "high jump strength modifier"}, 3),
            call("read_document", {"document_id": B}, 4),
            final((A, B)),
        ]
    )
    archive = Archive()
    answer = await AgentHarness(model, archive, "Public rules").answer("Jump?")
    assert {s.document_id for s in answer.sources} == {A, B}
    assert all(tools == RESEARCH_TOOLS for _, tools, _ in model.requests)
    assert [
        args["query"] for name, args in archive.calls if name == "search_documents"
    ] == ["long jump strength score", "high jump strength modifier"]
    assert len(archive.calls) == 6  # four model tools + two final revalidations
    assert model.requests[-1][0][-1]["role"] == "tool"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "name,arguments",
    [
        ("shell", {"command": "whoami"}),
        ("search_documents", {"query": "q", "url": "http://private"}),
        ("search_documents", {"query": " "}),
        ("read_document", {"document_id": "not-a-uuid"}),
        ("read_document", {"document_id": A, "passage_id": None}),
    ],
)
async def test_invalid_tool_never_reaches_archive(name, arguments):
    archive = Archive()
    with pytest.raises(ValueError):
        await AgentHarness(Model([call(name, arguments, 1)]), archive, "Rules").answer(
            "q"
        )
    assert archive.calls == []


@pytest.mark.asyncio
async def test_unread_source_rejected_then_model_can_return_unsupported():
    model = Model([final((A,)), final()])
    result = await AgentHarness(model, Archive(), "Rules").answer("q")
    assert result.status == "unsupported" and not result.sources
    assert "not backed" in model.requests[-1][0][-1]["content"]


@pytest.mark.asyncio
async def test_unavailable_read_invalidates_previous_source():
    class RevokingArchive(Archive):
        async def call(self, name, args):
            if name == "read_document" and len(self.calls) == 1:
                self.unavailable.add(A)
            return await super().call(name, args)

    model = Model([call("read_document", {"document_id": A}, 1), final((A,)), final()])
    result = await AgentHarness(model, RevokingArchive(), "Rules").answer("q")
    assert result.status == "unsupported"
    assert "changed or became unavailable" in model.requests[-1][0][-1]["content"]


@pytest.mark.asyncio
async def test_changed_source_requires_another_model_read_before_citation():
    class ChangingArchive(Archive):
        async def call(self, name, args):
            if len(self.calls) == 1:
                self.versions[A] = "v2"
            return await super().call(name, args)

    model = Model(
        [
            call("read_document", {"document_id": A}, 1),
            final((A,)),
            call("read_document", {"document_id": A}, 2),
            final((A,)),
        ]
    )
    result = await AgentHarness(model, ChangingArchive(), "Rules").answer("q")
    assert result.sources[0].content_version == "v2"
    assert model.requests[2][1] == RESEARCH_TOOLS


@pytest.mark.asyncio
async def test_oversized_initial_prompt_never_calls_model():
    model = Model([], total=150)
    result = await AgentHarness(model, Archive(), "Rules").answer("q" * 1000)
    assert "split" in result.text.lower() and model.requests == []


@pytest.mark.asyncio
async def test_near_limit_finalizes_without_tools_using_unchanged_history():
    messages = [
        {"role": "system", "content": _system_prompt("Rules")},
        {"role": "user", "content": "q"},
    ]
    total = Counter().count(_final_messages(messages), []) + 128
    model = Model([final()], total=total)
    result = await AgentHarness(model, Archive(), "Rules").answer("q")
    assert result.status == "unsupported" and "split" in result.text.lower()
    assert model.requests[0][1] == []
    assert model.requests[0][0][:-1] == messages
    assert model.requests[0][2] == {"tool_choice": "none", "json_response": True}


@pytest.mark.asyncio
async def test_oversized_tool_result_not_sent_or_registered_as_evidence():
    archive = Archive()
    archive.body = "oversized" * 10000
    model = Model(
        [call("read_document", {"document_id": A}, 1), final((A,))], total=8000
    )
    result = await AgentHarness(model, archive, "Rules").answer("q")
    assert "split" in result.text.lower()
    assert model.requests[-1][1] == []
    assert "exceeds remaining context" in json.dumps(model.requests[-1][0])
    assert "oversizedoversized" not in json.dumps(model.requests)


@pytest.mark.asyncio
async def test_per_call_timeout_and_operator_cancellation_propagate():
    class BrokenArchive(Archive):
        async def call(self, name, args):
            raise TimeoutError

    with pytest.raises(TimeoutError):
        await AgentHarness(
            Model([call("read_document", {"document_id": A}, 1)]),
            BrokenArchive(),
            "Rules",
        ).answer("q")

    class CancelledModel(Model):
        async def complete(self, *args, **kwargs):
            raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await AgentHarness(CancelledModel([]), Archive(), "Rules").answer("q")


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "answered", "answer": "x", "source_ids": []},
        {"status": "unsupported", "answer": "x", "source_ids": [A]},
        {"status": "unsupported", "answer": "@everyone", "source_ids": []},
        {"status": "unsupported", "answer": "https://wrong.test", "source_ids": []},
        {
            "status": "unsupported",
            "answer": "This is an original playtest addition.",
            "source_ids": [],
        },
        {
            "status": "unsupported",
            "answer": "Use Graze against enemies with high ability modifiers.",
            "source_ids": [],
        },
    ],
)
def test_terminal_contract_rejects_invalid_or_unsafe_answers(payload):
    with pytest.raises(ValueError):
        ResearchHarness._parse_answer(json.dumps(payload), {})


@pytest.mark.asyncio
async def test_oversized_tool_result_unsupported_explains_split():
    archive = Archive()
    archive.body = "oversized" * 10000
    model = Model([call("read_document", {"document_id": A}, 1), final()], total=8000)
    result = await AgentHarness(model, archive, "Rules").answer("q")
    assert "split" in result.text.lower()
    assert model.requests[-1][1] == []


@pytest.mark.asyncio
async def test_fitting_prior_evidence_can_finalize_after_oversized_new_result():
    class GrowingArchive(Archive):
        async def call(self, name, args):
            self.body = (
                "too big" * 2000 if args.get("document_id") == B else "Current evidence"
            )
            return await super().call(name, args)

    model = Model(
        [
            call("read_document", {"document_id": A}, 1),
            call("read_document", {"document_id": B}, 2),
            final((A,)),
        ],
        total=8000,
    )
    result = await AgentHarness(model, GrowingArchive(), "Rules").answer("q")
    assert result.status == "answered" and result.sources[0].document_id == A
    assert model.requests[-1][1] == []


@pytest.mark.asyncio
async def test_ordinary_unsupported_remains_evidence_message():
    result = await AgentHarness(Model([final()]), Archive(), "Rules").answer("q")
    assert "evidence" in result.text and "split" not in result.text


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [[], {}])
async def test_nonstring_final_status_enters_repair_loop(status):
    malformed = ModelTurn(
        json.dumps({"status": status, "answer": "x", "source_ids": []}), ()
    )
    model = Model([malformed, final()])
    result = await AgentHarness(model, Archive(), "Rules").answer("q")
    assert result.status == "unsupported"
    assert "response status was invalid" in model.requests[-1][0][-1]["content"]


@pytest.mark.asyncio
async def test_research_can_read_wrong_document_then_search_and_read_again():
    model = Model(
        [
            call("search_documents", {"query": "Fighter level 5"}, 1),
            call("read_document", {"document_id": A}, 2),
            call(
                "search_documents", {"query": "Fighter Extra Attack attacks level 5"}, 3
            ),
            call("read_document", {"document_id": B}, 4),
            call(
                "finish_answer",
                {
                    "status": "answered",
                    "answer": "Two attacks per Attack action.",
                    "source_ids": [B],
                },
                5,
            ),
        ]
    )
    archive = Archive()
    result = await AgentHarness(model, archive, "Rules").answer("How many attacks?")
    assert result.text == "Two attacks per Attack action."
    assert result.sources[0].document_id == B
    assert [name for name, _ in archive.calls] == [
        "search_documents",
        "read_document",
        "search_documents",
        "read_document",
        "read_document",
    ]
    for _, tools, options in model.requests:
        assert options["tool_choice"] == "required"
        assert {tool["function"]["name"] for tool in tools} == {
            "search_documents",
            "read_document",
            "finish_answer",
        }
    final_input = model.requests[-1][0]
    assert len([message for message in final_input if message["role"] == "tool"]) == 4


@pytest.mark.asyncio
async def test_uncited_finish_can_recover_with_more_research():
    model = Model(
        [
            call(
                "finish_answer",
                {"status": "answered", "answer": "Guess", "source_ids": []},
                1,
            ),
            call("read_document", {"document_id": A}, 2),
            call(
                "finish_answer",
                {"status": "answered", "answer": "Supported", "source_ids": [A]},
                3,
            ),
        ]
    )
    result = await AgentHarness(model, Archive(), "Rules").answer("Question")
    assert result.text == "Supported"
    assert "required a citation" in model.requests[1][0][-1]["content"]


@pytest.mark.asyncio
async def test_duplicate_search_reuses_context_and_read_reopens_search():
    model = Model(
        [
            call("search_documents", {"query": "Fighter"}, 1),
            call("search_documents", {"query": " fighter "}, 2),
            call("read_document", {"document_id": A}, 3),
            call("search_documents", {"query": "Fighter Extra Attack"}, 4),
            call("read_document", {"document_id": B}, 5),
            call(
                "finish_answer",
                {"status": "answered", "answer": "Two", "source_ids": [B]},
                6,
            ),
        ]
    )
    archive = Archive()
    await AgentHarness(model, archive, "Rules").answer("Attacks?")
    assert len([c for c in archive.calls if c[0] == "search_documents"]) == 2
    assert {t["function"]["name"] for t in model.requests[2][1]} == {
        "read_document",
        "finish_answer",
    }
    assert model.requests[3][1] == RESEARCH_TOOLS


@pytest.mark.asyncio
async def test_whole_document_archive_does_not_advertise_passage_reads():
    model = Model([call("read_document", {"document_id": A}, 1), final((A,))])
    await AgentHarness(model, Archive(), "Rules", allow_passage_reads=False).answer("q")
    read_tool = model.requests[0][1][1]["function"]
    assert set(read_tool["parameters"]["properties"]) == {"document_id"}
    assert "whole" in read_tool["description"]


@pytest.mark.asyncio
async def test_default_two_rounds_preserve_full_reads_and_then_answer():
    model = Model(
        [
            call("search_documents", {"query": "Fighter level 5"}, 1),
            call("read_document", {"document_id": A}, 2),
            call("search_documents", {"query": "Extra Attack Fighter"}, 3),
            call("read_document", {"document_id": B}, 4),
            final((B,), "Two attacks per Attack action."),
        ]
    )
    archive = Archive()
    archive.body = "Full document: two attacks per Attack action."
    answer = await ResearchHarness(model, archive, "Rules").answer("How many attacks?")
    assert answer.text == "Two attacks per Attack action."
    assert [[t["function"]["name"] for t in req[1]] for req in model.requests] == [
        ["search_documents"],
        ["read_document"],
        ["search_documents"],
        ["read_document"],
        [],
    ]
    assert model.requests[-1][2] == {"tool_choice": "none", "json_response": True}
    reads = [
        json.loads(m["content"]) for m in model.requests[-1][0] if m["role"] == "tool"
    ]
    assert reads[1]["public_text"] == archive.body
    assert reads[3]["public_text"] == archive.body


@pytest.mark.asyncio
async def test_generic_setting_overview_anchors_bounded_search_and_citations():
    model = Model(
        [
            ModelTurn(
                "I will search Dwendalian Empire.",
                (
                    ToolCall(
                        "1",
                        "search_documents",
                        json.dumps({"query": "Dwendalian Empire"}),
                    ),
                ),
            ),
            call("read_document", {"document_id": A, "passage_id": "p1"}, 2),
            ModelTurn(
                "I will search Dunamancy.",
                (
                    ToolCall(
                        "3",
                        "search_documents",
                        json.dumps({"query": "Dunamancy"}),
                    ),
                ),
            ),
            call("read_document", {"document_id": B, "passage_id": "p2"}, 4),
            final(
                (A, B),
                "Wildemount is a continent in Exandria and the campaign setting.",
            ),
        ]
    )

    class SettingArchive(Archive):
        async def call(self, name, arguments):
            self.calls.append((name, arguments))
            if name == "search_documents":
                return {
                    "hits": [
                        {
                            "document_id": A,
                            "title": "Wildemount",
                            "passage_id": "p1",
                            "excerpt": "Wildemount is an Exandrian continent.",
                        },
                        {
                            "document_id": B,
                            "title": "Exandria",
                            "passage_id": "p2",
                            "excerpt": "Exandria contains Wildemount.",
                        },
                    ]
                }
            document_id = arguments["document_id"]
            title = "Wildemount" if document_id == A else "Exandria"
            return {
                "document_id": document_id,
                "title": title,
                "url": f"https://example.test/{title.casefold()}",
                "content_version": self.versions[document_id],
                "public_text": (
                    "Wildemount is an Exandrian continent. Exandria contains "
                    "Wildemount."
                ),
                **(
                    {"passage_id": arguments["passage_id"]}
                    if "passage_id" in arguments
                    else {}
                ),
            }

    archive = SettingArchive()
    answer = await ResearchHarness(model, archive, "Rules").answer(
        "explain the setting"
    )

    assert answer.status == "answered"
    assert [
        args["query"] for name, args in archive.calls if name == "search_documents"
    ] == ["setting", "Wildemount Exandria setting overview"]
    first_tool_call = next(
        message for message in model.requests[1][0] if message["role"] == "assistant"
    )["tool_calls"][0]
    assert json.loads(first_tool_call["function"]["arguments"]) == {"query": "setting"}
    assert (
        first_tool_call
        and next(
            message
            for message in model.requests[1][0]
            if message["role"] == "assistant"
        )["content"]
        == ""
    )
    second_tool_message = [
        message for message in model.requests[3][0] if message["role"] == "assistant"
    ][-1]
    assert second_tool_message["content"] == ""
    assert json.loads(
        second_tool_message["tool_calls"][0]["function"]["arguments"]
    ) == {"query": "Wildemount Exandria setting overview"}
    assert "Wildemount or Exandria overview" in model.requests[1][0][-1]["content"]
    assert "Wildemount Exandria setting overview" in model.requests[2][0][-1]["content"]


def test_setting_overview_guard_rejects_adjacent_lore_and_ignores_named_settings():
    adjacent = ReadEvidence(
        AnswerSource(A, "Dwendalian Empire", "https://example.test/faction", "v1"),
        {"document_id": A},
        "A faction in Wildemount on the world of Exandria.",
    )
    overview = ReadEvidence(
        AnswerSource(B, "Wildemount", "https://example.test/wildemount", "v1"),
        {"document_id": B},
        "Wildemount is an Exandrian continent; Exandria contains Wildemount.",
    )

    assert not _setting_overview_supported(
        "explain the setting", "Wildemount and Exandria", [adjacent]
    )
    assert _setting_overview_supported(
        "explain the setting", "Wildemount is part of Exandria.", [overview]
    )
    assert not _setting_overview_supported(
        "explain the setting", "It is a campaign continent.", [overview]
    )
    assert _setting_overview_supported(
        "explain the Eberron setting", "Eberron", [adjacent]
    )
    assert _setting_overview_search("describe our campaign setting?", 0) == "setting"
    assert _setting_overview_search("describe our campaign setting?", 2) == (
        "Wildemount Exandria setting overview"
    )
    assert _setting_overview_search("explain the Eberron setting", 0) is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("history", "history_incomplete"),
    [
        ((ReplyHistoryMessage("user", "Tell me about Eberron."),), False),
        ((), True),
    ],
)
async def test_contextual_setting_question_does_not_force_default_campaign(
    history, history_incomplete
):
    model = Model(
        [
            call("search_documents", {"query": "Eberron campaign setting"}, 1),
            call("read_document", {"document_id": A}, 2),
            call("search_documents", {"query": "Khorvaire overview"}, 3),
            call("read_document", {"document_id": A}, 4),
            final((A,), "Current public evidence."),
        ]
    )
    archive = Archive()

    await ResearchHarness(model, archive, "Rules").answer(
        "explain this setting",
        history=history,
        history_incomplete=history_incomplete,
    )

    assert [
        args["query"] for name, args in archive.calls if name == "search_documents"
    ] == ["Eberron campaign setting", "Khorvaire overview"]


@pytest.mark.asyncio
async def test_generic_setting_omission_fails_closed_after_final_repairs():
    class OverviewArchive(Archive):
        async def call(self, name, arguments):
            self.calls.append((name, arguments))
            if name == "search_documents":
                return {
                    "hits": [
                        {
                            "document_id": A,
                            "title": "Wildemount",
                            "passage_id": "p1",
                            "excerpt": "Wildemount is part of Exandria.",
                        }
                    ]
                }
            return {
                "document_id": A,
                "title": "Wildemount",
                "url": "https://example.test/wildemount",
                "content_version": "v1",
                "public_text": "Wildemount is an Exandrian continent in Exandria.",
                **(
                    {"passage_id": arguments["passage_id"]}
                    if "passage_id" in arguments
                    else {}
                ),
            }

    model = Model(
        [
            call("search_documents", {"query": "wrong"}, 1),
            call("read_document", {"document_id": A, "passage_id": "p1"}, 2),
            call("search_documents", {"query": "wrong again"}, 3),
            call("read_document", {"document_id": A, "passage_id": "p1"}, 4),
            final((A,), "It is a broad campaign setting."),
            final((A,), "It is a broad campaign setting."),
            final((A,), "It is a broad campaign setting."),
        ]
    )

    answer = await ResearchHarness(model, OverviewArchive(), "Rules").answer(
        "explain the setting"
    )

    assert answer.status == "unsupported"
    assert not answer.sources


@pytest.mark.asyncio
async def test_second_spell_level_search_targets_missing_class_progression():
    model = Model(
        [
            call("search_documents", {"query": "Fireball spell level"}, 1),
            call("read_document", {"document_id": A}, 2),
            call("search_documents", {"query": "Wizard level 3 spell slots"}, 3),
            call("read_document", {"document_id": B}, 4),
            final(
                (A, B),
                "No. A level 3 Wizard cannot cast Fireball from class slots; "
                "it is a level 3 spell available at Wizard level 5.",
            ),
        ]
    )

    class SpellArchive(Archive):
        async def call(self, name, arguments):
            if name == "read_document":
                self.body = (
                    "Fireball\nLevel 3 Evocation (Sorcerer, Wizard)"
                    if arguments["document_id"] == A
                    else (
                        "Wizard Features\nSpell Slots per Spell Level\n"
                        "3 +2 Wizard Subclass 3 6 4 2 — — — — — — —\n"
                        "5 +3 Memorize Spell 4 9 4 3 2 — — — — — —"
                    )
                )
            return await super().call(name, arguments)

    answer = await ResearchHarness(model, SpellArchive(), "Rules").answer(
        "Can a Wizard cast Fireball at level 3?"
    )

    assert answer.status == "answered"
    second_search_instruction = model.requests[2][0][-1]["content"]
    assert "Features table" in second_search_instruction
    assert "Do not repeat" in second_search_instruction


def test_spell_level_answer_requires_cited_progression_evidence():
    source_a = AnswerSource(A, "Fireball", "https://example.test/a", "v1")
    source_b = AnswerSource(B, "Wizard", "https://example.test/b", "v1")
    spell = ReadEvidence(
        source_a,
        {"document_id": A},
        "Fireball\nLevel 3 Evocation (Sorcerer, Wizard)",
    )
    progression = ReadEvidence(
        source_b,
        {"document_id": B},
        "Wizard Features\nSpell Slots per Spell Level\n"
        "3 +2 Wizard Subclass 3 6 4 2 — — — — — — —\n"
        "5 +3 Memorize Spell 4 9 4 3 2 — — — — — —",
    )

    question = "Can a Wizard cast Fireball at level 3?"
    assert _needs_class_spell_progression(question)
    assert not _class_spell_progression_supported(question, [spell])
    assert _class_spell_progression_supported(question, [spell, progression])
    assert _derived_class_spell_level(question, [spell, progression]) == (
        "wizard",
        "Fireball",
        3,
        5,
    )
    assert _derived_level_appears("A Wizard gains the slot at 5th level.", 5)
    assert not _derived_level_appears("A Wizard gains it at level 3.", 5)


def test_warlock_table_columns_are_aligned_before_answering():
    source = AnswerSource(A, "Warlock", "https://example.test/a", "v1")
    evidence = ReadEvidence(
        source,
        {"document_id": A},
        "Warlock Features\n"
        "Level Proficiency Bonus Class Features Eldritch Invocations Cantrips "
        "Prepared Spells Spell Slots Slot Level\n"
        "3 +2 Warlock Subclass 3 2 4 2 2\n"
        "You regain all expended Pact Magic spell slots when you finish a "
        "Short or Long Rest.",
    )
    fact = _warlock_slot_fact(
        "how many spell slots does a warlock have at level 3", [evidence]
    )

    assert fact == (3, 2, 2, True)
    assert _warlock_slot_answer_supported(
        "Two spell slots, each level 2; they recover on a Short or Long Rest.", fact
    )
    assert not _warlock_slot_answer_supported("Two level 3 spell slots.", fact)


@pytest.mark.asyncio
async def test_bounded_mode_rejects_early_answer():
    with pytest.raises(ValueError, match="before completing"):
        await ResearchHarness(Model([final()]), Archive(), "Rules").answer("q")


@pytest.mark.asyncio
async def test_two_no_hit_searches_finish_unsupported_without_fake_reads():
    class EmptyArchive(Archive):
        async def call(self, name, arguments):
            self.calls.append((name, arguments))
            assert name == "search_documents"
            return {"hits": []}

    archive = EmptyArchive()
    model = Model(
        [
            call("search_documents", {"query": "first"}, 1),
            call("search_documents", {"query": "refined"}, 2),
            final(),
        ]
    )
    result = await ResearchHarness(model, archive, "Rules").answer("q")
    assert result.status == "unsupported"
    assert len(archive.calls) == 2


@pytest.mark.asyncio
async def test_answer_diagnostics_distinguish_ordinary_unsupported() -> None:
    result = await AgentHarness(
        Model([final()]),
        Archive(),
        "Rules",
        model_identity="luna-xhigh",
        build_sha="sha",
    ).answer("Unknown?")

    assert result.diagnostics["outcome"] == "unsupported"
    assert result.diagnostics["build_sha"] == "sha"
    assert result.diagnostics["model"] == "luna-xhigh"
    assert result.diagnostics["validation_attempts"] == 1
    assert len(result.diagnostics["model_timings"]) == 1


@pytest.mark.asyncio
async def test_archive_timeout_carries_classified_diagnostics() -> None:
    class BrokenArchive(Archive):
        async def call(self, name, args):
            raise TimeoutError

    with pytest.raises(TimeoutError) as raised:
        await AgentHarness(
            Model([call("read_document", {"document_id": A}, 1)]),
            BrokenArchive(),
            "Rules",
        ).answer("q")

    diagnostics = raised.value.qa_diagnostics
    assert diagnostics["outcome"] == "archive_timeout"
    assert diagnostics["archive_timings"][0]["tool"] == "read_document"
    assert diagnostics["archive_timings"][0]["status"] == "error"


@pytest.mark.asyncio
async def test_validation_diagnostics_count_attempts_not_only_retries() -> None:
    invalid = ModelTurn(
        json.dumps({"status": "unsupported", "answer": "", "source_ids": []}),
        (),
    )
    result = await AgentHarness(Model([invalid, final()]), Archive(), "Rules").answer(
        "Unknown?"
    )

    assert result.diagnostics["validation_attempts"] == 2
    assert result.diagnostics["outcome"] == "unsupported"
