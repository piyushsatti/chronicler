As-built living note. Scrubbed from quarry; prefer durable symbol/schema names over path:line.
Interfaces: see [docs/interfaces/](/docs/interfaces/README.md).

# Auth Flow -- Discord OAuth + Hybrid v2 Claims

Current-state reference (latest only). Rewritten 2026-07-21 (issue #284):
the previous version described a flow removed in `d53fd0a` (the fix for a
prod login-500). This version is read off the API auth routers and claims services directly.

## What this implements

Discord OAuth 2.0 login for the web frontend, minting one JWT that carries
both the legacy `sub` claim (Discord snowflake) and the full v2 RBAC payload
(`member_id`, `roles`, scoped-role assignments). One token, two consumers:
the legacy `extract_discord_id` middleware and `parse_claims_v2`.

## Architecture

```
Browser                   Backend (FastAPI)                Discord API
-------                   -----------------                -----------

[/login page]             GET /auth/discord ─────────────▶ redirect to
  |                            |                            discord.com/oauth2/
  |                            |                            authorize?...
  |◀───── 302 redirect ────────|
  |
  | (user clicks "Authorize" on Discord)
  |
  |◀───── Discord redirects to /auth/callback?code=XXX
  |
[AuthCallbackPage]        POST /auth/discord/callback
  |  {code: "XXX"}  ─────▶     |
                                | POST discord.com/oauth2/token
                                | GET  discord.com/api/users/@me
                                | ensure_member(discord_profile)   -- create-if-missing
                                | mint_claims_v2(member, ttl, archon_regions, lt_npcs)
  |◀───── {access_token} ──────|
  |
  | localStorage.setItem('chronicler_auth_token', token)
  | navigate("/me")
```

Source: ``apps/api`/api/routers/auth.py`
(`discord_oauth_initiate`, `discord_oauth_callback`).

## Backend flow (routers/auth.py)

1. **`GET /auth/discord`** (`auth.py`) -- 503s if `discord_client_id` is
   unset; otherwise 302-redirects to Discord's `/authorize` with
   `client_id` / `redirect_uri` / `scope=identify`.
2. **`POST /auth/discord/callback`** (`auth.py`):
   1. Exchange `code` for a Discord access token (`POST .../oauth2/token`).
   2. Fetch the profile (`GET .../users/@me`) -- `id`, `username`,
      `global_name`, `avatar`.
   3. Build a `DiscordProfile` (`_discord_avatar_url` resolves the CDN URL
      from the avatar hash, `auth.py`).
   4. Call `mint_login_token(session, profile)` (`auth.py`), which:
      - resolves-or-creates the `members` row via
        `services.members_v2.ensure_member` (create-if-missing keyed on
        `discord_id`; a configured bootstrap-admin Discord ID is granted
        `admin` in the same transaction if missing --
        `services/members_v2.py`),
      - reads the member's scoped-role grants
        (`archon_assignments` / `lieutenant_assignments`,
        `auth.py`),
      - mints ONE hybrid token via `mint_claims_v2`.
   5. Return `{access_token, token_type: "Bearer", expires_in}`.

Any Discord-side failure (bad code, non-200 token exchange, missing profile
fields) returns `401`; missing OAuth app config returns `503`
(`auth.py`).

## Token shape (hybrid v1 + v2)

Minted by `mint_claims_v2` (`services/auth/claims_v2.py`):

```json
{
  "sub": "<discord_snowflake_id>",
  "member_id": "<members.id UUID>",
  "discord_id": "<discord_snowflake_id>",
  "roles": ["player", "dm", "..."],
  "archon_regions": ["<region UUID>", "..."],
  "lt_npcs": ["<npc document UUID>", "..."],
  "iat": "<unix_timestamp>",
  "exp": "<unix_timestamp + JWT_EXPIRY_HOURS * 3600>"
}
```

Algorithm: HS256. Secret: `settings.jwt_secret` (`JWT_SECRET` env var),
shared across both claim readers. Expiry: `settings.jwt_expiry_hours`,
default 24 (`config.py`).

`sub` stays the Discord ID on purpose -- the legacy `extract_discord_id`
middleware (`api/auth_middleware.py`) reads only `sub` and never
raises (expired/invalid/missing -> `None`, anonymous). `member_id` is a
separate field read only by `parse_claims_v2`
(`services/auth/claims_v2.py`); a v1-shaped token has no
`member_id` and so resolves to `None` there -- both readers coexist on one
token. `parse_claims_v2` never raises either: malformed roles, bad UUIDs,
or a bad signature all resolve to anonymous.

Both are wired into the GraphQL context once per request in
`main.py:get_context` (`main.py`): `discord_id` (legacy) and
`claims_v2` (v2) are parsed independently from the same bearer token and
exposed as separate context keys. Resolvers migrated to v2 read
`claims_v2`; not-yet-migrated resolvers keep reading `discord_id`.

## Steady-state authorization: zero DB reads

`services/auth/permissions_v2.py` performs pure, in-memory capability
checks against the roles already decoded onto `ClaimsV2` -- no query per
request (`permissions_v2.py`). `ROLE_PERMS` maps each of the six
`member_role` values to a capability set; `admin` holds the wildcard.

## Revocation model

The tradeoff of a long-lived, DB-free steady state: a token minted before a
member is banned or demoted stays syntactically valid until it expires.
`services/auth/revocation_v2.py` closes that window on privileged actions
only:

- **`recheck_privileged(session, claims)`** (`revocation_v2.py`) --
  re-reads the live `members` row and raises `RevocationError` if: the row
  no longer exists, `members.status != ACTIVE`, or any role in the token is
  no longer in the live role set (demotion). Call it inside every
  privileged mutation (grants access, mutates governance/world state,
  writes on behalf of a scoped role) after the pure `permissions_v2` check
  and before commit -- e.g. `role.grant`, `region.edit`, `map.link_entry`,
  `verification.decide`. Routine self-service writes (`settings.edit`,
  `quest.join`) skip it; the short TTL is the accepted risk window. This
  list rots the moment a new privileged mutation ships, so treat
  `grep -rn "recheck_privileged(" `apps/api`` as the
  authoritative source, not this doc. As of this writing: 16 files, 50 call
  sites, across `quests_v2.py`, `characters_v2.py`, `spatial_v2.py`,
  `codex_v2.py`, `time_v2.py`, `personalization_v2.py`, `pull_model_v2.py`,
  `progression_v2.py`, `quest_rewards_v2.py`, `site_settings_v2.py`,
  `members_v2.py` (`role.grant`), `regions_v2.py` (`region.edit`), and
  `documents_v2/{delete,drafts,publish,visibility}.py`.
- **`recheck_archon_region(session, claims, region_id)`**
  (`revocation_v2.py`) -- scoped-assignment counterpart: confirms
  `region_id` is in both the token's `archon_regions` claim AND the live
  `archon_assignments` table, so an un-assignment takes effect immediately
  rather than at token expiry. `admin` bypasses (already covered by
  `recheck_privileged`).

There is no revocation for non-privileged actions and no refresh-token /
short-lived-access-token split -- a banned player's read-only or
self-service traffic keeps working until the token expires (accepted
tradeoff, not a gap).

## Anonymous browsing (CN.5)

All read surfaces work without authentication. Both `extract_discord_id`
and `parse_claims_v2` resolve missing/invalid/expired tokens to `None`
rather than raising -- this is enforced by design in both functions, not by
a try/except at the call site.

## Frontend token handling

- Storage key: `chronicler_auth_token` (`src/frontend/app/api/client.ts`,
  renamed from `lorekeep_auth_token` in #202; a one-time migration on load
  copies the legacy key forward, `client.ts`).
- Set on login in `AuthContext.tsx`; read on every request in
  `client.ts`.
- No refresh token. Expiry is `JWT_EXPIRY_HOURS` (default 24h); the user
  re-authenticates through `/auth/discord` when it lapses.

## Discord application setup

1. Discord Developer Portal -> Applications.
2. Select the bot's application (`BOT_CLIENT_ID`; same app as the bot).
3. OAuth2 -> Redirects: add `DISCORD_OAUTH_REDIRECT_URI` (or rely on
   `settings.oauth_redirect_uri()` derived from `PUBLIC_ORIGIN`,
   `config.py`).
4. Set `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` in the environment.

See `.env.example` for the full variable list.

## Sources verified

- ``apps/api`/api/routers/auth.py`
- ``apps/api`/services/auth/claims_v2.py`
- ``apps/api`/services/auth/revocation_v2.py`
- ``apps/api`/services/auth/permissions_v2.py`
- ``apps/api`/services/members_v2.py`
- ``apps/api`/api/auth_middleware.py`
- ``apps/api`/main.py`
- ``apps/api`/config.py`
- `src/frontend/app/api/client.ts`
- `src/frontend/app/auth/AuthContext.tsx`
