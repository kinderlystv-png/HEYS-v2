/**
 * Состояние нажатия · правило продукта — сверка кода с контрактом.
 *
 * Источник: docs/ui/handoff-v4/canvas/Переработка дизайна приложения/
 * design_handoff_heys_v4/home-widgets.v4.dc.html, строка
 * «состояние нажатия · правило продукта»: элемент гаснет до 70 % на время
 * касания и возвращается за 120 мс; плитки Главной при этом ещё и вжимаются до
 * 0,965 — единственное место, где к гашению добавлен масштаб; ни смены заливки,
 * ни ряби, ни тени при нажатии нет; hover не рисуется вовсе.
 *
 * Почему тестом, а не пересчётом руками. Правил нажатия в продукте больше трёх
 * сотен в двух десятках файлов: глазами «приём один» не проверить ни разу, а на
 * следующей правке — тем более. Тест читает и сам канвас, и все файлы стилей,
 * поэтому расхождение всплывает и когда меняют код, и когда дизайнер меняет
 * строку.
 *
 * Отступления перечислены поимённо ниже (ОТСТУПЛЕНИЯ). Список закрытый: новое
 * правило с масштабом, заливкой или тенью на нажатии уронит тест, пока его не
 * внесут в список с причиной. Запись приёма — комментарий в
 * styles/modules/001-design-tokens.css.
 */
import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const STYLES_DIR = path.join(WEB_DIR, 'styles');
const CANVAS = path.resolve(
  WEB_DIR,
  '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);

/** Приём: ровно эта пара во всех правилах нажатия. */
const DIM = '0.7';
const RETURN_MS = 'opacity 120ms ease';
/** Единственное место с масштабом — плитка Главной. */
const TILE = { file: 'modules/730-widgets-dashboard.css', sel: '.widget:active', scale: 'scale(0.965)' };

/**
 * Правила нажатия, которые приём не применяют, и почему. Ключ —
 * «файл :: селектор» (пробелы схлопнуты).
 */
const ОТСТУПЛЕНИЯ = new Map([
  [
    'modules/730-widgets-dashboard.css :: .widget:active',
    'плитка Главной: к гашению добавлен масштаб 0,965 — так сказано в контракте',
  ],
  // Ползунки и переключатели: палец ведёт непрерывное значение, «нажатия» как
  // события здесь нет — растёт бегунок, чтобы его было видно из-под пальца.
  [
    'modules/300-modals-and-day.css :: .steps-slider:active .steps-slider-thumb',
    'бегунок шагов растёт под пальцем — affordance ведения, не нажатие',
  ],
  [
    'modules/300-modals-and-day.css :: .mood-slider-row:active .mood-emoji-dynamic',
    'эмодзи настроения растёт, пока ведут ползунок',
  ],
  [
    'modules/300-modals-and-day.css :: .grams-slider-thumb:active, .grams-slider:active .grams-slider-thumb',
    'бегунок граммов растёт под пальцем',
  ],
  [
    'modules/500-pwa-and-offline.css :: .deficit-slider-thumb:active',
    'бегунок дефицита: перетаскивание, масштаб + позиционный translate',
  ],
  [
    "modules/500-pwa-and-offline.css :: .household-slider:active::-webkit-slider-thumb, .household-slider:active::-moz-range-thumb",
    'системный бегунок range растёт под пальцем',
  ],
  [
    'modules/400-water-and-hydration.css :: .ios-toggle:active .ios-toggle-thumb',
    'тумблер: пятно бегунка вытягивается — механика переключателя',
  ],
  [
    'modules/400-water-and-hydration.css :: .ios-toggle-on:active .ios-toggle-thumb',
    'тумблер во включённом положении — та же механика',
  ],
  [
    'modules/730-widgets-dashboard.css :: .widget__resize-handle:active::before',
    'ручка изменения размера: захват для тяги, а не нажатие',
  ],
  [
    'modules/900-planning.css :: .planning-calendar-slot__resize:active::before',
    'ручка растягивания слота: захват для тяги',
  ],
  // Перетаскивание: отклик — курсор, поверхность не гасится, чтобы было видно,
  // что именно уезжает под пальцем.
  [
    'modules/000-base-and-gamification.css :: .ct-wb-ex-drag-order:active, .ct-wb-ex-drag-ss:active',
    'перетаскивание упражнений: только курсор',
  ],
  [
    'modules/730-widgets-dashboard.css :: .widget--editing:active',
    'плитка в режиме правки: перетаскивание, только курсор',
  ],
  [
    'modules/900-planning.css :: .planning-task-matrix-card:active',
    'карточка матрицы: перетаскивание, только курсор',
  ],
  [
    'modules/900-planning.css :: .planning-calendar-unscheduled-pill:active',
    'нераспределённая задача: перетаскивание, только курсор',
  ],
  [
    'modules/900-planning.css :: .planning-calendar-task-picker__task-main:active',
    'строка выбора задачи: перетаскивание, только курсор',
  ],
  [
    'modules/906-planning-goal-map.css :: .goal-map-canvas:active',
    'полотно карты целей: панорамирование, только курсор',
  ],
  [
    'modules/906-planning-goal-map.css :: .goal-map-node:active',
    'узел карты целей: перетаскивание, только курсор',
  ],
  // Нажатие как раскрытие: правило показывает другое содержимое, а не рисует
  // отклик поверхности.
  [
    'modules/000-base-and-gamification.css :: .game-progress:active .game-progress-tooltip',
    'подсказка прогресса появляется на время удержания',
  ],
  [
    'modules/900-planning.css :: .planning-calendar-slot__resize:active::before, .planning-calendar-slot__resize:focus-visible::before, .planning-calendar-slot:focus-within .planning-calendar-slot__resize::before',
    'ручка слота проявляется на удержании и на фокусе',
  ],
  // Прочее.
  [
    'modules/000-base-and-gamification.css :: input:active, textarea:active, select:active',
    'поля ввода: рамка — предвестник фокуса, а не отклик нажимаемой поверхности',
  ],
  [
    'modules/000-base-and-gamification.css :: .ct-wb-ex-fold-toggle:active',
    'только курсор, ничего не рисует',
  ],
  [
    "modules/600-steps-and-aps.css :: .aps-product-card--disabled, .aps-product-card--disabled:hover, .aps-product-card--disabled:active, [data-theme$='dark'] .aps-product-card--disabled:hover, [data-theme$='dark'] .aps-product-card--disabled:active",
    'карточка в работе: правило гасит отклик целиком, включая нажатие',
  ],
  [
    'modules/600-steps-and-aps.css :: .aps-barcode-debug-dot:active::after',
    'отладочная точка сканера — dev-only, в продукт не видна',
  ],
  [
    'modules/730-widgets-dashboard.css :: .supplements-card.widget--supplements-diary, .supplements-card.widget--supplements-diary:active',
    'витамины в дневнике: снимают смещение плитки, гашение приходит от .widget:active',
  ],
  [
    'modules/730-widgets-dashboard.css :: .meal-rec-card.widget--meal-rec-diary, .meal-rec-card.widget--meal-rec-diary-water, .meal-rec-card.widget--meal-rec-diary:active, .meal-rec-card.widget--meal-rec-diary-water:active',
    'рекомендация еды в планировщике: то же самое',
  ],
]);

/** Правила hover, которые намеренно не под гейтом (это не подсветка). */
const HOVER_БЕЗ_ГЕЙТА = new Set([
  "modules/600-steps-and-aps.css :: .aps-product-card--disabled, .aps-product-card--disabled:hover, .aps-product-card--disabled:active, [data-theme$='dark'] .aps-product-card--disabled:hover, [data-theme$='dark'] .aps-product-card--disabled:active",
  'modules/733-ui-v4-login-theme.css :: .heys-auth-support-link, .heys-auth-link-btn, .heys-auth-support-link:hover, .heys-auth-support-link:focus, .heys-auth-support-link:visited, .heys-auth-link-btn:hover, .heys-auth-link-btn:focus, .heys-auth-link-btn:visited',
]);

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function cssFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(full));
    // tailwind.css — скомпилированный вывод утилит, авторского кода в нём нет
    else if (entry.name.endsWith('.css') && entry.name !== 'tailwind.css') out.push(full);
  }
  return out;
}

function collect(match) {
  const rules = [];
  for (const file of cssFiles(STYLES_DIR)) {
    const rel = path.relative(STYLES_DIR, file).split(path.sep).join('/');
    postcss.parse(fs.readFileSync(file, 'utf8'), { from: file }).walkRules((rule) => {
      if (!match.test(rule.selector)) return;
      const decls = [];
      rule.walkDecls((d) => decls.push({ prop: d.prop, value: norm(d.value) }));
      rules.push({ rel, rule, key: `${rel} :: ${norm(rule.selector)}`, decls, line: rule.source.start.line });
    });
  }
  return rules;
}

const press = collect(/:active/);
const обычные = press.filter((r) => !ОТСТУПЛЕНИЯ.has(r.key));

describe('состояние нажатия · правило продукта — контракт', () => {
  it('строка канваса всё ещё требует 70 %, возврат 120 мс и 0,965 у плиток', () => {
    const canvas = fs.readFileSync(CANVAS, 'utf8');
    const idx = canvas.indexOf('состояние нажатия · правило продукта');
    expect(idx).toBeGreaterThan(-1);
    // в канвасе неразрывные пробелы («70 %») — сверяем по обычным
    const строка = canvas.slice(idx, idx + 900).replace(/\s/g, ' ');
    expect(строка).toContain('гаснет до 70 % прозрачности');
    expect(строка).toContain('возвращается за 120 мс');
    expect(строка).toContain('вжимаются до 0,965');
    expect(строка).toContain('Ни смены заливки, ни ряби, ни тени при нажатии нет');
  });

  it('приём записан один раз в 001-design-tokens.css', () => {
    const tokens = fs.readFileSync(path.join(STYLES_DIR, 'modules/001-design-tokens.css'), 'utf8');
    const idx = tokens.indexOf('СОСТОЯНИЕ НАЖАТИЯ');
    expect(idx).toBeGreaterThan(-1);
    const блок = tokens.slice(idx, idx + 1800);
    expect(блок).toContain('opacity: 0.7;');
    expect(блок).toContain('transition: opacity 120ms ease;');
  });
});

describe('состояние нажатия · один приём на весь продукт', () => {
  it('в продукте вообще есть правила нажатия — иначе проверка ничего не значит', () => {
    expect(обычные.length).toBeGreaterThan(300);
  });

  it('каждое правило нажатия гасит до 70 % и делает это за 120 мс', () => {
    const плохие = обычные
      .filter(
        (r) =>
          !r.decls.some((d) => d.prop === 'opacity' && d.value === DIM) ||
          !r.decls.some((d) => d.prop === 'transition' && d.value.includes(RETURN_MS)),
      )
      .map((r) => `${r.key} (строка ${r.line}): ${r.decls.map((d) => d.prop + ': ' + d.value).join('; ')}`);
    expect(плохие).toEqual([]);
  });

  it('масштаба при нажатии нет нигде, кроме плитки Главной', () => {
    const сМасштабом = обычные
      .filter((r) => r.decls.some((d) => /\bscale[XYZ3d]*\(/.test(d.value)))
      .map((r) => `${r.key} (строка ${r.line})`);
    expect(сМасштабом).toEqual([]);
  });

  it('ни смены заливки, ни тени, ни ряби при нажатии', () => {
    const запрещено = ['background', 'background-color', 'box-shadow', 'filter', 'animation'];
    const сЛишним = обычные
      .filter((r) => r.decls.some((d) => запрещено.includes(d.prop)))
      .map((r) => `${r.key} (строка ${r.line}): ${r.decls.map((d) => d.prop).join(', ')}`);
    expect(сЛишним).toEqual([]);
  });

  it('кроме гашения правило нажатия ничего не переопределяет', () => {
    // Допустимы только снятие чужого смещения (transform: none/translate…0),
    // позиционный translate, курсор перетаскивания и снятие системной обводки.
    const лишнее = [];
    for (const r of обычные) {
      for (const d of r.decls) {
        if (d.prop === 'opacity' || d.prop === 'transition') continue;
        if (d.prop === 'cursor' || d.prop === 'outline') continue;
        if (d.prop === 'transform' && !/\bscale[XYZ3d]*\(/.test(d.value)) continue;
        лишнее.push(`${r.key} (строка ${r.line}): ${d.prop}: ${d.value}`);
      }
    }
    expect(лишнее).toEqual([]);
  });

  it('список отступлений закрыт: в нём нет ни лишних, ни отсутствующих записей', () => {
    const ключи = new Set(press.map((r) => r.key));
    const мёртвые = [...ОТСТУПЛЕНИЯ.keys()].filter((k) => !ключи.has(k));
    expect(мёртвые).toEqual([]);
  });
});

describe('состояние нажатия · плитка Главной', () => {
  const плитка = press.find((r) => r.key === `${TILE.file} :: ${TILE.sel}`);

  it('плитка гаснет до 70 % и вжимается ровно до 0,965', () => {
    expect(плитка).toBeTruthy();
    expect(плитка.decls).toContainEqual({ prop: 'opacity', value: DIM });
    expect(плитка.decls).toContainEqual({ prop: 'transform', value: TILE.scale });
  });

  it('плитка возвращается из нажатия за 120 мс — и по прозрачности, и по масштабу', () => {
    const переход = плитка.decls.find((d) => d.prop === 'transition');
    expect(переход.value).toContain('opacity 120ms ease');
    expect(переход.value).toContain('transform 120ms ease');
    // Возврат задаёт базовое правило .widget: без него плитка отскакивала бы
    // пружиной 0.4s, а контракт обещает 120 мс.
    const css = fs.readFileSync(path.join(STYLES_DIR, TILE.file), 'utf8');
    const idx = css.indexOf('\n.widget {');
    expect(idx).toBeGreaterThan(-1);
    const база = css.slice(idx, idx + css.slice(idx).indexOf('\n}'));
    expect(база).toContain('transform 120ms ease');
    expect(база).toContain('opacity 120ms ease');
  });
});

describe('hover не рисуется — продукт сенсорный', () => {
  it('каждое правило подсветки закрыто @media (hover: hover)', () => {
    const открытые = collect(/:hover/)
      .filter((r) => {
        let node = r.rule.parent;
        while (node && node.type !== 'root') {
          if (node.type === 'atrule' && /hover\s*:\s*hover/.test(node.params)) return false;
          node = node.parent;
        }
        return true;
      })
      .filter((r) => !HOVER_БЕЗ_ГЕЙТА.has(r.key))
      .map((r) => `${r.key} (строка ${r.line})`);
    expect(открытые).toEqual([]);
  });
});
