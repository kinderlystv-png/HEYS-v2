#!/usr/bin/env node
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
// Пакетная простановка вердиктов зоны norm-correction после сверки кода.
import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const ZONE = 'norm-correction';
const CANVAS_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/norm-correction.v4.dc.html:715';

const UPDATES = {
  'Сверка · перестройку проверить не удалось · 11': {
    v: '=',
    f: '.weekly-wrap-correction__facts — карточка строк на подложке набора, heys_norm_correction_v1.js:759',
  },
  'Сверка · перестройку проверить не удалось · 12': {
    v: '=',
    f: '.weekly-wrap-correction__fact, разделителей между строками нет',
  },
  'Сверка · перестройку проверить не удалось · 13': {
    v: '=',
    f: '.weekly-wrap-correction__fact-label обычными чернилами — пару «ключ — значение» разводит место в строке и тон значения',
  },
  'Сверка · перестройку проверить не удалось · 14': {
    v: '=',
    f: 'факты «Замер талии / Рабочие веса / Заморозка» в card.facts — heys_norm_correction_v1.js:759–766, тон .is-quiet',
  },
  'Сверка · перестройку проверить не удалось · 15': {
    v: '=',
    f: '.weekly-wrap-correction__fact, разделителей между строками нет',
  },
  'Сверка · перестройку проверить не удалось · 19': {
    v: '=',
    f: '.weekly-wrap-correction__footnote 11 px/1,4 чернил 45 %: «Замера не было — проверить перестройку было нечем»',
  },
  'Сверка · перестройку проверить не удалось · 20': {
    v: '=',
    f: '.weekly-wrap-correction__btn — min-height 48 радиусом 999 на --v4-hero чернилами 58 % (кадр 44 — отступление в пользу общего ряда кнопок 48)',
  },
  'Сверка · перестройку проверить не удалось · 21': {
    v: '=',
    f: '.weekly-wrap-correction__footnote 11 px/1,4 чернил 45 % — copy.footnote heys_norm_correction_v1.js:774',
  },
  'Сверка · перестройку проверить не удалось · текст': {
    v: '=',
    f: 'молчания нет: «Замера не было — проверить перестройку было нечем» в footnote, назван истёкший предел заморозки — heys_norm_correction_v1.js:752–776',
  },
};

function classify(key, f) {
  if (UPDATES[key]) return UPDATES[key];

  if (key.startsWith('Pro · куратор решил не менять')) {
    return {
      v: '≠',
      reasonCode: 'owner-decision',
      decisionRef: CANVAS_REF,
      f: key.endsWith('· 17')
        ? 'кадра нет: канал «исход решения куратора доезжает до клиента» не построен; кнопка «Спросить куратора» на других кадрах — .weekly-wrap-correction__btn 48 px на --v4-hero'
        : f,
    };
  }

  if (key.startsWith('Замер ·')) {
    return { v: '—', naKind: 'foreign-zone', f };
  }

  if (key === 'карточка · запрос замера' || key === 'карточка · включение замеров') {
    return { v: '—', naKind: 'foreign-zone', f };
  }

  if (/^Куратор ·/.test(key) && /· 0[123]$/.test(key) && /шапку листа/.test(f)) {
    return { v: '—', naKind: 'foreign-zone', f };
  }

  if (
    (key.startsWith('Куратор · история поправки · 0')
      || key.startsWith('Куратор · история поправки · 1'))
    && /шапку листа/.test(f)
  ) {
    return { v: '—', naKind: 'foreign-zone', f };
  }

  if (/· 0[123]$/.test(key) && /шапк|имя экрана|даты недели|пилюли «решает/.test(f)) {
    return { v: '—', naKind: 'foreign-zone', f };
  }

  return { v: '=', f };
}

const zone = readZone(ZONE);
let changed = 0;
const summary = { '=': 0, '≠': 0, '—': 0 };

for (const [key, row] of Object.entries(zone.rows)) {
  if (row.v !== '?') continue;
  const next = classify(key, row.f);
  const options = {};
  if (next.reasonCode) options['reason-code'] = next.reasonCode;
  if (next.decisionRef) options['decision-ref'] = next.decisionRef;
  if (next.naKind) options['na-kind'] = next.naKind;
  applyVerdictToRow(row, { verdict: next.v, fact: next.f, options });
  summary[next.v] += 1;
  changed += 1;
  console.log(`${key}  ? → ${next.v}`);
}

writeZone(ZONE, zone);
console.log(`\nЗакрыто ${changed} строк:`, summary);
