// Ссылка на имя, которого нет, роняет весь экран виджетов в ErrorBoundary.
//
// 22 августа так и вышло: модалка подтверждения сброса была снята вместе с
// useState, а один вызов `setShowResetConfirm(false)` остался в эффекте выхода
// из расстановки. Тесты ядра этого не видят — они не рендерят UI, а eslint для
// legacy `apps/web/**/heys_*.js` держит `no-undef` выключенным. Ошибка доехала
// до прода и убила вкладку целиком.
//
// Гейт узкий намеренно: только файлы виджетов, у которых нарушений сейчас ноль.
// Включать `no-undef` на весь legacy разом нельзя — там 222 срабатывания в 21
// файле, часть из них ложные (сборочные флаги, глобалы соседних рантаймов).
// Список ниже может только расти: почистили ещё один файл — добавили сюда.
import fs from 'node:fs';
import path from 'node:path';

import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

// `global` в этих файлах — часть UMD-обёртки (`typeof global !== 'undefined'`),
// а не промах: браузерного глобала с таким именем нет, и проверка это знает.
const GLOBALS = {
  HEYS: 'readonly',
  React: 'readonly',
  ReactDOM: 'readonly',
  globalThis: 'readonly',
  global: 'readonly',
};

function undefinedNames(file) {
  const linter = new Linter();
  return linter
    .verify(fs.readFileSync(path.join(WEB_DIR, file), 'utf8'), {
      env: { browser: true, es2022: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
      globals: GLOBALS,
      rules: { 'no-undef': 'error' },
    })
    // Сообщения о ненайденных правилах плагинов — не про код файла.
    .filter((m) => m.ruleId === 'no-undef')
    .map((m) => `${file}:${m.line} ${m.message}`);
}

describe('виджеты: ни одной ссылки на несуществующее имя', () => {
  const FILES = [
    'heys_widgets_core_v1.js',
    'heys_widgets_ui_v1.js',
    'heys_widgets_registry_v1.js',
    'heys_widgets_events_v1.js',
    'heys_widgets_variants_v4.js',
    'heys_widgets_insulin_wave_v4.js',
    'heys_widgets_weight_dynamics_v4.js',
    'heys_widgets_data_crash_risk_v1.js',
  ];

  it.each(FILES)('%s', (file) => {
    expect(undefinedNames(file)).toEqual([]);
  });

  it('список файлов не сузился', () => {
    const present = fs
      .readdirSync(WEB_DIR)
      .filter((f) => /^heys_widgets.*\.js$/.test(f) && !f.includes('bundle'));
    // Новый файл виджетов должен попасть под гейт осознанно, а не пройти мимо.
    expect(present.filter((f) => !FILES.includes(f))).toEqual([]);
  });
});
