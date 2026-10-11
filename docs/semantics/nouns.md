# Nouns

Product things and relationships. Not a promise that every aggregate repository exists yet. Part–whole detail: [mereology.md](/docs/semantics/mereology.md). Kind/state sets: [taxonomy.md](/docs/semantics/taxonomy.md).

| ID  | Noun                                  | Identity, ownership, relationship, lifecycle                                                                                                          |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| N01 | Member                                | UUID community identity linked to Discord; owns many characters and authored documents; active/inactive/banned ≠ held roles                           |
| N02 | DM profile                            | Member-related public DM information and verification state; draft/pending/approved/rejected ≠ member status                                          |
| N03 | Character                             | UUID plus short code; owned by one member; active/retired/dead/pending_approval; sheet, logs, progression, backstory are associated records           |
| N04 | Quest                                 | UUID plus unique short code; one DM and one brief document; optional arc; many regions and participants; open/full/played/closed/cancelled            |
| N05 | Participation                         | Composite `(quest_id, character_id)`; status signed_up/waitlisted/withdrawn/played/no_show; capacity counts signed_up only                            |
| N06 | Quest arc                             | UUID storyline grouping zero or more quests; nullable many-to-one from quest                                                                          |
| N07 | Document                              | UUID with unique slug; one author; kind/category; Codex authoring categories Artifact, Event, Lore, NPC, Faction; draft/published ≠ audience/deletion |
| N08 | Revision                              | Document-associated numbered snapshot with reason; audit/history, not system-wide event sourcing                                                      |
| N09 | Audience                              | Policy or legacy visibility for a request; body redaction ≠ edit permission                                                                           |
| N10 | Region                                | World/stewardship boundary; server/archon/uncharted; assignments and transition history                                                               |
| N11 | Map                                   | UUID spatial representation; hexgrid or pointcrawl; hexes/nodes/edges map-scoped                                                                      |
| N12 | Place/location                        | Campaign place via codex + spatial links; ≠ hex or map                                                                                                |
| N13 | Game time                             | In-world calendar and real→game anchors; ≠ quest real scheduled timestamp                                                                             |
| N14 | Request/follow                        | Community coordination; enum states ≠ all decision actions implemented                                                                                |
| N15 | Notification                          | Member-facing notice with delivery state; delivery success ≠ business success                                                                         |
| N16 | Activity observation                  | Discord signal; not authoritative prose                                                                                                               |
| N17 | Preference/unlock                     | Settings and earned/granted catalog; equipping ≠ granting                                                                                             |
| N18 | Work item                             | Umbrella for logical job / transport message / execution attempt (see N27–N32)                                                                        |
| N19 | Verification decision                 | Approval/rejection history; ≠ subject’s cached status                                                                                                 |
| N20 | Attendance/reward/progression outcome | Quest outcome and character ledger effects; ≠ signed-up seat                                                                                          |
| N21 | DDB snapshot                          | Cached external sheet; sync ≠ ownership transfer                                                                                                      |
| N22 | POI/edge/spatial link                 | Map-contained point, connection, or document association                                                                                              |
| N23 | Catalog/backstory option              | Valid creation/reference choice; admin ≠ player select                                                                                                |
| N24 | Assignment                            | Member↔region/NPC stewardship; grant/revoke/scope ≠ role name                                                                                         |
| N25 | Idempotency claim                     | Request-scoped retry identity; not user-authored history                                                                                              |
| N26 | Authorization decision/audit          | Permission evaluation trace; ≠ business success or persisted domain event (see [ontology.md](/docs/semantics/ontology.md))                            |
| N27 | Logical background job                | Stable UUID + unique `job_key`; obligation across retries and placement                                                                               |
| N28 | Queue message and claim receipt       | PGMQ identity + `(msg_id, read_ct)`; fences one attempt; ≠ logical job                                                                                |
| N29 | Lane and queue                        | Policy boundary (`discord`, `maintenance`, `dead_letter`) vs named PGMQ transport                                                                     |
| N30 | Dead letter                           | Terminal worker-job copy for operators; ≠ bot-spool dead event                                                                                        |
| N31 | Job run/attempt                       | Append-only execution evidence for a logical job + claim                                                                                              |
| N32 | Scheduled job and due slot            | Recurring intention + one eligible UTC occurrence; tick ≠ slot ≠ job ≠ execution                                                                      |
| N33 | Discord desired projection            | Desired vs applied revision; per-leg message/thread/event state                                                                                       |
| N34 | Repair case                           | Job stopped for ambiguous remote identity; needs inspection + explicit redrive/cancel                                                                 |
| N35 | Lane control and placement fence      | DB pause state and expected worker owner                                                                                                              |
| N36 | Sensor spool event                    | Normalized Discord observation in bot SQLite before API delivery                                                                                      |
| N37 | Observed voice session                | Bot recovery state for a guild voice join until closed/reconciled                                                                                     |
| N38 | Alert transition                      | Active/resolved condition for one operational alert key                                                                                               |

Evidence (legacy paths): `apps/api/db/v2/models/`, `apps/api/db/v2/enums.py`. Meaning also from [architecture systems](/docs/systems.md).
