# D29: Owner And Admin Bypass Identity Predicates

**Status:** decided 2026-07-31; amended 2026-09-16  
**Kind:** boundary  
**Owner:** global (`docs/decisions/`)  
**Interface:** [live-authority](/docs/interfaces/live-authority.md)

## Context

Ownership, permission and audience checks ask who the caller is. The existence of an operation and validity of its resulting state ask different questions. Bypass must not conflate those layers.

## Decision

**Outside player-character mutation, platform owner and admin bypass caller-dependent authorization predicates, including resource ownership and audience denies.** Evaluate this in shared decision logic, using verified current authority rather than token roles or scattered admin branches.

- Platform owner is the deployment-declared fixed account set, not an application-grantable role. Admin is an assigned, revocable role. Their current representation and enforcement must be established by the provider; legacy bootstrap mechanics are not the current Go implementation.
- **September 16 exception:** only the owning player may mutate a player character or its owned sub-resources, including progression/log writes and D&D Beyond sync. Platform owner, admin, verifier and all other staff are excluded. Admin/verifier assessment decisions are a separate ledgered authority, with no grant to edit player-authored fields or sync.
- Surface: bypass grants access to an existing operation; it never creates a missing mutation.
- Authorization: bypass skips caller-dependent checks outside the named exception.
- Invariant: required fields, constraints, legal transitions and quality gates still apply. A check independent of the caller has nothing to bypass.
- A privileged result must retain caller context; a nominally public resolver cannot drop authority when the result should differ for that caller.
- Record an actual override distinctly from an ordinary allowed action, without protected body or policy data.

The document author's raw-body grant and the approved per-viewer block rule remain governed by [scoped-body](/docs/interfaces/scoped-body.md). The player-character exception changes neither document grants nor other aggregates' rules.

## Alternatives rejected

- Wildcard permission alone: it cannot express resource or audience predicates.
- Independent admin branches at each call site: new checks can omit bypass or silently change its breadth.
- Interpreting bypass as permission to create invalid state or a missing operation: that confuses authorization with a different layer.

## Consequences

The September amendment supersedes July's universal wording for player-character mutations. Remaining aggregates converge on shared authority logic. Missing surfaces and denied operations are separate findings with separate remedies.

## Enforced by

`Specification.Allows`, `ScopeFromAuthority` and `TestAdminBlockOverrideAuditOmitsProtectedBytes` cover document administrator bypass and its audit distinction. [live-authority](/docs/interfaces/live-authority.md) records remaining platform-owner representation, cross-aggregate declaration and override-audit gaps; complete D29 conformance is **not enforced**.

## Reopen triggers

- An accepted decision changes the platform-owner account source or the named aggregate exception.
- A privileged projection loses caller context, or bypass reaches a caller-independent invariant.
