# Requirements — Two crons run nightly, unwatched; D23's queue and alert path exist only on paper

System: [work-and-scheduling.md](/docs/systems/work-and-scheduling.md)

## Requirements

| # | Requirement | Because |
|---|---|---|
| R1 | Every job's last-run outcome (ran / succeeded / failed / never ran) is observable without SSHing in and reading a log stream. | Today the only signal is `docker compose logs scheduler`, read by hand, on demand. Nothing surfaced a stale-scheduler incident until an unrelated audit found it. |
| R2 | A job cannot run its stale code against a schema newer than the code understands, silently or loudly, without the mismatch being visible before damage is done. | Today neither job checks anything about the schema it's about to query; a stale image either errors on a removed column or silently ignores an added one. Feeds `SCHED-2`. |
| R3 | A missed or failed run surfaces on its own, without a human going looking. | Today "log and keep scheduling" is the entire failure story; nobody is subscribed to that log. |
| R4 | At most one instance of a given job's logic runs at a time, enforced, not merely scheduled apart. | Today's only defence is a 30-minute gap in a crontab comment; nothing stops a second container or a slow run from overlapping the next one. |
