import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
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
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '@/features/**'],
              message: 'components must not import features',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/features/**/adapters/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pi/contracts', '@pi/contracts/**'],
              message: 'only adapters may import @pi/contracts wire types',
            },
          ],
        },
      ],
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
);
