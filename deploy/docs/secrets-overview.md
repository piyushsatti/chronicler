# Secrets and owner access

Secret values do not belong in the repository, documentation, build output, or release receipts.

Local development uses ignored environment files or a local secret manager. The staging and production release workflows supply credentials to the GitHub Actions job that needs them, from the secrets of the GitHub environment `staging` or `production`. Each run writes an env file outside the workspace (mode 600) for Compose on the runner host. Frontend build variables are public and must not contain private keys.

With `CHRONICLER_ENV=production`, the API requires `JWT_SECRET` and `INGEST_SECRET` to be at least 32 characters each. Startup errors name variables without printing values. Development behavior is unchanged. Before deploying this requirement, check existing secret lengths without printing them; a short value requires owner-authorized rotation before deployment.

`PLATFORM_OWNER_DISCORD_ID` is supplied as a GitHub secret for Actions or through the staging host environment. Never commit it or print its value. Discord application credentials remain in the Discord application settings and the owning runtime secret store.

The release Compose file, used by staging and production, forwards the owner setting to the API container. The local development Compose file does not; setting the host variable alone is insufficient there.

Production adds two credentials beyond the shared set ([D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md)). `DATABASE_URL` is the Supabase session pooler URI and embeds the database password; it reaches the API container, the migration step, and the pre-deployment dump, which passes it to the client container through the environment and never prints it. `CLOUDFLARE_TUNNEL_TOKEN` is the token of the remotely managed tunnel and reaches only the `cloudflared` container. Treat both as production credentials and rotate them in their providers if they leak. GitHub masks only the whole secret value in logs, so do not print parts of either. The deployment runbook lists the planned names, which await owner confirmation.

The production release path uses GitHub Actions under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). Do not copy production environment files to the VM or use workstation file transfer as a release path. See the [release runbook](/deploy/docs/deploy-runbook.md) and [operations system](/docs/systems/operations.md).
