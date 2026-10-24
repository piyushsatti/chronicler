# Start a fresh local database

The local Compose stack creates PostgreSQL, runs the Goose migrations, and loads the small local seed. Start it from the repository root:

```bash
scripts/dev-stack
```

The stack uses development-only credentials and a persistent local Docker volume. It does not connect to the production database. Check `scripts/dev-stack` output and its latest status receipt for startup success. See the [local stack guide](/deploy/docs/dev-stack.md) for log paths and failure details.

For API development setup and test identities, use the current [API documentation](/apps/api/docs/README.md). Never point seed or development commands at a production database.
