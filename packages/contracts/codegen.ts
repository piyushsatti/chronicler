import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './schema.graphql',
  generates: {
    './src/generated/graphql.ts': {
      plugins: ['typescript'],
      config: {
        scalars: {
          ID: 'string',
          Date: 'string',
          Time: 'string',
          DateTime: 'string',
          JSON: 'unknown',
        },
      },
    },
  },
};

export default config;
