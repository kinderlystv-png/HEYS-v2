import { existsSync } from 'node:fs';
import path from 'path';

import react from '@vitejs/plugin-react';
import { defaultExclude, defineConfig } from 'vitest/config';

// Скрипты из scripts/ — исполняемые файлы с шебангом, и тесты импортируют их
// как модули, чтобы проверить экспортированные помощники. Vite шебанг не
// снимает, и импорт падает с «Invalid or unexpected token» — из-за этого пять
// тестов, охраняющих публикацию, молча не загружались вовсе (проверено: файл
// с одним лишь шебангом не импортируется, без него импортируется).
//
// Снимаем шебанг на лету, а не из семидесяти одного файла: он там по делу —
// помечает точку входа, и правка каждого была бы подметанием ради теста.
const stripShebang = {
  name: 'heys-strip-shebang',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    // Путь нормализуем: на Windows id приходит с обратными слэшами.
    if (!id.replace(/\\/g, '/').includes('/scripts/')) return null;
    if (!code.startsWith('#!')) return null;
    // Строка заменяется пустой, а не удаляется: номера строк в стеке остаются
    // прежними, иначе отладка чужого падения уедет на единицу.
    const eol = code.indexOf('\n');
    return { code: eol < 0 ? '' : code.slice(eol), map: null };
  },
};

// Гейты сведения с кадрами отделены от проверок продукта.
//
// Эти тесты сверяют экран с кадром пакета дизайна, поэтому краснеют, когда
// дизайнер прислал новые кадры, а экран под них ещё не сведён. Это состояние
// работы, а не поломка продукта: 3 сентября обновление пакета так остановило
// выкатку исправного приложения — сам продукт был зелёным на остальных семи
// тысячах тестов. Деплойный гейт их пропускает (HEYS_DESIGN_GATES=skip),
// отдельный workflow гоняет только их (HEYS_DESIGN_GATES=only) и выкатку не
// держит; обязательными они быть не перестают, но в своём контуре.
//
// Набор задаётся именем, а не перечнем файлов: перечень пришлось бы вести
// руками, и новый гейт молча оказался бы вне обоих контуров. Названный иначе
// тест остаётся в деплойном гейте — ошибка в строгую сторону.
const DESIGN_GATES = '__tests__/**/*-canvas-{razbor,geometry,copy}.test.js';

// Названные вне соглашения. Список ручной, и это осознанная цена: у этих
// гейтов нет в имени слова «canvas», а переименовывать их ради глоба значило
// бы врать в названии — `ui-v4-completed-frame-evidence` сверяет не канвас, а
// полноту доказательств по восьми кадрам, объявленным завершёнными.
//
// Ручной список гниёт молча — файл переименовали, и он выпал из обоих
// контуров. Поэтому existsSync ниже роняет конфиг: пропасть незаметно строка
// больше не может.
//
// 3 сентября: пакет добавил 20 строк в эти восемь кадров, и «завершённые» они
// быть перестали. Продукт исправен, красна только полнота приёмки — класс тот
// же, что у razbor/geometry/copy. Шесть кадров из восьми принадлежат зоне
// `strength-builder`, её сессия и досочиняет доказательства; выкатку это
// держать не должно.
const DESIGN_GATE_FILES = ['__tests__/ui-v4-completed-frame-evidence.test.js'];

for (const file of DESIGN_GATE_FILES) {
  if (!existsSync(path.resolve(__dirname, file))) {
    throw new Error(
      `vitest.config: гейт сведения «${file}» не найден — переименован или удалён.`
        + ' Поправьте DESIGN_GATE_FILES, иначе он выпадет и из деплойного контура, и из контура сведения.',
    );
  }
}

const DESIGN_GATE_SET = [DESIGN_GATES, ...DESIGN_GATE_FILES];
const designGates = process.env.HEYS_DESIGN_GATES;

export default defineConfig({
  plugins: [react(), stripShebang],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    // setupFiles: ['./vitest.setup.ts'], // Отключено - импорт в тестах
    include:
      designGates === 'only'
        ? DESIGN_GATE_SET
        : ['src/**/*.{test,spec}.{ts,tsx}', '__tests__/**/*.{test,spec}.{ts,tsx,js}'],
    exclude: designGates === 'skip' ? [...defaultExclude, ...DESIGN_GATE_SET] : defaultExclude,
    // Каждый файл — свой fork (default vitest), isolate:true → чистые globals.
    // Раньше было isolate:false / singleFork:true как preventive OOM mitigation,
    // но это вызывало flake-тесты из-за shared global.HEYS между файлами
    // (восстановлено 2026-05-22, см. plan 1-5-cheeky-micali.md → Item 3).
    pool: 'forks',
    // Кросс-рантаймовые тесты сверяют web-расчёт с серверным: импортируют
    // модули облачных функций абсолютным путём выше корня vite. Vite пытался
    // их трансформировать как свои и падал на «Does the file exist?» — файл
    // существует и лежит в git, но за пределами корня. Из-за этого не
    // загружались вовсе curator-authorship (зеркало heys_sync_merge_v1.cjs)
    // и recipe-nutrients-parity: два сторожа расхождения рантаймов молчали.
    server: { deps: { external: [/yandex-cloud-functions/] } },
    // Доп. ограничения
    passWithNoTests: true,
    reporters: ['basic'],
    coverage: {
      enabled: false, // Отключаем в CI
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.{test,spec}.{ts,tsx}',
        '**/*.config.{ts,js}',
        '**/dist/**',
      ],
    },
  },
});
