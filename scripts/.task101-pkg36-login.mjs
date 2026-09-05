#!/usr/bin/env node
/** Task 101 package 36 — login zone verdicts (touch-target rows in contract prose). */
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'login';

const ROWS = [
  ['служебный вход', '=', 'ИСКЛЮЧЕНИЕ 44 pt (контракт login.v4.dc.html:159): .heys-auth-service-entry 44×44, svg 14px — 733-ui-v4-login-theme.css:978-1000; heys_login_screen_v1.js aria-label «Служебный вход»'],
  ['свёрнутое', '=', 'САМ РЯД 44 px: .heys-login-theme__dots min-height 44px — 733-ui-v4-login-theme.css:1140-1146; heys_login_theme_picker_v1.js dots trigger'],
  ['Оформление внутри приложения · 66', '—', 'Декорация кадра «Оформление внутри приложения»: предпросмотр Главной (кружок 40×40 в контракте ·66); живые FAB — home-widgets'],
];

const handoffKeys = new Set(ROWS.map((r) => r[0]));
const zone = readZone(ZONE);
const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);

for (const [key, verdict, fact] of ROWS) {
  const row = zone.rows[key];
  if (!row) {
    console.error('missing key', key);
    process.exit(1);
  }
  row.v = verdict;
  row.f = fact;
  delete row.reasonCode;
  delete row.decisionRef;
  if (verdict === '—') row.naKind = key === 'Оформление внутри приложения · 66' ? 'foreign-zone' : 'handoff';
}

assertForeignRowsUnchanged(foreignBefore, zone.rows);
writeZone(ZONE, zone);
console.log(`task101 pkg36 login: set ${ROWS.length} rows`);
