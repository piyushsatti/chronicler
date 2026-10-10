# D10: Backup Location And Cadence

**Status:** decided 2026-07-27
**Kind:** boundary
**Owner:** global (`docs/decisions/`)
**Interface:** [actions-releases](/docs/interfaces/actions-releases.md)

## Context

Production lost provider-side backups and CI backup minutes. A durable, operator-controlled pull backup was needed before launch traffic.

## Decision

The **owner’s workstation** is the durable backup store. Dumps run **nightly** and **before every deployment**.

| Question | Ruling |
| --- | --- |
| Where backups durably live | Owner’s Mac, pulled from Supabase — off-provider and off-droplet |
| Primary mechanism | Workstation pull is primary; GitHub Actions backup is a redundant second copy when minutes return, not load-bearing |

**Patterns (minimal):** pull-based backup (workstation initiates; compromised server cannot reach backup target); pre-change checkpoint dump before `migrate` on deploy.

**Mechanism:** reuse `supabase_backup.sh`; Mac wrapper runs `pg_dump` in a pinned Postgres container, credentials from `~/.config/chronicler/backup.env` (mode 600). Nightly and pre-deploy differ only by `BACKUP_TAG`.

**Explicit limits:** one copy, one site — not 3-2-1; sufficient pre-launch; second copy before real users stays open. Accepted risks: sleeping laptop (mitigate with `launchd` wake scheduling), plaintext dump on portable machine (FileVault, no cloud sync), single-copy loss.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Push backup from server to workstation | Compromised droplet could reach and destroy backups |
| Rely on GitHub Actions as primary | Billing gap made it non-load-bearing; workstation pull needs no billing |

## Consequences

Deploy path includes a restore point before migrations. Worst-case data loss is bounded by nightly cadence plus per-deploy checkpoints.

## Enforced by

`mac_backup.sh` / `supabase_backup.sh`; deploy gating on backup tag.

## Reopen triggers

- Second copy strategy required before launch (LIFE-5 reduced scope).
- Restore drill cadence (LIFE-7) not decided here.

Long-form evidence remains in `.local/docs-quarry/decisions-longform/`.
