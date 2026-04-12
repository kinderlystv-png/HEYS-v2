#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

const BASE_URL = process.env.HEYS_AUDIT_URL || 'http://127.0.0.1:3001/?perf-audit=multi-user';
const RUN_DURATION_HINT_MS = 5 * 60 * 1000;

const USERS = [
  { id: 'user_a', phone: '89624556111', pin: '1234', label: 'User A' },
  { id: 'user_b', phone: '89624597111', pin: '7123', label: 'User B' },
];

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return digits.slice(1);
  }
  return digits.slice(-10);
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function summarizeConsoleEvents(events) {
  const summary = {
    log: 0,
    info: 0,
    warning: 0,
    error: 0,
  };
  for (const event of events) {
    if (event.type in summary) summary[event.type] += 1;
  }
  return summary;
}

async function tryClickByText(page, text, timeout = 1800) {
  try {
    await page.click(`text=${text}`, { timeout });
    await page.waitForTimeout(250);
    return true;
  } catch (e) {
    return false;
  }
}

async function loginClient(page, phone, pin) {
  const phone10 = normalizePhone(phone);
  const loginStart = Date.now();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await tryClickByText(page, 'Войти по телефону →', 800);

  const phoneInput = page.locator('input[placeholder="(999) 123-45-67"]').first();
  if (await phoneInput.count()) {
    await phoneInput.fill(phone10);
  }

  const pinInputs = page.locator('.heys-auth-pin-input');
  const pinCount = await pinInputs.count();
  if (pinCount >= 4) {
    for (let i = 0; i < 4; i += 1) {
      await pinInputs.nth(i).fill(String(pin[i] || ''));
      await page.waitForTimeout(80);
    }
  }

  await tryClickByText(page, 'Войти →', 1200);

  await Promise.race([
    page.waitForSelector('text=ДНЕВНИК ПИТАНИЯ', { timeout: 35000 }),
    page.waitForSelector('text=Научная аналитика', { timeout: 35000 }),
    page.waitForSelector('text=Итоги недели', { timeout: 35000 }),
  ]);

  return { loginDurationMs: Date.now() - loginStart };
}

async function runScenario(page) {
  const scenarioStartedAt = Date.now();

  await page.evaluate(() => {
    const analytics = window.HEYS?.analytics;
    if (!analytics) return;
    analytics.trackEvent?.('multi_user_perf_scenario_start', { at: Date.now() });
    analytics.startMeasure?.('multi_user_perf_scenario');
  });

  const interactions = [];
  const clickTargets = [
    '7д',
    '30д',
    'Неделя',
    'Месяц',
    'Показать дни недели',
    'Показать дни недели',
    'Это реальные данные',
    'Добавить стакан воды',
    'Добавить приём пищи',
  ];

  for (const target of clickTargets) {
    const ok = await tryClickByText(page, target);
    interactions.push({ type: 'click', target, ok });
  }

  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(200);
  }
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(180);
  }

  // Bottom navigation traversal (mobile labels)
  const bottomTabs = ['Отчёты', 'Дневник', 'Инсайты', 'Месяц', 'Задачи'];
  for (const tab of bottomTabs) {
    const ok = await tryClickByText(page, tab, 1200);
    interactions.push({ type: 'bottom-tab', target: tab, ok });
  }

  await page.waitForTimeout(1400);

  await page.evaluate(() => {
    const analytics = window.HEYS?.analytics;
    if (!analytics) return;
    const duration = analytics.endMeasure?.('multi_user_perf_scenario', { at: Date.now() }) || 0;
    analytics.trackInteraction?.('multi_user_perf_scenario', duration, { source: 'playwright' });
    analytics.trackEvent?.('multi_user_perf_scenario_end', { at: Date.now(), duration });
    analytics.flushPerformanceProfile?.();
  });

  return {
    scenarioDurationMs: Date.now() - scenarioStartedAt,
    interactions,
  };
}

async function collectStats(page) {
  return page.evaluate(() => {
    const stats = (window.heysStats && window.heysStats())
      || (window.HEYS?.analytics?.getStats && window.HEYS.analytics.getStats())
      || null;

    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
    } catch (e) {}

    const dayLikeKeys = keys.filter((k) => k.includes('dayv2_') && !k.includes('backup'));
    const dayDates = dayLikeKeys
      .map((k) => {
        const m = k.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
      })
      .filter(Boolean)
      .sort();

    const uniqueDayDates = Array.from(new Set(dayDates));

    return {
      stats,
      storage: {
        totalKeys: keys.length,
        dayLikeKeys: dayLikeKeys.length,
        uniqueDayDates: uniqueDayDates.length,
        minDate: uniqueDayDates[0] || null,
        maxDate: uniqueDayDates[uniqueDayDates.length - 1] || null,
      },
      sync: {
        pendingCount: window.HEYS?.cloud?.getPendingCount?.() ?? null,
        pendingDetails: window.HEYS?.cloud?.getPendingDetails?.() ?? null,
        syncStatus: window.HEYS?.cloud?.getSyncStatus?.() ?? null,
      },
    };
  });
}

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.stack || err.message || String(err);
}

async function runForUser(browser, user) {
  const context = await browser.newContext({
    viewport: { width: 500, height: 1024 },
    // Avoid stale SW serving old postboot hashes between bundle rebuilds (404 noise in metrics)
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  const consoleEvents = [];
  const pageErrors = [];
  const requestFails = [];

  page.on('console', (msg) => {
    consoleEvents.push({
      at: nowIso(),
      type: msg.type(),
      text: msg.text(),
    });
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ at: nowIso(), message: String(error?.message || error) });
  });
  page.on('requestfailed', (req) => {
    requestFails.push({
      at: nowIso(),
      url: req.url(),
      method: req.method(),
      reason: req.failure()?.errorText || 'request_failed',
    });
  });

  let login = null;
  let scenario = null;
  let collected = null;
  let status = 'ok';
  let failure = null;

  try {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('heys_perf_audit', '1');
        window.__HEYS_FORCE_PERF_AUDIT = true;
      } catch (e) {}
    });

    login = await loginClient(page, user.phone, user.pin);
    scenario = await runScenario(page);
    collected = await collectStats(page);
  } catch (err) {
    status = 'failed';
    failure = formatError(err);
  } finally {
    await context.close();
  }

  return {
    id: user.id,
    label: user.label,
    phoneMasked: `+7***${normalizePhone(user.phone).slice(-4)}`,
    status,
    failure,
    login,
    scenario,
    collected,
    consoleSummary: summarizeConsoleEvents(consoleEvents),
    pageErrors,
    requestFailedCount: requestFails.length,
    requestFailsTop: requestFails.slice(0, 20),
    consoleTop: consoleEvents
      .filter((event) => event.type === 'error' || event.type === 'warning')
      .slice(0, 40),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# Multi-user Performance Audit');
  lines.push('');
  lines.push(`- Run at: ${report.runAt}`);
  lines.push(`- Base URL: ${report.baseUrl}`);
  lines.push(`- Users: ${report.users.length}`);
  lines.push(`- Scenario target duration hint: ${Math.round(RUN_DURATION_HINT_MS / 1000)}s`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| User | Status | Login ms | Scenario ms | Unique day dates | LCP ms | CLS | LongTasks | Failed requests |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');

  for (const user of report.users) {
    const perf = user.collected?.stats?.performance || {};
    const storage = user.collected?.storage || {};
    lines.push(
      `| ${user.label} (${user.phoneMasked}) | ${user.status} | ${user.login?.loginDurationMs ?? '-'} | ${user.scenario?.scenarioDurationMs ?? '-'} | ${storage.uniqueDayDates ?? '-'} | ${perf.webVitals?.lcp ?? '-'} | ${perf.webVitals?.cls ?? '-'} | ${perf.longTasks?.count ?? '-'} | ${user.requestFailedCount ?? '-'} |`,
    );
  }
  lines.push('');

  lines.push('## Per User Details');
  lines.push('');
  for (const user of report.users) {
    const stats = user.collected?.stats || {};
    const perf = stats.performance || {};
    const storage = user.collected?.storage || {};
    const sync = user.collected?.sync || {};

    lines.push(`### ${user.label} (${user.phoneMasked})`);
    lines.push('');
    lines.push(`- Status: ${user.status}`);
    if (user.failure) lines.push(`- Failure: \`${user.failure}\``);
    lines.push(`- Login duration: ${user.login?.loginDurationMs ?? '-'} ms`);
    lines.push(`- Scenario duration: ${user.scenario?.scenarioDurationMs ?? '-'} ms`);
    lines.push(`- Events total: ${stats.events?.total ?? '-'}, slow interactions: ${stats.events?.slowInteractions ?? '-'}`);
    lines.push(`- LCP: ${perf.webVitals?.lcp ?? '-'} ms, CLS: ${perf.webVitals?.cls ?? '-'}, INP: ${perf.webVitals?.inp ?? '-'}`);
    lines.push(`- Long tasks: ${perf.longTasks?.count ?? '-'} (max ${perf.longTasks?.maxDuration ?? '-'} ms)`);
    lines.push(`- Scroll sessions: ${perf.scroll?.sessions ?? '-'}, jank rate: ${perf.scroll?.jankRate ?? '-'}%`);
    lines.push(`- Storage keys: ${storage.totalKeys ?? '-'}, day-like keys: ${storage.dayLikeKeys ?? '-'}, unique day dates: ${storage.uniqueDayDates ?? '-'}`);
    lines.push(`- Date range: ${storage.minDate ?? '-'} .. ${storage.maxDate ?? '-'}`);
    lines.push(`- Sync status: ${sync.syncStatus ?? '-'}, pending count: ${sync.pendingCount ?? '-'}`);
    lines.push(`- Console summary: ${JSON.stringify(user.consoleSummary)}`);
    lines.push(`- Request failures: ${user.requestFailedCount}`);
    lines.push('');

    if (user.consoleTop?.length) {
      lines.push('Top warnings/errors:');
      for (const event of user.consoleTop.slice(0, 8)) {
        lines.push(`- [${event.type}] ${event.text}`);
      }
      lines.push('');
    }
  }

  lines.push('## Raw Artifacts');
  lines.push('');
  lines.push(`- JSON: \`${report.rawJsonPath}\``);
  lines.push(`- Script: \`scripts/run-heys-multi-user-perf-audit.mjs\``);
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const startedAt = nowIso();
  const browser = await chromium.launch({ headless: true });
  const users = [];

  for (const user of USERS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runForUser(browser, user);
    users.push(result);
  }

  await browser.close();

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.resolve(process.cwd(), 'reports', 'performance');
  await ensureDir(reportDir);

  const rawJsonPath = path.join(reportDir, `multi-user-perf-audit-${ts}.json`);
  const mdPath = path.join(reportDir, `multi-user-perf-audit-${ts}.md`);

  const report = {
    runAt: startedAt,
    finishedAt: nowIso(),
    baseUrl: BASE_URL,
    users,
    rawJsonPath: path.relative(process.cwd(), rawJsonPath),
  };

  await fs.writeFile(rawJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const md = toMarkdown(report);
  await fs.writeFile(mdPath, `${md}\n`, 'utf8');

  // Machine-readable + human-readable output
  console.log(JSON.stringify({
    ok: true,
    markdown: path.relative(process.cwd(), mdPath),
    raw: path.relative(process.cwd(), rawJsonPath),
    users: users.map((u) => ({
      id: u.id,
      status: u.status,
      loginMs: u.login?.loginDurationMs ?? null,
      scenarioMs: u.scenario?.scenarioDurationMs ?? null,
      uniqueDayDates: u.collected?.storage?.uniqueDayDates ?? null,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
