// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Pacotes de infraestrutura que a camada de domínio nunca pode importar. */
const INFRA = [
  'fastify',
  '@fastify/*',
  'prisma',
  '@prisma/*',
  'ioredis',
  'redis',
  'bullmq',
  'express',
  '@aws-sdk/*',
  'nodemailer',
  'sharp',
  'pg',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/api/src/generated/**',
      '**/.expo/**',
      'apps/mobile/expo-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },

  // React / React Native (app e design system): regras de hooks.
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Clean Architecture: domain não conhece infraestrutura nem HTTP.
  {
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: INFRA,
              message: 'A camada domain não pode depender de infraestrutura (seção 8 da spec).',
            },
            {
              group: ['**/infrastructure/**', '**/http/**', '**/application/**'],
              message: 'A camada domain não pode importar camadas externas.',
            },
          ],
        },
      ],
    },
  },

  // application só conhece domain e portas — nunca HTTP ou implementações concretas.
  {
    files: ['apps/api/src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: INFRA, message: 'Use cases dependem de portas, não de infraestrutura.' },
            {
              group: ['**/infrastructure/**', '**/http/**'],
              message: 'application não pode importar infrastructure nem http.',
            },
          ],
        },
      ],
    },
  },

  // Testes: permite padrões comuns em asserts.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/jest.setup.ts'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Arquivos de configuração CommonJS (jest.config.js, metro.config.js…)
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  prettier,
);
