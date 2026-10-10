# Preflight conflicts (Phase 0 rulings)

| Task A | Task B | Shared resource | Ruling |
| --- | --- | --- | --- |
| T310-feat-home | T319-feat-search | Search palette vs home lanes chrome | **Serial:** T010 before both; T319 must not edit `SiteChrome.tsx` (forbidden_globs) |
| T311-feat-quest | T510-editor-quest | Quest editor routes vs quest detail | **Serial waves:** Wave 5 before Wave 7; editor owns `/quests/new`, `/quests/:code/edit` |
| T314-feat-codex | T512-editor-codex | Codex editor paths | **Serial waves:** Wave 5 read routes before Wave 7 editors |
| T317-feat-rules | T513-editor-summary-rules | Rules editor paths | **Serial waves:** Wave 5 before Wave 7 |
| T617-admin-review | T618-admin-* | `AdminReviewPage.tsx` | **Serial:** T617 only task touching review page; other admin sections parallel after T610 |
| T110-primitives-core | T111-primitives-overlay | `tests/components/primitives/*` | **Same wave OK:** tests namespaced per file; implementers avoid editing same test file |
| T250-hook-* (future) | T250-hook-* | Shared adapter module | **Serial per module:** preflight assigns one hook owner per adapter file |
| T313-feat-community | T314-feat-codex | NPC/faction detail components | **Disjoint folders:** community profile vs codex guards; escalate if shared domain card imports |

Wave 1 dispatch cleared: no implementer task overlaps integrator-only paths. Wave 3 file globs are pairwise disjoint by filename prefix.
