# Production VM

## Target

Production's backend runs on one VM (2 vCPU, 2 GB) under [D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md). GitHub Actions deploys it with [`compose.production.yaml`](/deploy/compose.production.yaml) on a self-hosted runner on that VM, under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md). The stack is `chronicler-api` (HTTP API plus the background-job worker), `chronicler-discord-bot` and `chronicler-cloudflared`. There is no database container: the API reads `DATABASE_URL` for Supabase PostgreSQL.

Traffic reaches the API only through Cloudflare. `chronicler-cloudflared` dials out to Cloudflare, which terminates HTTPS and forwards `chronicler-prod-api.piyushsatti.com` to `http://chronicler-api:8080` over the Compose network. The VM exposes no inbound ports; the API's loopback publish (`127.0.0.1:8080`) is for on-host checks only.

## Host requirements (planned, unverified)

- Docker Engine with the Compose plugin. The runner user must be able to use Docker.
- A GitHub Actions runner registered with `--no-default-labels --labels chronicler-production`, so it carries only that label (as the `triton` CI runners do) and no job that asks for `self-hosted` can reach it.
- The pre-job hook [`deploy/runner/production-job-started.sh`](/deploy/runner/production-job-started.sh), because labels route jobs without authorizing them. Copy it outside the runner directory, owned by root and not writable by the runner user, and set `ACTIONS_RUNNER_HOOK_JOB_STARTED=<absolute path>` in the runner's `.env`, then restart the runner ([pre-job scripts](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)). It fails every job except `deploy-production.yml` started by a CalVer tag push. It trusts the tag, so who can push tags remains the repository's write access.
- Outbound access to GitHub, Docker Hub (the `cloudflared` and PostgreSQL client images), Supabase's session pooler, and Cloudflare on port 7844 over TCP and UDP ([tunnel firewall guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)).
- Disk for locally built images and for the pre-deployment dumps in `~/backups/chronicler-production`. Nothing prunes either; see [VM disk maintenance](/deploy/docs/vm-disk-hygiene.md).

Live VM identity, size, operating system, runner registration, tunnel, DNS, and installed services have not been verified. Establish them through the approved operational process before the first release, and do not infer them from old notes. Deploy workflows build both images on the VM as staging does; whether 2 GB is enough for those builds is unmeasured.

Production credentials reach only the protected Actions job that performs the change. `PLATFORM_OWNER_DISCORD_ID` is a GitHub secret. Keep its value out of repository files and logs. Do not deploy by copying files, transferring images, or running release commands over workstation SSH.

## Required deployment behavior

The release selects a CalVer tag that points to `main`, backs up the hosted database, migrates, starts the services, requires `https://chronicler-prod-api.piyushsatti.com/health` to return 204, and redeploys the previous API and bot images if a later step fails. It preserves the database through deploy and rollback. See the [deployment runbook](/deploy/docs/deploy-runbook.md) for steps and one-time owner setup, and the [backup guide](/deploy/docs/supabase-backups.md) for the restore point.
