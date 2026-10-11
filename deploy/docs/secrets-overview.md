# Secrets overview

## Verdict

- Secret **values** never live in this repository or in architecture prose.
- This page names **where** credentials live and who rotates them — nothing more.
- Do not ask the owner for raw SSH or on-server file edits for routine secret changes.

## Where secrets live

| Class                        | Typical home                                           | Notes                                   |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Local development            | Workstation env files / secret manager (not committed) | Never commit `.env` with real values    |
| Production API / bot / agent | Host vault or Actions secrets used by deploy workflows | Injected at deploy time                 |
| Frontend public config       | Build-time public env only                             | No private keys in the SPA              |
| Discord application          | Discord developer portal + vault                       | Bot token is a machine principal secret |

## Rotation and access

- Prefer workflow-driven rotation over manual droplet edits.
- Production release path remains Actions-only ([D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)).
- If Actions cannot run, stop — do not bypass with SCP of env files.

## Related

- [Operations system](/docs/systems/operations.md)
- [Deploy runbook](/deploy/docs/deploy-runbook.md)
