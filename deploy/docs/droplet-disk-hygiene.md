# Droplet Disk Hygiene

Prune cron + log-rotation caps for the DigitalOcean droplet (see
[digitalocean-droplet.md](/deploy/docs/digitalocean-droplet.md) for the deploy topology).
Resolves #279. **Everything under "Apply procedure" is owner-ack-gated** — this
doc was built from ticket evidence with no live SSH session; nobody has touched
the droplet to produce it.

## 1. Problem

`cd-deploy` run `29804330877` failed 2026-07-21 with `no space left on device`
pulling the api image. Root `/dev/vda1` was at 100%. `docker system prune -af`
plus a builder prune freed it to 81% (about 1.7G) — enough for roughly one more
image generation, not a fix. `docker system prune` reported `gc failed` **twice**
during that manual prune (containerd content-store gc errors, see §5). With
GitHub Actions minutes exhausted, deploys are manual and images may get built
directly on the droplet, which makes a full disk an immediate blocker instead of
a background risk.

Ticket's own recommendation: (a) weekly `docker system prune -af` cron — never
`--volumes` — (b) journald/docker log-rotation caps, (c) resize the disk only if
image count keeps growing. This doc implements a+b and defers c.

## 2. Read-only diagnostics

Run this **before** applying anything, to confirm the numbers below and
right-size the caps in §3/§4. Pure read commands, nothing here changes state.

```bash
df -h /
docker system df -v
journalctl --disk-usage
du -sh /var/lib/docker/* 2>/dev/null | sort -h | tail
du -sh /var/lib/containerd 2>/dev/null
journalctl -u containerd --since '7 days ago' | grep -i "gc failed"
docker info --format '{{.DriverStatus}}'
```

If the grep for `gc failed` returns nothing, check the daemon log directly
instead of the systemd unit (some distros route containerd's own gc logging
there rather than through `journalctl -u containerd`):

```bash
grep -i "gc failed" /var/log/syslog 2>/dev/null | tail -20
```

**Live numbers — TO CONFIRM by operator:**

| Metric | Command | Value (fill in) |
|---|---|---|
| Root disk use % | `df -h /` | |
| Root disk free | `df -h /` | |
| Docker reclaimable (images) | `docker system df -v` | |
| Docker reclaimable (build cache) | `docker system df -v` | |
| Docker reclaimable (containers) | `docker system df -v` | |
| journald disk usage | `journalctl --disk-usage` | |
| Largest `/var/lib/docker/*` subdir | `du -sh /var/lib/docker/*` | |
| `/var/lib/containerd` size | `du -sh /var/lib/containerd` | |
| `gc failed` occurrences (7d) | grep above | |

## 3. Fix (a): weekly prune cron

`docker system prune -af` removes stopped containers, dangling/unused images,
unused networks, and unused build cache. It does **not** touch volumes on its
own — never add `--volumes` here, that flag would delete the `pgdata` Postgres
volume (`docker-compose.yml` service `db`) along with anything else unmounted
at prune time. Prod's actual DB is external Supabase, so `pgdata` is dormant
rather than live, but the rule holds regardless: this cron must never carry
`--volumes`.

Schedule: **weekly, Sunday 04:00 UTC** — after the containerized `scheduler`
service's nightly ops jobs (`reconcile` 03:00, `gametime_fill` 03:30 UTC, see
[digitalocean-droplet.md § Scheduler](/deploy/docs/digitalocean-droplet.md#scheduler-nightly-ops-crons)),
and a different mechanism from them: this is a **host-level** cron for the
`deploy` OS user, not the in-container supercronic scheduler that runs app CLI
jobs. It prunes the Docker engine itself, which nothing inside a container can
do.

### Option 1: crontab (`deploy` user)

```bash
crontab -u deploy -e
```

Add:

```
0 4 * * 0 /usr/bin/docker system prune -af >> /var/log/chronicler/docker-prune.log 2>&1
```

Create the log dir first (one-time, owner-ack-gated along with the crontab
edit):

```bash
sudo mkdir -p /var/log/chronicler
sudo chown deploy:deploy /var/log/chronicler
```

`/var/log/chronicler/docker-prune.log` will grow unbounded on its own — rotate
it with logrotate:

```
/var/log/chronicler/docker-prune.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
```

Save that as `/etc/logrotate.d/chronicler-docker-prune` (owner-ack-gated,
`sudo` required).

### Option 2: systemd timer (alternative to crontab)

`/etc/systemd/system/docker-prune.service`:

```ini
[Unit]
Description=Weekly docker system prune

[Service]
Type=oneshot
ExecStart=/usr/bin/docker system prune -af
StandardOutput=append:/var/log/chronicler/docker-prune.log
StandardError=append:/var/log/chronicler/docker-prune.log
```

`/etc/systemd/system/docker-prune.timer`:

```ini
[Unit]
Description=Run docker-prune.service weekly

[Timer]
OnCalendar=Sun *-*-* 04:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now docker-prune.timer
```

Pick **one** of crontab or systemd-timer, not both. The repo ships the crontab
line as `droplet-prune.cron` (sample in deploy scripts or local quarry if kept) for convenience; it is a
reference snippet only, nothing wires it into deploy automation.

## 4. Fix (b): log rotation

Two independent log sources fill the disk over time: the systemd journal and
Docker's own container logs (`json-file` driver has no cap by default).

### (i) journald cap

Edit `/etc/systemd/journald.conf`:

```
SystemMaxUse=500M
```

500M is a starting default — size it from §2's `journalctl --disk-usage`
reading: if the current journal is already well past 500M, either raise the
cap or accept journald will trim it down to the cap on next rotation (it drops
oldest entries first, no data loss beyond history). Apply:

```bash
sudo systemctl restart systemd-journald
```

### (ii) Docker container log caps

Create or edit `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

10m x 3 files = 30M cap per container, reasonable default for the api/bot/db/
caddy/scheduler set here. This is committed as a sample at
`droplet-daemon.json.sample` — copy it in
rather than hand-typing on the droplet, then merge with any existing keys in
`/etc/docker/daemon.json` (don't blindly overwrite if the file already has
other settings).

**This only caps new log output, not existing containers.** Existing
containers keep their current (uncapped) log driver until recreated. Recreation
happens automatically on the next deploy (`docker compose ... up -d` recreates
containers whose config changed) — so no separate action needed once the
compose stack is next deployed, other than the daemon restart below.

`daemon.json` changes require a Docker daemon restart to take effect:

```bash
sudo systemctl restart docker
```

**Caveat:** this restarts every running container on the host (brief
downtime — the API and Caddy will bounce). Owner-ack-gated; schedule it
deliberately rather than folding it into an unattended step.

## 5. containerd gc-failed note

`docker system prune` reported `gc failed` twice during the #279 manual prune.
This is containerd's content-store garbage collector failing to reclaim a
blob, most commonly because a lease or an in-flight pull/build still
references it, or because the content-store's on-disk index lock was held at
the moment gc ran (transient content-store lease contention, not corruption).
It is usually **not** the cause of the disk fill by itself — it just means the
last prune's reclaim was partial.

Non-destructive check (read-only, safe to run anytime):

```bash
sudo ctr -n moby content ls | wc -l
sudo systemctl status containerd --no-pager
journalctl -u containerd --since '24 hours ago' | grep -i -E "gc|lease|error"
```

**Escalate** (open a follow-up issue, don't act solo on this doc's authority)
if: `gc failed` repeats on **every** prune run going forward (not just a
one-off), `docker system df` reclaimable space stops shrinking after prune
despite `-af`, or content-store size (`du -sh /var/lib/containerd`) keeps
growing independent of image count. Do **not** attempt a containerd data-dir
wipe or `ctr content rm` cleanup as a first move — that risks live image
layers still in use.

## 6. Option (c): resize

Not now. Revisit if the read-only diagnostics (§2), tracked over a few weekly
prune cycles, show reclaimable image/build-cache space trending up even with
the cron running — i.e. genuine image-count growth outpacing prune, not just a
one-time backlog. Resizing a DO droplet's disk is a control-panel action
(usually requires a power-off/power-on cycle) and is out of scope for this PR;
it would get its own owner-ack-gated runbook entry when the trend justifies it.

## 7. Apply procedure

Every step here is **[OWNER-ACK-GATED]** — this session has no droplet access
and made no server changes. Do not run any of this without the owner present
or explicitly signing off per step.

1. **[OWNER-ACK-GATED]** SSH to the droplet as `deploy`, run the §2 read-only
   diagnostics block, fill in the "TO CONFIRM" table above (or a copy of it)
   with live numbers.
2. **[OWNER-ACK-GATED]** Create `/var/log/chronicler` (owned by `deploy`) and
   `/etc/logrotate.d/chronicler-docker-prune` per §3.
3. **[OWNER-ACK-GATED]** Install the prune schedule: either the crontab line
   (§3 Option 1) or the systemd timer unit pair (§3 Option 2) — pick one.
   **Verify:** `crontab -u deploy -l` shows the line, or
   `systemctl list-timers docker-prune.timer` shows a scheduled next run.
4. **[OWNER-ACK-GATED]** Set `SystemMaxUse=500M` (or the size chosen from §2)
   in `/etc/systemd/journald.conf`, then `sudo systemctl restart
   systemd-journald`. **Verify:** `journalctl --disk-usage` reports at or
   below the new cap after the restart. **Rollback:** revert the line, restart
   `systemd-journald` again — no data beyond already-trimmed journal entries
   is recoverable.
5. **[OWNER-ACK-GATED]** Merge the contents of
   `droplet-daemon.json.sample` into
   `/etc/docker/daemon.json`, validate it parses
   (`python3 -m json.tool /etc/docker/daemon.json`), then `sudo systemctl
   restart docker`. **Verify:** `docker info --format
   '{{json .LoggingDriver}}'` reports `json-file`, and after the stack is next
   redeployed, `docker inspect <container> --format '{{json .HostConfig.LogConfig}}'`
   shows the 10m/3 caps. **Rollback:** restore the prior `/etc/docker/
   daemon.json` (or remove it if it didn't exist before), `sudo systemctl
   restart docker` again. Brief downtime both ways — schedule accordingly.
6. **[OWNER-ACK-GATED]** After all of the above, run `df -h /` and confirm
   free space is at a healthy margin (comfortably above the 81%-full state
   seen after the #279 manual prune). Record the post-apply number back into
   the table in §2 for the next person who touches this doc.
