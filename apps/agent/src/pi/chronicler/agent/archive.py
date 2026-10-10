from __future__ import annotations

import asyncio
from typing import cast

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client


class ArchiveClient:
    def __init__(self, url: str, token: str, *, timeout_seconds: float = 5.0) -> None:
        self._url = url
        self._token = token
        self._timeout_seconds = timeout_seconds

    async def call(self, name: str, arguments: dict[str, object]) -> dict[str, object]:
        async with asyncio.timeout(self._timeout_seconds):
            return await self._call(name, arguments)

    async def _call(self, name: str, arguments: dict[str, object]) -> dict[str, object]:
        async with httpx2.AsyncClient(
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=httpx2.Timeout(self._timeout_seconds, connect=3.0),
        ) as http_client:
            transport = streamable_http_client(self._url, http_client=http_client)
            async with Client(transport) as client:
                result = await client.call_tool(name, arguments)
        if result.is_error:
            raise RuntimeError(f"Archive tool {name} failed")
        structured = result.structured_content
        if not isinstance(structured, dict):
            raise ValueError(f"Archive tool {name} returned no structured content")
        payload = cast("dict[str, object]", structured)
        nested = payload.get("result")
        return (
            cast("dict[str, object]", nested) if isinstance(nested, dict) else payload
        )
