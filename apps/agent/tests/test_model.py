import json

import httpx
import pytest

from pi.chronicler.agent.budget import ContextBudget, ContextLimitError
from pi.chronicler.agent.model import GROUNDED_RESPONSE_FORMAT, LiteLlmChat


class Counter:
    def count(self, messages, tools):
        return len(json.dumps(messages)) + len(json.dumps(tools))


@pytest.mark.asyncio
async def test_http_client_roundtrip_tools_and_final_format():
    requests = []

    def handle(request):
        payload = json.loads(request.content)
        requests.append(payload)
        if len(requests) == 1:
            message = {
                "content": None,
                "tool_calls": [
                    {
                        "id": "call-1",
                        "type": "function",
                        "function": {
                            "name": "search_documents",
                            "arguments": '{"query":"jump strength"}',
                        },
                    }
                ],
            }
            finish = "tool_calls"
        else:
            message = {
                "content": '{"status":"unsupported","answer":"No evidence","source_ids":[]}'
            }
            finish = "stop"
        return httpx.Response(
            200,
            json={
                "choices": [{"message": message, "finish_reason": finish}],
                "usage": {"prompt_tokens": 42, "completion_tokens": 9},
            },
            headers={"x-request-id": "req-1"},
        )

    model = LiteLlmChat(
        "https://model.test",
        "secret",
        "answer",
        ContextBudget(Counter()),
        temperature=0.7,
        top_p=0.8,
        presence_penalty=1.5,
        seed=0,
        enable_thinking=False,
    )
    await model._client.aclose()
    model._client = httpx.AsyncClient(
        base_url="https://model.test", transport=httpx.MockTransport(handle)
    )
    tools = [
        {
            "type": "function",
            "function": {"name": "search_documents", "parameters": {"type": "object"}},
        }
    ]
    turn = await model.complete([{"role": "user", "content": "q"}], tools)
    assert turn.tool_calls[0].name == "search_documents"
    assert json.loads(turn.tool_calls[0].arguments) == {"query": "jump strength"}
    assert requests[0]["tools"] == tools and requests[0]["tool_choice"] == "auto"
    assert requests[0]["max_tokens"] == 2048
    assert requests[0]["temperature"] == 0.7
    assert requests[0]["top_p"] == 0.8
    assert requests[0]["presence_penalty"] == 1.5
    assert requests[0]["seed"] == 0
    assert requests[0]["chat_template_kwargs"] == {"enable_thinking": False}
    assert "response_format" not in requests[0]
    assert turn.prompt_tokens == 42 and turn.request_id == "req-1"
    await model.complete(
        [{"role": "user", "content": "final"}],
        [],
        tool_choice="none",
        json_response=True,
    )
    assert requests[1]["response_format"] == GROUNDED_RESPONSE_FORMAT
    assert "tools" not in requests[1]
    await model.close()


@pytest.mark.asyncio
async def test_oversized_request_never_reaches_transport():
    model = LiteLlmChat(
        "https://model.test", "secret", "answer", ContextBudget(Counter(), 100, 10)
    )
    await model._client.aclose()

    def fail(request):
        raise AssertionError("oversized request reached network")

    model._client = httpx.AsyncClient(
        base_url="https://model.test", transport=httpx.MockTransport(fail)
    )
    with pytest.raises(ContextLimitError):
        await model.complete([{"role": "user", "content": "x" * 100}], [])
    await model.close()


@pytest.mark.asyncio
async def test_per_call_timeout_is_configurable_and_http_errors_explicit():
    model = LiteLlmChat(
        "https://model.test",
        "secret",
        "answer",
        ContextBudget(Counter()),
        timeout_seconds=27,
    )
    assert model._client.timeout.read == 27
    assert model._client.timeout.connect == 3
    await model._client.aclose()
    model._client = httpx.AsyncClient(
        base_url="https://model.test",
        transport=httpx.MockTransport(lambda r: httpx.Response(503)),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await model.complete([{"role": "user", "content": "q"}], [])
    await model.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("interval", [0.005, 1.0])
async def test_elapsed_timeout_stops_response_that_keeps_trickling_bytes(interval):
    import asyncio

    class Trickle(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            for _ in range(100):
                yield b" "
                await asyncio.sleep(interval)

        async def aclose(self):
            self.closed = True

    stream = Trickle()
    model = LiteLlmChat(
        "https://model.test",
        "fake",
        "answer",
        ContextBudget(Counter()),
        timeout_seconds=0.03,
    )
    await model._client.aclose()
    model._client = httpx.AsyncClient(
        base_url="https://model.test",
        transport=httpx.MockTransport(lambda r: httpx.Response(200, stream=stream)),
    )
    try:
        with pytest.raises(TimeoutError):
            await model.complete([{"role": "user", "content": "q"}], [])
        assert stream.closed
    finally:
        await model.close()


@pytest.mark.asyncio
async def test_http_operation_operator_cancellation_is_not_converted_to_timeout():
    import asyncio

    started = asyncio.Event()

    async def waiting(request):
        started.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    model = LiteLlmChat(
        "https://model.test", "fake", "answer", ContextBudget(Counter())
    )
    await model._client.aclose()
    model._client = httpx.AsyncClient(
        base_url="https://model.test", transport=httpx.MockTransport(waiting)
    )
    task = asyncio.create_task(model.complete([{"role": "user", "content": "q"}], []))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await model.close()
