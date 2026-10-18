import type { CodegenConfig } from '@graphql-codegen/cli';

const sharedConfig = {
  scalars: {
    ID: 'string',
    Date: 'string',
    Time: 'string',
    DateTime: 'string',
    JSON: 'unknown',
  },
  useTypeImports: true,
  skipTypename: true,
};

const config: CodegenConfig = {
  schema: '../../packages/contracts/schema.graphql',
  documents: 'src/**/*.graphql',
  generates: {
    './src/api/graphql.schema.gen.ts': {
      plugins: ['typescript'],
      config: sharedConfig,
    },
    './src/api/graphql.operations.gen.ts': {
      plugins: ['typescript-operations'],
      config: {
        ...sharedConfig,
        onlyOperationTypes: true,
      },
    },
  },
};

export default config;
