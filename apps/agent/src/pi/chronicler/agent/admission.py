from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

AdmissionCategory = Literal[
    "retrieve",
    "product_help",
    "private_state",
    "admin_action",
    "prompt_injection",
    "clarification_needed",
    "out_of_scope",
]


@dataclass(frozen=True, slots=True)
class AdmissionDecision:
    category: AdmissionCategory
    response: str | None = None

    @property
    def should_retrieve(self) -> bool:
        return self.category == "retrieve"


_PRODUCT_HELP = (
    re.compile(
        r"\bwhat (?:kind of )?questions (?:can|are) you (?:answer|able to answer)\b"
    ),
    re.compile(r"\bwhat can you answer\b"),
    re.compile(r"\bwhat (?:are you for|can you do)\b"),
    re.compile(r"\bwhat public chronicler evidence do you have\b"),
    re.compile(r"\bwhy do you exist\b"),
    re.compile(r"\bwhat is public chronicler\b"),
    re.compile(r"\bhow (?:do i|can i|to) create a character\b"),
)
_PRIVATE_STATE = (
    re.compile(r"\bmy character status\b"),
    re.compile(r"\bwhat characters? (?:does|do) <@!?\d+> have\b"),
    re.compile(r"\b(?:show|list) (?:me )?(?:my|<@!?\d+>'?s) characters?\b"),
)
_ADMIN_ACTION = re.compile(
    r"^(?:please\s+)?(?:ban|kick|mute|timeout)\b|"
    r"^(?:please\s+)?(?:make|give)\s+(?:me|<@!?\d+>)\s+(?:a\s+)?"
    r"(?:mod|moderator|admin|role)\b"
)
_PROMPT_INJECTION = (
    re.compile(r"\bforget (?:everything|all (?:prior|previous) instructions)\b"),
    re.compile(r"\bignore (?:all )?(?:prior|previous|system) instructions\b"),
    re.compile(r"\b(?:show|reveal|print) (?:your )?(?:system prompt|instructions)\b"),
)
_DND_OVERVIEW = re.compile(r"^(?:what is|explain) (?:d&d|dnd)\??$")
_AMBIGUOUS = (
    re.compile(r"^(?:what is |explain )?death roll\??$"),
    re.compile(r"^what happens if i use it twice\??$"),
    re.compile(
        r"\bwhich class\b.*\b(?:maximum|most)\b.*\battacks?\b.*\b(?:turn|round)\b|"
        r"\b(?:maximum|most) number of attacks?\b.*\b(?:turn|round)\b"
    ),
    re.compile(r"\bwhich classes?\b.*\b(?:cast spells?|use magic|spellcasting)\b"),
    re.compile(
        r"\b(?:fighter|wizard)\b.*\b(?:better|best)\b.*\bmelee\b|"
        r"\b(?:better|best)\b.*\bmelee\b.*\b(?:fighter|wizard)\b"
    ),
)
_REGION_AMBIGUOUS = (
    re.compile(r"\bwhat kind of dragons exist (?:here|in this region)\b"),
    re.compile(r"^only one dragon\??$"),
    re.compile(r"\bmore than one dragon in this region\b"),
    re.compile(r"^(?:any |an? )?other dragons? besides bronze\??$"),
)
_OUT_OF_SCOPE = (
    re.compile(r"\bdeez nuts\b"),
    re.compile(r"\b(?:what is|do you know what) (?:a )?femboy (?:is|means)\b"),
    re.compile(r"\b(?:get|find) me (?:a )?.*\b(?:girlfriend|gf|boyfriend|bf)\b"),
    re.compile(r"^(?:what is life|what does being alive mean)\??$"),
)

_PRODUCT_HELP_RESPONSE = (
    "I can answer questions grounded in current public Chronicler Rules and Codex "
    "entries. I cannot access private character or account state, moderate Discord, "
    "or change roles. For character creation, use Chronicler's character-creation "
    "flow; ask a specific rules or setting question if you want help with a choice."
)
_PRIVATE_STATE_RESPONSE = (
    "I cannot access or disclose private character or account state from the public "
    "evidence bot. Open Chronicler while signed in to view your own character data."
)
_ADMIN_ACTION_RESPONSE = (
    "I cannot moderate this Discord server or change member roles. Ask a server "
    "moderator for that action."
)
_PROMPT_INJECTION_RESPONSE = (
    "I cannot change or reveal my operating instructions. I can help with questions "
    "about current public Chronicler Rules or Codex entries."
)
_CLARIFICATION_RESPONSE = (
    "That question depends on a missing rules choice, such as the exact term, level, "
    "build, resource limits, or whether subclasses and feats count. Please narrow it "
    "or give the exact term or link so I can use the right public evidence."
)
_REGION_CLARIFICATION_RESPONSE = (
    "Which named setting, region, or campaign do you mean? Give its exact name; "
    "a prior bot answer is not evidence, so I will verify the dragon count against "
    "current public Codex entries."
)
_DND_OVERVIEW_RESPONSE = (
    "Dungeons & Dragons (D&D) is a tabletop role-playing game: players describe "
    "characters' choices while a Dungeon Master presents the world and adjudicates "
    "the rules. I can help with current public Chronicler rules and setting entries."
)
_OUT_OF_SCOPE_RESPONSE = (
    "That does not look like a question about public Chronicler Rules or Codex "
    "entries. Ask a specific rules, setting, or public campaign question."
)


def admit_question(question: str) -> AdmissionDecision:
    """Apply deterministic capability policy before public-evidence retrieval.

    This is a deliberately narrow policy router. Domain questions continue to the
    evidence harness; only requests with a stable non-retrieval answer are handled
    here. The normalized question is never logged by this module.
    """

    normalized = " ".join(question.casefold().split())
    if any(pattern.search(normalized) for pattern in _PROMPT_INJECTION):
        return AdmissionDecision("prompt_injection", _PROMPT_INJECTION_RESPONSE)
    if _ADMIN_ACTION.search(normalized):
        return AdmissionDecision("admin_action", _ADMIN_ACTION_RESPONSE)
    if _DND_OVERVIEW.fullmatch(normalized):
        return AdmissionDecision("product_help", _DND_OVERVIEW_RESPONSE)
    if any(pattern.search(normalized) for pattern in _PRODUCT_HELP):
        return AdmissionDecision("product_help", _PRODUCT_HELP_RESPONSE)
    if any(pattern.search(normalized) for pattern in _PRIVATE_STATE):
        return AdmissionDecision("private_state", _PRIVATE_STATE_RESPONSE)
    if any(pattern.search(normalized) for pattern in _AMBIGUOUS):
        return AdmissionDecision("clarification_needed", _CLARIFICATION_RESPONSE)
    if any(pattern.search(normalized) for pattern in _REGION_AMBIGUOUS):
        return AdmissionDecision("clarification_needed", _REGION_CLARIFICATION_RESPONSE)
    if any(pattern.search(normalized) for pattern in _OUT_OF_SCOPE):
        return AdmissionDecision("out_of_scope", _OUT_OF_SCOPE_RESPONSE)
    return AdmissionDecision("retrieve")
