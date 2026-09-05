/**
 * Полоса 4 · задача 114 · tab-activity finding 07: один путь карточки программы.
 * Корень — .activity-v4-program; строка — .activity-v4-program-line; без
 * compact-trainings / program-next-line дневника с CSS-переопределением.
 */
import fs from 'node:fs';
import path from 'node:path';

import { act, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const TRAININGS_SRC = fs.readFileSync(path.join(WEB, 'heys_day_trainings_v1.js'), 'utf8');
const ACTIVITY_SRC = fs.readFileSync(path.join(WEB, 'heys_day_activity_v1.js'), 'utf8');
const TAB_SRC = fs.readFileSync(path.join(WEB, 'heys_day_tab_impl_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/731-ui-v4-activity.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const PALETTE = fs.readFileSync(path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

const originalReact = globalThis.React;

function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function mountTheme(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

function loadDayTrainings() {
  globalThis.React = RealReact;
  globalThis.HEYS = {
    currentClientId: 'client-test-1',
    utils: { lsGet: (_k, fallback) => fallback },
    TrainingKernel: { strength: {} },
    StrengthBuilderParts: {},
  };
  // eslint-disable-next-line no-eval
  eval(TRAININGS_SRC);
  return globalThis.HEYS.dayTrainings;
}

const PROGRAM_ANCHOR = new Date(2026, 7, 12);
const PROGRAM_T0 = '2026-08-12';
const PROGRAM_T1 = '2026-08-13';
const PROGRAM_T2 = '2026-08-14';

function fakeProgramApi(programData, dayBlobs = {}) {
  return {
    async getKV(_clientId, key) {
      if (key === 'heys_training_program') return { data: programData, error: null };
      return { data: null, error: null };
    },
    async getKVBatch(_clientId, keys) {
      return {
        data: keys.filter((key) => dayBlobs[key]).map((key) => ({ k: key, v: dayBlobs[key] })),
        error: null,
      };
    },
  };
}

function twoDayProgram() {
  return fakeProgramApi({
    id: 'pr_1',
    title: 'Верх/низ, 4 недели',
    weeks: 4,
    status: 'active',
    days: [
      { date: PROGRAM_T1, dayLabel: 'Ноги и спина', weekIndex: 1, trainingId: 'tr_1' },
      { date: PROGRAM_T2, dayLabel: 'Грудь и руки', weekIndex: 1, trainingId: 'tr_2' },
    ],
  }, {
    ['heys_dayv2_' + PROGRAM_T1]: { trainings: [{ id: 'tr_1', plan: { status: 'assigned' } }] },
    ['heys_dayv2_' + PROGRAM_T2]: { trainings: [{ id: 'tr_2', plan: { status: 'assigned' } }] },
  });
}

function programBlockSnapshot(container) {
  const root = container.querySelector('.activity-v4-program');
  const line = container.querySelector('.activity-v4-program-line');
  const legacyLine = container.querySelector('.program-next-line');
  const legacyHost = container.querySelector('.compact-trainings');
  const lineStyle = line ? getComputedStyle(line) : null;
  const rootStyle = root ? getComputedStyle(root) : null;
  const key = line?.querySelector('.program-next-key');
  const text = line?.querySelector('.program-next-text');
  const sub = line?.querySelector('.program-next-sub');
  const link = line?.querySelector('.program-next-link');
  const keyStyle = key ? getComputedStyle(key) : null;
  const textStyle = text ? getComputedStyle(text) : null;
  const subStyle = sub ? getComputedStyle(sub) : null;
  const linkStyle = link ? getComputedStyle(link) : null;
  return {
    hasActivityRoot: Boolean(root),
    hasLegacyHost: Boolean(legacyHost),
    hasActivityLine: Boolean(line),
    hasLegacyLine: Boolean(legacyLine),
    rootDisplay: rootStyle?.display || null,
    rootGap: rootStyle?.gap || null,
    rootMarginTop: rootStyle?.marginTop || null,
    linePadding: lineStyle?.padding || null,
    lineRadius: lineStyle?.borderRadius || null,
    lineBorderWidth: lineStyle?.borderWidth || null,
    lineBorderStyle: lineStyle?.borderStyle || null,
    lineBackground: lineStyle?.backgroundColor || null,
    keyFlexDirection: keyStyle?.flexDirection || null,
    keyGap: keyStyle?.gap || null,
    textColor: textStyle?.color || null,
    textFontWeight: textStyle?.fontWeight || null,
    subColor: subStyle?.color || null,
    subFontSize: subStyle?.fontSize || null,
    subLineHeight: subStyle?.lineHeight || null,
    linkColor: linkStyle?.color || null,
  };
}

function baseProgramParams(overrides = {}) {
  return {
    visibleTrainings: 0,
    householdActivities: [],
    trainingTypes: [],
    TR: [],
    kcalMin: [0, 0, 0, 0],
    weight: 80,
    r0: (v) => Math.round(v || 0),
    dateKey: PROGRAM_T0,
    trainingFilterMode: 'program',
    ...overrides,
  };
}

async function renderBothProgramPaths(dt, params) {
  const hostA = document.createElement('div');
  const hostB = document.createElement('div');
  document.body.appendChild(hostA);
  document.body.appendChild(hostB);
  const blockParams = { ...params, trainingFilterMode: 'program' };
  const { trainingFilterMode: _drop, ...canonicalParams } = blockParams;
  const treeA = dt.renderTrainingsBlock(blockParams);
  const treeB = dt.renderActivityProgramBlock(canonicalParams);
  let containerA;
  let containerB;
  await act(async () => {
    ({ container: containerA } = render(treeA, { container: hostA }));
    await Promise.resolve();
  });
  await act(async () => {
    ({ container: containerB } = render(treeB, { container: hostB }));
    await Promise.resolve();
  });
  return { containerA, containerB, hostA, hostB };
}

describe('polosa4 task114 · программа на «Активе» · один путь карточки', () => {
  let styles = [];

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    styles.push(injectCss(PALETTE));
    styles.push(injectCss(BASE_CSS));
    styles.push(injectCss(CSS));
    mountTheme('sand');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    styles.forEach((s) => s.remove());
    styles = [];
    delete globalThis.HEYS;
    globalThis.React = originalReact;
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.body.innerHTML = '';
  });

  it('источник — renderActivityProgramBlock; renderTrainingsBlock(program) — тот же корень', () => {
    const dt = loadDayTrainings();
    expect(typeof dt.renderActivityProgramBlock).toBe('function');
    expect(TRAININGS_SRC).toContain('function renderActivityProgramBlock');
    expect(TRAININGS_SRC).toContain("? 'activity-v4-program'");
    expect(TAB_SRC).toContain('renderActivityProgramBlock');
    expect(TAB_SRC).not.toContain("trainingFilterMode: 'program'");
    expect(ACTIVITY_SRC).not.toContain("className: 'activity-v4-program'\n      }, programTrainingsBlock");
    expect(ACTIVITY_SRC).toContain('programTrainingsBlock,');

    const viaDelegate = dt.renderTrainingsBlock({
      visibleTrainings: 0,
      householdActivities: [],
      trainingTypes: [],
      TR: [],
      kcalMin: [0, 0, 0, 0],
      weight: 80,
      r0: (v) => Math.round(v || 0),
      dateKey: '2026-08-30',
      trainingFilterMode: 'program',
    });
    const viaCanonical = dt.renderActivityProgramBlock({
      visibleTrainings: 0,
      householdActivities: [],
      trainingTypes: [],
      TR: [],
      kcalMin: [0, 0, 0, 0],
      weight: 80,
      r0: (v) => Math.round(v || 0),
      dateKey: '2026-08-30',
    });
    expect(viaDelegate?.props?.className).toBe('activity-v4-program');
    expect(viaCanonical?.props?.className).toBe('activity-v4-program');
  });

  it('computed: корень activity-v4-program, без compact-trainings; строка — activity-v4-program-line', () => {
    const dt = loadDayTrainings();
    const { ProgramNextLine } = dt;

    const host = document.createElement('div');
    document.body.appendChild(host);

    const block = dt.renderActivityProgramBlock({
      visibleTrainings: 0,
      householdActivities: [],
      trainingTypes: [],
      TR: [],
      kcalMin: [0, 0, 0, 0],
      weight: 80,
      r0: (v) => Math.round(v || 0),
      dateKey: '2026-08-30',
    });

    // Подменяем ProgramNextLine внутри блока нельзя — рендерим блок целиком с моком программы через API.
    // Достаточно вложить ProgramNextLine в тот же корень, что и прод.
    const tree = RealReact.createElement('div', { className: 'activity-v4-program' },
      RealReact.createElement(ProgramNextLine, { clientId: 'client-test-1', hasPlanToday: false }),
    );
    const { container } = render(tree, { container: host });

    const snap = programBlockSnapshot(container);
    expect(snap.hasActivityRoot).toBe(true);
    expect(snap.hasLegacyHost).toBe(false);
    expect(snap.rootDisplay).toBe('flex');
    expect(snap.rootGap).toBe('8px');
    expect(snap.rootMarginTop).toBe('12px');

    // ProgramNextLine без данных программы null — проверяем класс на кнопке напрямую.
    expect(TRAININGS_SRC).toContain('activity-v4-program-line');
    expect(TRAININGS_SRC).not.toMatch(/className: 'program-next-line'/);

    const lineBtn = document.createElement('button');
    lineBtn.className = 'activity-v4-program-line';
    lineBtn.innerHTML = '<span class="program-next-key"><span class="program-next-text">t</span>'
      + '<span class="program-next-sub">sub</span></span><span class="program-next-link">link</span>';
    host.querySelector('.activity-v4-program').appendChild(lineBtn);

    const lineSnap = programBlockSnapshot(host);
    expect(lineSnap.hasActivityLine).toBe(true);
    expect(lineSnap.hasLegacyLine).toBe(false);
    expect(lineSnap.linePadding).toBe('13px 16px');
    expect(lineSnap.lineRadius).toBe('20px');
    expect(
      lineSnap.lineBorderWidth === '0px'
      || lineSnap.lineBorderWidth === '0'
      || getComputedStyle(lineBtn).borderStyle === 'none',
    ).toBe(true);
    expect(lineSnap.lineBackground).toMatch(/rgb|#/);

    console.info('[polosa4-task114 computed]', JSON.stringify({ block: snap, line: lineSnap }));
    expect(block?.props?.className).toBe('activity-v4-program');
  });

  it('computed: sand и blue — activity-v4-program-line совпадает по геометрии', () => {
    ['sand', 'blue'].forEach((themeId) => {
      mountTheme(themeId);
      const host = document.createElement('div');
      host.className = 'activity-v4-program';
      document.body.appendChild(host);
      const line = document.createElement('button');
      line.className = 'activity-v4-program-line';
      line.textContent = 'Следующая';
      host.appendChild(line);
      const style = getComputedStyle(line);
      expect(style.padding).toBe('13px 16px');
      expect(style.borderRadius).toBe('20px');
      expect(style.borderStyle === 'none' || style.borderWidth === '0px').toBe(true);
      host.remove();
    });
  });

  it('базовый .program-next-line дневника не тронут — второй путь только на «Активе»', () => {
    const at = BASE_CSS.indexOf('.program-next-line {');
    expect(at).toBeGreaterThan(-1);
    const body = BASE_CSS.slice(at, BASE_CSS.indexOf('}', at));
    expect(body).toContain('border-radius: 12px');
    expect(CSS).toContain('.activity-v4-program-line {');
    expect(CSS).not.toContain('.activity-v4-program .program-next-line {');
  });

  describe('finding 07 · computed в обоих путях рендера', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(PROGRAM_ANCHOR);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('ProgramNextLine: renderTrainingsBlock(program) и renderActivityProgramBlock — одинаковый computed', async () => {
      const dt = loadDayTrainings();
      globalThis.HEYS.YandexAPI = twoDayProgram();
      const { containerA, containerB } = await renderBothProgramPaths(dt, baseProgramParams());
      const snapA = programBlockSnapshot(containerA);
      const snapB = programBlockSnapshot(containerB);
      expect(snapA).toEqual(snapB);
      expect(snapA.hasActivityLine).toBe(true);
      expect(snapA.hasLegacyHost).toBe(false);
      expect(snapA.hasLegacyLine).toBe(false);
      expect(snapA.rootMarginTop).toBe('12px');
      expect(snapA.lineBorderStyle).toBe('none');
      expect(snapA.keyFlexDirection).toBe('column');
      expect(snapA.keyGap).toBe('3px');
      expect(snapA.subFontSize).toBe('11px');
      expect(snapA.subLineHeight).toMatch(/^1[.]3/);
    }, 10000);

    it('finding 07 строки 16–17: sand и blue — цвета текста/подписи совпадают между путями', async () => {
      const dt = loadDayTrainings();
      globalThis.HEYS.YandexAPI = twoDayProgram();
      for (const themeId of ['sand', 'blue']) {
        mountTheme(themeId);
        const { containerA, containerB } = await renderBothProgramPaths(dt, baseProgramParams());
        const snapA = programBlockSnapshot(containerA);
        const snapB = programBlockSnapshot(containerB);
        expect(snapA.textColor).toBe(snapB.textColor);
        expect(snapA.subColor).toBe(snapB.subColor);
        expect(snapA.linkColor).toBe(snapB.linkColor);
        expect(snapA.textColor).toBeTruthy();
        expect(snapA.linkColor).toBeTruthy();
      }
    }, 15000);

    it('finding 07 строки 13–17: геометрия строки .activity-v4-program-line по контракту', async () => {
      const dt = loadDayTrainings();
      globalThis.HEYS.YandexAPI = twoDayProgram();
      const { containerA } = await renderBothProgramPaths(dt, baseProgramParams());
      const snap = programBlockSnapshot(containerA);
      expect(snap.rootMarginTop).toBe('12px');
      expect(snap.lineBorderStyle).toBe('none');
      expect(snap.keyFlexDirection).toBe('column');
      expect(snap.keyGap).toBe('3px');
      expect(snap.linePadding).toBe('13px 16px');
      expect(snap.lineRadius).toBe('20px');
      expect(snap.textFontWeight).toBe('600');
      expect(snap.subFontSize).toBe('11px');
    }, 10000);
  });
});
