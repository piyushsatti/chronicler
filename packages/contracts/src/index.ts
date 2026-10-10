// Public surface of @pi/contracts.
//
// Generated GraphQL types (produced from schema.graphql by graphql-codegen).
// Run `bun run build` to (re)generate ./generated/graphql.ts and compile to dist/.
export * from './generated/graphql.js';

// Region config is shipped as a raw JSON asset rather than baked into the TS
// build, so the Python backend and the Node consumers all read ONE file.
// Node consumers can import it directly:
//   import regions from '@pi/contracts/regions.json' with { type: 'json' }
