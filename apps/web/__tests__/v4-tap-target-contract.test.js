/**
 * Контракт цели касания: рисунок меньше 44 pt, а нажимается 44.
 *
 * Сквозные строки восьмой сборки требуют не ниже 44 px у всего нажимаемого.
 * Там, где контракт задаёт видимый размер меньше (крестик 34, кнопка настройки
 * экрана 40, действие undo-бара 34, ссылка шапки шторки), цель добирается прозрачным
 * припуском `::after`, а не размером кнопки — приём уже принят у
 * `.nutrition-v4-chip`.
 *
 * Чего тест намеренно НЕ покрывает: чипы в переносимых рядах
 * (`.mc-supp-flow-chips` зазор 6, `.nutrition-v4-supplements__chips` зазор 5).
 * Там припуск до 44 наезжает на соседний ряд — цель одного чипа забирает
 * пиксели у другого. Это не дефект кода, а вопрос к контракту: либо зазор
 * ряда, либо величина цели. До ответа такие чипы не трогаем.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** Вернуть тело правила `selector { ... }` из CSS. */
function rule(css, selector) {
  const needle = `${selector} {`;
  let at = 0;
  while ((at = css.indexOf(needle, at)) >= 0) {
    const block = css.slice(at, css.indexOf('}', at));
    if (!/display:\s*none/.test(block) || block.length > 48) return block;
    at += needle.length;
  }
  return null;
}

/** Найти блок ::after, в том числе в групповом селекторе. */
function afterRule(css, host) {
  const direct = rule(css, `${host}::after`);
  if (direct) return direct;
  const needle = `${host}::after`;
  const at = css.indexOf(needle);
  if (at < 0) return null;
  const brace = css.indexOf('{', at);
  if (brace < 0) return null;
  return css.slice(at, css.indexOf('}', brace));
}

const cases = [
  {
    what: 'крестик шторки настроек',
    file: 'styles/modules/000-base-and-gamification.css',
    host: '.hdr-settings-sheet__close',
    inset: '-5px',
    visible: 34,
  },
  {
    what: 'кнопка настройки экрана на Главной',
    file: 'styles/modules/730-widgets-dashboard.css',
    host: '.widgets-settings-fab__host',
    inset: '-2px',
  },
  {
    what: 'кнопка действия в баре отмены',
    file: 'styles/heys-components.css',
    host: '.heys-undo-bar__btn',
    inset: '-11px 0',
    visible: 34,
  },
  {
    what: 'минус быстрого undo на Главной',
    file: 'styles/modules/730-widgets-dashboard.css',
    host: '.widgets-quick-minus__host',
    inset: '-11px 0',
  },
  {
    what: 'кнопка изменения размера виджета',
    file: 'styles/modules/730-widgets-dashboard.css',
    host: '.widget__resize-btn',
    inset: '-11px',
    hostPosition: 'absolute',
    visible: 22,
  },
  {
    what: 'переключатель научного обоснования в reason-card',
    file: 'styles/modules/725-metabolic-intelligence.css',
    host: '.reason-card__science-toggle',
    inset: '-6px 0',
    visible: 32,
  },
  {
    what: 'редактирование имени продукта в таблице',
    file: 'styles/heys-components.css',
    host: '.product-name-edit',
    inset: '-14px',
    visible: 16,
  },
  {
    what: 'плитка в режиме редактирования — цель удаления',
    file: 'styles/modules/730-widgets-dashboard.css',
    host: '.widgets-grid--remove-pick .widget',
    inset: '-4px',
    hostPosition: 'relative',
  },
  {
    what: 'крестик шторки виджета',
    file: 'styles/modules/730-widgets-dashboard.css',
    host: '.widget-bd-sheet__close',
    inset: '-7px',
    visible: 30,
  },
];

describe('контракт цели касания 44 pt', () => {
  it.each(cases)('$what: припуск задан и хост позиционирован', (c) => {
    const css = read(c.file);
    const host = rule(css, c.host);
    expect(host, `нет правила ${c.host}`).toBeTruthy();
    const pos = c.hostPosition ?? 'relative';
    expect(host).toMatch(new RegExp(`position:\\s*${pos}`));

    const after = afterRule(css, c.host);
    expect(after, `нет припуска ${c.host}::after`).toBeTruthy();
    expect(after).toMatch(/position:\s*absolute/);
    expect(after).toContain(`inset: ${c.inset}`);
  });

  const manifest = JSON.parse(
    read('__tests__/fixtures/v4-tap-target-inset-manifest.json'),
  );
  const polosa5Zones = new Set([
    'planning',
    'settings-system',
    'service-curator',
    'home-widgets',
    'gamification',
    'date-remainders',
  ]);
  const polosa5Cases = manifest.filter((c) => polosa5Zones.has(c.zone));

  it.each(polosa5Cases)('полоса 5 · $zone · $host: припуск ::after', (c) => {
    const css = read(c.file);
    const hosts = c.host.split(',').map((s) => s.trim());
    for (const host of hosts) {
      const block = rule(css, host);
      expect(block, `нет ${host}`).toBeTruthy();
      expect(block).toMatch(/position:\s*relative/);
      const after = afterRule(css, host);
      expect(after, `нет ${host}::after`).toBeTruthy();
      expect(after).toMatch(/content:\s*''/);
      expect(after).toMatch(/position:\s*absolute/);
      expect(after).toContain('inset:');
    }
  });

  it('видимый размер не менялся — цель растёт припуском, а не кнопкой', () => {
    for (const c of cases.filter((x) => x.visible)) {
      const host = rule(read(c.file), c.host);
      expect(host).toMatch(new RegExp(`(width|min-height):\\s*${c.visible}px`));
    }
  });

  // Кегль действия канвас называет дважды и по-разному: проза «вид текста
  // и действия» просит 12 px, разбор кадра «Отмена · одно удаление · 09» —
  // 11 px. Здесь верен разбор: он описывает эту кнопку, а проза пересказывает
  // весь ряд и фона не называет вовсе, тогда как разбор даёт чернила 7 %.
  // Спор записан в UI_V4_FINDINGS.
  it('действие набрано 11 px, как просит разбор кадра', () => {
    expect(rule(read('styles/heys-components.css'), '.heys-undo-bar__btn')).toMatch(
      /font-size:\s*11px/,
    );
  });

  it('припуск бара отмены равен полям содержимого — цель во всю высоту плашки', () => {
    const css = read('styles/heys-components.css');
    expect(rule(css, '.heys-undo-bar__content')).toMatch(/padding:\s*11px/);
    expect(rule(css, '.heys-undo-bar__btn::after')).toContain('inset: -11px 0');
  });

  // Обратная сторона того же контракта: где дизайнер решил держать 44 ВИДИМЫМ
  // размером, припуска быть не должно — палец не видит отрицательных полей.
  // Решение 6 сентября, строка контракта «области нажатия» канваса tips: у
  // «Прочитать все» снят припуск ::after inset −16px, высота задана своим
  // min-height. Без этой проверки припуск вернулся бы молча, и обе половины
  // правила одновременно считались бы выполненными.
  it('«Прочитать все» держит 44 своим размером, а не припуском', () => {
    const css = read('styles/modules/400-water-and-hydration.css');
    expect(rule(css, '.advice-list-header-link::after')).toBeNull();
    expect(rule(css, '.advice-list-header-link--read-all'))
      .toMatch(/min-height:\s*44px/);
  });

  const dateRemaindersVisible44 = [
    '.date-picker--v4 .date-picker-trigger',
    '.date-picker--v4 .date-picker-inline-today',
  ];

  it.each(dateRemaindersVisible44)(
    'date-remainders · %s держит 44 видимым min-height без ::after',
    (host) => {
      const css = read('styles/modules/000-base-and-gamification.css');
      expect(afterRule(css, host)).toBeNull();
      expect(rule(css, host)).toMatch(/min-height:\s*44px/);
    },
  );

  it('date-remainders · «Вчера» добирает 44 припуском, видимый размер 33', () => {
    const css = read('styles/modules/000-base-and-gamification.css');
    const host = rule(css, '.yesterday-quick-btn');
    expect(host).toMatch(/position:\s*relative/);
    expect(host).toMatch(/height:\s*33px/);
    expect(afterRule(css, '.yesterday-quick-btn')).toContain('inset: -6px 0');
  });
});
