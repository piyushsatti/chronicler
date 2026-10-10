# Requirements — One droplet ships everything, one laptop is the backup, and nothing watches production yet

System: [operations.md](/docs/systems/operations.md)

## Requirements

| # | Requirement | Because |
| --- | --- | --- |
| R1 | Keeps its secrets, mostly without the owner. | Every credential lives in the macOS Keychain under service `chronicler`, managed by `scripts/secrets/vault.sh`, which lists, generates, diffs against the droplet, and pushes to it. The owner is asked only for a secret that originates in a third-party dashboard, and `deploy` on the droplet has no passwordless sudo, so any runbook step containing `sudo` is already wrong. |
| R2 | Backs up, and this is the one mechanism actually fixed. | [`D10`](/docs/decisions/D10-Backup-Location-And-Cadence.md) rules a nightly-plus-pre-deploy pull to the owner's workstation, replacing a CI job that had been silently dead since 2026-07-22, the same window a project deletion on 2026-07-27 destroyed both live data and its own provider-side backups. It is one copy, on one medium, at one site, not 3-2-1, and it verifies the dump is non-empty but does not test-restore it. |
| R3 | Tells you it broke, decided but not built. | [`D23`](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md) routes every operator-facing failure, a missed scheduler run, an expired bot heartbeat, a failed backup, a dead work-queue row, through one Discord webhook that does not share a failure domain with the bot process. None of it exists in code yet. |

## Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | The community stays small enough that one unscaled 458 MB droplet is the right compute budget | Capacity-envelope's roughly 150-user ceiling gets hit for real, and every choice on this page, single droplet, shared database identity, manual deploy, needs revisiting at once, not one at a time |
| A2 | The owner's workstation stays available, and its disk is not the point of failure between backups | A workstation loss between a nightly pull and the next one is a real data-loss window, not a theoretical one; [`D10`](/docs/decisions/D10-Backup-Location-And-Cadence.md) names this and defers the second copy rather than closing it |
| A3 | The Supabase anon key stays unpublished, so the 48 tables without RLS policies stay unreachable | The moment any code embeds that key in a browser bundle, every one of those tables becomes readable and writable from the internet, with no change needed on Chronicler's side to trigger it |
| A4 | GitHub Actions' billing failure resolves on roughly its stated timeline without further owner action | Deploys, and the CI-based image build and backup workflows [`D10`](/docs/decisions/D10-Backup-Location-And-Cadence.md) treats as a redundant second line, stay entirely local and manual indefinitely |
| A5 | Nobody but the owner and the deploy scripts ever needs droplet SSH access | The "no passwordless sudo for `deploy`" boundary is the only privilege separation the box has; a second operator changes what that boundary is actually protecting |
