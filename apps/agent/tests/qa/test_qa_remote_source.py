from __future__ import annotations

import json

import httpx
import pytest

from pi.chronicler.qa import remote_source
from pi.chronicler.qa.remote_source import (
    AnonymousGraphqlSource,
    PublicSourceError,
)


def _row(document_id: str, *, kind: str = "rule", visibility: str = "public"):
    return {
        "id": document_id,
        "slug": f"source-{document_id[-1]}",
        "kind": kind,
        "category": "ruling" if kind == "rule" else "npc",
        "status": "published",
        "visibility": visibility,
        "title": "Grappler correction",
        "updatedAt": "2026-09-13T00:00:00Z",
        "frontmatter": {
            "authority": "official_errata",
            "source": {"version": "1.0", "page": 27},
        },
        "effectiveBody": "The Grappler feat has this correction.",
    }


@pytest.mark.asyncio
async def test_revalidation_is_one_batched_query_and_fails_closed() -> None:
    allowed_id = "00000000-0000-0000-0000-000000000001"
    revoked_id = "00000000-0000-0000-0000-000000000002"
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert "authorization" not in request.headers
        payload = json.loads(request.content)
        assert "d0: documentById" in payload["query"]
        assert "d1: documentById" in payload["query"]
        return httpx.Response(
            200,
            json={
                "data": {
                    "d0": _row(allowed_id),
                    "d1": _row(revoked_id, visibility="restricted"),
                }
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource("https://example.test/graphql", client=client)
    admitted = await source.revalidate_projections((allowed_id, revoked_id))
    assert set(admitted) == {allowed_id}
    assert calls == 1
    assert admitted[allowed_id].authority == "official_errata"
    assert admitted[allowed_id].source_version == "1.0"
    assert admitted[allowed_id].locator == "27"
    await source.aclose()
    assert not client.is_closed
    await client.aclose()


@pytest.mark.parametrize(
    "url",
    [
        "http://example.test/graphql",
        "https://user:secret@example.test/graphql",
        "https://example.test/not-graphql",
        "https://example.test/graphql?token=secret",
        "https://example.test/graphql#fragment",
    ],
)
def test_public_source_requires_exact_anonymous_https_url(url: str) -> None:
    with pytest.raises(ValueError, match="anonymous HTTPS /graphql"):
        AnonymousGraphqlSource(url)


@pytest.mark.asyncio
async def test_public_source_bounds_response_before_json_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(remote_source, "_MAX_RESPONSE_BYTES", 32)

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"{" + b"x" * 64 + b"}")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource("https://example.test/graphql", client=client)
    with pytest.raises(PublicSourceError, match="too large"):
        await source.revalidate_projections(("d1",))
    await client.aclose()


@pytest.mark.asyncio
async def test_local_api_graphql_url_is_allowed_without_weakening_remote_https() -> (
    None
):
    async with httpx.AsyncClient() as client:
        for origin in (
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://[::1]:8080",
            "http://host.docker.internal:8080",
            "https://example.test",
        ):
            for path in ("/v1/graphql", "/graphql"):
                AnonymousGraphqlSource(origin + path, client=client)
        for url in (
            "http://example.test/v1/graphql",
            "http://host.docker.internal.evil.test/v1/graphql",
            "http://localhost.evil.test/v1/graphql",
            "http://127.0.0.2:8080/v1/graphql",
            "https://user:secret@example.test/v1/graphql",
            "https://@example.test/v1/graphql",
            "https://example.test/v1/graphql?token=secret",
            "https://example.test/v1/graphql#fragment",
            "https://example.test/v1/graphql?",
            "https://example.test/v1/graphql#",
            "https://example.test/v1/graphql/",
            "https://example.test:invalid/v1/graphql",
            "https:///v1/graphql",
            "https://example.test\n/v1/graphql",
            "https://example.test\x7f/v1/graphql",
            "https://example.test\\evil/v1/graphql",
        ):
            with pytest.raises(ValueError):
                AnonymousGraphqlSource(url, client=client)


@pytest.mark.asyncio
async def test_public_source_rejects_redirects_even_with_redirecting_client() -> None:
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url)
        return httpx.Response(307, headers={"location": "https://other.test/graphql"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=True
    ) as client:
        source = AnonymousGraphqlSource("https://example.test/graphql", client=client)
        with pytest.raises(PublicSourceError, match="request failed"):
            await source.revalidate_projections(("d1",))
    assert len(calls) == 1
