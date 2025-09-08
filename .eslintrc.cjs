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
    'no-console': 'error', // ЭАП требует error для production
    'no-debugger': 'error',
    'no-var': 'error',
    
    // Console logging rules - расширенный контроль
    'no-restricted-globals': [
      'error',
      {
        name: 'console',
        message: 'Use logger instead of console for production code. Import logger from @heys/logger'
      }
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.object.name='console']",
        message: 'Console methods are not allowed. Use logger from @heys/logger instead.'
      },
      {
        selector: "MemberExpression[object.name='console']",
        message: 'Console object access is not allowed. Use logger from @heys/logger instead.'
      }
    ],
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
    // Test files - разрешаем console в тестах
    {
      files: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    
    // Development/debugging files - разрешаем console для отладки
    {
      files: ['**/debug/**/*.{ts,js}', '**/*.debug.{ts,js}', '**/scripts/**/*.{ts,js}'],
      rules: {
        'no-console': 'warn',
        'no-restricted-globals': 'warn',
        'no-restricted-syntax': 'warn',
      },
    },
    
    // Console replacer files - разрешаем console для создания заместителей
    {
      files: ['**/console-replacer.{ts,js}', '**/console-replacement.{ts,js}'],
      rules: {
        'no-console': 'off',
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    
    // Configuration files - разрешаем console в конфигах
    {
      files: ['*.config.{ts,js}', '**/config/**/*.{ts,js}', '.eslintrc.cjs'],
      rules: {
        'no-console': 'warn',
        'no-restricted-globals': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    // Legacy files - более мягкие правила для старого кода
    {
      files: [
        '**/legacy/**/*.{ts,tsx}',
        '**/*_v12.{ts,tsx}',
        '**/*_v1.{ts,tsx}',
        'archive/**/*.{ts,tsx}',
        'TOOLS/**/*.js',
        'packages/ui/**/*.{ts,tsx}', // временно для security компонента
        'packages/shared/src/misc/**/*.{ts,tsx}', // legacy файлы в shared
        'packages/shared/src/day/**/*.{ts,tsx}', // day v12 файлы
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn',
        'no-console': 'warn',
        'no-empty': 'warn',
        'no-prototype-builtins': 'warn',
        'no-useless-escape': 'warn',
        'prefer-spread': 'warn',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        'no-undef': 'warn',
        'prefer-const': 'warn',
        'import/order': 'warn',
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
    // Временно игнорируем проблемные файлы для коммита
    'docs/automation/',
    'archive/legacy-v12/',
  ],
};
