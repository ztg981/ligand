import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // The browser extension is plain scripts running against the WebExtension
    // APIs, not React and not modules — it only needs the `chrome` global.
    files: ['extension/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
      sourceType: 'script',
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
