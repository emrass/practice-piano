import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dist-e2e', 'native', 'android', 'coverage', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // UI text follows design/system/guides/01-writing.md: two short sentences, never an em dash.
    // Everything the app can show is a string literal, a template literal or JSX text in these
    // files (titles, labels, messages, names in src/core, the web app manifest); comments are
    // not checked, and neither are tests.
    files: ['src/**/*.{ts,tsx}', 'pwa/**/*.ts'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal[value=/—/]', 'TemplateElement[value.raw=/—/]', 'JSXText[value=/—/]'].map((selector) => ({
          selector,
          message: 'No em dash in UI text: write two short sentences, or use a colon (design/system/guides/01-writing.md).',
        })),
      ],
    },
  },
  {
    // Browser tests and screenshot scripts: Playwright fixtures call `use()`, which is not a React hook.
    files: ['e2e/**/*.ts', 'scripts/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // Design system tooling: plain Node scripts.
    files: ['design/scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: { eqeqeq: ['error', 'smart'], 'prefer-const': 'error' },
  },
  {
    // The service worker template; the build plugin fills in __PP_FILES__.
    files: ['pwa/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker, __PP_FILES__: 'readonly' } },
  },
]);
