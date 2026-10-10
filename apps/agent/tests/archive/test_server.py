import asyncio

import pytest
from mcp import Client

from pi.chronicler.archive import server
from pi.chronicler.archive.index import SyncResult
from pi.chronicler.archive.settings import ArchiveSettings


class Closable:
    def __init__(self, *args: object) -> None:
        return None

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


class Indexer:
    def __init__(self, *args: object) -> None:
        return None

    async def sync(self):
        return SyncResult(0, 0, 0, 0, 0)


class Service:
    def __init__(self, *args: object) -> None:
        return None

    async def search_documents(self, query: str) -> dict[str, object]:
        return {"hits": [{"document_id": "d1", "excerpt": query}]}

    async def read_document(
        self, document_id: str, passage_id: str | None = None
    ) -> dict[str, object]:
        return {"document_id": document_id, "public_text": "Current"}

    async def read_document_by_url(self, url: str) -> dict[str, object]:
        return {"document_id": "d1", "url": url, "public_text": "Current"}


@pytest.mark.asyncio
async def test_mcp_tools_are_callable_with_runtime_context(
    monkeypatch, chunker
) -> None:
    monkeypatch.setattr(
        server.TokenChunker, "from_file", lambda *args, **kwargs: chunker
    )
    monkeypatch.setattr(server, "ProjectionReader", Closable)
    monkeypatch.setattr(server, "AnonymousGraphqlSource", Closable)
    monkeypatch.setattr(server, "ArchiveSource", Closable)
    monkeypatch.setattr(server, "LiteLlmEmbeddings", Closable)
    monkeypatch.setattr(server, "LanceStore", Closable)
    monkeypatch.setattr(server, "Indexer", Indexer)
    monkeypatch.setattr(server, "ArchiveService", Service)

    async def idle(*args: object) -> None:
        await asyncio.Event().wait()

    monkeypatch.setattr(server, "_index_loop", idle)
    settings = ArchiveSettings(
        database_url="postgresql://test",
        database_ca_file="ca.pem",
        public_graphql_url="https://example.test/graphql",
        litellm_base_url="https://model.test/v1",
        litellm_api_key="placeholder",
        embedding_model="test-model",
        embedding_revision="test-revision",
        embedding_dimensions=3,
        mcp_token="placeholder",
        lancedb_path="index",
        public_site_url="https://example.test",
        index_interval_seconds=3600,
        host="127.0.0.1",
        port=8000,
        allowed_hosts=("example.test",),
    )

    async with Client(server.create_mcp(settings)) as client:
        search = await client.call_tool("search_documents", {"query": "shove"})
        read = await client.call_tool("read_document", {"document_id": "d1"})
        focused = await client.call_tool(
            "read_document", {"document_id": "d1", "passage_id": "p1"}
        )
        exact = await client.call_tool(
            "read_document_by_url", {"url": "https://example.test/rules/d1"}
        )
        assert focused.is_error is False

    assert search.is_error is False
    assert search.structured_content == {
        "hits": [{"document_id": "d1", "excerpt": "shove"}]
    }
    assert read.structured_content == {
        "document_id": "d1",
        "public_text": "Current",
    }
    assert exact.structured_content == {
        "document_id": "d1",
        "url": "https://example.test/rules/d1",
        "public_text": "Current",
    }


@pytest.mark.asyncio
async def test_health_probe_is_unready_until_initial_sync_completes() -> None:
    readiness = server.ArchiveReadiness()
    messages: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    app = server.ArchiveReadinessMiddleware(object(), readiness)
    scope = {"type": "http", "method": "GET", "path": "/healthz"}
    await app(scope, object(), send)
    assert messages[0]["status"] == 503
    assert b'"ready":false' in messages[1]["body"]

    readiness.mark_ready(SyncResult(451, 451, 0, 0, 1000))
    messages.clear()
    await app(scope, object(), send)
    assert messages[0]["status"] == 200
    assert b'"initial_sync_complete":true' in messages[1]["body"]
