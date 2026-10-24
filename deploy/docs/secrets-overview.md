# Secrets and owner access

Secret values do not belong in the repository, documentation, build output, or release receipts.

Local development uses ignored environment files or a local secret manager. The planned production release supplies credentials to the protected GitHub Actions job that needs them. The planned staging runner uses the owner's host environment for runtime settings. Frontend build variables are public and must not contain private keys.

`PLATFORM_OWNER_DISCORD_ID` is supplied as a GitHub secret for Actions or through the staging host environment. Never commit it or print its value. Discord application credentials remain in the Discord application settings and the owning runtime secret store.

Production Compose forwards the owner setting. The current local Compose file does not forward it to the API container. The later staging configuration must add that forwarding; setting the host variable alone is insufficient today.

The production release path uses GitHub Actions under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). Do not copy production environment files to the droplet or use workstation file transfer as a release path. See the [release runbook](/deploy/docs/deploy-runbook.md) and [operations system](/docs/systems/operations.md).
