# Mereology

Part–whole and composition: what is a piece of what, without collapsing identities. Background-work chain is the densest example; see also N05 (participation ⊆ quest), N08 (revision ⊆ document), N11 (hex/node ⊆ map).

## Campaign record (informal)

```text
Community
  └── Member (N01) ──owns──► Character (N03)
  └── Quest (N04) ──has──► Participation (N05) ──references──► Character
  └── Document (N07) ──optional──► Revision (N08)
  └── Map (N11) ──contains──► hex / node / edge (N22) ──may link──► Document
```

Place/location (N12) is expressed through codex and spatial links; it is not the same whole as a hex or map.

## Background work (obligations)

The queue is transport, not the product’s entity model.

```text
authoritative mutation
  → desired revision / due slot
  → logical background job (N27)
  → PGMQ message (N28)
  → receipt-fenced job run (N31)
  → side effect
  → applied revision / completed slot
```

Machine principals remain distinct wholes: API producer, worker, sensor bot, watchdog—shared image or host does not merge authority.

## Discord projection legs

One quest → at most one stable logical job key; message, thread, and scheduled event are **independent legs** with their own remote IDs. Desired revision (what should exist) and applied revision (last known handled) are parts of one projection story, not the same fact as remote provider state.

## Sensor ingest

Gateway dispatch → spool row (N36) → HTTP attempt → idempotency claim → activity record (N16). Spool `dead` (sensor path) ≠ PGMQ dead letter (worker path).

## Rules

- Do not treat participation as interchangeable with attendance outcome (N05 vs N20).
- Do not treat logical job, queue message, and execution attempt as one object (N18 umbrella; N27–N31).
- Cardinality in the database supports many of the wholes above; this page states meaning, not implementation completeness.

Evidence: [background-work reference](/docs/interfaces/work-queue-durability.md), [work and scheduling](/docs/systems/work-and-scheduling.md).
