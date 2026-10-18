import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../../packages/contracts/schema.graphql',
  documents: 'src/**/*.graphql',
  generates: {
    './src/api/graphql.operations.gen.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        scalars: {
          ID: 'string',
          Date: 'string',
          Time: 'string',
          DateTime: 'string',
          JSON: 'unknown',
        },
        useTypeImports: true,
        skipTypename: true,
      },
    },
  },
};

export default config;
