# Actors

Who may act. Roles are composable, not a single hierarchy. Never derive authority from a UI label alone.

| ID | Actor | Meaning and authority |
| --- | --- | --- |
| A01 | Anonymous reader | No member identity; public reachable content only, subject to publication and audience rules |
| A02 | Player/member | Community identity; owns characters; joins/withdraws with own active characters; permitted authoring and personal settings |
| A03 | Dungeon master | Publishes/runs quests and authors permitted content; not blanket owner of every character or another member’s Codex entries |
| A04 | Archon | Region stewardship; location/map actions also check assigned scope |
| A05 | Lieutenant | Assigned world/NPC stewardship; declared capabilities do not imply every UI is available |
| A06 | Verifier | Decisions through verification-specific rules |
| A07 | Administrator | Administrative wildcard; some product operations still enforce their own constraints |
| A08 | Machine principal | Bot/scheduler/service identity; ingress ≠ authoritative authorship |

Evidence (legacy paths until `apps/` absorbs): `apps/api/services/auth/permissions_v2.py`, `apps/api/db/v2/models/actor.py`, `apps/api/services/auth/`.

See also: [taxonomy.md](/docs/semantics/taxonomy.md) (role kinds), [ontology.md](/docs/semantics/ontology.md) (authority invariants).
