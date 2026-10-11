# Semantics

Agreed **meaning** for Chronicler: who may act, what things are, what actions mean, how kinds classify, how parts relate to wholes, and which identities must not be collapsed.

Chronicler makes a persistent West Marches campaign understandable to members and newcomers. The written record is the product: website authoring is authoritative; Discord supplies identity and activity signals; external sheets supply snapshots. Playing the game is outside the platform.

This is product language—not syntax (schema field names), not DDD “domain” structure, and not deploy runbooks. Architecture intent: [../systems.md](/docs/systems.md).

## Facets

| Facet     | File                                         | Holds                             |
| --------- | -------------------------------------------- | --------------------------------- |
| Index     | this README                                  | Entry point                       |
| Actors    | [actors.md](/docs/semantics/actors.md)       | Who may act (A-ids)               |
| Nouns     | [nouns.md](/docs/semantics/nouns.md)         | Things and relationships (N-ids)  |
| Verbs     | [verbs.md](/docs/semantics/verbs.md)         | Actions and contracts (V-ids)     |
| Goals     | [goals.md](/docs/semantics/goals.md)         | Journeys built from verbs (G-ids) |
| Taxonomy  | [taxonomy.md](/docs/semantics/taxonomy.md)   | Kinds, categories, state sets     |
| Mereology | [mereology.md](/docs/semantics/mereology.md) | Part–whole and composition        |
| Ontology  | [ontology.md](/docs/semantics/ontology.md)   | Invariants and non-synonym rules  |

Formal **ontology** here means identity commitments and forbidden equivalences—not the whole folder.

## Rules

- Update the matching facet in the **same change** as a meaning, relationship, lifecycle, or public verb change.
- Prefer linking A/N/V/G ids over restating definitions.
- Runtime bugs do not redefine semantics—file the bug.
- Evidence paths may name legacy `apps/api` until `apps/*` absorbs the code.
