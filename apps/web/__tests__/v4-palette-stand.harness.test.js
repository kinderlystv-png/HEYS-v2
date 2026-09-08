/**
 * Harness parity: measureZone must match messenger-thread-v4-palette chromium path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  normColor,
  measureZone,
} from './helpers/v4-palette-stand.mjs';
import {
  releasePlaywrightBrowserForSuite,
  retainPlaywrightBrowserForSuite,
} from './helpers/playwright-browser.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);
const MESSENGER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
  'utf8',
);

const MESSENGER_HTML = `
  <div class="messenger-thread">
    <button type="button" class="messenger-show-older">older</button>
  </div>
  <div class="msg-bubble msg-bubble-theirs">T</div>
  <div class="msg-bubble msg-bubble-mine">M</div>
  <span class="msg-meta">9:12</span>
  <div class="msg-date-label">Сегодня</div>
  <div class="msg-quote">quote</div>
  <div class="msg-applied-card"><span class="msg-applied-card__title">Внесено</span><button class="msg-applied-card__open">open</button></div>
  <div class="msg-intent"><div class="msg-intent__kicker">вес</div><div class="msg-intent__value">71,4 кг</div></div>
  <div class="messenger-search__field"><input class="messenger-search__input" value="q" /></div>
  <div class="messenger-search__snippet"><mark>hit</mark></div>
  <span class="msg-status msg-status--seen"><span class="msg-status__dot"></span>seen</span>
`;

const MESSENGER_WATCH = {
  'пузырь собеседника': '.msg-bubble-theirs',
  'пузырь мой': '.msg-bubble-mine',
  'мета времени': '.msg-meta',
  'кнопка старых': '.messenger-show-older',
  'цитата': '.msg-quote',
  'карточка внесено': '.msg-applied-card',
  'кнопка открыть': '.msg-applied-card__open',
  'подпись намерения': '.msg-intent__kicker',
  'поле поиска': '.messenger-search__field',
  'подсветка поиска': '.messenger-search__snippet mark',
  'точка статуса': '.msg-status__dot',
};

async function measureChromium(themeId) {
  const { getPlaywrightBrowser } = await import('./helpers/playwright-browser.mjs');
  const page = await (await getPlaywrightBrowser()).newPage({ viewport: { width: 375, height: 812 } });
  const theme = themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId;
  const palette = themeId.startsWith('blue') ? 'blue' : 'sand';
  await page.setContent(`<!DOCTYPE html><html data-theme-id="${themeId}" data-palette="${palette}" data-theme="${theme}"><head><meta charset="utf-8"><style>${PALETTE_CSS}\n${MESSENGER_CSS}</style></head>
<body style="margin:0;width:375px">${MESSENGER_HTML}</body></html>`, { waitUntil: 'domcontentloaded' });
  const out = await page.evaluate(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const norm = (v) => String(v || '').replace(/\s/g, '');
    return {
      theirsBg: read('.msg-bubble-theirs', 'backgroundColor'),
      mineBg: read('.msg-bubble-mine', 'backgroundColor'),
      metaRaw: norm(read('.msg-meta', 'color')),
      showOlderBg: read('.messenger-show-older', 'backgroundColor'),
      quoteBorder: read('.msg-quote', 'borderLeftColor'),
      appliedBg: read('.msg-applied-card', 'backgroundColor'),
      appliedOpen: read('.msg-applied-card__open', 'color'),
      intentKicker: read('.msg-intent__kicker', 'color'),
      searchInputBg: read('.messenger-search__field', 'backgroundColor'),
      searchMark: read('.messenger-search__snippet mark', 'color'),
      seenDot: read('.msg-status__dot', 'backgroundColor'),
    };
  });
  await page.close();
  return out;
}

const FIELD_MAP = [
  ['пузырь собеседника', 'theirsBg', 'background'],
  ['пузырь мой', 'mineBg', 'background'],
  ['мета времени', 'metaRaw', 'color', true],
  ['кнопка старых', 'showOlderBg', 'background'],
  ['цитата', 'quoteBorder', 'borderColor'],
  ['карточка внесено', 'appliedBg', 'background'],
  ['кнопка открыть', 'appliedOpen', 'color'],
  ['подпись намерения', 'intentKicker', 'color'],
  ['поле поиска', 'searchInputBg', 'background'],
  ['подсветка поиска', 'searchMark', 'color'],
  ['точка статуса', 'seenDot', 'background'],
];

describe('v4 palette stand harness', () => {
  beforeAll(() => {
    retainPlaywrightBrowserForSuite();
  });

  afterAll(async () => {
    await releasePlaywrightBrowserForSuite();
  });

  it('measureZone совпадает с messenger chromium @375 (sand + blue)', async () => {
    const stand = await measureZone({
      html: MESSENGER_HTML,
      cssFiles: [
        'styles/modules/002-ui-v4-palette-roles.css',
        'styles/modules/1000-messenger.css',
      ],
      watch: MESSENGER_WATCH,
    });

    expect(stand.rendered).toBe(true);
    expect(stand.notFound).toEqual([]);

    for (const themeId of ['sand', 'blue']) {
      const legacy = await measureChromium(themeId);
      for (const [watchKey, legacyKey, prop, rawColor] of FIELD_MAP) {
        const measured = stand.sets[themeId][watchKey][prop];
        const legacyVal = legacy[legacyKey];
        if (rawColor) {
          expect(String(measured).replace(/\s/g, ''), `${themeId} ${watchKey}`).toBe(legacyVal);
        } else {
          expect(normColor(measured), `${themeId} ${watchKey}`).toBe(normColor(legacyVal));
        }
      }
    }
  }, 60_000);
});
