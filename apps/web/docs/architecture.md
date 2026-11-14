# Web architecture — boundaries, hooks, and accepted defects

Normative rules for `@pi/web`. Wire shapes live in [`/packages/contracts`](/packages/contracts/README.md). Composition tokens live in [design-system.md](/apps/web/docs/design-system.md).

## Validation ladder

| Level                            | Validates                                           | On failure                                                                            | Must not                    |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| Transport (`src/api/`)           | HTTP status, JSON, GraphQL `errors[]`, REST Problem | Throw `TransportError` (code only; never raw body in `.message`)                      | Map to UI copy              |
| Adapter (`features/*/adapters/`) | Selected wire shape (Zod per operation)             | Return `AdapterResult` failure: `NotFound`, `InvalidWire`, `Unauthorized`, `Upstream` | Import React; touch DOM     |
| Hook                             | Auth `enabled`, query keys                          | Surface `AppError` via `toAppError`                                                   | Parse wire; render JSX      |
| Page                             | View model or page status only                      | Controlled `AppError.userMessage`                                                     | Import generated wire types |
| Component                        | Prop types                                          | Prop-driven empty states                                                              | Fetch                       |

`parseX` is pure and returns `AdapterResult`. `loadX` calls transport, then parse, then throws `AppError` so TanStack Query uses `status: 'error'`. GraphQL responses with a non-empty `errors` array are failures even when `data` is present.

## Error taxonomy (`src/errors/`)

| Type                 | User-visible                   | When                                                                                                |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `TransportError`     | No (mapped)                    | Network, non-JSON, GraphQL errors, REST Problem                                                     |
| `AdapterFailure`     | Via `toAppError`               | Zod fail, unexpected null, leaked bigint                                                            |
| `AppError`           | Yes                            | Only type pages see. `kind: 'safe'` may use adapter-authored copy; other kinds use a fixed sentence |
| `InvariantViolation` | Dev/test throw; prod → generic | Required view invariants                                            |

`toAppError(unknown, context)` is the only UI copy builder. Context keys such as `home:load` are for logs, not user text.

## Hook taxonomy

| Kind        | Location                            | Role                                                    |
| ----------- | ----------------------------------- | ------------------------------------------------------- |
| Transport   | `src/api/`                          | `fetch`, paths, bearer headers                          |
| Adapter     | `features/*/adapters/`              | `parseX` → `AdapterResult`; `loadX` → throws `AppError` |
| Query       | `features/*/hooks/` or `src/hooks/` | `useQuery({ queryFn: loadX })`                          |
| Mutation    | `features/*/hooks/`                 | `useMutation` + scoped invalidation                     |
| Composition | `features/*/hooks/useXPage.ts`      | Combines queries; returns `PageData<T>`                 |
| UI          | `components/`                       | DOM-only                                                |

Hard rules: pages call composition hooks (or one query hook); hooks call adapters; no cross-feature hook imports; no `useEffect` for fetching.

`PageData<T>` is `loading` | `error` | `empty` | `ready`. Pages branch error, then loading, then empty, then ready.

Two-query pages (home): error if either required query errors without waiting on the other; else loading if either is loading; else empty if the heading source is empty; else ready.

## Fixture layout

- Wire: `tests/fixtures/wire/<feature>/good.json`, `bad-*.json`, `empty-list.json`
- Views: `tests/fixtures/views/` for dumb components
- MSW handlers read the same JSON as adapter unit tests where possible

Each adapter PR adds at least one bad-wire test.

## Client state

- Redux Toolkit: existing UI state, including foundation toasts. Server data remains in TanStack Query.
- TanStack Query: server cache; `queryFn` calls adapters
- Auth Context: JWT storage and expiry; `queryClient.clear()` on login, logout, and new token
- `useMe`: the typed `MemberMe` GraphQL operation supplies current member identity and roles. Staff routes also require their current server access proof. JWT role claims never grant UI or API authority.
- Accepted: `useMotionCollapse` reads preferences from Redux (`selectPreferences`) rather than `ThemeContext`, because `ThemeProvider` itself calls `useMotionCollapse` while building context and cannot consume that context.

## Responsive layout

Shell allocation and page arrangement come from [`@pi/react-imposition`](https://github.com/piyushsatti/imposition) (`github:piyushsatti/imposition#v0.1.0`): `ImpositionShell`, `PageHost`, `useContainerToken`, `navPatternFor`. Pages author a `PageDeclaration` and region renderers only. Nav pattern is never chosen in a page. No `@media` layout breakpoints in `apps/web/src`. No temporary breakpoint table.

Map composes the pointcrawl SVG, equivalent location list and selected location details through `PageHost`. Compact layouts retain keyboard selection and the list. A hexflower map is a pointcrawl map whose nodes are named by hex number (for example `LFR7008`); a Codex Feature names its hex in frontmatter `hex`, and when a DM or admin publishes it the API links it to that node on the Lightfall map, at most four published Features per hex. Hex-grid cell storage and a separate discovery model stay retired; see [Map guidance](/apps/web/docs/map-authoring.md).

Color and type stay Chronicler tokens. Skin Imposition chrome via `--imposition-*` overrides in `base.css`.

## Identity and current authority

Cross-links: [live authority](/docs/interfaces/live-authority.md), [identity lifecycle requirements](/docs/requirements/by-system/identity-lifecycle.md).

Discord authentication returns a bearer token from `POST /auth/discord/callback`. The token identifies the caller. Current PostgreSQL authority, resource ownership and assignments determine API admission. Existing read and command policies remain authoritative.

The web app uses validated member and access-proof queries for navigation and forms. Account changes clear scoped caches. Hooks must fence pending results and mutations against the current session. This is a required invariant; source review alone does not establish complete workflow coverage. A displayed button never grants permission, and a background role change can make a previously loaded action fail. Show controlled failure feedback and offer reload or sign-in rather than retrying under stale authority. The app query client retries transport failures and HTTP 5xx twice (`staleTime` 30s; mutations never retry). Authority failures (401, 403) never retry, which keeps that reload-or-sign-in rule.

Token renewal and provider profile ownership are separate concerns. This implementation does not introduce refresh tokens, role push updates or a new profile ownership policy. Browser acceptance must exercise actual revocation and account changes without treating a fixture token claim as authority.

## Product surface (this completion bar)

Primary navigation has exactly six destinations: Home (`/`), Quests (`/quests`), Chronicles (`/chronicles`), Codex (`/codex`), Rules (`/rules`), and Community (`/community`), matching `PRIMARY_DESTINATIONS` in [`destinations.ts`](/apps/web/src/chrome/destinations.ts). Verification (`/admin/review`) is an additional link for members with `canVerify`; it is not a primary destination. Other routes, including Characters and Map, remain accessible through their existing route and link flows. This choice changes the primary destination list only. The responsive shell continues to allocate navigation through `@pi/react-imposition` and `navPatternFor`; `PageHost` remains the page composition boundary above.

## Retained workflows and exclusions

Use the [accepted API behavior](/apps/api/docs/design/graphql-product/behavior.md) for retained operations. Map browsing and editing use current pointcrawl records and Document references. Hybrid Search uses safe Document full text and member-prefix matching with separate totals and pages. Search and the command palette share canonical reader destinations.

Do not restore hex-grid cell storage, fog, retired social requests or follows, cosmetic equipment, terminal-job redrive or D-AGENT under frontend completion. Historical visual examples do not authorize new storage, mock production behavior or alternate API ownership. The [QA route registry](/apps/web/docs/parity/qa-route-registry.json) records route dispositions and verification evidence.
