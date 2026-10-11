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
| `InvariantViolation` | Dev/test throw; prod → generic | Real view rules (for example max four features on a hex)                                            |

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

- Redux Toolkit: UI only (toasts in the foundation; search, preferences, map selection later)
- TanStack Query: server cache; `queryFn` calls adapters
- Auth Context: JWT storage and expiry; `queryClient.clear()` on login, logout, and new token
- `useMe`: `GET /v1/members/me`, `staleTime: 0`, refetch on window focus; sole source for UI roles

## Responsive layout

Shell allocation and page arrangement come from [`@pi/react-imposition`](https://github.com/piyushsatti/imposition) (`github:piyushsatti/imposition#v0.1.0`): `ImpositionShell`, `PageHost`, `useContainerToken`, `navPatternFor`. Pages author a `PageDeclaration` and region renderers only. Nav pattern is never chosen in a page. No `@media` layout breakpoints in `apps/web/src`. No temporary breakpoint table.

Map uses `twoPaneIntent` so the features rail yields when the shell is not `twoPaneCapable` (compact and medium widths). Phone map shows hexes only until a dedicated hex detail route exists.

Color and type stay Chronicler tokens. Skin Imposition chrome via `--imposition-*` overrides in `base.css`.

## Accepted defects: JWT and role freshness

Cross-links: [live-authority](/docs/interfaces/live-authority.md), [identity-lifecycle requirements](/docs/requirements/by-system/identity-lifecycle.md) (L1–L3).

| Capability            | Status                                                  |
| --------------------- | ------------------------------------------------------- |
| Mint JWT              | `POST /auth/discord/callback` → `{ token }`             |
| Refresh / rotate JWT  | Not in OpenAPI                                          |
| Live authority at API | Target: JWT is identity only; roles from the member row |
| Enforcement in Go API | Partial; do not assume every route is live              |

**Defect A — Long-lived bearer, no refresh.** The same JWT is reused until expiry or re-login. Role changes in the database do not mint a new token.

**Defect B — UI authority from cached `members/me`.** Never read roles from the JWT payload. Nav and gates use adapter-validated `MemberViewModel` from `useMe`. Cache updates on refetch, focus, reload, or a new token.

**Defect C — UI vs API mismatch until refresh.** After a background role change, buttons may be wrong until `useMe` refetches. On 403, show controlled copy that permissions may have changed, offer reload or sign-in, and invalidate `me` once per page session. Expired JWT clears token and cache and routes to login.

Automated tests cover detection and messaging. Role-change end-to-end without a new `me` payload is manual until the API adds refresh or push.

## Product surface (this completion bar)

Primary navigation has exactly six destinations: Home (`/`), Quests (`/quests`), Chronicles (`/chronicles`), Codex (`/codex`), Rules (`/rules`), and Community (`/community`), matching `PRIMARY_DESTINATIONS` in [`destinations.ts`](/apps/web/src/chrome/destinations.ts). Verification (`/admin/review`) is an additional link for members with `canVerify`; it is not a primary destination. Other routes, including Characters and Map, remain accessible through their existing route and link flows. This choice changes the primary destination list only. The responsive shell continues to allocate navigation through `@pi/react-imposition` and `navPatternFor`; `PageHost` remains the page composition boundary above.

## Contract gaps (do not invent wire)

Hex Locked / Unlocked / Mapped, Feature category max four per hex, and Private Notes are not in the committed SDL or OpenAPI. Mock or defer; do not extend contracts in this app track. Exploration state and `assertCanAddFeature` stay labeled client mocks on the map page.

