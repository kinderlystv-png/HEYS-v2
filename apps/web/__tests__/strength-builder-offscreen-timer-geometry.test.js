import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { afterAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');

let browser;
let browserPromise;

async function getBrowser() {
  if (browser) return browser;
  browserPromise ||= chromium.launch({ headless: true });
  browser = await browserPromise;
  return browser;
}

afterAll(async () => {
  await browser?.close();
});

async function renderCards() {
  const page = await (await getBrowser()).newPage({ viewport: { width: 375, height: 812 } });
  await page.setContent(`
    <style>${CSS}</style>
    <main style="padding:12px">
      <section class="sb-card sb-offscreen-session sb-offscreen-session--resume" data-resume>
        <div class="sb-offscreen-copy"><b>Тренировка продолжается · 52:14</b><span>последняя отметка в 19:24 · Жим гантелей 2 из 3</span></div>
        <button class="sb-offscreen-primary">Вернуться в тренировку</button>
      </section>
      <section class="sb-card sb-offscreen-session sb-offscreen-session--stale" data-stale>
        <div class="sb-offscreen-eyebrow">Вчерашняя не закрыта</div>
        <div class="sb-offscreen-copy"><b>Тренировка 9 августа</b><span>таймер остановлен на последней отметке в 19:24, чтобы не мотать всю ночь</span></div>
        <div class="sb-offscreen-actions"><button>удалить</button><button>дописать</button><button class="is-close">закрыть</button></div>
        <div class="sb-offscreen-note">Таймер привязан к подходу, который его запустил, а не к тому, что открыто на экране.</div>
      </section>
    </main>
  `);
  return page;
}

// Запуск Chromium и отрисовка макета не укладываются в пятисекундный лимит
// vitest по умолчанию: набор меряет живую геометрию, а не читает исходник.
describe('strength builder offscreen timer geometry at 375x812', { timeout: 45_000 }, () => {
  it('keeps the restart surface compact and its primary action 48px tall', async () => {
    const page = await renderCards();
    const geometry = await page.evaluate(() => {
      const card = document.querySelector('[data-resume]');
      const copy = card.querySelector('.sb-offscreen-copy');
      const title = copy.querySelector('b');
      const meta = copy.querySelector('span');
      const button = card.querySelector('button');
      return {
        cardWidth: card.getBoundingClientRect().width,
        gap: getComputedStyle(copy).gap,
        titleSize: getComputedStyle(title).fontSize,
        metaSize: getComputedStyle(meta).fontSize,
        buttonHeight: button.getBoundingClientRect().height,
        buttonMarginTop: getComputedStyle(button).marginTop,
      };
    });
    expect(geometry.cardWidth).toBeLessThanOrEqual(351);
    expect(geometry.gap).toBe('3px');
    expect(geometry.titleSize).toBe('13px');
    expect(geometry.metaSize).toBe('11px');
    expect(geometry.buttonHeight).toBeGreaterThanOrEqual(48);
    expect(geometry.buttonMarginTop).toBe('12px');
    await page.close();
  });

  it('keeps all three stale-session actions equal, reachable and on one row', async () => {
    const page = await renderCards();
    const geometry = await page.evaluate(() => {
      const card = document.querySelector('[data-stale]');
      const row = card.querySelector('.sb-offscreen-actions');
      const buttons = Array.from(row.querySelectorAll('button')).map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, width: rect.width, height: rect.height };
      });
      return {
        cardRight: card.getBoundingClientRect().right,
        rowRight: row.getBoundingClientRect().right,
        gap: getComputedStyle(row).gap,
        marginTop: getComputedStyle(row).marginTop,
        buttons,
      };
    });
    expect(geometry.rowRight).toBeLessThanOrEqual(geometry.cardRight + 0.5);
    expect(geometry.gap).toBe('7px');
    expect(geometry.marginTop).toBe('12px');
    expect(new Set(geometry.buttons.map((button) => button.top)).size).toBe(1);
    expect(Math.max(...geometry.buttons.map((button) => button.width))
      - Math.min(...geometry.buttons.map((button) => button.width))).toBeLessThan(1);
    for (const button of geometry.buttons) expect(button.height).toBeGreaterThanOrEqual(44);
    await page.close();
  });
});
