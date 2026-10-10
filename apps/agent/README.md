# Agent

Python service for the Chronicler agent, plus the Archive indexing stack in the same app tree. Answering a question is one instrument the agent can use. Jobs are durable in `apps/api`; this app claims and completes them over HTTP.

## Layout

| Path | Purpose |
| --- | --- |
| `src/pi/chronicler/agent/` | Answer worker and harness (`from pi.chronicler.agent import …`) |
| `src/pi/chronicler/archive/` | Archive index, embeddings, MCP server |
| `src/pi/chronicler/qa/` | Shared public-doc helpers for Archive |
| `tests/` | Pytest for agent, archive, and qa |
| `pyproject.toml`, `uv.lock` | Dependencies and package metadata |

`pi/` and `pi/chronicler/` are namespace directories only (no `__init__.py`).

## Local development

From the repo root (after `scripts/setup`):

```bash
uv run --directory apps/agent pytest
uv run --directory apps/agent chronicler-agent   # requires env from .env.example
```

Sync only this app: `uv sync --directory apps/agent --all-groups`.

HTTP transport and env: [docs/http-transport.md](/apps/agent/docs/http-transport.md), [docs/environment.md](/apps/agent/docs/environment.md).

## Docs

- App docs: [`docs/README.md`](/apps/agent/docs/README.md)
- Interface: [`agent-qa-http`](/docs/interfaces/agent-qa-http.md)
