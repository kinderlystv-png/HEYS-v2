/**
 * Контракт цели касания: рисунок меньше 44 pt, а нажимается 44.
 *
 * Сквозные строки восьмой сборки требуют не ниже 44 px у всего нажимаемого.
 * Там, где контракт задаёт видимый размер меньше (крестик 34, кнопка настройки
 * экрана 40, «Отменить» 34, ссылка шапки шторки), цель добирается прозрачным
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
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  return css.slice(at, css.indexOf('}', at));
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
    host: '.widgets-settings-fab',
    inset: '-2px',
    visible: 40,
  },
  {
    what: 'ссылка «Прочитать все» в шапке шторки советов',
    file: 'styles/modules/400-water-and-hydration.css',
    host: '.advice-list-header-link',
    inset: '-16px 0',
  },
  {
    what: 'кнопка «Отменить» в баре отмены',
    file: 'styles/heys-components.css',
    host: '.heys-undo-bar__btn',
    inset: '-11px 0',
    visible: 34,
  },
];

describe('контракт цели касания 44 pt', () => {
  it.each(cases)('$what: припуск задан и хост позиционирован', (c) => {
    const css = read(c.file);
    const host = rule(css, c.host);
    expect(host, `нет правила ${c.host}`).toBeTruthy();
    expect(host).toMatch(/position:\s*relative/);

    const after = rule(css, `${c.host}::after`);
    expect(after, `нет припуска ${c.host}::after`).toBeTruthy();
    expect(after).toMatch(/position:\s*absolute/);
    expect(after).toContain(`inset: ${c.inset}`);
  });

  it('видимый размер не менялся — цель растёт припуском, а не кнопкой', () => {
    for (const c of cases.filter((x) => x.visible)) {
      const host = rule(read(c.file), c.host);
      expect(host).toMatch(new RegExp(`(width|min-height):\\s*${c.visible}px`));
    }
  });

  it('«Отменить» набран 12 px, как просит строка «вид текста и действия»', () => {
    expect(rule(read('styles/heys-components.css'), '.heys-undo-bar__btn')).toMatch(
      /font-size:\s*12px/,
    );
  });

  it('припуск бара отмены равен полям содержимого — цель во всю высоту плашки', () => {
    const css = read('styles/heys-components.css');
    expect(rule(css, '.heys-undo-bar__content')).toMatch(/padding:\s*11px/);
    expect(rule(css, '.heys-undo-bar__btn::after')).toContain('inset: -11px 0');
  });
});
