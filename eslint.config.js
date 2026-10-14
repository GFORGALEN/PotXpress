import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'website/**',
      'asset-candidates/**',
      'server/data/**',
      '**/*.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['server/**/*.{js,cjs}', 'packages/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // 让 no-unused-vars 识别 JSX 中使用的组件。
      'react/jsx-uses-vars': 'error',
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['client/test/**/*.js', 'client/vite.config.*'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
    },
  },
];
