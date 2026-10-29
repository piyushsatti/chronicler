from __future__ import annotations

import re
from pathlib import Path

import httpx
import pytest
import yaml

from pi.chronicler.agent.settings import AgentSettings
from pi.chronicler.archive.settings import ArchiveSettings
from pi.chronicler.qa.remote_source import AnonymousGraphqlSource


@pytest.mark.asyncio
async def test_compose_archive_contract_supplies_required_settings_and_assets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = (
        Path(__file__).resolve().parents[4] / "deploy/compose/agent-archive.yml"
    ).read_text()
    values = {
        "CHRONICLER_BUILD_SHA": "unknown",
        "PUBLIC_GRAPHQL_URL": "http://host.docker.internal:8080/v1/graphql",
        "PUBLIC_SITE_URL": "http://localhost:3000",
        "ARCHIVE_DATABASE_URL": "postgresql://example.invalid/archive",
        "ARCHIVE_DATABASE_CA_FILE": "/staged/ca.pem",
        "ARCHIVE_ALLOWED_HOSTS": "archive:8000,localhost:8090",
        "ARCHIVE_MCP_TOKEN": "synthetic-token",
        "INDEX_INTERVAL_SECONDS": "3600",
        "LITELLM_BASE_URL": "https://example.invalid/v1",
        "LITELLM_API_KEY": "synthetic-key",
        "EMBEDDING_MODEL": "synthetic-embedding-alias",
        "EMBEDDING_REVISION": "synthetic-revision",
        "EMBEDDING_DIMENSIONS": "3",
        "EMBEDDING_TOKENIZER_PATH": "/staged/embedding-tokenizer.json",
        "EMBEDDING_TOKENIZER_SHA256": "a" * 64,
        "EMBEDDING_MAX_INPUT_TOKENS": "512",
        "EMBEDDING_QUERY_PREFIX": "",
        "API_URL": "http://host.docker.internal:8080",
        "INGEST_SECRET": "synthetic-ingest",
        "AGENT_MODEL": "synthetic-agent-alias",
        "AGENT_TOKENIZER_PATH": "/staged/agent-tokenizer",
        "AGENT_TOKENIZER_SHA256": "b" * 64,
        "AGENT_TOKENIZER_CONFIG_SHA256": "c" * 64,
        "AGENT_CHAT_TEMPLATE_SHA256": "d" * 64,
    }

    def render(value):
        if isinstance(value, dict):
            return {key: render(item) for key, item in value.items()}
        if isinstance(value, list):
            return [render(item) for item in value]
        if isinstance(value, str):
            return re.sub(
                r"\$\{([A-Z0-9_]+)(?:[^}]*)\}",
                lambda match: values[match[1]],
                value,
            )
        return value

    services = render(yaml.safe_load(source))["services"]
    archive = services["archive"]
    agent = services["agent"]
    for name in (
        "ARCHIVE_DATABASE_URL",
        "ARCHIVE_DATABASE_CA_FILE",
        "ARCHIVE_ALLOWED_HOSTS",
        "EMBEDDING_MODEL",
        "EMBEDDING_REVISION",
        "EMBEDDING_DIMENSIONS",
        "EMBEDDING_TOKENIZER_PATH",
        "EMBEDDING_TOKENIZER_SHA256",
        "EMBEDDING_MAX_INPUT_TOKENS",
    ):
        assert "${" + name + ":?" in source
    assert "${EMBEDDING_QUERY_PREFIX?" in source
    for name, value in archive["environment"].items():
        monkeypatch.setenv(name, str(value))
    settings = ArchiveSettings.from_env()
    assert settings.database_url == values["ARCHIVE_DATABASE_URL"]
    assert settings.database_ca_file == values["ARCHIVE_DATABASE_CA_FILE"]
    assert settings.embedding_revision == values["EMBEDDING_REVISION"]
    assert settings.embedding_dimensions == 3
    assert settings.embedding_tokenizer_path == values["EMBEDDING_TOKENIZER_PATH"]
    assert settings.embedding_query_prefix == ""
    assert settings.allowed_hosts == ("archive:8000", "localhost:8090")
    async with httpx.AsyncClient() as client:
        AnonymousGraphqlSource(settings.public_graphql_url, client=client)
    for name, value in agent["environment"].items():
        monkeypatch.setenv(name, str(value))
    monkeypatch.setenv(
        "AGENT_CONTEXT_FILE",
        str(Path(__file__).resolve().parents[2] / "context.md"),
    )
    worker = AgentSettings.from_env()
    assert worker.model == values["AGENT_MODEL"]
    assert worker.tokenizer_path == Path(values["AGENT_TOKENIZER_PATH"])
    for service in (archive, agent):
        assert service["restart"] == "unless-stopped"
    for service, path in (
        (archive, "ARCHIVE_DATABASE_CA_FILE"),
        (archive, "EMBEDDING_TOKENIZER_PATH"),
        (agent, "AGENT_TOKENIZER_PATH"),
    ):
        assert {
            "type": "bind",
            "source": values[path],
            "target": values[path],
            "read_only": True,
            "bind": {"create_host_path": False},
        } in service["volumes"]
