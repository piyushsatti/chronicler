from __future__ import annotations

import pytest

import pi.chronicler.agent.archive as archive_module
from pi.chronicler.agent.archive import ArchiveClient


class CapturedClientArguments(Exception):
    def __init__(self, arguments: dict[str, object]) -> None:
        super().__init__("captured AsyncClient arguments")
        self.arguments = arguments


@pytest.mark.asyncio
async def test_archive_client_allows_gpu_backed_tool_warmup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def capture_client_arguments(**arguments: object) -> None:
        raise CapturedClientArguments(arguments)

    monkeypatch.setattr(archive_module.httpx2, "AsyncClient", capture_client_arguments)

    with pytest.raises(CapturedClientArguments) as captured:
        await ArchiveClient("http://archive:8000/mcp", "token").call("search", {})

    timeout = captured.value.arguments["timeout"]
    assert isinstance(timeout, archive_module.httpx2.Timeout)
    assert timeout.connect == 3.0
    assert timeout.read == 5.0
    assert timeout.write == 5.0
    assert timeout.pool == 5.0


@pytest.mark.asyncio
async def test_elapsed_archive_deadline_bounds_operation_despite_activity():
    import asyncio

    class ActiveTransport(ArchiveClient):
        cancelled = False

        async def _call(self, name, arguments):
            try:
                for _ in range(100):
                    await asyncio.sleep(0.005)
                return {}
            finally:
                self.cancelled = True

    client = ActiveTransport("http://archive.test", "fake", timeout_seconds=0.02)
    with pytest.raises(TimeoutError):
        await client.call("search_documents", {"query": "q"})
    assert client.cancelled


@pytest.mark.asyncio
async def test_archive_operator_cancellation_propagates():
    import asyncio

    started = asyncio.Event()

    class WaitingTransport(ArchiveClient):
        async def _call(self, name, arguments):
            started.set()
            await asyncio.Event().wait()
            return {}

    task = asyncio.create_task(
        WaitingTransport("http://archive.test", "fake").call(
            "search_documents", {"query": "q"}
        )
    )
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
