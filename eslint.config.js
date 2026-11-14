import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

function asWarn(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, conf]) => {
      if (conf === 'off' || conf === 0) return [name, conf];
      if (Array.isArray(conf)) {
        const [sev, ...rest] = conf;
        if (sev === 'off' || sev === 0) return [name, conf];
        return [name, ['warn', ...rest]];
      }
      return [name, 'warn'];
    }),
  );
}

export default tseslint.config(
  {
    ignores: [
      '**/.local/**',
      // claude.ai/design sync: staged converter, its output, and the forked converter module
      'apps/web/.ds-sync/**',
      'apps/web/ds-bundle/**',
      'apps/web/.design-sync/overrides/**',
      '**/.artifacts/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.venv/**',
      '**/.git/**',
      '**/src/generated/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,cjs,js}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/src/components/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/**/*.mocks.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '@/features/**'],
              message: 'components must not import features',
            },
            {
              group: ['msw', 'msw/**'],
              message: 'msw belongs in mocks entry points and *.mocks.ts only',
            },
            {
              group: [
                '**/tests/**',
                '**/tests/fixtures/**',
                '*tests/fixtures*',
                '*tests/*',
              ],
              message: 'test fixtures belong in mocks entry points and *.mocks.ts only',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/features/**/adapters/**',
      'apps/web/src/features/**/*.mocks.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pi/contracts', '@pi/contracts/**'],
              message: 'only adapters may import @pi/contracts wire types',
            },
            {
              group: ['msw', 'msw/**'],
              message: 'msw belongs in mocks entry points and *.mocks.ts only',
            },
            {
              group: [
                '**/tests/**',
                '**/tests/fixtures/**',
                '*tests/fixtures*',
                '*tests/*',
              ],
              message: 'test fixtures belong in mocks entry points and *.mocks.ts only',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/mocks/**',
      'apps/web/src/**/*.mocks.ts',
      'apps/web/src/components/**',
      // Features (non-adapters) keep their own block so @pi/contracts stays banned;
      // adapters must still get the msw/fixtures ban from this block.
      'apps/web/src/features/**',
      '!apps/web/src/features/**/adapters/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['msw', 'msw/**'],
              message: 'msw belongs in mocks entry points and *.mocks.ts only',
            },
            {
              group: [
                '**/tests/**',
                '**/tests/fixtures/**',
                '*tests/fixtures*',
                '*tests/*',
              ],
              message: 'test fixtures belong in mocks entry points and *.mocks.ts only',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: jsxA11y.flatConfigs.recommended.languageOptions,
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...asWarn(jsxA11y.flatConfigs.recommended.rules),
    },
  },
  {
    files: ['scripts/design-gates/**/*.{mjs,js}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['apps/web/scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: {
        console: 'readonly',
      },
    },
  },
  {
    files: ['apps/discord/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read process.env only in apps/discord/src/index.ts via loadConfig',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Call fetch only in apps/discord/src/api/http.ts via createHttp',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="X-Ingest-Secret"]',
          message: 'Set X-Ingest-Secret only in apps/discord/src/api/http.ts',
        },
      ],
    },
  },
  {
    files: ['apps/discord/src/index.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['apps/discord/src/api/http.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
