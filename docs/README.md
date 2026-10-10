# Documentation

Use [start-here.md](/docs/start-here.md) for the human path. This page is the index.

## Product intent

| Slice | Path | Holds |
| --- | --- | --- |
| **Requirements** | [requirements/](/docs/requirements/README.md) | R-id index and by-system extracts |
| **Semantics** | [semantics/](/docs/semantics/README.md) | Actors, nouns, verbs, goals, taxonomy, mereology, invariants |
| **Systems** | [systems.md](/docs/systems.md) | Thin map of fourteen product areas |
| **Interfaces** | [interfaces/](/docs/interfaces/README.md) | Boundaries both sides must honor |
| **Decisions** | [decisions/](/docs/decisions/README.md) | Short boundary ADRs (D-ids) |

**Requirements** are the most product-facing. **Semantics** nail vocabulary. **Systems** point at **interfaces**; apps implement interfaces. Tooling rules: [CONTRIBUTING.md](/CONTRIBUTING.md), [AGENTS.md](/AGENTS.md).

**Intent wins on product shape.** Gaps become issues — do not silently rewrite intent.

## As-built

| Slice | Path | Holds |
| --- | --- | --- |
| **Apps** | `apps/*/docs/` | Design and as-built next to code |
| **Contracts** | `packages/contracts/schema.graphql` | GraphQL SDL ([graphql-schema](/docs/interfaces/graphql-schema.md)) |
| **Deploy** | [deploy/docs/](/deploy/docs/README.md) | Ship, promote, backup, repair runbooks |

## Tree

```text
docs/
├── start-here.md
├── systems.md
├── overview.md
├── requirements/
├── semantics/
├── interfaces/
├── decisions/          # boundary D-records
├── systems/            # thin system pages
└── templates/
apps/<app>/docs/        # co-located design + local decisions
deploy/docs/            # runbooks next to Compose
```

Superseded long-form: gitignored `.local/docs-quarry/`.

## Agents

Read [AGENTS.md](/AGENTS.md) before changing code or docs.
