import type { CodegenConfig } from '@graphql-codegen/cli';

// Generates base TypeScript types from the canonical SDL (schema.graphql).
// Scalars are mapped to their over-the-wire runtime representations, matching
// the monorepo's original codegen.yml that this is derived from:
//   DateTime -> ISO-8601 string, UUID -> string, JSON -> arbitrary object.
const config: CodegenConfig = {
  schema: './schema.graphql',
  generates: {
    './src/generated/graphql.ts': {
      plugins: ['typescript'],
      config: {
        scalars: {
          DateTime: 'string',
          UUID: 'string',
          JSON: 'Record<string, unknown>',
        },
      },
    },
  },
};

export default config;
