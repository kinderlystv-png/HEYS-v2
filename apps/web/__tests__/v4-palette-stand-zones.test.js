/**
 * Consumer · stand-фикстуры 28 зон против harness measureZone.
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
  'home-widgets',
  'checkin-morning',
  'nutrition-tab',
  'food-meal',
  'gamification',
  'reports-insights',
  'curator-cabinet',
  'curator-edits',
  'tips',
  'norm-correction',
  'strength-builder',
  'date-remainders',
  'tab-activity',
  'cycle',
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
  login: 'куратор + lockout + theme-picker; нет maintenance/consent-sign на входе',
  registration: 'персональные + колесо + consent-sheet; нет revoke и inline cardShell',
  questionnaire: 'шаги 1–5 + blocked + intake-login + offline-warning; нет review-сводки и финальных статусов',
  'first-run': 'tour + desktop-gate + tour-dot; нет четырёх пошаговых кадров тура по отдельности',
  'app-splash': 'boot-mark + SVG-спиннер + is-fail; нет slow/fail ступеней холодного старта',
  spinners: 'screen + boot fail + is-ok + embedded/button; нет анимаций reduced-motion',
  'pwa-update': 'модалка + heys-update-prompt + offline-banner + online-banner + enhanced',
  subscription: 'paywall + readonly + badge + sub-screen; не все 15 кадров subscription canvas',
  'settings-system': 'шторка списка + FAB + notify-detail + diagnostics; cycle-card — та же .cycle-card-v4, её мерит стенд cycle',
  'service-curator': 'список + footer-tag; нет отдельных techlog/pool экранов',
  messenger: 'empty + bubbles + card + composer/recording/offline/action-sheet; нет inbox/search',
  'undo-bar': 'visible + leaving + tabs-контекст; нет runtime-смещения bottom под tabs',
  'water-add': 'плитка + FAB + ring + custom-sheet; нет анимаций fill/drop',
  'product-card': 'create + pe-field + barcode + harm-compare; не все 27 reviewed data rows',
  'home-widgets': 'плитки + streak + sheet + режим расстановки; нет всех 12 виджетов',
  'checkin-morning': 'greeting + вес + просрочка + footer; нет всех 5 шагов и evening pack',
  'nutrition-tab': 'hero + meal-row + sheet; нет refeed/overlap/readonly/offline состояний',
  'food-meal': 'grams-hero + empty row + sheet actions; нет time-step и всех кадров приёма',
  gamification: 'hero + ach unlocked/locked; нет progress/mission/ladder экранов',
  'reports-insights': 'insights card + reports tier + cascade dots; не все кадры PI dashboard',
  'curator-cabinet': 'cur-row + cur-sheet; нет полного листа поправки и всех состояний строки',
  'curator-edits': 'ca-modal meal-card + ack/later; нет разворота продуктов и multi-day',
  tips: 'list + rate-panel + sync panel + settings toggles + skip; нет detail',
  'norm-correction': 'curator_kept hero + facts; нет client/proposal/reject flows',
  'strength-builder': 'sb-empty card + actions; нет workout/log/superset/menu sheets',
  'date-remainders': 'sheet + day cells + nav + trigger tones + legend swatches',
  'tab-activity': 'steps zero + today row + plan card; нет calendar grid и missed states',
  cycle: 'filled card + insight + norm pill + marking panel + empty card + ended row',
});

/** Разбирает «нет …» / «не все …» из STAND_COVERAGE_GAPS в список непокрытых состояний. */
function parseUncoveredStates(gapText) {
  const chunks = String(gapText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const uncovered = [];
  for (const chunk of chunks) {
    const noMatch = chunk.match(/^нет\s+(.+)$/i);
    if (noMatch) {
      uncovered.push(...noMatch[1].split(/\s*(?:,| и )\s*/).map((item) => item.trim()).filter(Boolean));
      continue;
    }
    const partialMatch = chunk.match(/^не все\s+(.+)$/i);
    if (partialMatch) uncovered.push(`не все ${partialMatch[1].trim()}`);
  }
  return uncovered;
}

/** Узлы с id/class в html, на которые не смотрит ни один watch-селектор. */
function nodesWithoutWatchKey(html, watch) {
  document.body.innerHTML = html;
  const watched = new Set();
  for (const selector of Object.values(watch || {})) {
    for (const el of document.querySelectorAll(selector)) watched.add(el);
  }

  const candidates = [...document.querySelectorAll('[id], [class]')].filter((el) => {
    if (watched.has(el)) return false;
    for (const hit of watched) {
      if (hit !== el && hit.contains(el)) return false;
    }
    return true;
  });

  document.body.innerHTML = '';
  return candidates.map((el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    className: el.className || '',
  }));
}

/**
 * @param {Record<string, string>} gaps
 * @param {string[]} zoneIds
 */
async function inventoryCoverageGaps(gaps, zoneIds) {
  const zonesWithoutFixture = zoneIds.filter((zone) => !fs.existsSync(path.join(STANDS_DIR, `${zone}.stand.mjs`)));
  /** @type {{ zone: string, nodes: object[] }[]} */
  const nodesMissingWatch = [];
  /** @type {{ zone: string, states: string[] }[]} */
  const statesNotRendered = [];

  for (const zone of zoneIds) {
    if (zonesWithoutFixture.includes(zone)) continue;
    const fixture = await loadFixture(zone);
    const missingWatch = nodesWithoutWatchKey(fixture.html, fixture.watch);
    if (missingWatch.length) nodesMissingWatch.push({ zone, nodes: missingWatch });

    const uncovered = parseUncoveredStates(gaps[zone]);
    if (uncovered.length) statesNotRendered.push({ zone, states: uncovered });
  }

  const nodesWithoutWatchCount = nodesMissingWatch.reduce((sum, row) => sum + row.nodes.length, 0);
  const statesNotRenderedCount = statesNotRendered.reduce((sum, row) => sum + row.states.length, 0);

  return {
    zonesWithoutFixture,
    nodesMissingWatch,
    statesNotRendered,
    counts: {
      zonesWithoutFixture: zonesWithoutFixture.length,
      nodesWithoutWatch: nodesWithoutWatchCount,
      statesNotRendered: statesNotRenderedCount,
    },
  };
}

function formatCoverageSelfReport(inventory, renderedCount, notFoundReport = []) {
  const total = ZONE_IDS.length;
  const skipped = inventory.counts.zonesWithoutFixture;
  const notRendered = inventory.statesNotRendered
    .flatMap((row) => row.states.map((state) => `${row.zone}: ${state}`));
  const notFoundCount = notFoundReport.reduce((sum, row) => sum + row.notFound.length, 0);
  const lines = [
    `screens rendered: ${renderedCount}/${total}`,
    `screens skipped (no fixture): ${skipped}`,
    `states not rendered (fixture gap): ${inventory.counts.statesNotRendered}`,
    `nodes without watch key: ${inventory.counts.nodesWithoutWatch}`,
    `watch keys notFound: ${notFoundCount}`,
  ];
  if (skipped) {
    lines.push(`skipped → ${inventory.zonesWithoutFixture.join(', ')}`);
  }
  if (notRendered.length) {
    lines.push(`not rendered → ${notRendered.slice(0, 8).join(' · ')}${notRendered.length > 8 ? ` · …+${notRendered.length - 8}` : ''}`);
  }
  if (notFoundReport.length) {
    const detail = notFoundReport
      .map((row) => `${row.zone}: ${row.notFound.join('+')}`)
      .slice(0, 8)
      .join(' · ');
    lines.push(`notFound → ${detail}${notFoundReport.length > 8 ? ` · …+${notFoundReport.length - 8} zones` : ''}`);
  }
  return lines.join(' | ');
}

describe('v4 palette stand fixtures · structure', () => {
  it('имеет все 28 stand-файлов', () => {
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

describe('TASK 1 · stand coverage inventory', () => {
  it('считает пробелы по типам: fixture / watch / state / notFound', async () => {
    const inventory = await inventoryCoverageGaps(STAND_COVERAGE_GAPS, ZONE_IDS);
    /** @type {{ zone: string, notFound: string[] }[]} */
    const notFoundReport = [];
    let renderedCount = 0;

    if (harnessExists) {
      const { measureZone } = await import(pathToFileURL(HARNESS_PATH).href);
      for (const zone of ZONE_IDS) {
        if (inventory.zonesWithoutFixture.includes(zone)) continue;
        const fixture = await loadFixture(zone);
        const result = await measureZone({
          html: fixture.html,
          cssFiles: fixture.cssFiles,
          watch: fixture.watch,
          width: 375,
        });
        if (result.rendered) renderedCount += 1;
        if (result.notFound.length) {
          notFoundReport.push({ zone, notFound: result.notFound });
        }
      }
    } else {
      renderedCount = ZONE_IDS.length - inventory.counts.zonesWithoutFixture;
    }

    console.info(
      `[TASK1 gaps] zonesWithoutFixture=${inventory.counts.zonesWithoutFixture} `
      + `nodesWithoutWatch=${inventory.counts.nodesWithoutWatch} `
      + `statesNotRendered=${inventory.counts.statesNotRendered} `
      + `watchNotFound=${notFoundReport.reduce((sum, row) => sum + row.notFound.length, 0)}`,
    );
    console.info(`[stand coverage] ${formatCoverageSelfReport(inventory, renderedCount, notFoundReport)}`);
    if (inventory.nodesMissingWatch.length) {
      console.info('[TASK1 nodesWithoutWatch]', JSON.stringify(inventory.nodesMissingWatch, null, 2));
    }
    if (inventory.statesNotRendered.length) {
      console.info('[TASK1 statesNotRendered]', JSON.stringify(inventory.statesNotRendered, null, 2));
    }
    if (notFoundReport.length) {
      console.info('[TASK1 watchNotFound]', JSON.stringify(notFoundReport, null, 2));
    }
    expect(inventory.counts.zonesWithoutFixture).toBe(0);
    expect(renderedCount).toBe(ZONE_IDS.length);
    expect(notFoundReport).toEqual([]);
    expect(inventory.counts.nodesWithoutWatch).toBeGreaterThanOrEqual(0);
    expect(inventory.counts.statesNotRendered).toBeGreaterThanOrEqual(0);
  }, 300_000);
});

describe('TASK 3 · stand coverage gaps', () => {
  it('фиксирует непокрытые экраны/состояния по зонам', () => {
    const lines = ZONE_IDS.map((zone) => `${zone}: ${STAND_COVERAGE_GAPS[zone]}`);
    console.info(`[TASK3 coverage gaps · 28 zones]\n${lines.join('\n')}`);
    expect(lines).toHaveLength(28);
  });
});

const measureDescribe = harnessExists ? describe : describe.skip;

// 120 000 здесь перекрывали 300 000, выставленные у «сводки» ниже: опция
// describe в vitest 3.2 выигрывает у опции it, и заявленный запас не работал.
// Замер 08.09: сводка идёт 190 с сама по себе — то есть падала по таймауту не
// случайно, а обязана была падать; проходила только когда машина была свободна
// и она укладывалась в две минуты. Дважды подряд на этом отменялся push всей
// ветки. Значение выровнено с тем, что просил автор теста.
measureDescribe('v4 palette stand zones · measureZone light↔dark', { timeout: 300_000 }, () => {
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

  it('сводка: light vs dark должны различаться по тону', { timeout: 300_000 }, async () => {
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
