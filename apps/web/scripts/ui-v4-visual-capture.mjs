#!/usr/bin/env node
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

import {
  CANVAS_PACK_DIR,
  parseCanvasHtml,
  resolveCanvasFrame,
} from '../../../scripts/lib/ui-v4-canvas-index.mjs';

import {
  buildUiV4VisualSnapshot,
  UI_V4_CANVAS_ZONES,
  UI_V4_DOM_GATE_ZONES,
  UI_V4_PIXEL_GATE_ZONES,
  UI_V4_VISUAL_CASES,
  UI_V4_VISUAL_CLOCK,
} from './ui-v4-visual-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const APP_ORIGIN = process.env.HEYS_UI_V4_URL || 'http://localhost:3001';
const BASELINE_DIR = path.join(ROOT, 'apps', 'web', '__screenshots__', 'ui-v4');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join(ROOT, 'tmp', 'ui-v4-visual', RUN_ID);
const VERDICTS_DIR = path.join(ROOT, 'docs', 'ui', 'verdicts');
const LOCAL_FIGTREE_PATH = path.join(
  ROOT,
  'apps',
  'web',
  'public',
  'fonts',
  'figtree',
  'Figtree-Variable.ttf',
);
const DRIFT_SCRIPT = path.join(ROOT, 'scripts', 'ui-v4-check-contract-drift.mjs');
const cliArgs = process.argv.slice(2);
const args = new Set(cliArgs);
const requestedCaseId =
  cliArgs.find((arg) => arg.startsWith('--case='))?.slice('--case='.length) || '';
const requestedZoneId =
  cliArgs.find((arg) => arg.startsWith('--zone='))?.slice('--zone='.length) || '';
const mode = args.has('--check')
  ? 'check'
  : args.has('--verify')
    ? 'verify'
    : args.has('--update-baselines')
      ? 'update-baselines'
      : 'capture';

function validateManifest() {
  // Вердикты лежат по файлу на зону — см. scripts/lib/ui-v4-verdicts.mjs.
  const registryZones = fs.readdirSync(VERDICTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();
  const manifestZones = [...UI_V4_CANVAS_ZONES].sort();
  const problems = [];

  if (JSON.stringify(registryZones) !== JSON.stringify(manifestZones)) {
    problems.push(`Список зон расходится с ${path.relative(ROOT, VERDICTS_DIR)}.`);
  }

  const ids = new Set();
  const covered = new Set();
  for (const item of UI_V4_VISUAL_CASES) {
    if (ids.has(item.id)) problems.push(`Повтор id: ${item.id}`);
    ids.add(item.id);
    covered.add(item.zone);
    if (!UI_V4_CANVAS_ZONES.includes(item.zone)) problems.push(`Неизвестная зона: ${item.zone}`);
    if (item.status === 'automated' && !item.rootSelector) {
      problems.push(`Автоматический сценарий ${item.id} не имеет rootSelector.`);
    }
    if (item.canvasFrame) {
      for (const field of ['file', 'label', 'oid', 'palette']) {
        if (!String(item.canvasFrame[field] || '').trim()) {
          problems.push(`Canvas-привязка ${item.id} не имеет поля ${field}.`);
        }
      }
      if (!item.captureSelector) {
        problems.push(`Парный сценарий ${item.id} не имеет уникального captureSelector.`);
      }
      const canvasPath = path.join(CANVAS_PACK_DIR, item.canvasFrame.file || '');
      if (!fs.existsSync(canvasPath)) {
        problems.push(`Canvas-файл ${item.id} не найден: ${path.relative(ROOT, canvasPath)}.`);
      } else {
        try {
          const canvas = parseCanvasHtml(fs.readFileSync(canvasPath, 'utf8'), {
            file: item.canvasFrame.file,
          });
          resolveCanvasFrame(canvas, item.canvasFrame);
        } catch (error) {
          problems.push(`Canvas-привязка ${item.id} неоднозначна: ${error?.message || error}`);
        }
      }
    }
    if (item.status === 'scenario-pending' && !item.reason) {
      problems.push(`Ожидающий сценарий ${item.id} не объясняет причину.`);
    }
    if (item.status === 'dom-gate' && !UI_V4_DOM_GATE_ZONES.includes(item.zone)) {
      problems.push(`DOM-гейт назначен неподходящей зоне: ${item.zone}`);
    }
    if (item.gate === 'pixel' && !UI_V4_PIXEL_GATE_ZONES.includes(item.zone)) {
      problems.push(`Pixel-gate включён до сведения зоны: ${item.zone}`);
    }
  }

  for (const zone of UI_V4_CANVAS_ZONES) {
    if (!covered.has(zone)) problems.push(`Зона без записи в manifest: ${zone}`);
  }

  return { problems, registryZones };
}

function assertPixelGateContracts(items) {
  const zones = [...new Set(items.filter((item) => item.gate === 'pixel').map((item) => item.zone))];
  if (!zones.length) return;
  const result = spawnSync(
    process.execPath,
    [DRIFT_SCRIPT, ...zones.flatMap((zone) => ['--zone', zone])],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Pixel-gate запрещён: сначала сведите вердикты зон ${zones.join(', ')}.\n${result.stdout || ''}${result.stderr || ''}`,
    );
  }

  const unresolved = zones.flatMap((zone) =>
    Object.entries(
      JSON.parse(fs.readFileSync(path.join(VERDICTS_DIR, `${zone}.json`), 'utf8')).rows || {},
    )
      .filter(([, row]) => row?.v !== '=' && row?.v !== '—')
      .map(([key, row]) => `${zone} · «${key}» = ${row?.v || 'нет вердикта'}`),
  );
  if (unresolved.length) {
    throw new Error(
      `Pixel-gate запрещён: в зоне остались несовпадения или вопросы:\n${unresolved.join('\n')}`,
    );
  }
}

async function ensureServer() {
  const response = await fetch(`${APP_ORIGIN}/`, { redirect: 'manual' }).catch(() => null);
  if (!response || response.status >= 500) {
    throw new Error(`Локальный web недоступен: ${APP_ORIGIN}. Запустите pnpm dev:local.`);
  }
}

async function installDeterminism(context, item, snapshot) {
  await context.addInitScript(
    ({ fixedEpoch, demoTab, profile, themeId }) => {
      const RealDate = Date;
      class FixedDate extends RealDate {
        constructor(...values) {
          super(...(values.length ? values : [fixedEpoch]));
        }
        static now() {
          return fixedEpoch;
        }
      }
      Object.setPrototypeOf(FixedDate, RealDate);
      window.Date = FixedDate;

      if (demoTab) {
        let demoMode = { enabled: true, gender: 'female', defaultTab: demoTab };
        Object.defineProperty(window, '__HEYS_DEMO_MODE__', {
          configurable: false,
          get: () => demoMode,
          set: (next) => {
            if (next?.enabled === true) demoMode = next;
          },
        });
        window.__HEYS_DEMO_T0__ = fixedEpoch;
        try {
          const clientId = 'demo-client-female';
          localStorage.setItem('heys_pin_auth_client', JSON.stringify(clientId));
          localStorage.setItem('heys_client_current', JSON.stringify(clientId));
          if (themeId) {
            localStorage.setItem('heys_theme_id', themeId);
            localStorage.setItem('heys_theme_mode_pref', themeId.endsWith('-dark') ? 'dark' : 'light');
            localStorage.setItem('heys_theme_explicit', '1');
          }
          if (profile) {
            const serializedProfile = JSON.stringify(profile);
            localStorage.setItem('heys_profile', serializedProfile);
            localStorage.setItem(`heys_${clientId}_profile`, serializedProfile);
          }
          localStorage.setItem(
            `heys_${clientId}_subscription_status`,
            JSON.stringify({ status: 'active', ts: fixedEpoch }),
          );
          window.HEYS = window.HEYS || {};
          window.HEYS.currentClientId = clientId;
        } catch (_) {}
      }
    },
    {
      fixedEpoch: UI_V4_VISUAL_CLOCK.epochMs,
      demoTab: item.kind === 'login' ? null : item.tab || 'widgets',
      profile: item.kind === 'login'
        ? null
        : item.kind === 'demo-registration'
          ? {
              ...snapshot.lsKeys.heys_profile,
              name: '',
              firstName: '',
              lastName: '',
              displayName: '',
              gender: '',
              age: 25,
              birthDate: '2001-01-01',
              profileCompleted: false,
              cycleTrackingEnabled: false,
            }
          : snapshot.lsKeys.heys_profile,
      themeId: item.themeId || null,
    },
  );
}

async function startCanvasServer() {
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  const rootPrefix = `${path.resolve(CANVAS_PACK_DIR)}${path.sep}`;
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/__heys-font/Figtree-Variable.ttf') {
        response.writeHead(200, {
          'content-type': 'font/ttf',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        });
        fs.createReadStream(LOCAL_FIGTREE_PATH).pipe(response);
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target = path.resolve(CANVAS_PACK_DIR, relative);
      if (!target.startsWith(rootPrefix) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(target).pipe(response);
    } catch (_) {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function openCase(browser, item, snapshot) {
  const viewport = item.viewport || { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: item.themeId?.endsWith('-dark') ? 'dark' : 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await installDeterminism(context, item, snapshot);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.route('**/snapshot-*.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(snapshot),
    });
  });

  const url =
    item.kind === 'login'
      ? `${APP_ORIGIN}/`
      : `${APP_ORIGIN}/?gender=female&defaultTab=${encodeURIComponent(item.tab || 'widgets')}`;

  try {
    console.info(`[ui-v4-visual] capture ${item.id}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    if (item.kind !== 'login') {
      await page.waitForFunction(() => localStorage.getItem('heys_profile') !== null, undefined, {
        timeout: 45_000,
      });
      await page.evaluate(({ stubGamificationMerge }) => {
        window.HEYS = window.HEYS || {};
        window.HEYS.currentClientId = 'demo-client-female';
        if (stubGamificationMerge) {
          window.HEYS.YandexAPI = window.HEYS.YandexAPI || {};
          window.HEYS.YandexAPI.mergeSaveKV = async () => ({ success: true });
        }
        const rawProfile = localStorage.getItem('heys_profile');
        if (rawProfile && window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_profile', JSON.parse(rawProfile));
        } else {
          window.HEYS?.store?.invalidate?.('heys_profile');
        }
        window.dispatchEvent(
          new CustomEvent('heys:profile-updated', {
            detail: { source: 'ui-v4-visual-fixture' },
          }),
        );
        window.__heysLoadingProgress?.forceHide?.();
      }, {
        stubGamificationMerge:
          item.kind === 'demo-registration' ||
          item.kind === 'demo-cycle-picker' ||
          item.kind === 'demo-food-copy-empty' ||
          item.kind === 'demo-food-copy-existing',
      });
      const tabLabels = { widgets: 'Главная', diary: 'Питание' };
      const tabLabel = tabLabels[item.tab];
      if (tabLabel) {
        const tabButton = page.getByText(tabLabel, { exact: true }).last();
        const optionalOffer = page.getByText('Замеры тела и добавки', { exact: true });
        await Promise.race([
          tabButton.waitFor({ state: 'attached', timeout: 45_000 }),
          optionalOffer.waitFor({ state: 'visible', timeout: 45_000 }),
        ]);
        await optionalOffer.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
        if (await optionalOffer.isVisible().catch(() => false)) {
          await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
          await optionalOffer.waitFor({ state: 'hidden', timeout: 45_000 });
        }
        await tabButton.waitFor({ state: 'attached', timeout: 45_000 });
        await page.evaluate(() => window.__heysLoadingProgress?.forceHide?.());
        await tabButton.waitFor({ state: 'visible', timeout: 45_000 });
        await tabButton.click();
        if (item.tab === 'diary') {
          await page.locator('.nutrition-v4').waitFor({ state: 'attached', timeout: 45_000 });
          await page.evaluate(() => {
            window.dispatchEvent(
              new CustomEvent('heys:profile-updated', {
                detail: { source: 'ui-v4-visual-fixture-after-mount' },
              }),
            );
          });
        }
      }
    }
    if (item.kind === 'demo-water-custom') {
      await page.waitForFunction(
        () => typeof window.HEYS?.WaterCustomVolume?.open === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate(() => {
        window.HEYS.WaterCustomVolume.open({ onAdd: () => {} });
      });
    }
    if (item.kind === 'demo-cycle-picker') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.dayPickers?.CycleDatePickerSheet === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        let host = document.getElementById('ui-v4-cycle-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'ui-v4-cycle-host';
          document.body.appendChild(host);
        }
        const element = window.React.createElement(window.HEYS.dayPickers.CycleDatePickerSheet, {
          React: window.React,
          isOpen: true,
          cycleDay: 7,
          valueISO: '2026-08-24',
          todayISO: '2026-08-26',
          onClose: () => {},
          onConfirm: () => {},
        });
        window.__uiV4CycleRoot = window.__uiV4CycleRoot || window.ReactDOM.createRoot(host);
        window.__uiV4CycleRoot.render(element);
      }, item.themeId || null);
      await page.locator('.cycle-date-picker-sheet[aria-label="Когда это было"]')
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-reports-whatif-inline') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.InsightsPI?.WhatIfScenariosInline === 'function' &&
          typeof window.HEYS?.InsightsPI?.whatif?.simulate === 'function' &&
          typeof window.HEYS?.PredictiveInsights?.calculateHealthScore === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const patterns = [
          { pattern: 'protein_satiety', available: true, score: 50 },
          { pattern: 'meal_quality', available: true, score: 60 },
          { pattern: 'protein_distribution', available: true, score: 55 },
          { pattern: 'nutrition_quality', available: true, score: 65 },
          { pattern: 'training_recovery', available: true, score: 58 },
          { pattern: 'nutrient_density', available: true, score: 62 },
        ];
        let host = document.getElementById('ui-v4-reports-whatif-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-reports-whatif-host';
          Object.assign(host.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '20000',
            overflow: 'auto',
            padding: '24px 16px',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        window.HEYS.InsightsPI.calculations = window.HEYS.InsightsPI.calculations || {};
        window.HEYS.InsightsPI.calculations.getDaysData = () =>
          Array.from({ length: 14 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}` }));
        const element = window.React.createElement(window.HEYS.InsightsPI.WhatIfScenariosInline, {
          lsGet: () => ({}),
          profile: {},
          pIndex: {},
          patterns,
          currentScore: 58,
          historyDays: 14,
        });
        window.__uiV4ReportsWhatIfRoot =
          window.__uiV4ReportsWhatIfRoot || window.ReactDOM.createRoot(host);
        window.__uiV4ReportsWhatIfRoot.render(element);
      }, item.themeId || null);
    }
    if (item.kind === 'demo-reports-weight-prediction') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.InsightsPI?.uiDashboard?.WeightPrediction === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        let host = document.getElementById('ui-v4-reports-weight-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-reports-weight-host';
          host.className = 'insights-v4';
          Object.assign(host.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '20000',
            overflow: 'auto',
            padding: '24px 18px',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const WeightPrediction = window.HEYS.InsightsPI.uiDashboard.WeightPrediction;
        const prediction = {
          available: true,
          projectedWeight: 90.7,
          weeklyChange: -0.42,
          monthlyChange: -1.8,
          series: [91.2, 91, 91.1, 90.9, 90.8, 90.9].map((weight, index) => ({
            date: `2026-08-${String(index + 1).padStart(2, '0')}`,
            weight,
          })),
        };
        const element = window.React.createElement(window.React.Fragment, null,
          window.React.createElement('div', {
            className: 'insights-v4-tier insights-v4-weight__tier',
          }, 'Прогноз веса'),
          window.React.createElement(WeightPrediction, { prediction, variant: 'v4' }),
          window.React.createElement('p', {
            className: 'insights-v4-detail__disclaimer',
          }, 'Расчёт при условии точного учёта — не обещание даты на весах.'),
        );
        window.__uiV4ReportsWeightRoot =
          window.__uiV4ReportsWeightRoot || window.ReactDOM.createRoot(host);
        window.__uiV4ReportsWeightRoot.render(element);
      }, item.themeId || null);
    }
    if (item.kind === 'demo-norm-correction-lowered') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.weeklyReports?.NormCorrectionScreen === 'function' &&
          typeof window.HEYS?.NormCorrection?.compute === 'function' &&
          typeof window.HEYS?.NormCorrection?.buildWeeklySyncCard === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const NC = window.HEYS.NormCorrection;
        const result = NC.compute({
          days: Array.from({ length: 21 }, () => ({
            kcal: 2112,
            isLogged: true,
            isIncomplete: false,
          })),
          formulaPerDay: 2400,
          trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
          currentFactor: 1,
          historyDays: 60,
        });
        const card = NC.buildWeeklySyncCard({
          result,
          tariff: 'pro',
          applied: true,
          expenditure: 2400,
          deficitPct: -12,
          basalMetabolism: 1520,
        });
        let host = document.getElementById('ui-v4-norm-correction-lowered-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-norm-correction-lowered-host';
          Object.assign(host.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '20000',
            width: '375px',
            overflow: 'visible',
            background: 'var(--v4-bg, #fffaf1)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(
          window.HEYS.weeklyReports.NormCorrectionScreen,
          {
            card,
            rangeLabel: '24–30 авг',
            onDecide: () => {},
          },
        );
        window.__uiV4NormCorrectionLoweredRoot =
          window.__uiV4NormCorrectionLoweredRoot || window.ReactDOM.createRoot(host);
        window.__uiV4NormCorrectionLoweredRoot.render(component);
      }, item.themeId || null);
      await page.locator('#ui-v4-norm-correction-lowered-host .weekly-wrap-correction--lowered')
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-finish') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthFinishUI?.FinishScreen === 'function' &&
          typeof window.HEYS?.TrainingKernel?.strength?.trainingTonnage === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const exerciseMeta = window.HEYS?.exerciseMeta;
        const readExerciseMeta = exerciseMeta?.get?.bind(exerciseMeta);
        if (exerciseMeta && readExerciseMeta) {
          exerciseMeta.get = (name) => name === 'Жим лёжа'
            ? { primaryGroup: 'chest', secondaryGroups: ['triceps', 'shoulders'] }
            : readExerciseMeta(name);
        }
        const done = (weightKg, reps, extra) => ({
          weightKg: String(weightKg), reps, done: true, ...(extra || {}),
        });
        const training = {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            exercises: [
              {
                name: 'Жим лёжа',
                approaches: [
                  done(40, 10, { type: 'warmup' }),
                  done(45, 8, { type: 'warmup' }),
                  done(50, 6, { type: 'warmup' }),
                  done(55, 4, { type: 'warmup' }),
                  done(75, 8),
                  done(75, 8),
                  done(70, 10),
                  done(70, 10),
                ],
              },
              {
                name: 'Тяга штанги в наклоне',
                approaches: Array.from({ length: 5 }, () => done(60, 10)),
              },
              {
                name: 'Жим гантелей сидя',
                approaches: Array.from({ length: 4 }, () => done(24, 10)),
              },
              {
                name: 'Планка', unit: 'time',
                approaches: [{ durationSec: 180, reps: 1, done: true }],
              },
              {
                name: 'Подтягивания', unit: 'bodyweight', bodyweightFactor: 0.65,
                approaches: [done('', 10), done('', 10), done('', 10), done('', 9)],
              },
              {
                name: 'Отжимания на брусьях', unit: 'bodyweight',
                approaches: [done('', 10)],
              },
            ],
            feedback: { mood: 7, wellbeing: 8, stress: 5 },
          },
        };
        let host = document.getElementById('ui-v4-strength-finish-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-finish-host';
          Object.assign(host.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '20000',
            overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthFinishUI.FinishScreen, {
          training,
          dateKey: '2026-08-08',
          elapsedSec: 3270,
          bodyWeightKg: 80,
          dayTonnageKg: 14200,
          strengthCount: 2,
          previousComparableTonnageKg: 7668,
          historyFor: (name) => name === 'Жим лёжа'
            ? { record: { maxW: 70, maxSet: 550, total: 1200 } }
            : { record: null },
          historyDetailFor: () => ({
            usages: [69, 69.75, 66.75, 67.5, 66]
              .map((weight) => ({ approaches: [done(weight, 10)] })),
          }),
          onBack: () => {},
          onDone: () => {},
        });
        window.__uiV4StrengthFinishRoot =
          window.__uiV4StrengthFinishRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthFinishRoot.render(component);
      }, item.themeId || null);
    }
    if (item.kind === 'demo-strength-plan-feed') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.dayTrainings?.ProgramPlanCard === 'function' &&
          typeof window.HEYS?.StrengthBuilderParts?.PlanCard === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const programId = 'visual-strength-program';
        const planDate = '2026-09-02';
        const approach = (weightKg, reps) => ({ weightKg: String(weightKg), reps });
        const exercise = (id, name, sets, weightKg, reps, extra) => ({
          id,
          name,
          approaches: Array.from({ length: sets }, (_, index) =>
            approach(weightKg, Array.isArray(reps) ? reps[index % reps.length] : reps)),
          ...(extra || {}),
        });
        const exercises = [
          exercise('visual-bench', 'Жим лёжа', 4, 75, [8, 9, 10, 12]),
          exercise('visual-row', 'Тяга штанги в наклоне', 4, 60, [8, 9, 10, 12]),
          exercise('visual-press', 'Жим гантелей сидя', 3, 24, [10, 11, 12]),
          exercise('visual-pullup', 'подтягивания', 3, '', 8, { ssGroup: 1 }),
          exercise('visual-pulldown', 'тяга блока', 3, 55, 10, { ssGroup: 1 }),
          exercise('visual-curl', 'Сгибание рук', 3, 14, 12),
          exercise('visual-extension', 'Разгибание рук', 3, 18, 12),
        ];
        const plan = {
          id: 'visual-plan-2026-09-02',
          status: 'assigned',
          programId,
          weekIndex: 2,
          dayLabel: 'День B · верх тела',
          assignedBy: 'Артём',
          assignedAt: new Date('2026-08-03T12:00:00+03:00').getTime(),
        };
        const training = {
          id: 'visual-training-2026-09-02',
          type: 'strength',
          plan,
          planSnapshot: { exercises },
          workoutLog: { exercises: [] },
        };
        const dayBlob = (date, status, trainingId) => ({
          date,
          trainings: [{
            id: trainingId,
            type: 'strength',
            plan: { status, programId },
          }],
        });
        const program = {
          id: programId,
          status: 'active',
          title: 'мезоцикл «База»',
          weeks: 4,
          days: [
            { date: '2026-08-31', trainingId: 'visual-training-2026-08-31', dayLabel: 'День A', weekIndex: 2 },
            { date: planDate, trainingId: training.id, dayLabel: plan.dayLabel, weekIndex: 2 },
            { date: '2026-09-04', trainingId: 'visual-training-2026-09-04', dayLabel: 'День C', weekIndex: 2 },
          ],
        };
        const programRows = new Map([
          ['heys_dayv2_2026-08-31', dayBlob('2026-08-31', 'done', 'visual-training-2026-08-31')],
          [`heys_dayv2_${planDate}`, { date: planDate, trainings: [training] }],
          ['heys_dayv2_2026-09-04', dayBlob('2026-09-04', 'assigned', 'visual-training-2026-09-04')],
        ]);
        window.HEYS.YandexAPI = {
          ...(window.HEYS.YandexAPI || {}),
          getKV: async (_clientId, key) => ({ data: key === 'heys_training_program' ? program : null }),
          getKVBatch: async (_clientId, keys) => ({
            data: keys
              .filter((key) => programRows.has(key))
              .map((key) => ({ k: key, v: programRows.get(key) })),
          }),
        };
        let host = document.getElementById('ui-v4-strength-plan-feed-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-plan-feed-host';
          host.className = 'activity-v4-program';
          Object.assign(host.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '20000',
            boxSizing: 'border-box',
            width: '375px',
            padding: '14px',
            overflow: 'visible',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.dayTrainings.ProgramPlanCard, {
          clientId: 'demo-client-female',
          training,
          dateKey: planDate,
          isFutureDay: true,
          isPastDay: false,
          weekPlace: '',
          moveOptions: [],
          onStart: () => {},
          onSkip: () => ({ ok: true }),
          onMove: () => ({ ok: true }),
          onResumeSkipped: () => ({ ok: true }),
        });
        window.__uiV4StrengthPlanFeedRoot =
          window.__uiV4StrengthPlanFeedRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthPlanFeedRoot.render(component);
      }, item.themeId || null);
      await page.locator('#ui-v4-strength-plan-feed-host .sb-plan-week-label')
        .filter({ hasText: 'Неделя 2 из 4' })
        .waitFor({ state: 'visible', timeout: 45_000 });
      await page.locator('#ui-v4-strength-plan-feed-host .sb-plan-actions--future .sb-plan-cta')
        .filter({ hasText: 'Перенести' })
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-builder-collapsed') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthBuilder?.BuilderScreen === 'function' &&
          typeof window.HEYS?.StrengthBuilderParts?.ExerciseCard === 'function' &&
          typeof window.HEYS?.TrainingKernel?.strength?.trainingTonnage === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const approach = (weightKg, reps, done) => ({
          weightKg: String(weightKg),
          reps,
          done: !!done,
        });
        const exercise = (name, weightKg, reps, doneCount, restSec) => ({
          name,
          restSec,
          approaches: reps.map((value, index) => approach(weightKg, value, index < doneCount)),
        });
        const exercises = [
          exercise('Жим лёжа', 75, [8, 10, 10, 12], 4, 120),
          exercise('Тяга штанги в наклоне', 60, [8, 10, 10, 12], 4, 120),
          exercise('Жим гантелей сидя', 24, [10, 10, 12, 12], 1, 90),
          exercise('Разведение в тренажёре', 20, [12, 12, 12], 0, 60),
        ];
        let host = document.getElementById('ui-v4-strength-builder-collapsed-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-builder-collapsed-host';
          Object.assign(host.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '20000',
            width: '375px',
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthBuilder.BuilderScreen, {
          training: {
            type: 'strength',
            strengthEntryMode: 'workout_builder',
            time: '18:40',
            workoutLog: {
              title: 'Силовая · грудь, спина, плечи',
              startedAt: new Date('2026-08-28T08:42:48+03:00').getTime(),
              exercises,
            },
          },
          dateKey: '2026-08-28',
          profile: { weight: 80 },
          historyFor: (name) => name === 'Жим лёжа'
            ? { record: { maxW: 75, maxSet: 900, total: 3000 } }
            : null,
          historyDetailFor: () => ({ usages: [], record: null }),
          onPatch: () => {},
          onPatchSession: () => {},
          onClose: () => {},
        });
        window.__uiV4StrengthBuilderCollapsedRoot =
          window.__uiV4StrengthBuilderCollapsedRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthBuilderCollapsedRoot.render(component);
      }, item.themeId || null);
      const firstExercise = page
        .locator('#ui-v4-strength-builder-collapsed-host .sb-ex-head')
        .first();
      await firstExercise.waitFor({ state: 'visible', timeout: 45_000 });
      await firstExercise.click();
      await page
        .locator('#ui-v4-strength-builder-collapsed-host .sb-ex.is-open')
        .waitFor({ state: 'detached', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-builder-active-calm') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthBuilder?.BuilderScreen === 'function' &&
          typeof window.HEYS?.StrengthBuilderParts?.ExerciseCard === 'function' &&
          typeof window.HEYS?.TrainingKernel?.strength?.trainingTonnage === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const caseNow = new Date('2022-08-08T19:27:12+03:00').getTime();
        window.Date.now = () => caseNow;
        const approach = (weightKg, reps, done) => ({
          weightKg: String(weightKg),
          reps,
          done: !!done,
        });
        const exercise = (name, approaches, restSec) => ({ name, approaches, restSec });
        const exercises = [
          exercise('Жим лёжа', [
            { weightKg: '20', reps: 12, done: false, type: 'warmup' },
            { weightKg: '30', reps: 10, done: false, type: 'warmup' },
            { weightKg: '40', reps: 8, done: false, type: 'warmup' },
            approach(75, 8, true), approach(75, 10, true),
            approach(75, 10, true), approach(75, 12, true),
          ], 120),
          exercise('Тяга штанги в наклоне', [
            { weightKg: '20', reps: 12, done: false, type: 'warmup' },
            { weightKg: '30', reps: 10, done: false, type: 'warmup' },
            { weightKg: '40', reps: 8, done: false, type: 'warmup' },
            approach(60, 8, true), approach(60, 10, true),
            approach(60, 10, true), approach(60, 12, true),
          ], 120),
          { ...exercise('Жим гантелей сидя', [
            approach(22.5, 12, true), approach(24, 10, true),
            approach(24, 10, false), approach(24, 10, false),
          ], 120), rpe: 7 },
          exercise('Разведение в тренажёре', [
            { weightKg: '10', reps: 15, done: false, type: 'warmup' },
            { weightKg: '15', reps: 12, done: false, type: 'warmup' },
            approach(20, 12, false), approach(20, 12, false), approach(20, 12, false),
          ], 60),
        ];
        let host = document.getElementById('ui-v4-strength-builder-active-calm-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-builder-active-calm-host';
          Object.assign(host.style, {
            position: 'fixed', top: '0', left: '0', zIndex: '20000',
            width: '375px', height: '100vh', overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthBuilder.BuilderScreen, {
          training: {
            type: 'strength',
            strengthEntryMode: 'workout_builder',
            time: '18:40',
            workoutLog: {
              title: 'Силовая · грудь, спина, плечи',
              startedAt: new Date('2022-08-08T18:40:00+03:00').getTime(),
              exercises,
            },
          },
          dateKey: '2022-08-08',
          profile: { weight: 80 },
          historyFor: (name) => name === 'Жим гантелей сидя'
            ? { record: { maxW: 25, maxSet: 250, total: 900 } }
            : name === 'Жим лёжа'
              ? { record: { maxW: 75, maxSet: 900, total: 3000 } }
              : null,
          historyDetailFor: (name) => name === 'Жим гантелей сидя'
            ? { usages: [{ approaches: [approach(22.5, 12, true)] }], record: { maxW: 25 } }
            : { usages: [], record: null },
          onPatch: () => {},
          onPatchSession: () => {},
          onClose: () => {},
        });
        window.__uiV4StrengthBuilderActiveCalmRoot =
          window.__uiV4StrengthBuilderActiveCalmRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthBuilderActiveCalmRoot.render(component);
      }, item.themeId || null);
      const thirdExercise = page
        .locator('#ui-v4-strength-builder-active-calm-host .sb-ex-head')
        .nth(2);
      await thirdExercise.waitFor({ state: 'visible', timeout: 45_000 });
      await thirdExercise.click();
      await page
        .locator('#ui-v4-strength-builder-active-calm-host .sb-ex.is-open')
        .filter({ hasText: 'Жим гантелей сидя' })
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-builder-empty') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthBuilder?.BuilderScreen === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const emptyTraining = {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: { exercises: [] },
          plan: {
            id: 'visual-plan-b', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём',
            assignedAt: new Date('2026-08-28T08:00:00+03:00').getTime(),
          },
          planSnapshot: {
            exercises: Array.from({ length: 7 }, (_, index) => ({
              name: 'План · упражнение ' + (index + 1),
              approaches: [{ weightKg: '20', reps: 10, done: false }],
            })),
          },
        };
        const lastExercises = Array.from({ length: 7 }, (_, index) => ({
          name: 'Прошлое · упражнение ' + (index + 1), approaches: [],
        }));
        let host = document.getElementById('ui-v4-strength-builder-empty-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-builder-empty-host';
          Object.assign(host.style, {
            position: 'fixed', top: '0', left: '0', zIndex: '20000',
            width: '375px', height: '100vh', overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthBuilder.BuilderScreen, {
          training: emptyTraining,
          dateKey: '2026-08-28',
          profile: { weight: 80 },
          lastSessionFor: () => ({ dateKey: '2026-08-05', exercises: lastExercises }),
          onStartPlan: async () => [],
          onStartCustom: async () => false,
          onRepeatLast: async () => [],
          onPatch: () => {},
          onPatchSession: () => {},
          onClose: () => {},
        });
        window.__uiV4StrengthBuilderEmptyRoot =
          window.__uiV4StrengthBuilderEmptyRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthBuilderEmptyRoot.render(component);
      }, item.themeId || null);
      await page
        .locator('#ui-v4-strength-builder-empty-host .sb-empty-card')
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-builder-catalog') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthCatalogUI?.CatalogScreen === 'function' &&
          !!window.HEYS?.exerciseMeta,
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const catalogRows = [
          { name: 'Тяга штанги в наклоне', norm: 'тяга штанги в наклоне', rank: 1, favorite: true },
          { name: 'Подтягивания', norm: 'подтягивания', rank: 2, favorite: false },
          { name: 'Тяга верхнего блока', norm: 'тяга верхнего блока', rank: 3, favorite: false },
          { name: 'Становая тяга', norm: 'становая тяга', rank: 4, favorite: true },
        ];
        window.HEYS.getExerciseSuggestions = () => catalogRows;
        const previous = {
          'Тяга штанги в наклоне': { weightKg: '60', reps: 8 },
          'Тяга верхнего блока': { weightKg: '55', reps: 10 },
          'Становая тяга': { weightKg: '105', reps: 5 },
        };
        let host = document.getElementById('ui-v4-strength-builder-catalog-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-builder-catalog-host';
          Object.assign(host.style, {
            position: 'fixed', top: '0', left: '0', zIndex: '20000',
            width: '375px', height: '100vh', overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthCatalogUI.CatalogScreen, {
          onPick: () => {}, onCreate: () => {}, onBack: () => {},
          historyFor: (name) => ({
            last: previous[name]
              ? { approaches: [{ ...previous[name], done: true }] }
              : null,
            record: null,
          }),
        });
        window.__uiV4StrengthBuilderCatalogRoot =
          window.__uiV4StrengthBuilderCatalogRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthBuilderCatalogRoot.render(component);
      }, item.themeId || null);
      const backGroup = page
        .locator('#ui-v4-strength-builder-catalog-host .sb-chip')
        .filter({ hasText: 'Спина' });
      await backGroup.waitFor({ state: 'visible', timeout: 45_000 });
      await backGroup.click();
      await page
        .locator('#ui-v4-strength-builder-catalog-host .sb-chip.is-on')
        .filter({ hasText: 'Спина' })
        .waitFor({ state: 'visible', timeout: 45_000 });
      await page
        .locator('#ui-v4-strength-builder-catalog-host input[aria-label="Поиск по названию"]')
        .fill('Тяга Т-грифа');
      await page
        .locator('#ui-v4-strength-builder-catalog-host .sb-cat-create')
        .filter({ hasText: 'Создать «Тяга Т-грифа»' })
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-strength-superset-create') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.StrengthCatalogUI?.SupersetScreen === 'function' &&
          typeof window.HEYS?.TrainingKernel?.strength?.makeSuperset === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const exercise = (name, weightKg, restSec) => ({
          name,
          restSec,
          approaches: Array.from({ length: 3 }, () => ({
            weightKg: String(weightKg),
            reps: 10,
            done: false,
          })),
        });
        const exercises = [
          exercise('Жим лёжа', 75, 90),
          exercise('Тяга штанги в наклоне', 60, 120),
          exercise('Жим гантелей сидя', 24, 90),
          exercise('Разведение в тренажёре', 20, 60),
        ];
        let host = document.getElementById('ui-v4-strength-superset-create-host');
        if (!host) {
          host = document.createElement('main');
          host.id = 'ui-v4-strength-superset-create-host';
          Object.assign(host.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '20000',
            width: '375px',
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--v4-bg, #fffaf3)',
          });
          document.body.appendChild(host);
        }
        const component = window.React.createElement(window.HEYS.StrengthCatalogUI.SupersetScreen, {
          exercises,
          startIndex: 0,
          onCreate: () => {},
          onCancel: () => {},
        });
        window.__uiV4StrengthSupersetCreateRoot =
          window.__uiV4StrengthSupersetCreateRoot || window.ReactDOM.createRoot(host);
        window.__uiV4StrengthSupersetCreateRoot.render(component);
      }, item.themeId || null);
      const triset = page
        .locator('#ui-v4-strength-superset-create-host .sb-radio')
        .filter({ hasText: 'Трисет' });
      await triset.waitFor({ state: 'visible', timeout: 45_000 });
      await triset.click();
      await page
        .locator('#ui-v4-strength-superset-create-host .sb-radio.is-on')
        .filter({ hasText: 'Трисет' })
        .waitFor({ state: 'visible', timeout: 45_000 });
    }
    if (item.kind === 'demo-food-copy-empty') {
      await page.waitForFunction(
        () => typeof window.HEYS?.CopyMealModal?.show === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        window.HEYS.CopyMealModal.show({
          sourceMeal: {
            id: 'visual-source',
            name: 'Перекус',
            items: [
              { id: 'visual-coffee', name: 'Домашний кофе', grams: 100, kcal100: 17 },
            ],
          },
          sourceMealIndex: 0,
          sourceDate: '2026-08-28',
          targetDate: '2026-08-28',
          targetMeals: [],
          onCopyToExisting: () => {},
          onCopyToNew: () => {},
        });
      }, item.themeId || null);
    }
    if (item.kind === 'demo-food-copy-existing') {
      await page.waitForFunction(
        () => typeof window.HEYS?.CopyMealModal?.show === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        const sourceItems = [
          { id: 'visual-soba', name: 'Лапша соба варёная', grams: 137, kcal100: 114.6 },
          { id: 'visual-sauce', name: "Соус Хеллманн'с Бургер Гриль", grams: 30, kcal100: 270 },
          { id: 'visual-coffee', name: 'Домашний кофе', grams: 300, kcal100: 16.67 },
          { id: 'visual-chicken', name: 'Куриная грудка', grams: 160, kcal100: 165 },
          { id: 'visual-oil', name: 'Оливковое масло', grams: 50, kcal100: 884 },
          { id: 'visual-bread', name: 'Хлеб цельнозерновой', grams: 100, kcal100: 247 },
          { id: 'visual-cheese', name: 'Сыр', grams: 80, kcal100: 350 },
          { id: 'visual-avocado', name: 'Авокадо', grams: 45, kcal100: 160 },
        ];
        window.HEYS.CopyMealModal.show({
          sourceMeal: {
            id: 'visual-source',
            name: 'Перекус',
            items: sourceItems,
          },
          sourceMealIndex: 0,
          sourceDate: '2026-08-28',
          targetDate: '2026-08-28',
          targetMeals: [
            {
              id: 'visual-source',
              name: 'Перекус',
              items: sourceItems,
            },
            {
              id: 'visual-snack',
              name: 'Перекус',
              time: '10:40',
              items: [{ id: 'visual-target-coffee', name: 'Домашний кофе', grams: 100, kcal100: 17 }],
            },
          ],
          onCopyToExisting: () => {},
          onCopyToNew: () => {},
        });
      }, item.themeId || null);
    }
    if (item.kind === 'demo-food-move-existing') {
      await page.waitForFunction(
        () => typeof window.HEYS?.MoveModal?.show === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate((themeId) => {
        if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
        window.HEYS.MoveModal.show({
          mode: 'meal-move',
          sourceDate: '2026-08-28',
          daysWithMeals: [
            {
              dateStr: '2026-08-28',
              dateLabel: 'Сегодня',
              meals: [{ id: 'visual-source', name: 'Ужин', time: '19:00' }],
            },
            {
              dateStr: '2026-08-27',
              dateLabel: 'Вчера',
              meals: [
                { id: 'visual-breakfast', name: 'Завтрак', time: '09:00' },
                { id: 'visual-lunch', name: 'Обед', time: '14:00' },
              ],
            },
          ],
          onPick: () => {},
        });
      }, item.themeId || null);
    }
    if (item.kind === 'demo-tips') {
      await page.waitForFunction(
        () =>
          !!window.React &&
          !!window.ReactDOM?.createRoot &&
          typeof window.HEYS?.dayAdviceListUI?.renderManualAdviceList === 'function' &&
          !!window.HEYS?.dayComponents?.AdviceCard,
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate(() => {
        let host = document.getElementById('ui-v4-tips-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'ui-v4-tips-host';
          document.body.appendChild(host);
        }
        const advice = {
          id: 'visual-tip-protein',
          type: 'tip',
          category: 'nutrition',
          icon: '💡',
          text: 'Добавьте источник белка к следующему приёму пищи',
          details: 'Так сытость сохранится дольше, а дневная норма станет ближе.',
          priority: 80,
        };
        const noop = () => {};
        const element = window.HEYS.dayAdviceListUI.renderManualAdviceList({
          React: window.React,
          adviceTrigger: 'manual',
          adviceRelevant: [advice],
          badgeAdvices: [advice],
          totalAdviceCount: 1,
          toastVisible: true,
          dismissToast: noop,
          getSortedGroupedAdvices: (items) => ({
            sorted: items,
            groups: { nutrition: items },
          }),
          dismissedAdvices: new Set(),
          hiddenUntilTomorrow: new Set(),
          lastDismissedAdvice: null,
          adviceSwipeState: {},
          expandedAdviceId: null,
          trackClick: noop,
          rateAdvice: noop,
          handleAdviceSwipeStart: noop,
          handleAdviceSwipeMove: noop,
          handleAdviceSwipeEnd: noop,
          handleAdviceLongPressStart: noop,
          handleAdviceLongPressEnd: noop,
          registerAdviceCardRef: noop,
          handleAdviceListTouchStart: noop,
          handleAdviceListTouchMove: noop,
          handleAdviceListTouchEnd: noop,
          handleDismissAll: noop,
          dismissAllAnimation: false,
          toastsEnabled: true,
          toggleToastsEnabled: noop,
          scheduleAdvice: noop,
          undoLastDismiss: noop,
          clearLastDismissed: noop,
          copyAdviceTrace: noop,
          adviceDiagnostics: null,
          adviceDiagnosticsOpen: false,
          openAdviceDiagnostics: noop,
          closeAdviceDiagnostics: noop,
          adviceDetailModalOpen: false,
          adviceDetailModalAdvice: null,
          openAdviceDetailModal: noop,
          closeAdviceDetailModal: noop,
          markAdviceDetailRead: noop,
          hideAdviceDetailUntilTomorrow: noop,
          adviceTechnicalDetails: null,
          adviceTechnicalDetailsOpen: false,
          openAdviceTechnicalDetails: noop,
          closeAdviceTechnicalDetails: noop,
          ADVICE_CATEGORY_NAMES: { nutrition: 'Питание' },
          ewsWarnings: [],
          AdviceCard: window.HEYS.dayComponents.AdviceCard,
          undoCountdownSeconds: 0,
          adviceServiceOpen: false,
          closeAdviceService: noop,
          openAdviceRulesPool: noop,
          closeAdviceRulesPool: noop,
          adviceRulesPoolOpen: false,
          medicalDisclaimerSessionDismissed: true,
        });
        window.__uiV4TipsRoot = window.__uiV4TipsRoot || window.ReactDOM.createRoot(host);
        window.__uiV4TipsRoot.render(element);
      });
    }
    if (item.kind === 'demo-registration') {
      await page.waitForFunction(
        () => typeof window.HEYS?.MorningCheckinUtils?.openRegistrationReplayWizard === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate(() => {
        // Diagnostic replay must not mark the fixture client as partially registered.
        window.HEYS._registrationReplay = true;
        window.HEYS.MorningCheckinUtils.openRegistrationReplayWizard();
      });
    }
    if (item.kind === 'demo-curator-edits') {
      await page.waitForFunction(
        () => typeof window.HEYS?.debug?.replayCuratorReview === 'function',
        undefined,
        { timeout: 45_000 },
      );
      await page.evaluate(async () => {
        await window.HEYS.debug.replayCuratorReview({ allowSample: true });
      });
    }
    if (item.kind === 'demo-settings') {
      await page
        .locator('.widgets-grid .widget')
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 });
      await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    }
    await page.locator(item.rootSelector).first().waitFor({ state: 'visible', timeout: 45_000 });
    let visualChecks = null;
    if (item.kind === 'demo-registration') {
      visualChecks = await page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return {
            x: Math.round(box.x * 100) / 100,
            y: Math.round(box.y * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
          };
        };
        const firstInput = document.querySelector('.profile-personal-step input[autocomplete="given-name"]');
        const firstInputStyle = firstInput ? getComputedStyle(firstInput) : null;
        return {
          modal: rect('.mc-modal[data-heys-step-id="profile-personal"]'),
          header: rect('.mc-modal[data-heys-step-id="profile-personal"] .mc-header--nav'),
          content: rect('.mc-step-content[data-heys-step-id="profile-personal"]'),
          title: rect('.profile-personal-step > div:first-child'),
          firstInput: rect('.profile-personal-step input[autocomplete="given-name"]'),
          firstInputStyle: firstInputStyle ? {
            height: firstInputStyle.height,
            minHeight: firstInputStyle.minHeight,
            padding: firstInputStyle.padding,
            boxSizing: firstInputStyle.boxSizing,
            font: firstInputStyle.font,
          } : null,
          familyInput: rect('.profile-personal-step input[autocomplete="family-name"]'),
          wheel: rect('.profile-personal-wheel-card'),
          age: rect('.profile-personal-age'),
          footer: rect('.mc-modal[data-heys-step-id="profile-personal"] .mc-daily-footer'),
          primary: rect('.mc-modal[data-heys-step-id="profile-personal"] .mc-daily-footer-primary'),
          registrationMarker: localStorage.getItem('heys_registration_in_progress'),
        };
      });
      if (visualChecks.registrationMarker !== null) {
        throw new Error('Registration visual fixture wrote heys_registration_in_progress');
      }
    }
    if (item.kind === 'demo-food-copy-empty') {
      await page.waitForTimeout(250);
      visualChecks = await page.evaluate(() => {
        const label = document.querySelector('[data-copy-meal-target-label="new-meal"]');
        const row = document.querySelector('[data-copy-meal-target="new-meal"]');
        if (!label || !row) return { contrastRatio: 0, reason: 'target label is missing' };
        const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
        const relativeRect = (target) => {
          if (!sheet || !target) return null;
          const rootBox = sheet.getBoundingClientRect();
          const box = target.getBoundingClientRect();
          return {
            x: Math.round((box.x - rootBox.x) * 100) / 100,
            y: Math.round((box.y - rootBox.y) * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
          };
        };
        const parseRgb = (value) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (rgb) => {
          const channels = rgb.map((value) => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const color = getComputedStyle(label).color;
        const background = getComputedStyle(row).backgroundColor;
        const foregroundLuminance = luminance(parseRgb(color));
        const backgroundLuminance = luminance(parseRgb(background));
        const contrastRatio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
        return {
          color,
          background,
          contrastRatio: Math.round(contrastRatio * 100) / 100,
          geometry: {
            sheet: relativeRect(sheet),
            header: relativeRect(sheet?.querySelector('.meal-transfer-v4__top')),
            tierRow: relativeRect(sheet?.querySelector('.meal-transfer-v4__tier-row')),
            product: relativeRect(sheet?.querySelector('.meal-transfer-v4__product')),
            productMain: relativeRect(sheet?.querySelector('.meal-transfer-v4__product-main')),
            grams: relativeRect(sheet?.querySelector('.meal-transfer-v4__grams')),
            gramStep: relativeRect(sheet?.querySelector('.meal-transfer-v4__gram-step')),
            range: relativeRect(sheet?.querySelector('.meal-transfer-v4__range')),
            targets: relativeRect(sheet?.querySelector('.meal-transfer-v4__targets')),
            empty: relativeRect(sheet?.querySelector('.meal-transfer-v4__empty')),
            target: relativeRect(row),
            footer: relativeRect(sheet?.querySelector('.meal-transfer-v4__footer')),
            actions: relativeRect(sheet?.querySelector('.meal-transfer-v4__actions')),
            cancel: relativeRect(sheet?.querySelector('.meal-transfer-v4__button--cancel')),
            primary: relativeRect(sheet?.querySelector('.meal-transfer-v4__button--primary')),
          },
          rangeStyle: (() => {
            const range = sheet?.querySelector('.meal-transfer-v4__range');
            if (!range) return null;
            const style = getComputedStyle(range);
            return {
              height: style.height,
              padding: style.padding,
              border: style.border,
              boxSizing: style.boxSizing,
              appearance: style.appearance,
            };
          })(),
        };
      });
      if (visualChecks.contrastRatio < 4.5) {
        throw new Error(
          `Контраст цели копирования ${visualChecks.contrastRatio}:1 ниже 4.5:1`,
        );
      }
    }
    if (item.kind === 'demo-food-copy-existing') {
      await page.waitForTimeout(250);
      visualChecks = await page.evaluate(() => {
        const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
        const productList = sheet?.querySelector('.meal-transfer-v4__product-list');
        const primary = sheet?.querySelector('.meal-transfer-v4__button--primary');
        const sheetBox = sheet?.getBoundingClientRect();
        const primaryBox = primary?.getBoundingClientRect();
        const relativeRect = (target) => {
          if (!sheetBox || !target) return null;
          const box = target.getBoundingClientRect();
          return {
            x: Math.round((box.x - sheetBox.x) * 100) / 100,
            y: Math.round((box.y - sheetBox.y) * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
          };
        };
        const targets = [...(sheet?.querySelectorAll('.meal-transfer-v4__target') || [])];
        return {
          productCount: productList?.children.length || 0,
          productListClientHeight: productList?.clientHeight || 0,
          productListScrollHeight: productList?.scrollHeight || 0,
          canScrollProducts: Boolean(productList && productList.scrollHeight > productList.clientHeight),
          primaryVisible: Boolean(
            sheetBox &&
              primaryBox &&
              primaryBox.top >= sheetBox.top &&
              primaryBox.bottom <= sheetBox.bottom,
          ),
          primaryText: primary?.textContent || '',
          geometry: {
            header: relativeRect(sheet?.querySelector('.meal-transfer-v4__top')),
            tierRow: relativeRect(sheet?.querySelector('.meal-transfer-v4__tier-row')),
            productList: relativeRect(productList),
            products: [...(productList?.children || [])].slice(0, 3).map(relativeRect),
            targetTier: relativeRect(sheet?.querySelector('.meal-transfer-v4__tier')),
            targets: targets.map(relativeRect),
            summary: relativeRect(sheet?.querySelector('.meal-transfer-v4__summary')),
            actions: relativeRect(sheet?.querySelector('.meal-transfer-v4__actions')),
          },
        };
      });
      if (
        visualChecks.productCount !== 8 ||
        !visualChecks.canScrollProducts ||
        !visualChecks.primaryVisible ||
        visualChecks.primaryText !== 'Копировать (8)'
      ) {
        throw new Error(`Long copy fixture не сохранил scroll/CTA: ${JSON.stringify(visualChecks)}`);
      }
    }
    await page.addStyleTag({
      content: [
        '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}',
        'input,textarea{caret-color:transparent!important}',
      ].join(''),
    });
    const fontState = await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      return {
        ready: document.fonts?.status === 'loaded',
        figtree: document.fonts?.check?.('12px Figtree') ?? false,
      };
    });
    if (!item.preserveScroll) await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);

    const file = path.join(OUT_DIR, `${item.id}${item.canvasFrame ? '.runtime' : ''}.png`);
    if (item.captureSelector) {
      const captureRoot = page.locator(item.captureSelector);
      const matches = await captureRoot.count();
      if (matches !== 1) {
        throw new Error(`captureSelector ${item.captureSelector} дал ${matches} узлов вместо одного`);
      }
      await captureRoot.screenshot({ path: file, animations: 'disabled' });
    } else {
      await page.screenshot({ path: file, fullPage: false });
    }
    const allowedConsoleErrors = item.allowedConsoleErrors || [];
    const ignoredConsoleErrors = consoleErrors.filter((message) =>
      allowedConsoleErrors.some((fragment) => message.includes(fragment)),
    );
    const evidenceConsoleErrors = consoleErrors.filter((message) =>
      !allowedConsoleErrors.some((fragment) => message.includes(fragment)),
    );
    return {
      id: item.id,
      zone: item.zone,
      gate: item.gate,
      status: 'captured',
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      visualChecks,
      fontState,
      consoleErrors,
      ignoredConsoleErrors,
      evidenceConsoleErrors,
    };
  } catch (error) {
    const failureFile = path.join(OUT_DIR, `${item.id}.failed.png`);
    await page.screenshot({ path: failureFile, fullPage: false }).catch(() => {});
    const diagnostics = await page
      .evaluate(() => {
        const profile = window.HEYS?.utils?.lsGet?.('heys_profile', {}) || {};
        return {
          demoMode: window.__HEYS_DEMO_MODE__ || null,
          currentClientId: window.HEYS?.currentClientId || null,
          profile: {
            gender: profile.gender,
            cycleTrackingEnabled: profile.cycleTrackingEnabled,
            showDiaryCyclePanel: profile.showDiaryCyclePanel,
          },
          cycleTrackingEnabled:
            window.HEYS?.healthFeatures?.isCycleTrackingEnabled?.(profile) ?? null,
          nutritionBlocks: Array.from(
            document.querySelectorAll('.nutrition-v4-block[data-block]'),
          ).map((element) => element.getAttribute('data-block')),
        };
      })
      .catch(() => null);
    return {
      id: item.id,
      zone: item.zone,
      gate: item.gate,
      status: 'failed',
      error: error?.message || String(error),
      failureFile: fs.existsSync(failureFile)
        ? path.relative(ROOT, failureFile).replaceAll('\\', '/')
        : undefined,
      diagnostics,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

async function captureCanvasFrame(browser, item, canvasOrigin) {
  const viewport = item.viewport || { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: item.themeId?.endsWith('-dark') ? 'dark' : 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    const canvasPath = path.join(CANVAS_PACK_DIR, item.canvasFrame.file);
    const staticCanvasHtml = fs
      .readFileSync(canvasPath, 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
      .replace('<head>', `<head><base href="${canvasOrigin}/">`);
    await page.setContent(staticCanvasHtml, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await page.addStyleTag({
      content: [
        `@font-face{font-family:Figtree;src:url("${canvasOrigin}/__heys-font/Figtree-Variable.ttf") format("truetype");font-weight:400 800;font-style:normal;font-display:block}`,
        '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}',
        'input,textarea{caret-color:transparent!important}',
      ].join(''),
    });
    const fontState = await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      return {
        ready: document.fonts?.status === 'loaded',
        figtree: document.fonts?.check?.('12px Figtree') ?? false,
      };
    });
    const candidates = page.locator(`.ph[data-oid="${item.canvasFrame.oid}"]`);
    const matches = await candidates.count();
    if (matches !== 1) {
      throw new Error(
        `Canvas oid ${item.canvasFrame.oid} дал ${matches} кадров вместо одного в ${item.canvasFrame.file}`,
      );
    }
    const frame = candidates.first();
    const actualLabel = await frame.getAttribute('data-screen-label');
    if (actualLabel !== item.canvasFrame.label) {
      throw new Error(
        `Canvas oid ${item.canvasFrame.oid}: ожидался «${item.canvasFrame.label}», найден «${actualLabel || ''}»`,
      );
    }
    await frame.waitFor({ state: 'visible', timeout: 45_000 });
    if (item.canvasFrame.pixelAlign) {
      await frame.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const offsetX = Math.round(box.x) - box.x;
        const offsetY = Math.round(box.y) - box.y;
        node.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
    }
    const visualChecks = item.kind === 'demo-registration'
      ? await frame.evaluate((node) => {
          const frameBox = node.getBoundingClientRect();
          const relativeRect = (target) => {
            if (!target) return null;
            const box = target.getBoundingClientRect();
            return {
              x: Math.round((box.x - frameBox.x) * 100) / 100,
              y: Math.round((box.y - frameBox.y) * 100) / 100,
              width: Math.round(box.width * 100) / 100,
              height: Math.round(box.height * 100) / 100,
            };
          };
          const content = node.querySelector('.sc');
          const children = content ? [...content.children] : [];
          return {
            modal: relativeRect(node),
            header: relativeRect(node.querySelector('.top')),
            content: relativeRect(content),
            title: relativeRect(children[0]),
            firstInput: relativeRect(children[1]?.querySelector('.fld')),
            familyInput: relativeRect(children[2]?.querySelector('.fld')),
            wheel: relativeRect(children[5]),
            age: relativeRect(children[6]),
            footer: relativeRect(node.querySelector('.foot')),
            primary: relativeRect(node.querySelector('.foot .btn')),
          };
        })
      : item.kind === 'demo-food-copy-empty'
        ? await frame.evaluate((node) => {
            const rootBox = node.getBoundingClientRect();
            const relativeRect = (target) => {
              if (!target) return null;
              const box = target.getBoundingClientRect();
              return {
                x: Math.round((box.x - rootBox.x) * 100) / 100,
                y: Math.round((box.y - rootBox.y) * 100) / 100,
                width: Math.round(box.width * 100) / 100,
                height: Math.round(box.height * 100) / 100,
              };
            };
            const content = node.querySelector('.sc');
            const children = content ? [...content.children] : [];
            const product = children[1];
            return {
              geometry: {
                sheet: relativeRect(node),
                header: relativeRect(node.querySelector('.top')),
                tierRow: relativeRect(children[0]),
                product: relativeRect(product),
                productMain: relativeRect(product?.children[0]),
                grams: relativeRect(product?.children[1]),
                gramStep: relativeRect(product?.children[1]?.children[0]),
                range: relativeRect(product?.children[1]?.children[3]),
                targets: relativeRect(children[2]),
                empty: relativeRect(children[3]),
                target: relativeRect(children[4]),
                footer: relativeRect(children[5]),
                actions: relativeRect(children[5]),
                cancel: relativeRect(children[5]?.children[0]),
                primary: relativeRect(children[5]?.children[1]),
              },
            };
          })
        : item.kind === 'demo-food-copy-existing'
          ? await frame.evaluate((node) => {
              const rootBox = node.getBoundingClientRect();
              const relativeRect = (target) => {
                if (!target) return null;
                const box = target.getBoundingClientRect();
                return {
                  x: Math.round((box.x - rootBox.x) * 100) / 100,
                  y: Math.round((box.y - rootBox.y) * 100) / 100,
                  width: Math.round(box.width * 100) / 100,
                  height: Math.round(box.height * 100) / 100,
                };
              };
              const content = node.querySelector('.sc');
              const children = content ? [...content.children] : [];
              return {
                geometry: {
                  header: relativeRect(node.querySelector('.top')),
                  tierRow: relativeRect(children[0]),
                  products: children.slice(1, 4).map(relativeRect),
                  targetTier: relativeRect(children[4]),
                  targets: children.slice(5, 7).map(relativeRect),
                  summary: relativeRect(children[7]),
                  actions: relativeRect(children[8]),
                },
              };
            })
          : null;
    const file = path.join(OUT_DIR, `${item.id}.canvas.png`);
    if (item.canvasFrame.captureSelector) {
      const boundary = frame.locator(item.canvasFrame.captureSelector);
      const boundaryMatches = await boundary.count();
      if (boundaryMatches !== 1) {
        throw new Error(
          `Canvas boundary ${item.canvasFrame.captureSelector} дал ${boundaryMatches} узлов вместо одного`,
        );
      }
      await boundary.screenshot({ path: file, animations: 'disabled' });
    } else {
      await frame.screenshot({ path: file, animations: 'disabled' });
    }
    return {
      status: 'captured',
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      source: path.relative(ROOT, canvasPath).replaceAll('\\', '/'),
      frame: item.canvasFrame,
      visualChecks,
      fontState,
      consoleErrors,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error?.message || String(error),
      frame: item.canvasFrame,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

async function comparePng(actualPath, expectedPath, { diffPath } = {}) {
  const actualImage = sharp(actualPath);
  const expectedImage = sharp(expectedPath);
  const [actualMeta, expectedMeta] = await Promise.all([
    actualImage.metadata(),
    expectedImage.metadata(),
  ]);
  if (actualMeta.width !== expectedMeta.width || actualMeta.height !== expectedMeta.height) {
    return {
      ok: false,
      reason: `Размер runtime ${actualMeta.width}x${actualMeta.height}, Canvas ${expectedMeta.width}x${expectedMeta.height}`,
    };
  }

  const [actual, expected] = await Promise.all([
    actualImage.ensureAlpha().raw().toBuffer(),
    expectedImage.ensureAlpha().raw().toBuffer(),
  ]);
  let changedPixels = 0;
  let maxDelta = 0;
  const diff = diffPath ? Buffer.alloc(actual.length) : null;
  const threshold = 16;
  for (let offset = 0; offset < actual.length; offset += 4) {
    const delta = Math.max(
      Math.abs(actual[offset] - expected[offset]),
      Math.abs(actual[offset + 1] - expected[offset + 1]),
      Math.abs(actual[offset + 2] - expected[offset + 2]),
      Math.abs(actual[offset + 3] - expected[offset + 3]),
    );
    maxDelta = Math.max(maxDelta, delta);
    if (delta > threshold) changedPixels += 1;
    if (diff) {
      diff[offset] = Math.abs(actual[offset] - expected[offset]);
      diff[offset + 1] = Math.abs(actual[offset + 1] - expected[offset + 1]);
      diff[offset + 2] = Math.abs(actual[offset + 2] - expected[offset + 2]);
      diff[offset + 3] = 255;
    }
  }
  if (diff) {
    await sharp(diff, {
      raw: { width: actualMeta.width, height: actualMeta.height, channels: 4 },
    }).png().toFile(diffPath);
  }
  const totalPixels = actualMeta.width * actualMeta.height;
  const changedRatio = changedPixels / totalPixels;
  return {
    ok: changedRatio <= 0.001,
    changedPixels,
    totalPixels,
    changedRatio,
    maxDelta,
    diffFile: diffPath ? path.relative(ROOT, diffPath).replaceAll('\\', '/') : undefined,
  };
}

async function main() {
  const manifest = validateManifest();
  if (manifest.problems.length) {
    manifest.problems.forEach((problem) => console.error(`[ui-v4-visual] ${problem}`));
    process.exitCode = 1;
    return;
  }

  const allAutomated = UI_V4_VISUAL_CASES.filter((item) => item.status === 'automated');
  const gateReady = allAutomated.filter((item) => item.gate === 'pixel');
  const modeCases = mode === 'verify' || mode === 'update-baselines' ? gateReady : allAutomated;
  const automated = modeCases.filter((item) => {
    if (requestedCaseId && item.id !== requestedCaseId) return false;
    if (requestedZoneId && item.zone !== requestedZoneId) return false;
    return true;
  });
  const pending = UI_V4_VISUAL_CASES.filter((item) => item.status === 'scenario-pending');
  const domGates = UI_V4_VISUAL_CASES.filter((item) => item.status === 'dom-gate');
  if ((requestedCaseId || requestedZoneId) && automated.length === 0) {
    throw new Error(`Нет подходящего сценария: ${requestedCaseId || requestedZoneId}`);
  }
  console.info(
    `[ui-v4-visual] manifest: ${UI_V4_CANVAS_ZONES.length} зон, ${gateReady.length} pixel-gate, ${allAutomated.length - gateReady.length} diagnostic, ${domGates.length} DOM-gate, ${pending.length} ожидают сценария`,
  );
  assertPixelGateContracts(gateReady);
  if (mode === 'check') return;

  if ((mode === 'verify' || mode === 'update-baselines') && process.platform !== 'linux') {
    throw new Error('Pixel baseline каноничен только в Linux CI; локальный Windows-запуск оставлен для diagnostic capture.');
  }
  if (mode === 'update-baselines' && !requestedZoneId) {
    throw new Error('Baseline утверждается позонно: укажите --zone=<zone>.');
  }

  await ensureServer();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const canvasServer = automated.some((item) => item.canvasFrame)
    ? await startCanvasServer()
    : null;
  const browser = await chromium.launch({
    headless: true,
  });
  const results = [];
  try {
    const snapshot = buildUiV4VisualSnapshot();
    for (const item of automated) {
      const result = await openCase(browser, item, snapshot);
      if (result.status === 'captured' && item.canvasFrame) {
        result.canvas = await captureCanvasFrame(browser, item, canvasServer.origin);
        if (result.canvas.status !== 'captured') {
          result.status = 'failed';
          result.error = `Канонический кадр не снят: ${result.canvas.error}`;
        } else {
          const diffPath = path.join(OUT_DIR, `${item.id}.diff.png`);
          result.comparison = await comparePng(
            path.join(ROOT, result.file),
            path.join(ROOT, result.canvas.file),
            { diffPath },
          );
          result.comparison.source = 'live-canvas-pair';
          result.evidenceReady = Boolean(
            result.fontState?.ready &&
              result.fontState?.figtree &&
              result.canvas.fontState?.ready &&
              result.canvas.fontState?.figtree &&
              result.evidenceConsoleErrors.length === 0 &&
              result.canvas.consoleErrors.length === 0,
          );
          if (!result.evidenceReady) {
            result.comparison.inconclusiveReason =
              'Шрифт Figtree не подтверждён или во время capture были console/page errors.';
          }
        }
      }
      results.push(result);
    }
  } finally {
    await browser.close();
    await canvasServer?.close();
  }

  if (mode === 'update-baselines') {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    for (const result of results.filter((entry) => entry.status === 'captured' && !entry.canvas)) {
      fs.copyFileSync(path.join(ROOT, result.file), path.join(BASELINE_DIR, `${result.id}.png`));
    }
  }

  if (mode === 'verify') {
    for (const result of results) {
      if (result.status !== 'captured') continue;
      if (result.canvas) continue;
      const baseline = path.join(BASELINE_DIR, `${result.id}.png`);
      if (!fs.existsSync(baseline)) {
        result.comparison = { ok: false, reason: 'Baseline отсутствует' };
      } else {
        result.comparison = await comparePng(path.join(ROOT, result.file), baseline);
      }
    }
  }

  const report = {
    schemaVersion: 2,
    mode,
    fixedClock: UI_V4_VISUAL_CLOCK.iso,
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    appOrigin: APP_ORIGIN,
    demoActivation: 'init-script@localhost',
    results,
    pending,
    domGates,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const failures = results.filter(
    (entry) =>
      entry.status === 'failed' ||
      (entry.gate === 'pixel' &&
        (entry.comparison?.ok === false || entry.evidenceReady === false)),
  );
  console.info(
    `[ui-v4-visual] ${results.length - failures.length}/${results.length} кадров готовы → ${OUT_DIR}`,
  );
  if (failures.length) {
    failures.forEach((entry) =>
      console.error(
        `[ui-v4-visual] ${entry.id}: ${entry.error || entry.comparison?.reason || 'pixel mismatch'}`,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[ui-v4-visual] failed:', error?.stack || error);
  process.exit(1);
});
