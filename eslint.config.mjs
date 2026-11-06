import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default [
    {
        ignores: ['build/**', 'node_modules/**', '.tmp/**'],
    },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                firebase: 'readonly',
            },
        },
        rules: {
            'no-empty': ['error', { allowEmptyCatch: true }],
            // Application modules import each other only through the package.json aliases (#js/*, #assets/*).
            'no-restricted-imports': [
                'error',
                { patterns: [{ regex: '^\\.', message: 'Use #js/* or #assets/* aliases instead of relative paths.' }] },
            ],
        },
    },
    {
        files: ['vite.config.js', 'eslint.config.mjs', '.lintstagedrc.mjs', 'tests/**/*.mjs', 'tools/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
    eslintConfigPrettier,
];
