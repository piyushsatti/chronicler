# Vercel Frontend Deploy (custom domain + server-side proxy to Caddy)

See [deploy-runbook.md](/deploy/docs/deploy-runbook.md) for the full deploy topology and
the end-to-end operating sequence; this file is the frontend/proxy detail.
See [vercel-promotion.md](/deploy/docs/vercel-promotion.md) for how merges to `main`
reach production (staged production builds + explicit promote), including
why `scripts/deploy/promote_frontend.sh` treats a `409 already current` as
success (`scripts/vercel-promote.sh` is a thin delegator onto it).

The Chronicler SPA is hosted on **Vercel** at the custom domain
**`https://chronicler.smokebombstudios.com`** (Vercel-issued cert). Vercel's edge
reverse-proxies the API paths, **server-side**, to the DigitalOcean droplet's
backend, which sits behind **Caddy** at
**`https://api.chronicler.smokebombstudios.com`** (Caddy auto-TLS, Let's Encrypt).

- **Frontend:** Vercel, custom domain, HTTPS.
- **Backend:** droplet, behind Caddy at `https://api.chronicler.smokebombstudios.com`.
- **HTTPS end-to-end** — the browser talks HTTPS same-origin to the frontend, and
  the Vercel→droplet proxy hop is also HTTPS. No plaintext hop, no mixed content.
- The droplet publishes **only** ports 80 + 443 (Caddy). `api:8000` and `db:5432`
  are **not** exposed to the public.

## How the proxy works

The browser only ever talks to `https://chronicler.smokebombstudios.com`
(same-origin HTTPS). Vercel's edge rewrites the API paths to the Caddy backend,
server-side, over HTTPS:

```
browser ──HTTPS──► https://chronicler.smokebombstudios.com/graphql
                          │  (Vercel edge rewrite, server-side)
                          └──HTTPS──► https://api.chronicler.smokebombstudios.com/graphql
                                              │  (Caddy :443, auto-TLS)
                                              └──► api:8000 (internal Docker net)
```

Both hops are TLS. Because the browser sees same-origin HTTPS and the backend has
a real Let's Encrypt cert, there is no mixed content and no plaintext anywhere.

**Why same-origin works:** the GraphQL client
(`src/frontend/app/api/client.ts`) uses
`API_BASE = import.meta.env.VITE_API_URL ?? window.location.origin`. With
`VITE_API_URL` **unset** at build time, the browser calls same-origin
`https://chronicler.smokebombstudios.com/graphql`, which the rewrite proxies.
**Do not set `VITE_API_URL` in the Vercel project** — that would bake an absolute
API URL into the bundle and bypass the same-origin proxy.

## Routing map

`vercel.json` rewrites (first match wins — order matters):

| Source | Destination | Purpose |
|---|---|---|
| `/graphql` | `https://api.chronicler.smokebombstudios.com/graphql` | GraphQL API |
| `/auth/discord/:path*` | `https://api.chronicler.smokebombstudios.com/auth/discord/:path*` | OAuth start + callback POST |
| `/health` | `https://api.chronicler.smokebombstudios.com/health` | Health check |
| `/(.*)` | `/index.html` | SPA catch-all (**last**) |

**Critical:** the backend's OAuth routes are namespaced under `/auth/discord/*`.
`/auth/callback` is a **frontend SPA route** and must fall through to the
catch-all — it is NOT proxied. The browser lands there after Discord redirects,
then the SPA POSTs to `/auth/discord/callback` (which IS proxied). Do not add a
rewrite that captures `/auth/callback`.

The `:path*` splat is Vercel's `path-to-regexp` wildcard; it forwards the
matched tail to the destination unchanged.

## DNS (Namecheap)

Nameservers are the registrar defaults (`registrar-servers.com`); edit under the
**Advanced DNS** tab. Add **two** records. **Do not touch the `@` / `www` records**
— they CNAME to `ghs.googlehosted.com` (the Smokebomb marketing site on Google
Sites) and must stay.

| Type | Host | Value |
|---|---|---|
| CNAME | `chronicler` | `cname.vercel-dns.com` (confirm exact value on Vercel's Add-Domain screen) |
| A | `api.chronicler` | `<droplet public IP>` |

The CNAME lets Vercel issue the frontend cert; the A record lets Caddy issue the
backend cert. Both cert steps are **gated on DNS propagation**.

## Human deploy checklist

Do these in order. Some steps only complete once DNS has propagated (noted).

1. **Namecheap — add the two DNS records** above (`chronicler` CNAME and
   `api.chronicler` A). This unblocks the two cert issuances below.

2. **Vercel — import the project.**
   - New Project → import the `chronicler` repo.
   - **Root Directory:** repo root (leave as `./`). `vercel.json` at root drives
     the build (`framework: vite`, build/output/install already set).
   - **Add custom domain** `chronicler.smokebombstudios.com` in the project's
     Domains settings. Confirm the CNAME target Vercel shows matches the DNS
     record above.
   - Do NOT add a `VITE_API_URL` environment variable. Leave it unset.
   - **Gated on DNS:** Vercel issues the domain cert once the `chronicler` CNAME
     resolves. Until then the domain shows as pending. API calls also 502 until
     the droplet + Caddy are up (steps 3–4).

3. **Droplet — set `.env.prod` + firewall.** On the droplet, set in `.env.prod`:
   ```
   API_DOMAIN=api.chronicler.smokebombstudios.com
   PUBLIC_ORIGIN=https://chronicler.smokebombstudios.com
   # plus DATABASE_URL, POSTGRES_*, JWT_SECRET, DISCORD_CLIENT_ID/SECRET, etc.
   ```
   Leave `VITE_API_URL` unset. Open **only** inbound 80 + 443
   (`sudo ufw allow 80,443/tcp`) and ensure a modern Docker/Compose (the prod
   override uses `ports: !reset []`, which needs Compose **v2.24+**). See
   [digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md).

4. **Droplet — deploy backend + Caddy** (base + prod compose). Caddy
   auto-issues the Let's Encrypt cert on first request; that needs the
   `api.chronicler` A record resolving and ports 80 + 443 open.
   **Gated on DNS.** See [digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md) for
   the exact commands.

5. **Discord Developer Portal — register the redirect URI.** In your app →
   OAuth2 → Redirects, add EXACTLY:
   ```
   https://chronicler.smokebombstudios.com/auth/callback
   ```
   Must match `PUBLIC_ORIGIN` + `/auth/callback` character-for-character.

6. **Verify** (see below) once both certs have issued.

## Verify

1. **HTTPS loads:** open `https://chronicler.smokebombstudios.com` — SPA renders
   over HTTPS, padlock, no mixed-content console warnings.
2. **GraphQL round-trips:** trigger any data load. In DevTools → Network the
   request goes to `https://chronicler.smokebombstudios.com/graphql` (same-origin)
   and returns **200**.
3. **Backend cert + health:** `https://api.chronicler.smokebombstudios.com/health`
   returns the backend health JSON with a valid cert (no browser warning).
4. **Discord login end-to-end:** click login → redirected to Discord → authorize
   → land back on `https://chronicler.smokebombstudios.com/auth/callback?code=...`
   → SPA completes login (POST to `/auth/discord/callback` returns a session).
   You are logged in.

## Alternative: Netlify

Netlify gives an equivalent server-side proxy via `netlify.toml` redirects with
`status = 200` (a rewrite, not a 3xx redirect). Same topology, proxying to the
same Caddy HTTPS backend. Sketch (not built out here):

```toml
[[redirects]]
  from = "/graphql"
  to = "https://api.chronicler.smokebombstudios.com/graphql"
  status = 200
  force = true

[[redirects]]
  from = "/auth/discord/*"
  to = "https://api.chronicler.smokebombstudios.com/auth/discord/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/health"
  to = "https://api.chronicler.smokebombstudios.com/health"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Order matters the same way; `/auth/callback` must fall through to the SPA.
