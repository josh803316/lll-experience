import josh803316SharedConfig from '@josh803316/shared-config/eslint.config.js';
import ts from 'typescript-eslint';

const config = [
  ...josh803316SharedConfig,
  // Relax rules that require significant type refactoring in existing code.
  // Warnings remain visible in the editor — fix them incrementally.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    plugins: {
      '@typescript-eslint': ts.plugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/return-await': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-restricted-types': 'warn',
      // False positive: rule fails to recognise Error constructor with bun-types
      '@typescript-eslint/only-throw-error': 'warn',
    },
  },
  {
    rules: {
      'no-useless-escape': 'warn',
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'patches/',
      'tests/',
      'playwright.config.ts',
      // GitHub Pages demo files — loaded via @babel/standalone in the browser, not part of the app build
      '*.jsx',
    ],
  },
];

export default config;
