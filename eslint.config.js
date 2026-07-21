import eslint from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['dist/**', 'dist-demo/**', 'node_modules/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                parser: tseslint.parser,
            },
        },
        rules: {
            'vue/multi-word-component-names': 'off',
            'vue/html-indent': ['warn', 4],
            'vue/max-attributes-per-line': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    }
)
