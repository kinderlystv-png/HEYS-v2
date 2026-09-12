// Нижняя панель сессии («Добавить упражнение» и «Завершить») обязана оставаться
// на экране при любом числе упражнений.
//
// 4 сентября (3923ec050) из правила `.sb-root` пропала строка `position: fixed`
// — её место заняло объявление `--sb-sync-muted`. Слой перестал быть
// полноэкранным и начал расти по содержимому, а тело страницы на время слоя
// стоит `position: fixed; overflow: hidden`: прокрутки нет, и всё, что ниже
// первого экрана, становится недостижимым. На сессии из семи упражнений внизу
// экрана оставался конец списка («Очередь отправки»), а завершить тренировку
// было нечем.
//
// Проверка меряет живую геометрию в той же обвязке, что даёт слою ядро
// (heys_kernel_fullscreen_v1.js): тело фиксировано, слой — единственный
// прокручиваемый узел внутри себя.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getPlaywrightBrowser,
  releasePlaywrightBrowserForSuite,
  retainPlaywrightBrowserForSuite,
} from './helpers/playwright-browser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');

const VIEWPORT = { width: 375, height: 812 };

async function measure(exerciseCount) {
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: VIEWPORT });
  const rows = Array.from({ length: exerciseCount }, (_, index) => (
    `<div class="sb-ex" data-row="${index}" style="min-height:64px">Упражнение ${index + 1}</div>`
  )).join('');
  await page.setContent(`
    <style>
      body { margin: 0; }
      ${CSS}
    </style>
    <div id="heys-fullscreen-strength">
      <div class="heys-fullscreen" role="dialog" aria-modal="true">
        <div class="sb-root sb-builder-screen is-exercise-open">
          <header class="sb-head"><button class="sb-icon-btn">✕</button><div class="sb-head-title"><b>Силовая · грудь, спина, плечи</b><div class="sb-head-sub">пн, 8 авг · начата в 18:40</div></div><button class="sb-icon-btn">⋯</button></header>
          <div class="sb-stats"><span class="sb-stat">47:12</span><span class="sb-stat">10 / 23 ✓</span></div>
          <section class="sb-list" data-list>${rows}<div class="sb-tier">Очередь отправки</div></section>
          <footer class="sb-panel" data-panel><button class="sb-panel-add">Добавить упражнение</button><button class="sb-finish">Завершить тренировку</button></footer>
        </div>
      </div>
    </div>
  `);
  // Тело страницы фиксируется ядром слоя ровно так, как здесь: пока слой открыт,
  // фон не прокручивается, поэтому упавшая ниже экрана панель недостижима.
  await page.evaluate(() => {
    document.body.style.position = 'fixed';
    document.body.style.top = '0px';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  });
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    const list = document.querySelector('[data-list]');
    return {
      root: rect('.sb-root'),
      panel: rect('[data-panel]'),
      list: rect('[data-list]'),
      listScrolls: list.scrollHeight > list.clientHeight,
      rootPosition: getComputedStyle(document.querySelector('.sb-root')).position,
    };
  });
  await page.close();
  return geometry;
}

describe('нижняя панель силовой сессии остаётся на экране', { timeout: 90_000, hookTimeout: 60_000 }, () => {
  beforeAll(() => {
    retainPlaywrightBrowserForSuite();
  });

  afterAll(async () => {
    await releasePlaywrightBrowserForSuite();
  }, 90_000);

  it('корень слоя позиционирован: `inset: 0` и `z-index` без этого не работают', () => {
    expect(CSS).toMatch(/\.sb-root \{[\s\S]*?\n {2}position: fixed;\n {2}inset: 0;\n {2}z-index: 9000;/);
  });

  for (const count of [3, 7, 14]) {
    it(`${count} упражнений: панель внутри экрана, список прокручивается сам`, { timeout: 90_000 }, async () => {
      const geometry = await measure(count);
      expect(geometry.rootPosition).toBe('fixed');
      expect(geometry.root.height).toBe(VIEWPORT.height);
      expect(geometry.panel.bottom).toBeLessThanOrEqual(VIEWPORT.height + 0.5);
      expect(geometry.panel.height).toBeGreaterThan(0);
      expect(geometry.list.bottom).toBeLessThanOrEqual(geometry.panel.top + 0.5);
    });
  }

  it('длинная сессия прокручивается внутри списка, а не уводит панель за экран', async () => {
    const geometry = await measure(14);
    expect(geometry.listScrolls).toBe(true);
  });
});
