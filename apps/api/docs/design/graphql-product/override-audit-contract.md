# Actual override audit D29

**Status:** accepted receipt storage contract, updated 2026-10-20. The [owner's receipt decision](/docs/audits/owner-decisions.md#frontend-completion-follow-ups-2026-10-20) supersedes this document's former audit-table writer. Receipt persistence and mounted acceptance require fresh execution evidence. Earlier missing-table failures remain historical failures.

The governing pattern is a shared authorization specification, safe structured observation for reads, and transactional command receipts for writes. D29 distinguishes an actual override from an ordinary permitted action. It introduces no mandatory authored reason or additional event history.

## Decisions and read observations

P02 `Policy.Decide` returns `Allowed`, `UsedOverride`, and a closed safe `RuleCode` from `ROLE`, `OWNERSHIP`, `ASSIGNMENT`, and `AUDIENCE`. The rule identifies the skipped predicate. An ordinary permitted action and caller-independent validation do not set `UsedOverride`. No `RequiresReason` flag exists.

Read services receive `OverrideReadObserver` through their existing constructors. W02 supplies `NewSafeOverrideObserver(slog.Logger)` with the application's configured structured logger. An actual permitted bypass emits `OverrideFact{ActorID, Operation, SubjectType, SubjectID, RuleCode, At}` using the captured clock. Reads write no database rows, command receipts, history, or grants. DOC05 body-scope observations use this same observer. The logger receives no protected body, title, audience policy, reason, profile data, or token. Diagnostic observations do not establish a second durable authority.

## Command receipt storage

W01 binds `NewOverrideRecorder(replay idempotency.Repository)` to the exact transaction-bound repository supplied as `ProductCommandRepos.Replay`, after any existing paired notification producer. `Audit.Record(ctx, claim, fact)` receives the command's actual new `idempotency.Claim`. The auth adapter maps the safe fact to `idempotency.CommandOverrideFact` and calls `RecordOverride` on that repository.

The existing claim map stages an ordered list against the exact actor, operation, key, and fingerprint. Staging rejects replay, consumed or foreign claims, changed identity, and invalid facts. It performs no SQL. The existing `Complete` performs the single conditional receipt update in the same business UOW. There is no `auth_override_audit` table, audit-row UUID, additional command wrapper, or separate completion transaction.

`idempotency_keys.receipt._authorizationOverrides` contains the ordered nonempty array. Each item has exactly these six fields:

| Field         | Value                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `actorId`     | Canonical member UUID equal to the receipt actor.                                              |
| `operation`   | Exact `Mutation.<operation>` identity matching the receipt operation.                          |
| `subjectType` | Closed safe subject type supplied by the owning domain.                                        |
| `subjectId`   | Actual aggregate UUID or an existing canonical singleton setting key.                          |
| `ruleCode`    | The actual skipped predicate's closed rule code.                                               |
| `at`          | The command's captured UTC instant from `product.UTCNow`, at PostgreSQL microsecond precision. |

No version dispatch, fabricated audit identity, protected content, policy JSON, or user reason enters the array. Ordinary commands omit the sidecar. They do not store an empty array as an override. Existing authored note and reason fields retain their existing owners and rules.

Created subjects use explicit typed successful results. Catalog, Backstory, unlockable, Quest, QuestArc, and Document results supply their actual IDs. A Quest summary uses its returned Document ID, never the first linked Quest or the actor. Spatial Map, Region, and TimeAnchor results retain their typed ID normalization. Existing singleton subjects retain `home_banner`, `quest_announcement_role`, or `game-calendar` as applicable.

`SetMemberRolesBatch` records one fact per successful returned Member in validated input order, using the same decision and captured clock. Each successful row has `Ok`, a nonnull Member, no Error, and matching `MemberId` and `Member.Id`. Error rows, missing targets, and the actor fallback cannot stand in for changed Members. Repeated admission checks, including pointcrawl audience checks, do not generate duplicate facts or invented per-node policy decisions.

## Replay, encoding, and failure

The shared structural receipt codec rejects malformed or colliding metadata, duplicate fields, unknown fact fields, and invalid identities. Stored facts must match the actual receipt actor and operation. Notification retains its typed proof and event validation. Existing `_notificationProofs` receipts remain compatible, including their top-level SQL proof lookup.

Array results reuse `_notificationResult`. The codec unwraps the result only after both authorization and notification sidecars have been validated and removed by their owning layers. Object results retain their original result fields. Replay DTOs and public GraphQL results contain neither sidecar nor a new wrapper. Plain legacy receipts retain their accepted result shape.

Current authority and disclosure checks precede receipt use, including replay. A denied or revoked caller cannot recover an old privileged result. An admitted same-key replay returns the existing command result under its current disclosure contract. It creates no additional fact, revision, notification, job, or business effect and does not call `Record` or `Complete` again.

Any staging, encoding, business, notification, or receipt-completion failure propagates through the same UOW. The transaction rolls back the business record, relationships, history, ledger or cache changes, inbox, jobs, and receipt claim. The failure test forces the existing receipt completion to fail. It does not insert into an absent audit table or report partial success.

## Mounted scenarios and retained exclusions

S03 retains the existing mounted scenario identities. An anonymous read of Document011 is `FORBIDDEN` with no override observation. Author002's ordinary read emits none. Live admin004's otherwise denied read emits one safe `AUDIENCE` fact and changes no database row. After demotion, the next read denies without a successful override observation. Captured logs contain no protected sentinel, policy, or token.

For admin004's `editPublishedDocument` on Document010 with `PATCH-DOCUMENT-EDIT-JOINT`, the completed receipt contains one exact `OWNERSHIP` fact with the original actor, operation, subject UUID, and captured clock. Forced receipt-completion failure retains the original Document and leaves no new revision, inbox, job, or completed receipt. Ordinary denial and exact replay assertions remain required.

Staff, admins, and the configured owner cannot claim Character031 or edit, sync, or otherwise mutate another player's Character through an override. These denials also apply when a caller supplies another actor's successful replay key. No audit fact can imply permission for those actions.

The retired addressed-request scenario remains a dated authorization reference. Its decision was exclusive to003, with no admin004 or configured-owner017 bypass. Terminal-job redrive and its historical V27 reason requirement are excluded from this frontend completion scope. These references authorize no restored route, mutation, request workflow, or D-AGENT work.

Exact mounted assertions are in `apps/api/cmd/api/testdata/product/mounted-override-cases.json`. Captured revision and existing notification identities retain their owning contracts. Override facts have no independent generated identity. This reference and its JSON vector define acceptance criteria, not a successful native or browser receipt.
