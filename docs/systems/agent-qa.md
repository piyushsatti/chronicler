# Agent Q&A

**Map:** [systems.md](/docs/systems.md)

## What it is

Allowlisted Discord mentions ask questions about public rules and codex. The Go API stores the job. A Python worker answers from Archive evidence via LiteLLM. No message broker is required.

## Interfaces

| Interface                                          | Role                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| [agent-qa-http](/docs/interfaces/agent-qa-http.md) | Submit, claim, complete over ingest-secret REST |

## Implemented by

| App            | Local docs                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/discord` | [mentions.md](/apps/discord/docs/mentions.md)                                                                                |
| `apps/api`     | [D42](/apps/api/docs/decisions/D42-Worker-And-Migrations.md), [D43](/apps/api/docs/decisions/D43-Agent-Worker-HTTP-Claim.md) |
| `apps/agent`   | [architecture.md](/apps/agent/docs/architecture.md)                                                                          |

## Requirements

R-ids for this system: [../requirements/by-system/](/docs/requirements/by-system/) (when present). Index: [../requirements/index.md](/docs/requirements/index.md).
