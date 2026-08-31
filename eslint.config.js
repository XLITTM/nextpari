import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}', 'plugins/**/*.ts', 'scripts/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['server/**/*.ts', 'api/owner/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  {
    files: [
      'src/player/**/*.{ts,tsx}',
      'src/screens/**/*.{ts,tsx}',
      'src/games/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/*Context.tsx',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/owner', '**/owner/**'], message: 'Player boundary cannot import owner.' },
          { group: ['**/manager', '**/manager/**'], message: 'Player boundary cannot import manager.' },
          { group: ['**/mobcash', '**/mobcash/**'], message: 'Player boundary cannot import mobcash desk.' },
          { group: ['**/shared/staff', '**/shared/staff/**'], message: 'Player app cannot import shared/staff.' },
          { group: ['**/lib/backoffice', '**/lib/cashier', '**/lib/players'], message: 'Use player/services or shared/cashout — not staff/desk barrels.' },
        ],
      }],
    },
  },
  {
    files: ['src/owner/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/manager', '**/manager/**'], message: 'Owner boundary cannot import manager.' },
          { group: ['**/mobcash', '**/mobcash/**'], message: 'Owner boundary cannot import mobcash.' },
          { group: ['**/player', '**/player/**'], message: 'Owner boundary cannot import player.' },
          { group: ['**/hooks/useAuth'], message: 'Owner must not use player useAuth.' },
          { group: ['**/lib/playerAccount'], message: 'Owner must never provision a player account.' },
        ],
      }],
    },
  },
  {
    files: ['src/manager/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/owner', '**/owner/**'], message: 'Manager boundary cannot import owner.' },
          { group: ['**/mobcash', '**/mobcash/**'], message: 'Manager boundary cannot import mobcash.' },
          { group: ['**/player', '**/player/**'], message: 'Manager boundary cannot import player.' },
        ],
      }],
    },
  },
  {
    files: ['src/mobcash/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/player', '**/player/**'], message: 'Mobcash cannot import player modules.' },
          { group: ['**/owner', '**/owner/**'], message: 'Mobcash cannot import owner.' },
          { group: ['**/manager', '**/manager/**'], message: 'Mobcash cannot import manager.' },
          { group: ['**/screens', '**/screens/**'], message: 'Mobcash cannot import player UI screens.' },
          { group: ['**/games', '**/games/**'], message: 'Mobcash cannot import player games.' },
        ],
      }],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/player', '**/player/**'], message: 'shared cannot import player.' },
          { group: ['**/owner', '**/owner/**'], message: 'shared cannot import owner.' },
          { group: ['**/manager', '**/manager/**'], message: 'shared cannot import manager.' },
          { group: ['**/mobcash', '**/mobcash/**'], message: 'shared cannot import mobcash.' },
        ],
      }],
    },
  },
);
