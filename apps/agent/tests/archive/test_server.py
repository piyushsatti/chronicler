import asyncio
import hashlib
import json
from dataclasses import asdict, replace

import pytest
from mcp import Client

from pi.chronicler.archive import server
from pi.chronicler.archive.index import SyncResult
from pi.chronicler.archive.settings import ArchiveSettings
from pi.chronicler.qa.contracts import PublicDocument


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


def _settings() -> ArchiveSettings:
    return ArchiveSettings(
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
    settings = _settings()

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


@pytest.mark.asyncio
async def test_bootstrap_safe_subset_does_not_fail_initial_sync(
    monkeypatch, chunker, tmp_path
) -> None:
    documents = tuple(
        PublicDocument(
            f"d{index}", "rule", None, f"rule-{index}", "Rule", "Frozen public text"
        )
        for index in (1, 2)
    )
    snapshot = tmp_path / "snapshot.jsonl"
    snapshot.write_text(
        "".join(json.dumps(asdict(document)) + "\n" for document in documents)
    )

    class Projection(Closable):
        async def all_document_ids(self):
            return (documents[0].document_id,)

    class PublicSource(Closable):
        async def revalidate_projections(self, identifiers):
            return {documents[0].document_id: documents[0]}

    class SubsetIndexer:
        def __init__(self, source, *args):
            self.source = source

        async def sync(self):
            current = await self.source.all_documents()
            return SyncResult(len(current), 0, 0, 0, len(current))

    monkeypatch.setattr(
        server.TokenChunker, "from_file", lambda *args, **kwargs: chunker
    )
    monkeypatch.setattr(server, "ProjectionReader", Projection)
    monkeypatch.setattr(server, "AnonymousGraphqlSource", PublicSource)
    monkeypatch.setattr(server, "LiteLlmEmbeddings", Closable)
    monkeypatch.setattr(server, "LanceStore", Closable)
    monkeypatch.setattr(server, "Indexer", SubsetIndexer)
    monkeypatch.setattr(server, "ArchiveService", Service)
    settings = replace(
        _settings(),
        bootstrap_snapshot_path=str(snapshot),
        bootstrap_snapshot_sha256=hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        bootstrap_expected_document_count=2,
        bootstrap_min_live_document_count=2,
        bootstrap_promotion_marker_path=str(tmp_path / "promoted.json"),
    )
    readiness = server.ArchiveReadiness()
    async with Client(server.create_mcp(settings, readiness)):
        assert readiness.ready is True
        assert readiness.initial_sync.documents == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("authorization", "expected_status"),
    [
        (b"Bearer \xe9", 401),
        (b"Bearer secret", 204),
        (b"Bearer wrong", 401),
        (b"", 401),
    ],
)
async def test_bearer_auth_non_ascii_header_is_unauthorized(
    authorization: bytes, expected_status: int
) -> None:
    protected_calls = 0
    messages = []

    async def send(message):
        messages.append(message)

    async def protected(scope, receive, send):
        nonlocal protected_calls
        protected_calls += 1
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    app = server.BearerTokenMiddleware(protected, "secret")
    await app(
        {"type": "http", "headers": [(b"authorization", authorization)]},
        object(),
        send,
    )
    assert messages[0]["status"] == expected_status
    assert protected_calls == (expected_status == 204)
    if expected_status == 401:
        assert messages[1]["body"] == b'{"error":"unauthorized"}'
