# D10: Backup Location And Cadence

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [actions-releases](/docs/interfaces/actions-releases.md)

## Context

Production lost provider-side backups and CI backup minutes. A durable, operator-controlled pull backup was needed before launch traffic.

## Decision

The **owner’s workstation** is the durable backup store for the production PostgreSQL database. Dumps run **nightly** and **before every deployment**. _(Amended 2026-10-31: the database moved from the DigitalOcean droplet to Supabase PostgreSQL, see [D51](/docs/decisions/D51-Production-On-One-VM-Behind-Cloudflare-Tunnel.md); the store and cadence are unchanged.)_

| Question                   | Ruling                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Where backups durably live | Owner’s workstation, pulling the production PostgreSQL database — off the database host and off the VM              |
| Primary mechanism          | Workstation pull is primary; GitHub Actions backup is a redundant second copy when minutes return, not load-bearing |

**Patterns (minimal):** pull-based backup (workstation initiates; compromised server cannot reach backup target); pre-change checkpoint dump before `migrate` on deploy.

**Historical mechanism:** `supabase_backup.sh` and the Mac wrapper implemented the pull policy. Those helpers are absent from the rebuild; their old configuration and transcripts do not establish a currently running backup. The accepted store and cadence remain binding. Current tooling, isolated recovery proof and admission of pre-deployment evidence into Actions remain work; see [backup guidance](/deploy/docs/supabase-backups.md).

**Explicit limits:** one copy, one site — not 3-2-1; sufficient pre-launch; second copy before real users stays open. Accepted risks: sleeping laptop (mitigate with `launchd` wake scheduling), plaintext dump on portable machine (FileVault, no cloud sync), single-copy loss.

## Alternatives rejected

| Alternative                            | Why not                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Push backup from server to workstation | Compromised server could reach and destroy backups                      |
| Rely on GitHub Actions as primary      | Billing gap made it non-load-bearing; workstation pull needs no billing |

## Consequences

Deploy admission requires a current restore point before migrations. When the required backups run and restore successfully, nightly cadence and pre-deployment checkpoints bound the intended recovery window; current operation and a measured RPO remain unverified.

## Enforced by

**Not enforced by current repository tooling.** The named legacy helpers are absent. The Actions release contract requires current restore-point evidence; its backup-evidence handoff is not implemented. Workstation pull backup does not authorize workstation deployment ([D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md)).

## Reopen triggers

- Second copy strategy required before launch (LIFE-5 reduced scope).
- Restore drill cadence (LIFE-7) not decided here.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
