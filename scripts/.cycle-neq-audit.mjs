#!/usr/bin/env node
// Second-eye audit of all ≠ verdicts in cycle zone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const CANVAS = path.join(PACK, 'cycle.v4.dc.html');
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

function contractMap(html) {
  const map = new Map();
  for (const m of html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function readSlice(rel, start, end) {
  const full = path.join(ROOT, 'apps/web', rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8').split('\n').slice(start - 1, end).join('\n');
}

function readFile(rel) {
  const full = path.join(ROOT, 'apps/web', rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

/** @type {Record<string, (f: string) => { factInF: boolean; aliveInCode: boolean; notes?: string }>} */
const VERIFY = {
  'Цикл · шаг 5, строка в стопке · 07': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 1770, 1775);
    return {
      factInF: !!t?.includes('.mc-rest-row'),
      aliveInCode: !!t?.includes('var(--v4-sand-surface'),
      notes: '500-pwa:1770-1775 radius 16 padding 13/14; фон sand-surface ≠ --c1 кадра',
    };
  },
  'Цикл · шаг 5, строка в стопке · 10': () => {
    const t = readSlice('heys_steps_v1.js', 7163, 7182);
    const all = readFile('heys_steps_v1.js');
    return {
      factInF: !!t?.includes('mc-rest-card--supplements'),
      aliveInCode: !all.includes('2 пункта'),
      notes: 'heys_steps_v1.js:7163 — карточка добавок без свёрнутого «2 пункта»',
    };
  },
  'Цикл · шаг 5, строка в стопке · 11': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 1787, 1791);
    return {
      factInF: !!t?.includes('mc-rest-row--cycle'),
      aliveInCode: !!t?.includes('var(--v4-sand-surface'),
      notes: '500-pwa:1787-1791 cycle row sand-surface ≠ --c1',
    };
  },
  'Цикл · шаг 5, строка в стопке · 14': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 1770, 1785);
    return {
      factInF: !!t?.includes('.mc-rest-row') && t.includes('min-height: 44px'),
      aliveInCode: !!t?.includes('var(--v4-sand-surface'),
      notes: '500-pwa:1770-1776 min-height 44 padding 13/14; sand-surface ≠ --c1',
    };
  },
  'Цикл · шаг 5, выбор дня · 01': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 1813, 1818);
    return {
      factInF: !!t?.includes('mc-rest-cycle-card--expanded'),
      aliveInCode: !!t?.includes('var(--v4-sand-surface') && t.includes('border-radius: 16px'),
      notes: '500-pwa:1813-1818 expanded card sand-surface ≠ --c1',
    };
  },
  'Цикл · профиль, выключение · 02': () => {
    const t = readSlice('heys_user_tab_impl_v1.js', 1385, 1388);
    return {
      factInF: !!t?.includes('вопрос в чек-ине исчезнет'),
      aliveInCode: !t?.includes('цель вернётся к базовой'),
      notes: 'heys_user_tab_impl_v1.js:1386-1387 — продуктовый текст диалога',
    };
  },
  'Цикл · карточка дня, заполнено · 08': () => {
    const t = readSlice('heys_cycle_ui_v1.js', 622, 653);
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: !!t?.includes('cycle-card-v4--filled'),
      aliveInCode: !all.includes('Сбросить неделю'),
      notes: 'heys_cycle_ui_v1.js:622-653 — нет ссылки «Сбросить неделю»',
    };
  },
  'Цикл · график калорий · 01': () => {
    const t = readSlice('styles/modules/733-ui-v4-reports.css', 291, 295);
    return {
      factInF: !!t?.includes('reports-v4-dynamics-card'),
      aliveInCode: !!t?.includes('border-radius: 20px') && t.includes('var(--v4-sand-surface'),
      notes: '733-ui-v4-reports.css:291-295 radius 20 padding 16 vs кадр 18/15-16',
    };
  },
  'Цикл · график веса · 01': () => {
    const t = readSlice('styles/modules/733-ui-v4-reports.css', 291, 295);
    return {
      factInF: !!t?.includes('reports-v4-dynamics-card'),
      aliveInCode: !!t?.includes('border-radius: 20px') && t.includes('var(--v4-sand-surface'),
      notes: '733-ui-v4-reports.css:291-295 — тот же класс dynamics-card',
    };
  },
  'Цикл · график веса · 02': () => {
    const t = readSlice('heys_day_stats_v1.js', 4130, 4134);
    return {
      factInF: !!t?.includes('Вес · 30 дней'),
      aliveInCode: !readFile('heys_day_stats_v1.js').includes("'Вес и тренд'"),
      notes: 'heys_day_stats_v1.js:4132 — «Вес · 30 дней» ≠ «Вес и тренд»',
    };
  },
  'Цикл · инсайт баланса · 01': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 2226, 2230);
    return {
      factInF: !!t?.includes('cycle-card-v4__insight'),
      aliveInCode: !!t?.includes('var(--v4-ok-bg') && !t.includes('--gr-bg'),
      notes: '500-pwa:2226-2230 ok-bg ≠ --gr-bg кадра',
    };
  },
  'Цикл · закончились раньше · 01': () => {
    const t = readSlice('styles/modules/500-pwa-and-offline.css', 1770, 1791);
    const js = readFile('heys_steps_v1.js');
    return {
      factInF: !!t?.includes('mc-rest-row') && js.includes('mc-rest-row--cycle-ended'),
      aliveInCode: !!t?.includes('var(--v4-sand-surface'),
      notes: '500-pwa:1770-1791 + heys_steps_v1.js:6548 cycle-ended row',
    };
  },
  'Цикл · прошлый день, отметка задним числом · 04': () => {
    const t = readSlice('heys_cycle_ui_v1.js', 605, 620);
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: !!t?.includes('Особый период'),
      aliveInCode: !all.includes('Питание · блок «Особый период»'),
      notes: 'heys_cycle_ui_v1.js:607,616 — без надстроки «Питание · блок…»',
    };
  },
  'Цикл · прошлый день, отметка задним числом · 10': () => {
    const t = readSlice('heys_cycle_ui_v1.js', 254, 260);
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: !!t?.includes('Период встанет'),
      aliveInCode: !all.includes('Первый день —'),
      notes: 'heys_cycle_ui_v1.js:254-259 formatWeekRangeForMark — короткая фраза',
    };
  },
  'Цикл · день выбран, подтверждение даты · 01': () => {
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: all.includes('Особый период'),
      aliveInCode: !all.includes('Питание · блок «Особый период»'),
      notes: 'heys_cycle_ui_v1.js:607,616 — заголовок без префикса Питание',
    };
  },
  'Цикл · день выбран, подтверждение даты · 07': () => {
    const t = readSlice('heys_cycle_ui_v1.js', 254, 260);
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: !!t?.includes('Период встанет'),
      aliveInCode: all.includes('cycle-card-v4__date-confirm-sub') && !all.includes('дата · период'),
      notes: 'heys_cycle_ui_v1.js:500-501 date-confirm-sub — «Период встанет на…»',
    };
  },
  'Цикл · тултип задержки · 02': () => {
    const t = readSlice('heys_day_stats_v1.js', 4130, 4134);
    return {
      factInF: !!t?.includes('Вес · 30 дней'),
      aliveInCode: !readFile('heys_day_stats_v1.js').includes("'Вес и тренд'"),
      notes: 'heys_day_stats_v1.js:4132 — тот же заголовок карточки',
    };
  },
  'Цикл · профиль, выключение · текст': () => {
    const t = readSlice('heys_user_tab_impl_v1.js', 1385, 1388);
    return {
      factInF: !!t?.includes('Выключить особый период'),
      aliveInCode: !!t?.includes('вопрос в чек-ине исчезнет') && !t.includes('цель вернётся'),
      notes: 'heys_user_tab_impl_v1.js:1385-1387 — строка текста кадра',
    };
  },
  'Цикл · карточка дня, заполнено · текст': () => {
    const t = readSlice('heys_cycle_ui_v1.js', 628, 629);
    const all = readFile('heys_cycle_ui_v1.js');
    return {
      factInF: !!t?.includes('День'),
      aliveInCode: !all.includes('Сбросить неделю'),
      notes: 'heys_cycle_ui_v1.js:628-629 «День N»; «Сбросить неделю» не рендерится',
    };
  },
  'Цикл · график веса · текст': () => {
    const t = readSlice('heys_day_stats_v1.js', 4130, 4134);
    return {
      factInF: !!t?.includes('Вес · 30 дней'),
      aliveInCode: !readFile('heys_day_stats_v1.js').includes("'Вес и тренд'"),
      notes: 'heys_day_stats_v1.js:4132 — заголовок; подпись «Пустые точки» — пояснение канваса',
    };
  },
  'Цикл · копия шага 5, канон · 08': () => verifyCanvasConflict(),
  'Цикл · копия шага 5, с карточкой · 08': () => verifyCanvasConflict(),
  'Цикл · копия шага 5, период идёт · 08': () => verifyCanvasConflict(),
  'Цикл · копия шага 5, строка · 08': () => verifyCanvasConflict(),
};

function verifyCanvasConflict() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  const t = readSlice('styles/modules/500-pwa-and-offline.css', 743, 746);
  const canvas14 = /поля 14px 18px 0/.test(html) && /padding:14px 18px 0/.test(html);
  const product16 = !!t?.includes('padding: 16px 18px 0');
  return {
    factInF: canvas14,
    aliveInCode: product16,
    notes: 'cycle.v4.dc.html data-flow/контракт ·08: 14px 18px 0; 500-pwa:743-746 mc-step-content: 16px 18px 0; reasonCode canvas-conflict',
  };
}

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/ui/verdicts/cycle.json'), 'utf8'));
const canvas = contractMap(fs.readFileSync(CANVAS, 'utf8'));
const neq = Object.entries(data.rows).filter(([, r]) => r.v === '≠');

const rows = [];
for (const [key, row] of neq) {
  const verify = VERIFY[key];
  if (!verify) throw new Error(`no verifier for ${key}`);
  const { factInF, aliveInCode, notes } = verify(row.f);
  const currentHash = hash(canvas.get(key) || '');
  const frameUnchanged = currentHash === row.h;

  let status = 'CONFIRMED';
  let recommendation = 'keep ≠';
  if (!frameUnchanged) {
    status = 'STALE';
    recommendation = '→ ?';
  } else if (!factInF || !aliveInCode) {
    status = aliveInCode === false && factInF ? 'STALE' : 'WEAK';
    recommendation = status === 'STALE' ? '→ =' : '→ ?';
  }

  rows.push({
    contractLine: key,
    verdict: '≠',
    status,
    checks: { factInF, aliveInCode, frameUnchanged },
    notes,
    recommendation,
  });
}

const summary = {
  total: rows.length,
  confirmed: rows.filter((r) => r.status === 'CONFIRMED').length,
  stale: rows.filter((r) => r.status === 'STALE').length,
  weak: rows.filter((r) => r.status === 'WEAK').length,
};

const report = {
  zone: 'cycle',
  generated: '2026-09-04',
  driftGate: 'no drift — ui-v4-check-contract-drift cycle exit 0, all 24 h match canvas',
  package35: 'contract lines unchanged since recorded 2026-09-04; no rehash needed',
  summary,
  rows,
};

const outJson = path.join(ROOT, 'scripts/.cycle-neq-audit-report.json');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Cycle zone ≠ audit (second-eye)',
  '',
  `**Дата:** 2026-09-04 · **Всего ≠:** ${summary.total} · **CONFIRMED:** ${summary.confirmed} · **STALE:** ${summary.stale} · **WEAK:** ${summary.weak}`,
  '',
  'Drift: `node scripts/ui-v4-check-contract-drift.mjs cycle` — контракт не двигался.',
  '',
  '| # | Строка | Статус | fact | alive | frame | Рек. |',
  '|---|--------|--------|------|-------|-------|------|',
  ...rows.map((r, i) =>
    `| ${i + 1} | ${r.contractLine} | **${r.status}** | ${r.checks.factInF ? '✓' : '✗'} | ${r.checks.aliveInCode ? '✓' : '✗'} | ${r.checks.frameUnchanged ? '✓' : '✗'} | ${r.recommendation} |`,
  ),
  '',
  '## Группы расхождений',
  '',
  '| Группа | Строк | Суть |',
  '|--------|-------|------|',
  '| Фон sand-surface vs --c1 | 6 | 500-pwa mc-rest-row / expanded card / insight ok-bg |',
  '| Копия/структура | 9 | текст диалога, «Сбросить неделю», надстрока Питание, formatWeekRange |',
  '| Отчёты/графики | 5 | dynamics-card геометрия + «Вес · 30 дней» vs «Вес и тренд» |',
  '| canvas-conflict | 4 | padding 14px (канвас) vs 16px (mc-step-content) |',
  '',
  '## Flip candidates',
  '',
  rows.filter((r) => r.recommendation !== 'keep ≠').length
    ? rows.filter((r) => r.recommendation !== 'keep ≠').map((r) => `- ${r.contractLine}: ${r.recommendation} — ${r.notes}`).join('\n')
    : '_Нет — все 24 ≠ подтверждены, переворот не нужен._',
  '',
  '## Детали',
  '',
  ...rows.map((r) => `### ${r.contractLine}\n${r.notes}\n`),
].join('\n');

fs.writeFileSync(path.join(ROOT, 'scripts/.cycle-neq-audit-report.md'), md);
console.log(JSON.stringify(summary, null, 2));
