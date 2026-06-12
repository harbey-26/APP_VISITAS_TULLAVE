// ESLint 9 (flat config) — frontend React + backend Express en el mismo repo.
// Filosofía: errores solo para bugs reales (variables sin definir, hooks mal
// usados); lo estilístico queda en warning para no bloquear deploys.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    { ignores: ['dist/', 'android/', 'ios/', 'node_modules/', 'dev-dist/'] },
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx,mjs}'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            // El repo mezcla frontend (browser) y backend (node)
            globals: {
                ...globals.browser,
                ...globals.node,
                __APP_VERSION__: 'readonly', // inyectada por Vite (define)
            },
        },
        plugins: { react, 'react-hooks': reactHooks },
        settings: { react: { version: 'detect' } },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // Marca variables usadas solo dentro de JSX como usadas
            'react/jsx-uses-vars': 'error',
            'react/jsx-uses-react': 'off',
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
            // catch {} silencioso es convención del proyecto para errores GPS
            'no-empty': ['error', { allowEmptyCatch: true }],
            'react-hooks/exhaustive-deps': 'warn',
            // Reglas nuevas (estilo React Compiler) de react-hooks v7: marcan
            // patrones legacy que funcionan en producción (fetch+setState en
            // efectos, refs en render). En warn para corregirlos gradualmente
            // sin bloquear el CI; rules-of-hooks sí queda en error.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/static-components': 'warn',
            'react-hooks/immutability': 'warn',
        },
    },
];
