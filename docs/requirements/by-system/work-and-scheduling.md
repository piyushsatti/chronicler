# Requirements: work and scheduling

System: [work and scheduling](/docs/systems/work-and-scheduling.md)

## Requirements

| ID  | Requirement                                                                               | Current evidence boundary                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | Every job's last outcome is observable without reading a live log stream.                 | The Go API has a background worker. Durable, operator-facing run outcomes and alert delivery remain unverified.          |
| R2  | A job must not run against a schema its code does not understand without visible failure. | Migration and worker compatibility controls require implementation evidence.                                             |
| R3  | Missed or failed work must raise an alert without a person polling logs.                  | The out-of-band alert boundary is in D23. Current end-to-end delivery is unverified.                                     |
| R4  | At most one instance of a job's logic runs at a time.                                     | Verify the current lease and worker behavior against [work queue durability](/docs/interfaces/work-queue-durability.md). |
