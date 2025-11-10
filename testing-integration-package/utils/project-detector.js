/**
 * 🎯 УНИВЕРСАЛЬНЫЙ ДЕТЕКТОР ПРОЕКТОВ
 * Автоматически определяет фреймворк и создает конфигурацию тестирования
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// ---- НОВОЕ: утилиты аргументов и безопасной записи ----
function parseArgs(argv = []) {
  const args = {
    force: false,
    dryRun: false,
    framework: undefined,
    dir: undefined,
    msw: false,
    hooks: false,
    github: false,
    interactive: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--msw') args.msw = true;
    else if (a === '--hooks') args.hooks = true;
    else if (a === '--github') args.github = true;
    else if (a === '--interactive' || a === '-i') args.interactive = true;
    else if (a === '--framework' && argv[i + 1]) args.framework = argv[++i];
    else if (a === '--dir' && argv[i + 1]) args.dir = argv[++i];
  }
  return args;
}

function writeFileSafe(filePath, content, { force = false, dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const rel = path.relative(process.cwd(), filePath);

  if (dryRun) {
    console.info(`${exists ? '📝 DRY-RUN перезапись' : '🆕 DRY-RUN создание'}: ${rel}`);
    return false;
  }

  if (exists && !force) {
    console.info(`⏭️  Пропущено (файл уже существует): ${rel}`);
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.info(`${exists ? '♻️  Обновлён' : '✅ Создан'} файл: ${rel}`);
  return true;
}
// ---- /НОВОЕ ----

/**
 * Определяет тип проекта на основе package.json и структуры файлов
 */
export function detectProjectType(projectPath = process.cwd()) {
  // Если запускаем из папки testing-integration-package, поднимаемся на уровень выше
  if (path.basename(projectPath) === 'testing-integration-package') {
    projectPath = path.dirname(projectPath);
  }

  console.info(`🔍 Сканирование проекта: ${projectPath}`);

  // Файлы-индикаторы для точного определения фреймворка
  const indicators = {
    'next.js': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    sveltekit: ['svelte.config.js', 'app.html'],
    nuxt: ['nuxt.config.ts', 'nuxt.config.js'],
    vue: ['vue.config.js'],
    angular: ['angular.json'],
    gatsby: ['gatsby-config.js'],
  };

  // Проверяем файлы-индикаторы
  for (const [framework, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (fs.existsSync(path.join(projectPath, file))) {
        return { type: framework, projectPath };
      }
    }
  }

  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json не найден. Убедитесь, что находитесь в корне проекта.');
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // Определение фреймворка по зависимостям
  if (dependencies.next || dependencies.react) {
    return { type: dependencies.next ? 'next.js' : 'react', projectPath };
  }

  if (dependencies['@sveltejs/kit'] || dependencies.svelte) {
    return { type: dependencies['@sveltejs/kit'] ? 'sveltekit' : 'svelte', projectPath };
  }

  if (dependencies.nuxt || dependencies.vue) {
    return { type: dependencies.nuxt ? 'nuxt' : 'vue', projectPath };
  }

  if (dependencies['@angular/core']) {
    return { type: 'angular', projectPath };
  }

  return { type: 'react', projectPath };
}

/**
 * Получает информацию о проекте включая конфигурации
 */
export function getProjectInfo(projectPath) {
  const result = detectProjectType(projectPath);
  const info = {
    ...result,
    hasTypeScript: fs.existsSync(path.join(result.projectPath, 'tsconfig.json')),
    hasESLint:
      fs.existsSync(path.join(result.projectPath, '.eslintrc.js')) ||
      fs.existsSync(path.join(result.projectPath, '.eslintrc.json')) ||
      fs.existsSync(path.join(result.projectPath, 'eslint.config.js')),
    hasTests:
      fs.existsSync(path.join(result.projectPath, 'tests')) ||
      fs.existsSync(path.join(result.projectPath, '__tests__')) ||
      fs.existsSync(path.join(result.projectPath, 'test')),
    packageManager: fs.existsSync(path.join(result.projectPath, 'bun.lockb'))
      ? 'bun'
      : fs.existsSync(path.join(result.projectPath, 'yarn.lock'))
        ? 'yarn'
        : fs.existsSync(path.join(result.projectPath, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : 'npm',
  };

  return info;
}

/**
 * Получает конфигурацию для конкретного фреймворка
 */
export function getFrameworkConfig(framework) {
  const configs = {
    react: {
      dependencies: [
        'vitest',
        '@testing-library/jest-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        '@vitejs/plugin-react',
        'jsdom',
        'vite-tsconfig-paths',
      ],
      vitestConfig: `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    pool: 'threads',
    isolate: true,
    environmentOptions: {
      jsdom: { url: 'http://localhost' }
    },
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', '**/*.config.*'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});`,
      testWrapper: `import { render } from '@testing-library/react';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}`,
    },

    'next.js': {
      dependencies: [
        'vitest',
        '@testing-library/jest-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        '@vitejs/plugin-react',
        'jsdom',
        'vite-tsconfig-paths',
      ],
      vitestConfig: `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    pool: 'threads',
    isolate: true,
    environmentOptions: {
      jsdom: { url: 'http://localhost' }
    },
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', '**/*.config.*'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './')
    }
  }
});`,
      testWrapper: `import { render } from '@testing-library/react';
import { vi } from 'vitest';

// Мок для Next.js Router
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
  query: {},
  asPath: '/'
};

vi.mock('next/router', () => ({
  useRouter: () => mockRouter
}));

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}`,
    },

    vue: {
      dependencies: [
        'vitest',
        '@testing-library/jest-dom',
        '@testing-library/vue',
        '@testing-library/user-event',
        '@vitejs/plugin-vue',
        'jsdom',
        'vite-tsconfig-paths',
      ],
      vitestConfig: `import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [vue(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts,vue}'],
    pool: 'threads',
    isolate: true,
    environmentOptions: {
      jsdom: { url: 'http://localhost' }
    },
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', '**/*.config.*'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});`,
      testWrapper: `import { render } from '@testing-library/vue';

export function renderWithProviders(component, options = {}) {
  return render(component, {
    global: {
      plugins: []
    },
    ...options
  });
}`,
    },

    sveltekit: {
      dependencies: [
        'vitest',
        '@testing-library/jest-dom',
        '@testing-library/svelte',
        '@testing-library/user-event',
        'jsdom',
        'vite-tsconfig-paths',
      ],
      vitestConfig: `import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [sveltekit(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts,svelte}'],
    pool: 'threads',
    isolate: true,
    environmentOptions: {
      jsdom: { url: 'http://localhost' }
    },
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**', '**/*.config.*'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
      '$app': '@sveltejs/kit'
    }
  }
});`,
      testWrapper: `import { render } from '@testing-library/svelte';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}`,
    },
  };

  return configs[framework] || configs.react;
}

/**
 * Создает необходимые директории
 */
export function createDirectories(projectPath = process.cwd()) {
  const directories = [
    'tests',
    'tests/utils',
    'tests/fixtures',
    'tests/mocks',
    'tests/components',
    'src/constants',
  ];

  directories.forEach((dir) => {
    const fullPath = path.join(projectPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.info(`✅ Создана директория: ${dir}`);
    } else {
      console.info(`↔️  Директория уже есть: ${dir}`);
    }
  });
}

/**
 * Создает файл setup.ts
 */
export function createSetupFile(projectPath = process.cwd(), options = {}) {
  // авто-выбор ts/js
  const isTs = fs.existsSync(path.join(projectPath, 'tsconfig.json'));
  const ext = isTs ? 'ts' : 'js';

  const setupContent = `import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }));

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  });
});`;

  const setupPath = path.join(projectPath, 'tests', `setup.${ext}`);
  writeFileSafe(setupPath, setupContent, options);
}

/**
 * Создает файл с константами тест-идентификаторов
 */
export function createTestIds(projectPath = process.cwd(), options = {}) {
  const testIdsContent = `// Константы для test-id атрибутов
export const TEST_IDS = {
  // Базовые элементы
  FORM_SUBMIT: 'form-submit',
  FORM_CANCEL: 'form-cancel',
  ERROR_MESSAGE: 'error-message',
  SUCCESS_MESSAGE: 'success-message',
  LOADING_SPINNER: 'loading-spinner',

  // Кнопки
  BUTTON_PRIMARY: 'button-primary',
  BUTTON_SECONDARY: 'button-secondary',

  // Формы
  FIELD_EMAIL: 'field-email',
  FIELD_PASSWORD: 'field-password',
  FIELD_NAME: 'field-name',

  // Навигация
  NAV_HOME: 'nav-home',
  NAV_PROFILE: 'nav-profile',
  NAV_LOGOUT: 'nav-logout'
};`;

  const constantsDir = path.join(projectPath, 'src', 'constants');
  if (!fs.existsSync(constantsDir)) {
    fs.mkdirSync(constantsDir, { recursive: true });
  }

  const testIdsPath = path.join(constantsDir, 'test-ids.js');
  writeFileSafe(testIdsPath, testIdsContent, options);
}

/**
 * Создает фабрики данных
 */
export function createFactories(projectPath = process.cwd(), options = {}) {
  const factoriesContent = `// Фабрики для создания тестовых данных
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));

export const dataFactory = {
  user: (overrides = {}) => ({
    id: uuid(),
    email: \`test-${Date.now()}@example.com\`,
    name: 'Test User',
    role: 'user',
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  event: (overrides = {}) => ({
    id: uuid(),
    title: 'Test Event',
    description: 'Test event description',
    date: new Date().toISOString(),
    status: 'draft',
    ...overrides
  }),

  client: (overrides = {}) => ({
    id: uuid(),
    name: 'Test Client',
    email: \`client-${Date.now()}@example.com\`,
    phone: '+1234567890',
    ...overrides
  })
};`;

  const factoriesPath = path.join(projectPath, 'tests', 'fixtures', 'factories.js');
  writeFileSafe(factoriesPath, factoriesContent, options);
}

/**
 * Настраивает MSW (Mock Service Worker) для мокирования API в тестах
 */
export function setupMswMocks(projectPath = process.cwd(), options = {}) {
  const mocksDir = path.join(projectPath, 'tests', 'mocks');
  if (!fs.existsSync(mocksDir) && !options.dryRun) {
    fs.mkdirSync(mocksDir, { recursive: true });
    console.info(`✅ Создана директория: ${path.relative(process.cwd(), mocksDir)}`);
  } else if (fs.existsSync(mocksDir)) {
    console.info(`↔️  Директория уже есть: ${path.relative(process.cwd(), mocksDir)}`);
  }

  const serverPath = path.join(mocksDir, 'server.js');
  const serverContent = `import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () => HttpResponse.json({ ok: true })),
];

export const server = setupServer(...handlers);
`;
  writeFileSafe(serverPath, serverContent, options);

  // Патчим setup.(ts|js) для инициализации MSW
  const isTs = fs.existsSync(path.join(projectPath, 'tsconfig.json'));
  const setupPath = path.join(projectPath, 'tests', `setup.${isTs ? 'ts' : 'js'}`);
  const relSetup = path.relative(process.cwd(), setupPath);

  if (!fs.existsSync(setupPath)) {
    // Если по какой-то причине setup не создан — создадим базовый и добавим MSW
    const baseSetup = `import '@testing-library/jest-dom';\n`;
    if (!options.dryRun) fs.writeFileSync(setupPath, baseSetup, 'utf8');
  }

  const mswBlock = `\n// MSW setup\nimport { server } from './mocks/server';\nbeforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));\nafterEach(() => server.resetHandlers());\nafterAll(() => server.close());\n`;

  try {
    const current = fs.existsSync(setupPath) ? fs.readFileSync(setupPath, 'utf8') : '';
    if (current.includes("from './mocks/server'")) {
      console.info(`↔️  MSW уже подключен в ${relSetup}`);
      return { added: false };
    }
    if (options.dryRun) {
      console.info(`📝 DRY-RUN patch: добавить MSW bootstrap в ${relSetup}`);
      return { added: true, dryRun: true };
    }
    const updated = `${current.trim()}${mswBlock}`;
    fs.writeFileSync(setupPath, `${updated}\n`, 'utf8');
    console.info(`♻️  Обновлён файл: ${relSetup} (MSW bootstrap)`);
    return { added: true };
  } catch (e) {
    console.warn(`⚠️ Не удалось обновить ${relSetup}: ${e.message}`);
    return { added: false, error: e.message };
  }
}

/**
 * Настраивает Husky + lint-staged (pre-commit и pre-push)
 */
export function setupGitHooks(projectPath = process.cwd(), options = {}) {
  const huskyDir = path.join(projectPath, '.husky');
  const preCommit = path.join(huskyDir, 'pre-commit');
  const prePush = path.join(huskyDir, 'pre-push');
  const lintStagedRc = path.join(projectPath, '.lintstagedrc.json');

  const lintStagedConfig = `{
  "*.{js,jsx,ts,tsx,svelte,vue}": [
    "eslint --fix",
    "vitest related --run"
  ]
}`;
  writeFileSafe(lintStagedRc, lintStagedConfig, options);

  if (!options.dryRun && !fs.existsSync(huskyDir)) {
    fs.mkdirSync(huskyDir, { recursive: true });
    console.info(`✅ Создана директория: ${path.relative(process.cwd(), huskyDir)}`);
  } else if (fs.existsSync(huskyDir)) {
    console.info(`↔️  Директория уже есть: ${path.relative(process.cwd(), huskyDir)}`);
  }

  const preCommitScript = `npx lint-staged\n`;
  const prePushScript = `npx vitest run --coverage=false\n`;

  writeFileSafe(preCommit, preCommitScript, options);
  writeFileSafe(prePush, prePushScript, options);

  // ensure prepare script
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.scripts ||= {};
    if (!pkg.scripts.prepare) {
      pkg.scripts.prepare = 'husky';
      if (!options.dryRun) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.info('✅ Добавлен scripts.prepare="husky" в package.json');
    } else {
      console.info('↔️  scripts.prepare уже задан в package.json');
    }
  }

  try {
    if (!options.dryRun && fs.existsSync(preCommit)) fs.chmodSync(preCommit, 0o755);
    if (!options.dryRun && fs.existsSync(prePush)) fs.chmodSync(prePush, 0o755);
  } catch {}
  console.info('✅ Настроены Git hooks (Husky + lint-staged)');
}

/**
 * Создаёт GitHub Actions workflow для тестов и покрытия
 */
export function setupGithubActions(projectPath = process.cwd(), options = {}) {
  const wfDir = path.join(projectPath, '.github', 'workflows');
  const wfPath = path.join(wfDir, 'tests.yml');
  if (!options.dryRun && !fs.existsSync(wfDir)) {
    fs.mkdirSync(wfDir, { recursive: true });
  }
  const workflow = `name: CI - tests\n\non:\n  push:\n    branches: [ master, main, develop, feature/** ]\n  pull_request:\n    branches: [ '**' ]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      fail-fast: false\n      matrix:\n        node-version: [18.x, 20.x]\n\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n\n      - name: Setup Node.js \${{ matrix.node-version }}\n        uses: actions/setup-node@v4\n        with:\n          node-version: \${{ matrix.node-version }}\n          cache: npm\n\n      - name: Install dependencies\n        run: |\n          if [ -f package-lock.json ]; then npm ci; else npm install; fi\n\n      - name: Run tests\n        run: |\n          npm run test --if-present\n          npm run test:coverage --if-present || true\n\n      - name: Upload coverage artifact\n        if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: coverage-\${{ matrix.node-version }}\n          path: |\n            coverage\n            **/coverage\n          if-no-files-found: ignore\n`;
  writeFileSafe(wfPath, workflow, options);
  console.info('✅ Создан GitHub Actions workflow: .github/workflows/tests.yml');
}

/**
 * Обновляет package.json со скриптами тестирования
 */
export function updatePackageJsonScripts(projectPath = process.cwd(), options = {}) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const testScripts = {
    test: 'vitest',
    'test:ui': 'vitest --ui',
    'test:coverage': 'vitest run --coverage',
    'test:watch': 'vitest watch',
    'test:run': 'vitest run',
  };

  packageJson.scripts ||= {};
  for (const [k, v] of Object.entries(testScripts)) {
    if (packageJson.scripts[k] && packageJson.scripts[k] !== v && !options.force) {
      console.info(
        `⏭️  scripts.${k} существует и отличается — пропущено (используйте --force для перезаписи)`,
      );
      continue;
    }
    packageJson.scripts[k] = v;
  }

  if (options.dryRun) {
    console.info('📝 DRY-RUN обновление package.json scripts');
    return;
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.info('✅ Обновлен package.json со скриптами тестирования');
}

/**
 * Создает пример теста
 */
export function createExampleTest(projectPath = process.cwd(), framework = 'react', options = {}) {
  const examples = {
    react: `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Простой пример компонента для демонстрации
function TestButton({ onClick, children }) {
  return (
    <button onClick={onClick} data-testid="test-button">
      {children}
    </button>
  );
}

describe('Example Test', () => {
  it('should render and handle click', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<TestButton onClick={handleClick}>Click me</TestButton>);

    const button = screen.getByTestId('test-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');

    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});`,

    vue: `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';

const TestButton = {
  props: ['onClick'],
  template: '<button @click="onClick" data-testid="test-button"><slot /></button>'
};

describe('Example Test', () => {
  it('should render and handle click', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(TestButton, {
      props: { onClick: handleClick },
      slots: { default: 'Click me' }
    });

    const button = screen.getByTestId('test-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');

    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});`,
  };

  // Добавим пример для SvelteKit отдельно с выбором импорта для v4/v5
  if (framework === 'sveltekit') {
    let svelteMajor = 4;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
      const ver = (pkg.dependencies?.svelte || pkg.devDependencies?.svelte || '').toString();
      const m = ver.match(/\d+/);
      if (m) svelteMajor = parseInt(m[0], 10);
    } catch {}
    const importPath =
      svelteMajor >= 5 ? '@testing-library/svelte/svelte5' : '@testing-library/svelte';
    examples.sveltekit = `import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '${importPath}';
import TestButton from './components/TestButton.svelte';

describe('Example Svelte Test', () => {
  it('should render and handle click', async () => {
    const handleClick = vi.fn();

    render(TestButton, { props: { onClick: handleClick, label: 'Click me' } });

    const button = screen.getByTestId('test-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');

    await fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});`;
  }

  if (framework === 'sveltekit') {
    const componentDir = path.join(projectPath, 'tests', 'components');
    if (!fs.existsSync(componentDir)) fs.mkdirSync(componentDir, { recursive: true });

    const componentPath = path.join(componentDir, 'TestButton.svelte');
    const componentContent = `<script>
  export let onClick = () => {};
  export let label = 'Click me';
</script>

<button data-testid="test-button" on:click={onClick}>{label}</button>`;
    writeFileSafe(componentPath, componentContent, options);
  }

  const testContent = examples[framework] || examples.react;
  const testFileName = framework === 'sveltekit' ? 'example.svelte.test.ts' : 'example.test.js';
  const testPath = path.join(projectPath, 'tests', testFileName);

  writeFileSafe(testPath, testContent, options);
  console.info('✅ Создан пример теста');
}

/**
 * Главная функция настройки проекта
 */
export async function setupTestingEnvironment(projectPath = process.cwd(), options = {}) {
  console.info('🚀 Начинаем настройку тестирования...\n');

  try {
    // Определяем тип проекта
    const result = detectProjectType(projectPath);
    const detectedFramework = result.type;
    const actualProjectPath = result.projectPath;
    const framework = options.framework || detectedFramework;
    console.info(
      `📦 Обнаружен фреймворк: ${framework}${options.framework ? ` (override, был ${detectedFramework})` : ''}`,
    );

    // Интерактивный режим: спросить про опции
    if (options.interactive) {
      try {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q) => new Promise((res) => rl.question(q, (ans) => res(ans)));
        const yn = (s) =>
          ['y', 'yes', 'д', 'да'].includes(
            String(s || '')
              .trim()
              .toLowerCase(),
          );
        const a1 = await ask('Enable MSW mocks? (y/N): ');
        const a2 = await ask('Setup Husky + lint-staged? (y/N): ');
        const a3 = await ask('Add GitHub Actions CI? (y/N): ');
        rl.close();
        options.msw = options.msw || yn(a1);
        options.hooks = options.hooks || yn(a2);
        options.github = options.github || yn(a3);
      } catch {
        // ignore interactive errors and proceed non-interactively
      }
    }

    // Получаем конфигурацию
    const config = getFrameworkConfig(framework);

    // Создаем директории
    createDirectories(actualProjectPath);

    // Создаем конфигурационные файлы (js/ts)
    const isTs = fs.existsSync(path.join(actualProjectPath, 'tsconfig.json'));
    const vitestConfigPath = path.join(actualProjectPath, `vitest.config.${isTs ? 'ts' : 'js'}`);
    const vitestConfigContent = config.vitestConfig.replace(
      './tests/setup.ts',
      `./tests/setup.${isTs ? 'ts' : 'js'}`,
    );
    writeFileSafe(vitestConfigPath, vitestConfigContent, options);

    const wrapperPath = path.join(actualProjectPath, 'tests', 'utils', 'test-wrapper.js');
    let testWrapperContent = config.testWrapper;
    if (framework === 'sveltekit') {
      // Определяем версию svelte для выбора импорта v4/v5
      let svelteMajor = 4;
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(actualProjectPath, 'package.json'), 'utf8'),
        );
        const ver = (pkg.dependencies?.svelte || pkg.devDependencies?.svelte || '').toString();
        const m = ver.match(/\d+/);
        if (m) svelteMajor = parseInt(m[0], 10);
      } catch {}
      const importPath =
        svelteMajor >= 5 ? '@testing-library/svelte/svelte5' : '@testing-library/svelte';
      testWrapperContent = testWrapperContent.replace('@testing-library/svelte', importPath);
    }
    writeFileSafe(wrapperPath, testWrapperContent, options);

    // Создаем вспомогательные файлы
    createSetupFile(actualProjectPath, options);
    createTestIds(actualProjectPath, options);
    createFactories(actualProjectPath, options);
    createExampleTest(actualProjectPath, framework, options);

    // Опционально настраиваем MSW
    if (options.msw) {
      setupMswMocks(actualProjectPath, options);
    }

    // Обновляем package.json
    updatePackageJsonScripts(actualProjectPath, options);

    // Дополнительно: Husky/lint-staged и GitHub Actions
    if (options.hooks) {
      setupGitHooks(actualProjectPath, options);
    }
    if (options.github) {
      setupGithubActions(actualProjectPath, options);
    }

    console.info('\n🎉 Настройка завершена!');
    console.info('\n📋 Следующие шаги:');
    const { packageManager } = getProjectInfo(actualProjectPath);
    const pmInstall =
      packageManager === 'pnpm'
        ? 'pnpm add -D'
        : packageManager === 'yarn'
          ? 'yarn add -D'
          : packageManager === 'bun'
            ? 'bun add -d'
            : 'npm install -D';
    const pmRun =
      packageManager === 'pnpm'
        ? 'pnpm'
        : packageManager === 'yarn'
          ? 'yarn'
          : packageManager === 'bun'
            ? 'bun'
            : 'npm';
    const extraDeps = [];
    if (options.msw) extraDeps.push('msw');
    if (options.hooks) extraDeps.push('husky', 'lint-staged');
    const deps = [...config.dependencies, ...extraDeps];
    console.info('1. Установите зависимости:');
    console.info(`   ${pmInstall} ${deps.join(' ')}`);
    if (options.hooks) {
      console.info('   Затем инициализируйте husky (один раз):');
      console.info('   npx husky install');
    }
    console.info('2. Запустите тесты:');
    console.info(`   ${pmRun} run test`);

    return {
      framework,
      dependencies: config.dependencies,
      success: true,
    };
  } catch (error) {
    console.error('❌ Ошибка при настройке:', error.message);
    return { success: false, error: error.message };
  }
}

// Экспорт для использования в CLI
try {
  const invoked =
    process.argv && process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
  if (import.meta.url === invoked) {
    const args = parseArgs(process.argv.slice(2));
    const dir = args.dir ? path.resolve(args.dir) : process.cwd();
    setupTestingEnvironment(dir, args);
  }
} catch {
  // Безопасное игнорирование в средах без process.argv
}
