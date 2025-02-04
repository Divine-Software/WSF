import pluginJs from '@eslint/js';
import pluginJest from 'eslint-plugin-jest';
import pluginJsDoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        files: ['*/src/**/*.{ts,mts,cts,tsx}'],
    },

    {
        plugins: { jsdoc: pluginJsDoc, jest: pluginJest },
    },

    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
            globals: globals.node
        },
    },

    pluginJs.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.recommendedTypeCheckedOnly,
    ...tseslint.configs.stylistic,
    // ...tseslint.configs.stylisticTypeCheckedOnly,
    pluginJsDoc.configs['flat/recommended-typescript'],
    pluginJest.configs['flat/recommended'],

    {
        rules: {
            // Override tseslint.configs.recommended
            '@typescript-eslint/no-empty-object-type': 0,
            '@typescript-eslint/no-explicit-any': 0,
            '@typescript-eslint/no-unused-expressions': 0,
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],

            // Override tseslint.configs.strict
            '@typescript-eslint/no-non-null-assertion': 0,
            '@typescript-eslint/no-dynamic-delete': 0,

            // Override tseslint.configs.recommendedTypeCheckedOnly
            '@typescript-eslint/no-base-to-string': 0,
            '@typescript-eslint/no-duplicate-type-constituents': 0,
            '@typescript-eslint/no-misused-promises': ['error', { 'checksVoidReturn': false }],
            '@typescript-eslint/no-redundant-type-constituents': 0,
            '@typescript-eslint/no-unsafe-argument': 0,
            '@typescript-eslint/no-unsafe-assignment': 0,
            '@typescript-eslint/no-unsafe-assignment': 0,
            '@typescript-eslint/no-unsafe-call': 0,
            '@typescript-eslint/no-unsafe-enum-comparison': 0,
            '@typescript-eslint/no-unsafe-member-access': 0,
            '@typescript-eslint/no-unsafe-return': 0,
            '@typescript-eslint/require-await': 0,
            '@typescript-eslint/restrict-template-expressions': 0,

            // Override tseslint.configs.stylistic
            "@typescript-eslint/array-type": 0,
            "@typescript-eslint/consistent-indexed-object-style": 0,
            "@typescript-eslint/no-inferrable-types": 0,
            "@typescript-eslint/prefer-function-type": 0,

            // Override jsdoc
            'jsdoc/require-jsdoc': [ 'warn', { publicOnly: true } ],
            'jsdoc/tag-lines': 0,

            // Custom settings
            '@typescript-eslint/return-await': [ 'error', 'error-handling-correctness-only' ],
            '@typescript-eslint/naming-convention': ['error', {
                    selector: 'memberLike',
                    modifiers: ['private'],
                    format: ['camelCase'],
                    leadingUnderscore: 'require',
                }, {
                    selector: 'memberLike',
                    modifiers: ['protected'],
                    format: ['camelCase'],
                    leadingUnderscore: 'require',
                },
            ],
        },
    },
];