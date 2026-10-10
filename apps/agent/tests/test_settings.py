import pytest

from pi.chronicler.agent.settings import AgentSettings


def environment(monkeypatch, tmp_path):
    context = tmp_path / "context.md"
    context.write_text("Public rules")
    values = {
        "AGENT_CONTEXT_FILE": str(context),
        "API_URL": "http://api.test",
        "INGEST_SECRET": "secret",
        "LITELLM_BASE_URL": "https://model.test",
        "LITELLM_API_KEY": "fake",
        "AGENT_MODEL": "answer",
        "ARCHIVE_MCP_URL": "https://archive.test",
        "ARCHIVE_MCP_TOKEN": "fake",
        "AGENT_TOKENIZER_PATH": str(tmp_path),
        "AGENT_TOKENIZER_SHA256": "fake",
        "AGENT_TOKENIZER_CONFIG_SHA256": "fake",
        "AGENT_CHAT_TEMPLATE_SHA256": "fake",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    for name in (
        "AGENT_CONTEXT_TOKENS",
        "AGENT_MAX_COMPLETION_TOKENS",
        "AGENT_MODEL_TIMEOUT_SECONDS",
        "AGENT_CLAIM_INTERVAL_SECONDS",
        "AGENT_MODEL_TEMPERATURE",
        "AGENT_MODEL_TOP_P",
        "AGENT_MODEL_PRESENCE_PENALTY",
        "AGENT_MODEL_SEED",
        "AGENT_MODEL_ENABLE_THINKING",
        "CHRONICLER_BUILD_SHA",
        "BUILD_SHA",
        "BUILD_VERSION",
    ):
        monkeypatch.delenv(name, raising=False)


def test_defaults_and_required_tokenizer_contract(monkeypatch, tmp_path):
    environment(monkeypatch, tmp_path)
    settings = AgentSettings.from_env()
    assert settings.api_url == "http://api.test"
    assert settings.ingest_secret == "secret"
    assert settings.claim_interval_seconds == 2.0
    assert settings.context_tokens == 16384
    assert settings.max_completion_tokens == 512
    assert settings.model_timeout_seconds == 60
    assert settings.model_temperature == 0.7
    assert settings.model_top_p == 0.8
    assert settings.model_presence_penalty == 1.5
    assert settings.model_seed == 0
    assert settings.model_enable_thinking is False
    assert settings.build_sha == "unknown"
    assert settings.tokenizer_path == tmp_path
    monkeypatch.delenv("AGENT_TOKENIZER_SHA256")
    with pytest.raises(ValueError, match="AGENT_TOKENIZER_SHA256"):
        AgentSettings.from_env()


def test_build_identity_is_injected_from_deployment_environment(monkeypatch, tmp_path):
    environment(monkeypatch, tmp_path)
    monkeypatch.setenv("CHRONICLER_BUILD_SHA", "sha-from-deploy")

    assert AgentSettings.from_env().build_sha == "sha-from-deploy"


@pytest.mark.parametrize(
    "name,value",
    [
        ("AGENT_MAX_COMPLETION_TOKENS", "32768"),
        ("AGENT_CONTEXT_TOKENS", "0"),
        ("AGENT_MODEL_TIMEOUT_SECONDS", "nan"),
        ("AGENT_MODEL_TIMEOUT_SECONDS", "0"),
        ("AGENT_CLAIM_INTERVAL_SECONDS", "0"),
        ("AGENT_MODEL_TEMPERATURE", "nan"),
        ("AGENT_MODEL_TEMPERATURE", "-0.1"),
        ("AGENT_MODEL_TOP_P", "0"),
        ("AGENT_MODEL_TOP_P", "1.1"),
        ("AGENT_MODEL_PRESENCE_PENALTY", "2.1"),
        ("AGENT_MODEL_SEED", "-1"),
        ("AGENT_MODEL_ENABLE_THINKING", "sometimes"),
    ],
)
def test_invalid_runtime_budgets_rejected(monkeypatch, tmp_path, name, value):
    environment(monkeypatch, tmp_path)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError):
        AgentSettings.from_env()
