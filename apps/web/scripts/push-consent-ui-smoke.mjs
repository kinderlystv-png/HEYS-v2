#!/usr/bin/env node
/**
 * Push consent 1.2 UI smoke (prod or local).
 *   HEYS_SMOKE_URL=https://app.heyslab.ru \
 *   HEYS_SMOKE_PHONE=9624556111 HEYS_SMOKE_PIN=0076 \
 *   node apps/web/scripts/push-consent-ui-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(ROOT, 'tmp', 'push-consent-smoke', new Date().toISOString().replace(/[:.]/g, '-'));
const BASE_URL = (process.env.HEYS_SMOKE_URL || 'https://app.heyslab.ru').replace(/\/$/, '');
const PHONE = process.env.HEYS_SMOKE_PHONE || process.env.HEYS_BOOT_CAPTURE_PHONE || '';
const PIN = process.env.HEYS_SMOKE_PIN || process.env.HEYS_BOOT_CAPTURE_PIN || '';

const MARKERS = {
  naprimer: /например/i,
  autoParagraph: /формируются автоматически/i,
  onlyMyDevice: /прочитать текст уведомления может только мо[ёе] устройство/i,
  mozilla: /Mozilla[\s\S]{0,40}Corporation/i,
};
const STALE = /ключ шифрования есть только у мо[ёе]го устройства/i;

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.length === 10 ? `7${digits}` : digits;
}

function checkDocText(text) {
  const hits = {};
  for (const [key, re] of Object.entries(MARKERS)) {
    hits[key] = re.test(text);
  }
  hits.staleDraft = STALE.test(text);
  hits.allFresh = Object.entries(MARKERS).every(([, re]) => re.test(text)) && !hits.staleDraft;
  return hits;
}

async function ensureLoggedIn(page) {
  if (!PHONE || !PIN) throw new Error('Set HEYS_SMOKE_PHONE and HEYS_SMOKE_PIN');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.HEYS?.auth?.loginClient && window.HEYS?.cloud), { timeout: 120_000 });
  const login = await page.evaluate(async ({ phone, pin }) => {
    const result = await window.HEYS.auth.loginClient({ phone, pin });
    if (!result?.ok || !result.clientId) return { ok: false, error: result?.error || 'login_failed' };
    if (window.HEYS.cloud?.switchClient) await window.HEYS.cloud.switchClient(result.clientId);
    window.dispatchEvent(new CustomEvent('heys-auth-ready', { detail: { mode: 'client', clientId: result.clientId } }));
    return { ok: true, clientId: result.clientId };
  }, { phone: normalizePhone(PHONE), pin: PIN });
  if (!login.ok) throw new Error(`PIN login failed: ${login.error || 'unknown'}`);
  await page.waitForFunction(() => Boolean(window.__heysAppReady), { timeout: 120_000 });
  return login.clientId;
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = { baseURL: BASE_URL, steps: [], doc: null, push: null, consents: null, ok: false };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'ru-RU',
    permissions: ['notifications'],
    viewport: { width: 390, height: 844 },
  });

  try {
    const page = await context.newPage();
    const clientId = await ensureLoggedIn(page);
    report.clientId = clientId;
    report.steps.push({ step: 'login', ok: true });

    const docResp = await context.request.get(`${BASE_URL}/docs/v1.2/push-notifications-consent.md`);
    const docText = await docResp.text();
    report.doc = { status: docResp.status(), ...checkDocText(docText) };
    report.steps.push({ step: 'doc_markers', ok: report.doc.allFresh });
    await shot(page, '01-push-doc');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__heysAppReady && window.HEYS?.Consents?.api?.setPushConsent), { timeout: 120_000 });
    await page.waitForFunction(() => typeof window.HEYS?.push?.setEnabled === 'function', { timeout: 120_000 }).catch(() => false);

    const before = await page.evaluate(async () => {
      const r = await window.HEYS.Consents.api.getMyConsents();
      const push = (r.consents || []).find((c) => c.type === 'push_notifications');
      const status = window.HEYS.push ? await window.HEYS.push.getStatus() : null;
      return { consents: r, push, status, legalVersion: window.HEYS?.LegalVersions?.push_notifications };
    });
    report.before = before;

    const pushResult = await page.evaluate(async ({ pin }) => {
      const api = window.HEYS?.Consents?.api;
      if (!api?.setPushConsent) return { ok: false, error: 'consents_api_missing' };
      let consent = await api.setPushConsent(true);
      if (!consent?.success && consent?.needsAccessCode && pin) {
        consent = await api.setPushConsent(true, pin);
      }
      let enabled = null;
      if (window.HEYS?.push?.setEnabled) {
        enabled = await window.HEYS.push.setEnabled(true, pin ? { accessCode: pin } : {});
      }
      return { consent, enabled, legalVersion: window.HEYS?.LegalVersions?.push_notifications };
    }, { pin: PIN });
    report.push = pushResult;
    report.steps.push({ step: 'setEnabled', ok: !!(pushResult?.consent?.success), detail: pushResult });

    await page.waitForTimeout(1500);

    const after = await page.evaluate(async () => {
      const r = await window.HEYS.Consents.api.getMyConsents();
      const push = (r.consents || [])
        .filter((c) => c.type === 'push_notifications' && c.granted)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const status = window.HEYS.push ? await window.HEYS.push.getStatus() : null;
      return { consents: r, push, status };
    });
    report.after = after;
    report.consents = after.push || null;

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__heysAppReady), { timeout: 120_000 });

    await page.evaluate(() => {
      window.__heysPendingUserSection = 'consents';
      if (window.HEYS?.ui?.switchTab) window.HEYS.ui.switchTab('user');
      window.dispatchEvent(new CustomEvent('heys:open-user-section', { detail: { id: 'consents' } }));
    });
    await page.waitForSelector('.profile-field-group__title', { timeout: 30_000 });
    await page.getByText('Мои согласия', { exact: false }).first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await shot(page, '03-my-consents');

    const uiText = await page.evaluate(() => {
      const consentsBlock = [...document.querySelectorAll('.profile-field-group')]
        .find((el) => el.textContent?.includes('Мои согласия'));
      return consentsBlock?.innerText || document.body.innerText.slice(0, 8000);
    });
    report.uiConsentsText = uiText;
    report.uiHasPush12 = /Push-уведомления[\s\S]*Версия\s+1\.2/i.test(uiText)
      || /Push-уведомления[\s\S]*1\.2/.test(uiText);

    report.ok = report.doc.allFresh
      && !!(after.push?.granted)
      && String(after.push?.version || '') === '1.2'
      && report.uiHasPush12
      && !!(pushResult?.consent?.success);

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.info(JSON.stringify({
      ok: report.ok,
      outDir: OUT_DIR,
      pushVersion: after.push?.version,
      consentSuccess: pushResult?.consent?.success,
      consentError: pushResult?.consent?.error || pushResult?.error,
      doc: report.doc,
    }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (err) {
    report.error = err?.message || String(err);
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[push-consent-smoke] failed:', err?.message || err);
  process.exit(1);
});
