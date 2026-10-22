# Final Build29 route and action evidence audit

2026-10-20. **Acceptance remains bounded; do not mark the entire frontend complete from these receipts.** No new product defect was established in this read-only audit. The explicit Calendar title/filter decision, actual failed-preference-save retry proof, final visual approval, real OAuth/provider limits and source-bound Map activation remain separate gates. This report does not change the registry.

## Current inventory and provenance

The route manifest and registry match exactly in order: **92 unique patterns: 60 retained,29 aliases,3 demos**. Every entry has actors/access/actions; these describe applicability, not a completed role-by-route Cartesian matrix. This count is inventory only. Current625 source and181 dist files were independently hashed against immutable Build29 and all matched. Source manifest `fe1319173ab0789c395d1a2b6e1bacdd7bc2fb56dd18794e6c8fc29dde550ec5`, dist `2a842153d0c9987bff7904c04600ad1bf13cd431a54729ce7a2f720c9e797db4`, build receipt `0c15652d1275198ab9d3480d286fd6a1d37c9baa74edaac8fd6b8b00cb6e8548`. API12 production was not changed or called by this audit.

Current repository verification93697 reports1104 web tests and15 design gates passed; mock57294 reports62 expected/0unexpected/0skipped/0flaky. Current guest49585 raw Playwright report has138 expected/0unexpected/0skipped/0flaky across390/900/1920. These are distinct evidence: unit/mock success cannot substitute for persistence or live authority.

## Evidence actually inspected

| Key | Actual receipt and useful scope | Bounds |
| --- | --- | --- |
| D10 | editor-live/run-10/browser-receipt.json: completed18 stages,765 observed requests, errors/pageErrors/unsafe empty, browser/Vite closed; before/after Build29 identity matches. Native persisted readback contains72 receipts,13 Documents,5 links and1 notice; compatibility Arc unchanged. | Current real draft/create/edit/replay/publish/readback/reload; Guide audience null/deny-all/custom/member, history/stale/trash/restore; hidden-body omission and current assignment/role denial; incomplete Summary link preservation; account/new-token/expiry; imported category/frontmatter; canonical aliases; private Chronicle/Search/palette. Root acceptance JSON was not yet present when inspected; raw terminal receipt/native artifacts were used. |
| A13 | account-browser/run-13-current-css/browser-receipt.json and root-acceptance.json: completed12 stages/534 requests/57 command receipts, current source stable, native cleanup confirms DB absent/listeners closed. | Current saved settings/account/guest isolation/OS motion; inbox pages/read/destinations; character create/replay/profile/verification/resubmission/progression/log/downtime/retire; member/DM profile/availability/table ownership; role loss/logout/expiry. Actual default DDB success has persisted mirror and exact replay/readback; invalid URL fails separately before provider fetch. Provider request count was not instrumented; this is not a Discord/OAuth claim. |
| G29 | route-acceptance/preview-29-api12/playwright-report.json:138 passing guest cases. | Current public reads/recoverable boundaries/guest protected redirects/aliases, Search second page and back URL state at three widths. It does not perform authenticated writes. |
| C13 | admin-browser/run-13: complete10 actor/allocation journeys, actual role/banner/catalog/clock/calendar writes and readback; DM dashboard25+1; configured-owner override receipt; current self-revocation. | Dated source; actual People phone/intermediate/desktop geometry is historical, not Build29 geometry. |
| C7 | admin-browser/continuation/run-7: completed14 checkpoints/298 requests,217 native receipts, isolated cleanup. | Dated Build22; real50+1 character/DM queues, note/reject/resubmit/stale conflict/approval, catalog/backstory pages and edits, batch roles replay,101 Regions/both forwards/current role denial/Document+deadline preservation. |
| P6 | public-collections/run-6: completed9 stages/115 requests, Build28; native all-product-table before/after equal. | Dated functional public Rules/Community/directories/character owner-filter/Codex51-page/profile/schedule/DM-table/Me; qualified Home DM population proof. Its phone pixels are not current. |
| Q6 | quest-browser/run-6: completed9 stages/384 requests; cache/capacity/duplicate-award invariant violations0; database cleanup. | Dated complete Quest editor/create/edit/version/timezone/DST/Region/Arc/pointcrawl, PC choice/waitlist/FIFO/manual selection/attendance/cancel/played-close/PCXP, player+DM summaries/multiquest/current authority/expiry. Delivery is queued intent, not provider application. |
| Q8 | quest-browser/composition-run-8: completed=false; seven successful checkpoints before Calendar failure. | Dated Build28 partial evidence only: original first4 stages, Home51 schedules/phone/native WeekGrid pan, Board50+1/select/signup/withdraw, Series create/rename/reload/other-DM denial. Old merge accidentally names Series checkpoint “Quest composition renamed series”; acknowledged data still identify Arc. No Calendar success or full13-stage claim. |
| M10/M11 | M10 remains dated. Root then supplied terminal session-run-11/root-acceptance.json: native4900 exit0,13 stages/557 requests,six profiles,926 source inputs stable, current geometry/keyboard/readback and cleanup. | M11 now supplies current functional/geometry evidence; it explicitly does not substitute for the cold-cache40-trial budget or final owner visual approval. |
| GL29 | phone-layout-repair/current-29-geometry/geometry.json:11 recorded rows,errors empty,browser closed; root reports native20401 pass. | Read-only current-layout proof; separate Community/Rules32px phone top-gap diagnosis remains open and may require another narrowly scoped source build. |
| W2 | admin-browser/world-run-2: completed11 checkpoints, actual World partial multi-command failure and Gallery role matrix. | Dated functional proof, including ordinary/configured owner positives and guest/player/verifier/archon/forged/current-role-loss boundaries; no current visual claim. |
| L | chronicle-pagination/final-report.md and final raw receipt: actual101 rows/second-page facets at390/900/1920;14 Search/palette navigations to seven real reader types and reload. | Older canonical Community-entry and complete Chronicle population proof. Current D10 additionally covers private audiences/account/late response and current G29 covers public Search/Chronicles. L's old pixels/body request are not current excerpt proof. |

## Concrete remaining bounds

1. **Calendar acceptance is not complete.** Q8 fails with0 versus1 after the successful Series stage. Current G29 proves Calendar renders, but not the remaining rich filtered/page/reverse-URL action matrix. The title-versus-code search behavior is an explicit owner decision; do not change its semantics or relax the oracle silently.
2. **Real failed settings save/retry is not in A13.** Its settings stage uses successful UpdateMySettings acknowledgements and persisted reload/account transitions; no rejected UpdateMySettings then visible Retry action is exercised. Existing PreferencesSync.test.tsx has the failed-save/retry behavior under MSW. That is useful current unit proof, but not the plan's real-API browser error/retry proof. This is an evidence gap, not an observed broken retry control.
3. **Registry action applicability needs reconciliation.** `/quests/new` and `/quests/:code/edit` inherit generic Document draft/preview/revisions/publish/audience/trash/restore requirements. The accepted Quest editor intentionally has one owning atomic Save action; generic Document lifecycle actions do not apply to Quest operational records/Quest-owned briefs. Do not fabricate a missing Quest screen from this template. Exact generator source: apps/web/scripts/gen-qa-route-registry.mjs148–158 defines generic editorActions;253–260 spreads it into the two Quest paths at257. Smallest applicability correction is to replace only that spread with explicit Quest actions: load current Quest, save metadata and brief atomically and reload owning reader, preview permitted prose, resolve current update-token conflict, preserve omitted fields/hidden blocks, and link Regions/pointcrawl nodes. Retain present current-command authority/foreign-DM/guest denial. No change is needed to Document lifecycle requirements for summary paths483–487. The Quest summary route240–250 should describe authoritative linked-summary navigation/append through the shared Document/upsertQuestSummary seam, not independent Quest brief lifecycle commands. Regenerate metadata/requirements fingerprints through the existing root-owned generator; no new generic applicability framework is required.
4. **Role coverage is representative, not exhaustive92×roles.** Actual receipts prove current ordinary owner/foreign Player/DM/Verifier/Admin/configured-owner, assigned/unassigned/revoked actors at the relevant owning workflows. For example D10 proves Verifier/assignment revocation on loaded Document forms, C7 review revocation and M10 map authority. They do not prove every listed actor visits every typed alias. Shared admission plus the relevant concrete checks support functional convergence, not a blanket full Cartesian-matrix claim.
5. **Provider and visual limits remain explicit.** A13 provides actual public DDB success and expected invalid-URL failure, separately from profile saving. Discord application remains unproved; queued is not delivered. G29 invalid/missing callback recovery is not actual valid Discord OAuth. Final Legacy owner visual approval remains absent. Current Map activation needs the released current-source performance receipt before claiming the20-cold-cache/p75/p95 gate.

## The seven Build28→29 deltas

Exactly seven paths differ: ChronicleList query, Chronicle list wire pick, Chronicle adapter, root-generated operations, Home module CSS, base.css, shell.css. No other Build28 source path differs. The Chronicle change adds existing authorized effectiveBody, preserves authored excerpt semantics, and derives a whitespace-normalized160-character fallback; it changes visible/searchable excerpt content, so old Chronicle presentation/filter expectations cannot establish new excerpt behavior. Current unit61 cases plus D10 current private collection/reader and G29 public journeys cover useful integration; actual recapture remains needed for visual approval.

Generated operations are derived query types; other runtime operation documents remain unchanged. CSS changes compact Atlas gutters, Home frame/shelf arrangement and bottom-bar header height. Thus older unchanged command/admission/persistence/idempotency/native SQL findings remain dated functional evidence across these seven changes; they do not become new runtime executions. CSS affects all phone routes' painted allocation, and the header affects Map's usable height. C13/P6/Q8/M10 screenshots or old Map latency cannot prove current pixels/performance. M11 and GL29 now add their explicitly bounded current geometry results; neither is a final owner visual or cold-cache performance approval. Medium/expanded rules and Home card/WeekGrid fixes are byte-preserved, but source preservation is not geometry proof.

My prior independent CSS/Chronicle reviews are not extra delivery authority here; raw receipts, current source and independent manifest comparisons are the evidence. Root subsequently reported the failed-settings-save/retry feasibility lane assigned to another author for read-only planning; this audit makes no product change or presumption about feasibility. Registry invalidations caused by the global hash are expected; root must link the new receipts and retain dated scope rather than restore old full-completion labels wholesale.

## Ten newly executed compatibility patterns

D10's final stage now actually covers Quest, Character and Player redirect aliases; Faction/NPC redirects; Guild reader and Guild redirect; Series redirect; editor-demo and _demo. Ten successful concrete alias reads (including both Guild UUID/slug identities) record actual returned ID, canonical URL, reader ordinal and reload ordinal. Quest uses actual Quest1/DOCBROWSER1 with public brief1; intentional deny-all brief0 remains unchanged. Guild unmapped values explain the boundary, invalid Series does no guessed lookup, and exact private Guild/Faction/NPC reads are FORBIDDEN without private content. This closes the earlier route-registration-only gap.

Public demo390/900/1920 proves local typing, keyboard Read focus/outline, system light/dark and canonical redirect. A separate authorized owner PreviewBody response is rendered. `additionalMutationCount=0`; neither demo claims save/publication/persisted content. The native compatibility Arc before/after is byte-equivalent. The literal last ten manifest entries also include `/verify`, `/settings`, `/schedule`; those are separately accounted for by G29/A13/C7, not conflated with this extension's ten newly accepted patterns.

## Per-pattern evidence index

Each line below records the relevant evidence family, not a full-completion status or all listed actor combinations. Dated keys retain the bounds above. Applicable actions/roles were read from every one of the92 registry entries.

| Registered pattern | Disposition | Evidence family / limit |
| --- | --- | --- |
| `/` | retained | G29,A13 inbox links; Q8 Home actions/counts dated; current phone visual pending |
| `/editor-demo` | demo | D10 public local controls +real authorized preview; no persistence claim |
| `/_demo` | demo | D10 public local controls +real authorized preview; no persistence claim |
| `/quests/open` | alias | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/quests` | retained | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/quests/new` | retained | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/quests/:code/summary` | retained | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/quests/:code/edit` | retained | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/quests/:code` | retained | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/characters` | retained | A13 current ownership/progression; P6 dated directory; D10 alias |
| `/characters/:code` | retained | A13 current ownership/progression; P6 dated directory; D10 alias |
| `/players` | retained | A13 current profile/ownership; P6 dated directory+schedule; D10 player alias |
| `/players/:shortCode` | retained | A13 current profile/ownership; P6 dated directory+schedule; D10 player alias |
| `/dms` | retained | A13 current profile/ownership; P6 dated directory+schedule; D10 player alias |
| `/dms/:shortCode` | retained | A13 current profile/ownership; P6 dated directory+schedule; D10 player alias |
| `/editor/dm-table` | retained | D10 current creation/lifecycle/reader; A13 current owner edit |
| `/editor/dm-table/:id/edit` | retained | D10 current creation/lifecycle/reader; A13 current owner edit |
| `/community/dm-table/:slug` | retained | D10 current creation/lifecycle/reader; A13 current owner edit |
| `/community/entries/:slug` | retained | L actual Search/palette canonical reader/reload dated; current route-specific rerun absent |
| `/guilds` | alias | G29 current guest; P6 dated directory/page/filter; D10 real aliases |
| `/guilds/:shortCode` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/factions` | retained | G29 current guest; P6 dated directory/page/filter; D10 real aliases |
| `/factions/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/npcs` | retained | G29 current guest; P6 dated directory/page/filter; D10 real aliases |
| `/npcs/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex` | retained | G29 current guest; P6 dated directory/page/filter; D10 real aliases |
| `/codex/new` | retained | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/:id/edit` | retained | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/:category/new` | retained | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/:category/:id/edit` | retained | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/npc/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/faction/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/region/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/location/:slug` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/artifact/:id` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/event/:id` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/lore/:id` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/codex/:slug` | retained | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/regions` | retained | G29 guest; M11 current graph/edit/Region/current-authority/geometry; performance/owner approval separate |
| `/regions/:slug` | retained | G29 guest; M11 current graph/edit/Region/current-authority/geometry; performance/owner approval separate |
| `/map` | retained | G29 guest; M11 current graph/edit/Region/current-authority/geometry; performance/owner approval separate |
| `/map/:atlasCode` | retained | G29 guest; M11 current graph/edit/Region/current-authority/geometry; performance/owner approval separate |
| `/chronicles/:id` | retained | D10 current generic/hidden-linked/lifecycle/readers; Q6 linked PC/DM multiquest dated |
| `/chronicles` | retained | D10 current private collection +G29 public; L complete101-row facets dated; excerpt visual pending |
| `/timeline` | alias | D10 current private collection +G29 public; L complete101-row facets dated; excerpt visual pending |
| `/summaries/new` | retained | D10 current generic/hidden-linked/lifecycle/readers; Q6 linked PC/DM multiquest dated |
| `/summaries/:id/edit` | retained | D10 current generic/hidden-linked/lifecycle/readers; Q6 linked PC/DM multiquest dated |
| `/summaries/:slug` | retained | D10 current generic/hidden-linked/lifecycle/readers; Q6 linked PC/DM multiquest dated |
| `/series/:shortCode` | retained | D10 alias/unmapped; Q8 actual create/rename/other-DM denial dated |
| `/calendar` | retained | G29 render/alias; C13 clock projection dated; Q8 rich actions blocked |
| `/community` | retained | G29 current public; P6 actual paginated/availability composition dated |
| `/search` | retained | G29 current page2/back; D10 current private/late/audience; L all7 result destinations dated |
| `/rules` | retained | G29 public; P6 independent complete guide/ruling pages dated |
| `/rules/guides/new` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/rules/guides/:id/edit` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/rules/guides/:id` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/rules/rulings/new` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/rules/rulings/:id/edit` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/rules/rulings/:id` | retained | D10 current create/edit/readback/lifecycle/reader; L canonical Search destinations dated |
| `/welcome` | retained | G29 current guest/recovery; valid OAuth separate |
| `/login` | retained | G29 current guest/recovery; valid OAuth separate |
| `/auth/callback` | retained | G29 current guest/recovery; valid OAuth separate |
| `/me` | retained | A13 current; P6 dated composition |
| `/notifications` | retained | A13 current; P6 dated composition |
| `/me/personalize` | retained | A13 current; real failed-save retry unproved |
| `/dm` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/people` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/characters` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/review` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/world` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/content` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/delivery` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/data-health` | retained | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/overview` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/members` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/home-banner` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/regions` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/world-clock` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/catalogs` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/admin/ingestion` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/gallery` | demo | G29 guest denial; W2 role admission/demos dated |
| `/verify` | alias | G29 guest gates; C13,C7,W2 dated actual roles/actions |
| `/settings` | retained | A13 current; real failed-save retry unproved |
| `/schedule` | alias | G29 render/alias; C13 clock projection dated; Q8 rich actions blocked |
| `/quests/:shortCode/redirect` | alias | Q6 complete owning workflow dated; Q8 Home/Board composition partial; D10 actual compatibility alias |
| `/characters/:shortCode/redirect` | alias | A13 current ownership/progression; P6 dated directory; D10 alias |
| `/players/:shortCode/redirect` | alias | A13 current profile/ownership; P6 dated directory+schedule; D10 player alias |
| `/guilds/:shortCode/redirect` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/factions/:shortCode/redirect` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/npcs/:shortCode/redirect` | alias | D10 current creation/imported-category/hidden-body/authority/real canonical aliases; P6 dated directory |
| `/series/:shortCode/redirect` | alias | D10 alias/unmapped; Q8 actual create/rename/other-DM denial dated |

## Frozen input hashes and audit limits

- `editor-live/run-10/browser-receipt.json`: `96d642d4d9b383786a2eea4a516fa395f82d845dbbaca39d7873ddae28a051b3`
- `account-browser/run-13-current-css/browser-receipt.json`: `98c961ad0a26b687907f14fb161994aba6463f598bf3a4ed8db66342fc1d331c`
- `route-acceptance/preview-29-api12/playwright-report.json`: `dcff0b71df42aa02cf82e0ea90f4d09e2719b9c52ced28802f936eb192c83297`
- `admin-browser/run-13/browser-receipt.json`: `ea4ae83283541296bf7cd1be347a327453925a59c7d781f718b86ad310f78306`
- `admin-browser/continuation/run-7/browser-receipt.json`: `4907a4420c1096be9dfc027ccbbf1f2917c900e2554bc0141967b9f95597ff11`
- `public-collections/run-6/browser-receipt.json`: `09d4525c3bec73f6519d750605c1e4a3c75dcae94960e59ec84b5b8607b76497`
- `quest-browser/run-6/browser-receipt.json`: `42ed263927ea06dc379505463eb98753fe8c9ca14d3b95a15a6940d197b894bc`
- `quest-browser/composition-run-8/browser-receipt.json`: `19a109d790804b54e6a1dd97146912a45683254c581727452eb92629ca480199`
- `map-final-acceptance/session-run-10/browser-receipt.json`: `b900a62c229dc2cdd8cbab226e2447b8358b762edef7e19362a3135d8b698743`

This audit performed local read-only JSON/source/hash comparisons only. No test suite, compiler, build, browser, API/database, provider or service ran. No registry/docs/product/harness source was changed. Only this report was written; all audit commands ended.

- Late terminal evidence `map-final-acceptance/session-run-11/root-acceptance.json`: `8dd0f756d71c3626e0d3dc314b86a9a616d328124b5767882ca526dab6a981e7`

- Late terminal evidence `phone-layout-repair/current-29-geometry/geometry.json`: `fae36e723157b7dbb95ab7f3178fc191e512e932982f0a7fa3be9f8a69f6aa01`
