# Web sign-in and current member authority

The Go API implements the OAuth2 Authorization Code Grant. The web callback owns same-tab state correlation; API authorization uses the live member authority. These are separate checks.

## Login journey

1. `AuthProvider.login` creates a 32-byte random nonce, stores it in session storage with a timestamp, and starts `GET /auth/discord?state=…`.
2. `login.Service` redirects to Discord with the configured client ID and redirect URI, `response_type=code`, `scope=identify`, and the supplied state.
3. Discord returns to the web `/auth/callback` route. `useAuthCallback` consumes the pending nonce before exchanging the code. Missing, mismatched, replayed, damaged, or expired state is rejected. The age must be less than ten minutes.
4. The member adapter posts `{code, state?}` to `/auth/discord/callback`. The Go service exchanges the code at the fixed Discord token endpoint, then reads the profile at `/users/@me`. Both requests share a ten-second context deadline; the default client does not follow redirects. Responses have bounded decoding and controlled errors.
5. The Postgres implementation of `MemberStore.EnsureFromDiscord` resolves the stable public member UUID. First login creates a guest and initializes display name and avatar from Discord. Later logins preserve the stored profile, including a locally cleared (null) avatar, along with the stable UUID, handle, status, flat roles, and profile update timestamp. The member record is the profile authority; see the [owner decision](/docs/audits/owner-decisions.md#frontend-completion-follow-ups-2026-10-20).
6. The API returns `{token}`. The web accepts an unexpired token, clears previous account caches, and navigates to a safe internal intended path or Home. The callback guards duplicate effect execution and late responses.

The configured redirect must reach the frontend callback on the initiating browser origin; the API callback is a POST endpoint. This document does not establish any externally registered redirect value. Registration and credentials require the owner's exact authorized configuration.

## Token and account wire

`login.Mint` emits an HS256 JWT containing `member_id`, `roles`, `archon_regions`, `lt_npcs`, and `exp`, with a default thirty-day lifetime (`Config.TokenTTL` can override it). Token role fields are not authorization authority. There is no refresh-token flow or server-side session-replay guarantee in this slice. Local development login remains a separate configured path.

`GET /v1/members/me` returns exactly `id`, `handle`, `displayName`, and `roles`. `id` is the public member UUID. Roles come from the verified request Authority; an empty role set is `[]`. The canonical schema is [OpenAPI](/packages/contracts/openapi.yaml). Internal member fields and other profile endpoints keep their own contracts.

## Request authorization

`apiHandler` installs `auth.LiveMiddleware` on every route except `POST /v1/graphql`, which keeps identity-only middleware and resolves live authority after GraphQL validation and costing, answering failures as GraphQL `errors[]`. Elsewhere a valid member token is resolved against current Postgres authority once per request. Missing or inactive members and authority lookup failures fail closed; changed roles take effect without minting another token. Live DM status and the current handle also feed audience policy. See [live-authority](/docs/interfaces/live-authority.md) and [scoped-body](/docs/interfaces/scoped-body.md).

The web uses validated member responses for presentation and role-based navigation, and clears caches on account or authority changes. The server makes the authorization decision for every protected request.

Guests can author summaries and set availability, but cannot sign up for quests. They can withdraw existing participation. The first approved character promotes its guest owner to player within the verification transaction, preserving staff roles and appending role history. Later retirement or deletion does not remove player. See [D47](/docs/decisions/D47-Guest-Onboarding-And-Player-Promotion.md).

## Verification boundaries

Controlled provider transports and an isolated Postgres runtime can verify this code path without contacting Discord. They do not certify the application's external registration, live credentials, production deployment, or real-provider effectiveness. Frontend state correlation does not prevent a caller from bypassing the browser and posting a code directly to the API.

## Implementation sources

- `apps/api/internal/login/login.go` and `oauth.go`: initiation, exchange, profile, and token minting.
- `apps/api/db/queries/members.sql`: member creation and repeat-login persistence.
- `apps/api/internal/member/http.go`: account DTO.
- `apps/api/cmd/api/main.go` and `internal/platform/auth/auth.go`: request authority boundary.
- `apps/web/src/auth/AuthContext.tsx`, `oauthState.ts`, and `features/member/hooks/useAuthCallback.ts`: browser lifecycle.

The earlier imported FastAPI hybrid-token description is historical evidence, not the Go implementation. Historical sources remain preserved in `.dump` and the documentation quarry.
