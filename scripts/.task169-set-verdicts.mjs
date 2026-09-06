import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';
import { readZone } from './lib/ui-v4-verdicts.mjs';

const updates = [
  {
    zone: 'cycle',
    key: 'Цикл · график веса · текст',
    verdict: '=',
    fact:
      'heys_day_stats_v1.js:4132-4134 — при hasCycleReportContext заголовок «Вес и тренд», иначе «Вес · 30 дней»; :4218-4220 .reports-v4-weight-cycle-footnote — «Пустые точки — дни с задержкой воды…»',
  },
  {
    zone: 'cycle',
    key: 'Цикл · график веса · 02',
    verdict: '=',
    fact:
      'heys_day_stats_v1.js:4132-4134 — заголовок «Вес и тренд» при hasCycleReportContext; 733-ui-v4-reports.css:84-92 .reports-v4-dynamics-card__label — 600 10.5px/1, letter-spacing .04em, color var(--v4-ink-3)',
  },
  {
    zone: 'cycle',
    key: 'Цикл · график веса · 03',
    verdict: '=',
    fact:
      'heys_day_stats_v1.js:4218-4220 .reports-v4-weight-cycle-footnote — подпись «Пустые точки — дни с задержкой воды…»; 733-ui-v4-reports.css:171-175 margin-top 6px, 500 10.5px/1.4',
  },
  {
    zone: 'registration',
    key: 'Регистрация · подписано · текст',
    verdict: '≠',
    fact:
      'копия экрана совпадает; версия «Обработка персональных данных» в продукте — 1.0 (heys_legal_versions_v1.js:16, heys_consents_v1.js:47), кадр демо «в. 1.4» — расхождение legal registry, не UI/CSS; передать legal review, код не менять без владельца',
    options: {
      'reason-code': 'logic-invariant',
      'decision-ref': 'apps/web/heys_legal_versions_v1.js:16',
    },
  },
];


// Снимок чужих строк до первой записи: всё, чего скрипт не называет своим,
// обязано остаться байт в байт. Промах в ключе или в фильтре зоны иначе
// переписал бы чужой вердикт молча и правдоподобно.
const __ownedByZone = (() => {
  const m = new Map();
  for (const r of updates) {
    if (!m.has(r.zone)) m.set(r.zone, new Set());
    m.get(r.zone).add(r.key);
  }
  return m;
})();
const __foreignBefore = new Map();
for (const [__z, __keys] of __ownedByZone) {
  __foreignBefore.set(__z, snapshotForeignRowStrings(readZone(__z).rows, __keys));
}
for (const row of updates) {
  const { was } = setVerdictKey(row.zone, row.key, {
    verdict: row.verdict,
    fact: row.fact,
    options: row.options ?? {},
  });
  console.log(`${row.zone} :: ${row.key}   ${was.v} → ${row.verdict}`);
}

console.log('done', updates.length);

// Сверка после последней записи.
for (const [__z, __snap] of __foreignBefore) {
  assertForeignRowsUnchanged(__snap, readZone(__z).rows);
}
console.log('чужие строки не тронуты:', [...__foreignBefore.keys()].join(', '));
