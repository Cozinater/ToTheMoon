import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // `const { pk: _pk, sk: _sk, ...rest } = item` is how we drop keys we don't want
      // to carry forward; the underscore-prefixed bindings are deliberately unused.
      // Anything NOT underscore-prefixed is still an error.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Code-based TanStack Router means every route file exports its `*Route` object
    // next to the component (see src/router.tsx), and shadcn primitives export their
    // `*Variants` helper. Both are library conventions, so scope the rule off here
    // rather than listing names that every new route would have to be added to.
    files: ['src/routes/**/*.tsx', 'src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Seeding form state from props in an effect when a dialog opens is the form
    // component idiom in this repo (entry-form, holding-form, amend-dialog,
    // strategies-card, and the cash-related form additions in later tasks). The
    // settings-driven cases can't be lazy initialisers — the data arrives async.
    // Use a directory glob rather than a file list so future form components can be
    // added without editing this config.
    files: ['src/features/**/components/**/*.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
