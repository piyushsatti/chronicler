# Local development stack

Run the local API, PostgreSQL, migrations, seed, and worker with the repository script:

```bash
scripts/dev-stack
```

Run it from the repository root. `CHRONICLER_REPO_ROOT` can name another physical repository root; when unset, the script resolves the root from its own location. The stack uses a persistent local Docker volume and synthetic development settings. It does not reset the database or start the Discord gateway.

The script writes its status and service logs under `/tmp/chronicler-dev`. Read `latest-status` before interpreting an older health receipt. See the script output for the startup result and the current service state.

This command is for local development only. Production deploy, promotion, and rollback belong to GitHub Actions under [D33](/docs/decisions/D33-GitHub-Actions-Owns-Production-Releases.md).
