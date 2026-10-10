import hashlib
from pathlib import Path

import pytest
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from transformers import PreTrainedTokenizerFast

from pi.chronicler.agent.budget import ChatTokenizer, ContextBudget, ContextLimitError

TEMPLATE = """{% for message in messages %}{{ message.role }} {{ message.content or '' }} {% for call in message.tool_calls or [] %}{{ call.function.name }} {{ call.function.arguments.query }} {% endfor %}{% endfor %}{% if tools %} tools {{ tools | tojson }} {% endif %}{% if add_generation_prompt %} assistant {% endif %}"""


def assets(path: Path):
    raw = Tokenizer(WordLevel({"[UNK]": 0}, unk_token="[UNK]"))
    raw.pre_tokenizer = Whitespace()
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=raw, unk_token="[UNK]", chat_template=TEMPLATE
    )
    tokenizer.save_pretrained(path)
    return (
        hashlib.sha256((path / "tokenizer.json").read_bytes()).hexdigest(),
        hashlib.sha256((path / "tokenizer_config.json").read_bytes()).hexdigest(),
        hashlib.sha256(TEMPLATE.encode()).hexdigest(),
    )


def test_exact_local_template_includes_tools_framing_and_parsed_arguments(tmp_path):
    hashes = assets(tmp_path)
    counter = ChatTokenizer(tmp_path, *hashes)
    messages = [
        {"role": "user", "content": "hello"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "1",
                    "type": "function",
                    "function": {
                        "name": "search_documents",
                        "arguments": '{"query":"jump strength"}',
                    },
                }
            ],
        },
    ]
    # user hello assistant search_documents jump strength assistant
    assert counter.count(messages, []) == 7
    assert isinstance(messages[1]["tool_calls"][0]["function"]["arguments"], str)
    tools = [
        {
            "type": "function",
            "function": {"name": "search_documents", "parameters": {"type": "object"}},
        }
    ]
    assert counter.count(messages, tools) > counter.count(messages, [])
    budget = ContextBudget(counter, total_tokens=15, completion_tokens=8)
    budget.require_fit(messages, [])
    with pytest.raises(ContextLimitError):
        budget.require_fit(messages, tools)


def test_startup_rejects_missing_and_changed_assets(tmp_path):
    with pytest.raises(FileNotFoundError):
        ChatTokenizer(tmp_path, "x", "y", "z")
    hashes = assets(tmp_path)
    with pytest.raises(ValueError, match="template hash"):
        ChatTokenizer(tmp_path, hashes[0], hashes[1], "wrong")
    (tmp_path / "tokenizer_config.json").write_text("{}")
    with pytest.raises(ValueError, match="tokenizer_config"):
        ChatTokenizer(tmp_path, *hashes)


def test_budget_requires_real_output_reserve(tmp_path):
    counter = ChatTokenizer(tmp_path, *assets(tmp_path))
    with pytest.raises(ValueError):
        ContextBudget(counter, 100, 100)
