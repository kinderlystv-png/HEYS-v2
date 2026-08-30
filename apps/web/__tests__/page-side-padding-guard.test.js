// Боковые поля вкладок «Питание», «Актив» и «Отчёты».
//
// Контейнер вкладки несёт два класса сразу — `page page-day` и
// `page page-reports`. Боковые 18 px объявлены у `.page-day` / `.page-reports`
// в 730-widgets-dashboard.css, а `.page` идёт в каскаде последним. Пока `.page`
// задавал padding шорткатом, четвёртое значение шортката молча обнуляло эти
// 18 px, и вкладки шли встык к краю экрана — против строки контракта
// «поля вкладки» канваса nutrition-tab.v4.dc.html («горизонтальные поля 18 px»).
//
// Живьём не видно: в реестре вердиктов строка стояла «=» с обоснованием
// «18 px даёт контейнер страницы», потому что исходник читали, а результат
// в браузере не сверяли. Здесь сверяется именно то, что шорткат не вернулся.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const BASE_CSS = fs.readFileSync(
  path.join(ROOT, 'web/styles/modules/000-base-and-gamification.css'),
  'utf8',
);
const DASHBOARD_CSS = fs.readFileSync(
  path.join(ROOT, 'web/styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

/** Тело правила по точному селектору на нулевом уровне вложенности. */
function ruleBody(rawCss, selector) {
  // Переводы строк нормализуем: на Windows файл лежит в дереве с CRLF,
  // и многострочный селектор не находился — тест краснел на ровном
  // месте, хотя правило на месте.
  const css = rawCss.replace(/\r\n/g, '\n');
  const marker = `\n${selector} {`;
  const at = css.indexOf(marker);
  if (at === -1) return null;
  const start = at + marker.length;
  const end = css.indexOf('\n}', start);
  return end === -1 ? null : css.slice(start, end);
}

describe('боковые поля вкладок · .page не стирает чужие', () => {
  it('.page задаёт padding только длинными свойствами по вертикали', () => {
    const body = ruleBody(BASE_CSS, '.page');
    expect(body, 'правило .page не найдено').not.toBeNull();

    // Шорткат `padding:` задаёт все четыре стороны и обнуляет боковые.
    expect(body).not.toMatch(/(^|[;\s])padding\s*:/);
    expect(body).toMatch(/padding-top\s*:/);
    expect(body).toMatch(/padding-bottom\s*:/);
    // Боковые здесь не назначаются вовсе — их задаёт конкретная вкладка.
    expect(body).not.toMatch(/padding-left\s*:/);
    expect(body).not.toMatch(/padding-right\s*:/);
  });

  it('ни один медиа-запрос не обнуляет боковые поля .page', () => {
    // Настоящая причина была здесь: `.page { padding-left: 0 }` внутри
    // @media (max-width: 840px) стояло последним в каскаде и било по всем
    // вкладкам с классом `page` именно на телефоне — там, где это и видно.
    const zeroing = [...BASE_CSS.matchAll(/\.page\s*\{([^}]*)\}/g)].filter(([, body]) =>
      /padding-(left|right)\s*:\s*0/.test(body),
    );
    expect(zeroing.map(([whole]) => whole.trim())).toEqual([]);
  });

  it('вкладки дня и отчётов объявляют свои 18 px', () => {
    const day = ruleBody(DASHBOARD_CSS, '.widgets-tab,\n.page-day');
    expect(day, 'правило .widgets-tab, .page-day не найдено').not.toBeNull();
    expect(day).toMatch(/padding-left:\s*18px/);
    expect(day).toMatch(/padding-right:\s*18px/);

    const reports = ruleBody(DASHBOARD_CSS, '.page-reports');
    expect(reports, 'правило .page-reports не найдено').not.toBeNull();
    expect(reports).toMatch(/padding-left:\s*18px/);
    expect(reports).toMatch(/padding-right:\s*18px/);
  });
});
