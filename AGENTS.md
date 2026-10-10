# Agent instructions (Chronicler monorepo)

Campaign-management monorepo: Go GraphQL/REST API (`apps/api`), React web, discord.js bot, Python agent service, shared contracts. **Namespace:** product name Chronicler; packages and modules live under the PI maintainer namespace (`@pi/*`, `pi.chronicler.*` for the agent)—do not introduce parallel naming (for example `@chronicler/*`) without an explicit decision record. Commands and layout: [README.md](/README.md). Documentation routing: [docs/start-here.md](/docs/start-here.md). Ownership model: [CONTRIBUTING.md](/CONTRIBUTING.md#documentation-ownership-model).

## Design discipline

**Name the pattern before designing.** Use established names (CQRS, outbox, specification, anti-corruption layer, …). Record deviations from a named pattern explicitly. “No governing pattern” is allowed; inventing an unnamed bespoke approach is not.

**Converge on one surface** (owner ruling 2026-07-28). Every decision states whether it moves the system toward a single authoritative surface. Convergence needs no defence; divergence needs a written justification. One rule with two interpreters (e.g. specification in SQL and Python) is convergence; a consumer restating the rule in its own terms is not.

## Architecture authority

We do **not** use GitHub’s wiki feature. Product architecture and accepted decisions live **in this repository**:

- **Intent:** [docs/systems.md](/docs/systems.md), [docs/interfaces/](/docs/interfaces/README.md), [docs/decisions/](/docs/decisions/README.md), [docs/semantics/](/docs/semantics/README.md), [docs/requirements/](/docs/requirements/README.md).
- **As-implemented:** `apps/*/docs/`, [deploy/docs/](/deploy/docs/README.md), `packages/contracts/`.
- Working scratch outside the clone is not authority — publish durable conclusions into the owning path above.

## Earned footguns

- **Database sessions:** Go commands own one transaction via `uow.Runner.Do` (commit on nil, rollback otherwise). Repositories never commit. Expected failures are values ([D25](/apps/api/docs/decisions/D25-Expected-Failures-Are-Values.md)). Backend rules: [apps/api/docs/backend-working-rules.md](/apps/api/docs/backend-working-rules.md).
- **Production releases:** deployments, promotions, and rollbacks run **only** through GitHub Actions. No manual SCP/rsync, SSH mutation, or workstation deploy scripts as a production release path. Repo scripts may be workflow primitives only. If Actions cannot run, stop. Canonical record: [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). Interface: [actions-releases](/docs/interfaces/actions-releases.md).

## Secrets and operations

Do not ask the owner to perform raw SSH or on-server file edits for routine operations. Development credentials may stay local; production secret handling: [secrets overview](/deploy/docs/secrets-overview.md).

## Pointer map

| Resource | Holds | Consult when |
| --- | --- | --- |
| [README.md](/README.md) | Setup, verify, monorepo layout | Running tooling or finding an app |
| [CONTRIBUTING.md](/CONTRIBUTING.md) | PR gate, doc ownership model | Before pushing or changing docs |
| [docs/start-here.md](/docs/start-here.md) | Human onboarding path | First read |
| [docs/systems.md](/docs/systems.md) | Product systems map | Shaping the product |
| [docs/interfaces/](/docs/interfaces/README.md) | Boundaries both sides must honor | Changing a seam |
| [docs/semantics/](/docs/semantics/README.md) | Product semantics | Naming concepts |
| [docs/requirements/](/docs/requirements/README.md) | R-id verdict index | Flipping met/partial/absent |

## Verify before claiming done

From the repository root, `scripts/verify` (or `bun run verify`) must pass for changes that touch covered apps. Say what you ran; do not claim verification you did not perform. Docs changes should also pass `python3 scripts/docs-lint.py`.
