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
async def test_anonymous_source_pages_both_kinds_without_credentials() -> None:
    rule_id = "00000000-0000-0000-0000-000000000001"
    codex_id = "00000000-0000-0000-0000-000000000002"

    async def handler(request: httpx.Request) -> httpx.Response:
        assert "authorization" not in request.headers
        payload = json.loads(request.content)
        if "PublicQaDocumentIds" in payload["query"]:
            assert payload["variables"]["limit"] == remote_source._SNAPSHOT_PAGE_SIZE
            kind = payload["variables"]["kind"]
            document_id = rule_id if kind == "rule" else codex_id
            return httpx.Response(
                200,
                json={
                    "data": {"documents": {"total": 1, "items": [{"id": document_id}]}}
                },
            )
        document_id = payload["variables"]["id0"]
        kind = "rule" if document_id == rule_id else "codex_entry"
        return httpx.Response(
            200,
            json={"data": {"d0": _row(document_id, kind=kind)}},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource("https://example.test/graphql", client=client)
    documents = [item async for item in source.iter_public_documents()]
    assert [item.document_id for item in documents] == [rule_id, codex_id]
    assert documents[0].authority == "official_errata"
    assert documents[0].source_version == "1.0"
    assert documents[0].locator == "27"
    await client.aclose()


@pytest.mark.asyncio
async def test_revalidation_is_one_batched_query_and_fails_closed() -> None:
    allowed_id = "00000000-0000-0000-0000-000000000001"
    revoked_id = "00000000-0000-0000-0000-000000000002"
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
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


def test_public_source_page_bound_leaves_room_below_response_ceiling() -> None:
    worst_case_escaped_bodies = remote_source._MAX_PAGE_SIZE * 256 * 1024 * 6
    assert worst_case_escaped_bodies <= (
        remote_source._MAX_RESPONSE_BYTES - 2 * 1024 * 1024
    )
    with pytest.raises(ValueError, match="invalid public GraphQL pagination bounds"):
        AnonymousGraphqlSource(
            "https://example.test/graphql",
            page_size=remote_source._MAX_PAGE_SIZE + 1,
        )


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


@pytest.mark.parametrize("invalid_total", [True, -1])
@pytest.mark.asyncio
async def test_public_scan_rejects_invalid_totals(invalid_total: object) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": {"documents": {"total": invalid_total, "items": []}}},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource("https://example.test/graphql", client=client)
    with pytest.raises(PublicSourceError, match="malformed"):
        _ = [item async for item in source.iter_public_documents()]
    await client.aclose()


@pytest.mark.asyncio
async def test_public_scan_requires_two_matching_snapshots() -> None:
    first = "00000000-0000-0000-0000-000000000001"
    second = "00000000-0000-0000-0000-000000000002"
    third = "00000000-0000-0000-0000-000000000003"
    fourth = "00000000-0000-0000-0000-000000000004"
    snapshot_calls: list[tuple[str, int]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        if "PublicQaDocumentIds" in payload["query"]:
            kind = payload["variables"]["kind"]
            offset = payload["variables"]["offset"]
            snapshot_calls.append((kind, offset))
            identifiers = (first, second) if kind == "rule" else (third, fourth)
            return httpx.Response(
                200,
                json={
                    "data": {
                        "documents": {
                            "total": 2,
                            "items": [{"id": identifiers[offset]}],
                        }
                    }
                },
            )
        identifier = payload["variables"]["id0"]
        kind = "rule" if identifier in {first, second} else "codex_entry"
        return httpx.Response(200, json={"data": {"d0": _row(identifier, kind=kind)}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource(
        "https://example.test/graphql",
        page_size=1,
        snapshot_page_size=1,
        client=client,
    )
    documents = [item async for item in source.iter_public_documents()]
    assert [item.document_id for item in documents] == [first, second, third, fourth]
    assert snapshot_calls == [
        ("rule", 0),
        ("rule", 1),
        ("rule", 0),
        ("rule", 1),
        ("codex_entry", 0),
        ("codex_entry", 1),
        ("codex_entry", 0),
        ("codex_entry", 1),
    ]
    await client.aclose()


@pytest.mark.asyncio
async def test_public_scan_accepts_reordered_complete_snapshots() -> None:
    first = "00000000-0000-0000-0000-000000000001"
    second = "00000000-0000-0000-0000-000000000002"
    snapshot_calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal snapshot_calls
        payload = json.loads(request.content)
        if "PublicQaDocumentIds" in payload["query"]:
            snapshot_calls += 1
            if payload["variables"]["kind"] == "codex_entry":
                return httpx.Response(
                    200,
                    json={"data": {"documents": {"total": 0, "items": []}}},
                )
            identifiers = (first, second) if snapshot_calls % 2 else (second, first)
            return httpx.Response(
                200,
                json={
                    "data": {
                        "documents": {
                            "total": 2,
                            "items": [{"id": identifier} for identifier in identifiers],
                        }
                    }
                },
            )
        identifier = payload["variables"]["id0"]
        return httpx.Response(200, json={"data": {"d0": _row(identifier)}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource(
        "https://example.test/graphql", page_size=1, client=client
    )
    documents = [item async for item in source.iter_public_documents()]
    assert [item.document_id for item in documents] == [first, second]
    assert snapshot_calls == 4
    await client.aclose()


@pytest.mark.asyncio
async def test_public_scan_rejects_premature_empty() -> None:

    async def empty_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": {"documents": {"total": 1, "items": []}}},
        )

    empty_client = httpx.AsyncClient(transport=httpx.MockTransport(empty_handler))
    empty_source = AnonymousGraphqlSource(
        "https://example.test/graphql", snapshot_page_size=1, client=empty_client
    )
    with pytest.raises(PublicSourceError, match="before reported total"):
        _ = [item async for item in empty_source.iter_public_documents()]
    await empty_client.aclose()


@pytest.mark.asyncio
async def test_public_scan_rejects_a_mutating_snapshot() -> None:
    first = "00000000-0000-0000-0000-000000000002"
    lower = "00000000-0000-0000-0000-000000000001"
    calls = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        identifier = first if calls == 1 else lower
        return httpx.Response(
            200,
            json={"data": {"documents": {"total": 1, "items": [{"id": identifier}]}}},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    source = AnonymousGraphqlSource(
        "https://example.test/graphql", snapshot_page_size=1, client=client
    )
    with pytest.raises(PublicSourceError, match="changed during snapshot"):
        _ = [item async for item in source.iter_public_documents()]
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
