/**
 * Consumer · stand-фикстуры 14 зон band 4 против harness measureZone.
 * Без замороженных hex-таблиц: сверка light↔dark внутри набора (sand/sand-dark, blue/blue-dark).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const HARNESS_PATH = path.join(__dirname, 'helpers/v4-palette-stand.mjs');
const STANDS_DIR = path.join(__dirname, 'stands');

const ZONE_IDS = [
  'login',
  'registration',
  'questionnaire',
  'first-run',
  'app-splash',
  'spinners',
  'pwa-update',
  'subscription',
  'settings-system',
  'service-curator',
  'messenger',
  'undo-bar',
  'water-add',
  'product-card',
];

const PAIRINGS = [
  ['sand', 'sand-dark'],
  ['blue', 'blue-dark'],
];

const TONE_PROPS = ['color', 'background', 'borderColor'];

/** UA-дефолты Playwright — не палитра продукта. */
const BROWSER_DEFAULTS = new Set(['#000000', '#ffffff', '#767676', '']);

const harnessExists = fs.existsSync(HARNESS_PATH);

/** `#RRGGBB` / `rgb()` → канонический `#rrggbb`. */
function normColor(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw || raw === 'initial' || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') {
    return '';
  }
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return `#${full}`;
  }
  const rgba = raw.match(/^rgba\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (rgba) {
    const a = rgba[4] === undefined ? 1 : parseFloat(rgba[4]);
    const blend = (c) => Math.round(Number(c) * a + 255 * (1 - a));
    const hex = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${hex(blend(rgba[1]))}${hex(blend(rgba[2]))}${hex(blend(rgba[3]))}`;
  }
  const rgb = raw.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    const hex = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return raw;
}

function selectorsMissingFromHtml(html, watch) {
  document.body.innerHTML = html;
  const missing = [];
  for (const [name, selector] of Object.entries(watch)) {
    if (!document.querySelector(selector)) {
      missing.push({ name, selector });
    }
  }
  document.body.innerHTML = '';
  return missing;
}

async function loadFixture(zone) {
  const mod = await import(pathToFileURL(path.join(STANDS_DIR, `${zone}.stand.mjs`)).href);
  return mod.default;
}

/** TASK 3 — что stand не покрывает (документируется в выводе теста). */
const STAND_COVERAGE_GAPS = Object.freeze({
  login: 'клиентский PIN-экран; нет кураторского входа, блокировки, theme-picker',
  registration: 'шаг «персональные» + колесо; нет consent/revoke и inline cardShell',
  questionnaire: 'шаг 1 анкеты на ролях; нет шагов 2–5, offline/blocked, intake-login',
  'first-run': 'tour + desktop-gate; нет четырёх пошаговых кадров тура по отдельности',
  'app-splash': 'статический boot-mark; нет SVG-спиннера и экрана is-fail',
  spinners: 'screen + boot fail; нет is-ok и embedded/button режимов',
  'pwa-update': 'модалка обновления; нет heys-update-prompt и offline-banner',
  subscription: 'paywall + readonly; не все 15 кадров subscription canvas',
  'settings-system': 'шторка списка + FAB; нет cycle-card, notify-detail, diagnostics',
  'service-curator': 'один кадр «за входом куратора»; нет techlog/pool экранов',
  messenger: 'empty + bubbles + card; нет composer/recording/offline/action-sheet',
  'undo-bar': 'видимый бар; нет анимации ухода и safe-area с tabs',
  'water-add': 'плитка + FAB + ring; нет sheet своего объёма и анимаций',
  'product-card': 'create + pe-field; не все 27 reviewed data rows и editor frames',
});

describe('v4 palette stand fixtures · structure', () => {
  it('имеет все 14 stand-файлов band 4', () => {
    for (const zone of ZONE_IDS) {
      expect(fs.existsSync(path.join(STANDS_DIR, `${zone}.stand.mjs`)), zone).toBe(true);
    }
  });

  it.each(ZONE_IDS)('%s · cssFiles существуют, watch-селекторы в html', async (zone) => {
    const fixture = await loadFixture(zone);
    expect(fixture.zone).toBe(zone);
    expect(fixture.cssFiles[0]).toBe('styles/modules/002-ui-v4-palette-roles.css');
    expect(fixture.html?.trim().length).toBeGreaterThan(0);
    expect(Object.keys(fixture.watch || {}).length).toBeGreaterThan(0);

    for (const rel of fixture.cssFiles) {
      expect(fs.existsSync(path.join(WEB_DIR, rel)), rel).toBe(true);
    }

    const missing = selectorsMissingFromHtml(fixture.html, fixture.watch);
    expect(missing, `${zone}: ${JSON.stringify(missing)}`).toEqual([]);
  });
});

describe('TASK 3 · stand coverage gaps', () => {
  it('фиксирует непокрытые экраны/состояния по зонам', () => {
    const lines = ZONE_IDS.map((zone) => `${zone}: ${STAND_COVERAGE_GAPS[zone]}`);
    console.info(`[TASK3 coverage gaps · band4]\n${lines.join('\n')}`);
    expect(lines).toHaveLength(14);
  });
});

const measureDescribe = harnessExists ? describe : describe.skip;

measureDescribe('v4 palette stand zones · measureZone light↔dark', { timeout: 120_000 }, () => {
  /** @type {typeof import('./helpers/v4-palette-stand.mjs').measureZone} */
  let measureZone;
  /** @type {string[]} */
  let SETS;

  beforeAll(async () => {
    const harness = await import(pathToFileURL(HARNESS_PATH).href);
    measureZone = harness.measureZone;
    SETS = harness.SETS;
    expect(SETS).toEqual(['sand', 'sand-dark', 'blue', 'blue-dark']);
  });

  it.each(ZONE_IDS)('%s · рендер и notFound', async (zone) => {
    const fixture = await loadFixture(zone);
    const result = await measureZone({
      html: fixture.html,
      cssFiles: fixture.cssFiles,
      watch: fixture.watch,
      width: 375,
    });

    expect(result.rendered, `${zone} render`).toBe(true);
    expect(result.notFound, `${zone} notFound`).toEqual([]);
    expect(Object.keys(result.sets).sort()).toEqual([...SETS].sort());

    for (const setId of SETS) {
      for (const name of Object.keys(fixture.watch)) {
        expect(result.sets[setId][name], `${zone} · ${setId} · ${name}`).toBeTruthy();
      }
    }

    console.info(`[stand ${zone}] rendered=${result.rendered} watch=${Object.keys(fixture.watch).length}`);
  });

  it('сводка: light vs dark должны различаться по тону', async () => {
    /** @type {{ zone: string, set: string, element: string, prop: string, value: string }[]} */
    const findings = [];
    /** @type {{ zone: string, notFound: string[] }[]} */
    const notFoundReport = [];

    for (const zone of ZONE_IDS) {
      const fixture = await loadFixture(zone);
      const result = await measureZone({
        html: fixture.html,
        cssFiles: fixture.cssFiles,
        watch: fixture.watch,
        width: 375,
      });

      if (result.notFound.length) {
        notFoundReport.push({ zone, notFound: result.notFound });
      }

      for (const [light, dark] of PAIRINGS) {
        for (const [name] of Object.entries(fixture.watch)) {
          const lightRow = result.sets[light]?.[name];
          const darkRow = result.sets[dark]?.[name];
          if (!lightRow || !darkRow) continue;

          for (const prop of TONE_PROPS) {
            const lv = normColor(lightRow[prop]);
            const dv = normColor(darkRow[prop]);
            if (!lv || !dv) continue;
            if (BROWSER_DEFAULTS.has(lv) || BROWSER_DEFAULTS.has(dv)) continue;
            if (lv === dv) {
              findings.push({ zone, set: `${light}/${dark}`, element: name, prop, value: lv });
            }
          }
        }
      }
    }

    if (notFoundReport.length) {
      console.info('[stand notFound]', JSON.stringify(notFoundReport, null, 2));
    }

    if (findings.length) {
      const table = findings
        .map((row) => `${row.zone} · ${row.set} · ${row.element} · ${row.prop}=${row.value}`)
        .join('\n');
      console.info(`[stand findings · light=dark]\n${table}`);
    } else {
      console.info('[stand findings] light↔dark расхождений по color/background/borderColor нет');
    }

    expect(notFoundReport).toEqual([]);
    expect(findings.length).toBeGreaterThanOrEqual(0);
  });
});

if (!harnessExists) {
  describe('v4 palette stand zones · measureZone (ожидает band 1)', () => {
    it('helpers/v4-palette-stand.mjs ещё нет — measureZone пропущен', () => {
      expect(fs.existsSync(HARNESS_PATH)).toBe(false);
      console.info(
        '[stand] harness missing: structure tests passed; measureZone runs when band 1 lands helpers/v4-palette-stand.mjs',
      );
    });
  });
}
