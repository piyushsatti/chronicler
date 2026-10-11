# Ontology (formal commitments)

Identity rules, invariants, and **non-synonyms**—what must not be collapsed even when code or conversation blurs them. Lexicon tables live in sibling facet files.

## Authority

Product purpose and authority boundaries: [README](/docs/semantics/README.md) (opening). Never derive role authority from a UI label alone. The [systems map](/docs/systems.md) owns product shape; these rules travel with the application for implementers.

**Term:** _persisted domain event_ (N26) means an append-only business or audit record tied to an entity—not DDD “domain layer,” not a Discord Gateway event, and not a queue message.

## Non-synonyms (background and ops)

- logical job vs queue message vs execution attempt
- desired revision vs applied revision vs remote provider state
- retryable failure vs terminal dead letter vs ambiguous repair case
- scheduler tick vs durable due slot vs successful maintenance outcome
- process liveness vs Gateway readiness vs end-to-end delivery health
- sensor spool event vs API activity observation
- deployment supervisor ownership vs database placement admission
- database alert receipt vs durable background job ledger

## Invariants

- Every write reaches an explicit transaction commit before the request finishes. Repositories flush; services own commit.
- Discord projection and desired-revision/job enqueue commit or roll back together. No Discord network I/O in the API mutation path in queue mode.
- PGMQ timing vs `background_jobs` obligation: do not invent a second worker lease.
- Workers may complete only the exact `(msg_id, read_ct)` receipt they claimed.
- Queue payloads: versioned identifier references only—no secrets, rendered bodies, or raw provider responses.
- Automatic retry only for bounded transient failures; ambiguous remote state stops for repair.
- Scheduled catch-up reconciles latest state, not every missed tick.
- Sensor bot: no database authority; spool before delivery; full spool must reject explicitly.
- Bot liveness ≠ Gateway-ready ≠ delivery health.
- DB cannot attest its own outage; watchdog local receipt is the narrow exception.
- `job_lane_controls.expected_owner` is placement authority.
- `filled_count` and participation changes share a transaction.
- Retirement and signup share character-row locking.
- Quest schedule is one UTC instant; game calendar is separate.
- Document identity survives soft delete; status, audience, and tombstone are orthogonal dimensions.
- Five Codex categories share one lifecycle; NPC + Lieutenant blocks category exit.
- Row visibility, scoped body, edit permission, and machine permission are four questions.
- Current rows hold current state; ledgers/revisions hold history—no system-wide event-sourcing replay.
- Deployment config claims do not prove running release, backup, restore, or OAuth.
- v1 scrape-era identities stay retired.

## Maintenance

Update facet files in the same change as meaning or public verb changes. Verify semantics ↔ implementation; when code disagrees, file the bug—do not silently redefine terms.

Evidence (legacy paths): `apps/api/db/v2/models/background_jobs.py`, `apps/api/services/quest_discord_jobs.py`, `apps/api/cli/background_worker.py`, `bot/sniffer/spool.ts`.
