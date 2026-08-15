#!/usr/bin/env node
/**
 * One-shot cold-boot frame capture for HEYS home/widgets tab.
 * Usage (from repo root):
 *   HEYS_BOOT_CAPTURE_PHONE=9624556111 HEYS_BOOT_CAPTURE_PIN=0076 node apps/web/scripts/boot-frame-capture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(ROOT, 'tmp', 'boot-capture', new Date().toISOString().replace(/[:.]/g, '-'));
const BASE_URL = process.env.HEYS_BOOT_CAPTURE_URL || 'http://localhost:3001';
const PHONE = process.env.HEYS_BOOT_CAPTURE_PHONE || process.env.HEYS_TEST_PHONE || '';
const PIN = process.env.HEYS_BOOT_CAPTURE_PIN || process.env.HEYS_TEST_PIN || '';

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.length === 10 ? `7${digits}` : digits;
}

async function ensureLoggedIn(page) {
  if (!PHONE || !PIN) {
    throw new Error('Set HEYS_BOOT_CAPTURE_PHONE and HEYS_BOOT_CAPTURE_PIN (or HEYS_TEST_* env vars).');
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.HEYS?.auth?.loginClient && window.HEYS?.cloud), { timeout: 120_000 });

  const login = await page.evaluate(async ({ phone, pin }) => {
    const auth = window.HEYS?.auth;
    const cloud = window.HEYS?.cloud;
    if (!auth?.loginClient) return { ok: false, error: 'auth_not_ready' };
    const result = await auth.loginClient({ phone, pin });
    if (!result?.ok || !result.clientId) return { ok: false, error: result?.error || 'login_failed' };
    if (cloud?.switchClient) await cloud.switchClient(result.clientId);
    window.dispatchEvent(new CustomEvent('heys-auth-ready', { detail: { mode: 'client', clientId: result.clientId } }));
    return { ok: true, clientId: result.clientId };
  }, { phone: normalizePhone(PHONE), pin: PIN });

  if (!login.ok) throw new Error(`PIN login failed: ${login.error || 'unknown'}`);
  await page.waitForFunction(() => Boolean(window.__heysAppReady), { timeout: 120_000 });
  return login.clientId;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.info(`[boot-capture] output → ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'ru-RU',
  });

  try {
    const page = await context.newPage();

    const clientId = await ensureLoggedIn(page);
    console.info(`[boot-capture] logged in client=${String(clientId).slice(0, 8)}…`);

    await page.addInitScript(() => {
      const describeDom = () => {
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => document.querySelectorAll(sel).length;
        const text = (sel) => q(sel)?.textContent?.trim() || '';
        const badFlash = !!(
          q('.hdr-bottom')
          && q('.widgets-tab:not(.widgets-tab--loading)')
          && qa('.widgets-grid .widget-card') === 0
          && !document.getElementById('heys-boot-visual-guard')
          && !q('.heys-tab-skeleton--boot')
          && !q('.widgets-tab--loading .heys-tab-skeleton')
        );
        return {
          title: document.title,
          bootGuard: !!document.getElementById('heys-boot-visual-guard'),
          bootSkeleton: !!document.querySelector('[data-heys-boot-mark], [data-heys-boot-skeleton], .heys-tab-skeleton--boot'),
          widgetsLoading: !!q('.widgets-tab--loading'),
          widgetCards: qa('.widgets-grid .widget-card'),
          hdrTitle: text('.hdr-client-tab-title-text'),
          editBtn: text('.hdr-widgets-edit-btn--primary'),
          progressChip: text('#heys-loading-progress-chip'),
          visibleFrame: q('[data-heys-visible-frame]')?.getAttribute('data-heys-visible-frame') || '',
          badFlash,
          appReady: !!window.__heysAppReady,
          contentReady: !!window.__heysContentReady,
        };
      };

      window.__bootCapture = { frames: [], badFrames: [] };
      const push = (reason) => {
        const frame = { ms: Math.round(performance.now()), reason, ...describeDom() };
        const prev = window.__bootCapture.frames.at(-1);
        const key = JSON.stringify({ ...frame, ms: undefined, reason: undefined });
        const prevKey = prev ? JSON.stringify({ ...prev, ms: undefined, reason: undefined }) : null;
        if (key !== prevKey) {
          window.__bootCapture.frames.push(frame);
          if (frame.badFlash) window.__bootCapture.badFrames.push(frame);
        }
      };
      push('init');
      const id = setInterval(() => push('poll'), 40);
      window.addEventListener('DOMContentLoaded', () => push('domcontentloaded'), { once: true });
      window.addEventListener('load', () => push('load'), { once: true });
      window.addEventListener('heys:app-content-ready', () => push('app-content-ready'), { once: true });
      window.__bootCaptureStop = () => clearInterval(id);
    });

    const shotTimes = [];
    const captureShot = async (label, ms) => {
      const file = path.join(OUT_DIR, `${String(ms).padStart(5, '0')}ms-${label}.png`);
      await page.screenshot({ path: file, fullPage: false });
      shotTimes.push({ ms, label, file: path.basename(file) });
    };

    await captureShot('before-reload', 0);

    const reloadStarted = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });

    for (let i = 0; i < 40; i += 1) {
      const elapsed = Date.now() - reloadStarted;
      const snap = await page.evaluate(() => {
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => document.querySelectorAll(sel).length;
        const text = (sel) => q(sel)?.textContent?.trim() || '';
        const badFlash = !!(
          q('.hdr-bottom')
          && q('.widgets-tab:not(.widgets-tab--loading)')
          && qa('.widgets-grid .widget-card') === 0
          && !document.getElementById('heys-boot-visual-guard')
          && !q('.heys-tab-skeleton--boot')
          && !q('.widgets-tab--loading .heys-tab-skeleton')
        );
        return {
          bootGuard: !!document.getElementById('heys-boot-visual-guard'),
          widgetsLoading: !!q('.widgets-tab--loading'),
          widgetCards: qa('.widgets-grid .widget-card'),
          badFlash,
          progressChip: text('#heys-loading-progress-chip'),
        };
      });
      const label = [
        snap.bootGuard ? 'guard' : 'no-guard',
        snap.widgetsLoading ? 'w-loading' : (snap.widgetCards ? `${snap.widgetCards}cards` : 'no-cards'),
        snap.badFlash ? 'BAD' : 'ok',
        snap.progressChip ? 'chip' : 'nochip',
      ].join('_');
      await captureShot(label, elapsed);
      if (elapsed > 6000) break;
      if (snap.widgetCards > 0 && !snap.bootGuard && !snap.progressChip) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    await page.waitForFunction(() => window.__bootCaptureStop, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.__bootCaptureStop?.());

    const capture = await page.evaluate(() => window.__bootCapture || { frames: [], badFrames: [] });
    const report = {
      baseURL: BASE_URL,
      clientId,
      screenshots: shotTimes,
      frames: capture.frames,
      badFrames: capture.badFrames,
    };

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    console.info(`[boot-capture] frames=${capture.frames.length}, bad=${capture.badFrames.length}, shots=${shotTimes.length}`);
    if (capture.badFrames.length) {
      console.info('[boot-capture] BAD frames:');
      capture.badFrames.forEach((f) => console.info(`  ms=${f.ms} title=${f.title} chip=${f.progressChip}`));
    } else {
      console.info('[boot-capture] no badFlash frames detected');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[boot-capture] failed:', err?.message || err);
  process.exit(1);
});
