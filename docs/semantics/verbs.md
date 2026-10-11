# Verbs

Actions and contracts: actor, prerequisites, transitions, effects, failures.

| ID  | Verb                               | Actor, prerequisites, transitions, effects, failures                                                                                                              |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01 | Discover/read                      | Publication, tombstone, audience govern appearance; five Codex categories share one safe body renderer; stale supported-category URL redirects to canonical route |
| V02 | Create/update character            | Owner supplies valid catalog/backstory/profile; verification/lifecycle are separate verbs                                                                         |
| V03 | Submit/decide verification         | Owner submits; verifier decides; status and history must agree                                                                                                    |
| V04 | Create/update quest                | DM supplies DM, regions, scheduled time (timezone→UTC), duration, slots, brief; ≠ in-world calendar                                                               |
| V05 | Join quest                         | Own active character + idempotency key; open→signed_up, full→waitlisted; duplicates/wrong owner/inactive/terminal fail                                            |
| V06 | Withdraw                           | Own character; frees capacity / may promote waitlist; repeat must not double-decrement                                                                            |
| V07 | Transition/close quest             | Legal lifecycle; closure coordinates attendance/rewards; terminals have no outgoing edge                                                                          |
| V08 | Write summary                      | Authorized author ties outcome to quest(s), characters, prose after external play                                                                                 |
| V09 | Create/save draft                  | Member creates Artifact/Event/Lore/NPC/Faction; backend draft persists; browser-local “Save draft” ≠ server persistence                                           |
| V10 | Publish/edit/unpublish             | Author or admin; reclassify within five Codex categories; NPC with Lieutenant assignment cannot leave NPC; publish is one transaction                             |
| V11 | Set audience                       | Visibility/readers/policy + revision; does not grant edit rights                                                                                                  |
| V12 | Delete/restore document            | Tombstone; identity and references preserved; orthogonal to draft/published                                                                                       |
| V13 | Govern place/time                  | Scoped map/location or calendar edits; API ≠ browser route                                                                                                        |
| V14 | Follow/request/configure           | Member coordination and preferences; distinguish implemented vs unimplemented decisions                                                                           |
| V15 | Observe/notify/process             | Machine paths; accept ≠ persist ≠ execute ≠ notify                                                                                                                |
| V16 | Project quest to Discord           | Desired state in API txn; worker applies legs async in queue mode                                                                                                 |
| V17 | Attest participation               | DM manual attendance; ≠ self-service seat                                                                                                                         |
| V18 | Synchronize sheet                  | Refresh DDB snapshot under character authority                                                                                                                    |
| V19 | Grant/equip unlock                 | Entitlement vs equip from inventory; catalog alone grants nothing                                                                                                 |
| V20 | Assign/revoke authority            | Role / Archon / Lieutenant with own gates                                                                                                                         |
| V21 | Administer catalog/backstory       | Reference options; ≠ player choice                                                                                                                                |
| V22 | Link/unlink spatial entry          | Spatial↔prose association under scope                                                                                                                             |
| V23 | Schedule/claim/complete/retry work | Due-slot→job+message; claim by receipt; work without holding DB connection                                                                                        |
| V24 | Retire character                   | Withdraw live signups first; terminal retired; history kept; future signup refused                                                                                |
| V25 | Advance desired Discord state      | Lock quest; bump desired revision only for rendered change; enqueue logical job same commit                                                                       |
| V26 | Apply Discord projection           | Apply legs; record applied revision; successor if desired advanced                                                                                                |
| V27 | Dead-letter/redrive/repair         | Terminal→DLQ; redrive only with reason; ambiguous→repair-required                                                                                                 |
| V28 | Ensure a scheduled slot            | Create only eligible missing UTC slots; uniqueness collapses duplicates                                                                                           |
| V29 | Accept/deliver a sensor event      | Persist spool before POST; delete only after accepted/idempotent success                                                                                          |
| V30 | Reconcile voice recovery           | After Gateway ready; close missing/changed sessions with stable recovery IDs                                                                                      |
| V31 | Fence/pause/resume work            | Expected owner before claim; explicit reason for ownership/lane mutations                                                                                         |
| V32 | Raise/resolve operational alert    | One pending transition; at-least-once notify; DB outage uses local receipt                                                                                        |

Evidence (legacy paths): `apps/api/services/quest_signup_v2.py`, `quests_v2.py`, `quest_rewards_v2.py`, `characters_v2.py`, `documents_v2/`, `social_v2.py`.

Journeys built from these verbs: [goals.md](/docs/semantics/goals.md).
