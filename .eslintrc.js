/**
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    // TypeScript rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'prefer-const': 'error',

    // Import rules
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],

    // General rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-var': 'error',
  },
  overrides: [
    // React-specific rules for UI package and apps
    {
      files: ['packages/ui/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
      plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],
      rules: {
        // React rules
        'react/react-in-jsx-scope': 'off', // Not needed in React 17+
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        'react/prop-types': 'off', // Using TypeScript instead
        'react/display-name': 'off',

        // JSX rules
        'react/jsx-uses-react': 'off', // Not needed in React 17+
        'react/jsx-uses-vars': 'error',
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
    },
    // Test files
    {
      files: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
    // Config files
    {
      files: ['*.config.{js,ts}', '.*rc.{js,ts}'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.min.js',
    'coverage/',
    '.next/',
    '.turbo/',
    'storybook-static/',
    // Legacy files
    'heys_*.js',
    'temp/',
    'TESTS/',
    'старые МЕТОДОЛОГИИ И ИНСТРУКЦИИ ДЛЯ ИИ/',
  ],
};
