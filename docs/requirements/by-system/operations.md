# Requirements: operations

System: [operations](/docs/systems/operations.md)

## Requirements

| ID  | Requirement                                                                                                                                                                             | Current evidence boundary                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Keep credentials within their owning secret and identity boundary. Scope production credentials to the admitted Actions job.                                                            | [Secrets guidance](/deploy/docs/secrets-overview.md) and R6 of the [Actions release contract](/docs/interfaces/actions-releases.md) define the target. Current enforcement is unverified.                                           |
| R2  | Keep nightly and pre-deployment pull backups of droplet PostgreSQL on the owner's workstation, outside the provider and droplet. Admit current restore-point evidence before migration. | [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md) and the [backup guide](/deploy/docs/supabase-backups.md) state the policy. The database, backup mechanism, and workflow evidence handoff are not implemented or verified. |
| R3  | Alert on operator-facing failures, missed runs, backup failures, and terminal work outside the bot's failure domain.                                                                    | [D23](/docs/decisions/D23-One-Work-Table-Out-Of-Band-Alerts.md) defines the boundary. Current end-to-end delivery is unverified.                                                                                                    |
| R4  | Admit, execute, verify, and recover each production release through one Actions run with non-secret evidence.                                                                           | R1-R8 of the [Actions release contract](/docs/interfaces/actions-releases.md) define the target. `deploy-api` publishes images only; deployment, migration, promotion, verification, and rollback remain unimplemented.             |

## Assumptions

| ID  | Assumption                                                                              | If false                                                                    |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A1  | The droplet has enough measured capacity for the intended workload.                     | Measure the host and workload before selecting production capacity.         |
| A2  | The workstation and backup medium are available for scheduled and pre-deployment pulls. | D10's single-copy data-loss risk remains. The second-copy strategy is open. |
| A3  | Public application configuration grants no unintended database authority.               | Review actual database grants and provider identities before release.       |
| A4  | Actions, protected jobs, credentials, and target connectivity are available.            | Stop production changes. Do not use a workstation release fallback.         |
| A5  | Host and provider access remain scoped to their declared identities.                    | Review privileges before admitting a mutating job.                          |
