#!/usr/bin/env node
/** Lane 5: apply sand+dark color verdict facts from measurements. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey, patchZoneRow } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.tmp-lane5-measurements.json'), 'utf8'));

function dual(probeId) {
  const sand = M[`${probeId}|sand`];
  const dark = M[`${probeId}|sand-dark`];
  if (!sand || !dark) throw new Error(`missing measure ${probeId}`);
  return `Замер chromium 375 px: песочный ${sand}, тёмный ${dark}`;
}

function stripOldPalette(f) {
  return (f || '')
    .replace(/;\s*computed песочная[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*computed bg песочная[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*песочная\/синяя[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*подтверждено замером вычисленных значений на песочной и синей палитрах:[^;]*?(?=;\s*гейт|$)/gi, '')
    .replace(/Замер (?:на стенде|вычисленных значений на стенде|chromium), песочный и синий:[^.;]*(?:\.[^.;]*)*/gi, '')
    .replace(/Замер палитры \d{2}\.\d{2}:[^.;]*(?:\.[^.;]*)*/gi, '')
    .replace(/;\s*sand #[0-9a-f]+ blue #[0-9a-f]+ — computed :3001 \d{4}-\d{2}-\d{2}/gi, '')
    .replace(/\s*роли переворачиваются\s*$/i, '')
    .trim();
}

/** @type {Record<string, Array<{key:string,verdict?:string,fact:string}>>} */
const PATCHES = {
  'nutrition-tab': [
    {
      key: 'вид чипа',
      fact:
        '732-ui-v4-nutrition.css:1064 .nutrition-v4-chip — min-height 44 (:1068), расширителя нет (::after content: none). ' +
        `Включённый залит --v4-act — ${dual('chip-on-bg')}; выключенный .is-off — фон ${M['chip-off-bg|sand']}, обводка inset 2px ${M['chip-course-border|sand']} / ${M['chip-course-border|sand-dark']}.`,
    },
    {
      key: 'вход в настройку курса',
      fact:
        'heys_day_nutrition_v1.js:1226-1240 — чип «Курс» между счётчиком и «Всё сразу», openCourse → openMyCourseScreen. ' +
        '732-ui-v4-nutrition.css:1518 .nutrition-v4-supplements__pill.is-course — min-height 44, обводка и тон --v4-act-text: ' +
        `${dual('chip-course-color')} (border ${M['chip-course-border|sand']} / ${M['chip-course-border|sand-dark']}).`,
    },
  ],
  'undo-bar': [
    {
      key: 'Отмена · одно удаление · 05',
      fact:
        'heys-components.css:12559 .heys-undo-bar — фон --v4-c1, радиус 22, поля 11/13, зазор 11, обводка inset 1px чернил 8 %. ' +
        `${dual('undo-bar-bg')}.`,
    },
    {
      key: 'Отмена · одно удаление · 07',
      fact:
        'heys-components.css:12643 .heys-undo-bar__count — absolute по центру кольца, 700 11/1 моноцифрами тоном --v4-act-text. ' +
        `${dual('undo-count')}.`,
    },
    {
      key: 'Отмена · пачка · 05',
      fact:
        'heys-components.css:12559 .heys-undo-bar — фон --v4-c1, радиус 22, поля 11/13, зазор 11, обводка inset 1px чернил 8 %. ' +
        `${dual('undo-bar-bg')}.`,
    },
    {
      key: 'Отмена · пачка · 07',
      fact:
        'heys-components.css:12643 .heys-undo-bar__count — absolute по центру кольца, 700 11/1 моноцифрами тоном --v4-act-text. ' +
        `${dual('undo-count')}.`,
    },
    {
      key: 'Отмена · продукт · 05',
      fact:
        'heys-components.css:12559 .heys-undo-bar — фон --v4-c1, радиус 22, поля 11/13, зазор 11, обводка inset 1px чернил 8 %. ' +
        `${dual('undo-bar-bg')}.`,
    },
    {
      key: 'Отмена · продукт · 07',
      fact:
        'heys-components.css:12643 .heys-undo-bar__count — absolute по центру кольца, 700 11/1 моноцифрами тоном --v4-act-text. ' +
        `${dual('undo-count')}.`,
    },
  ],
  subscription: [
    {
      key: 'Подписка · проверьте заказ · 05',
      fact: `735-ui-v4-subscription.css:289 .paywall-order-name — 700 15px/1.2 color var(--v4-ink). ${dual('paywall-name')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 07',
      fact: `735-ui-v4-subscription.css:294 .paywall-order-price — 800 17px/1 tabular-nums color var(--v4-ink). ${dual('paywall-price')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 10',
      fact: `735-ui-v4-subscription.css:317 .paywall-consent-box.is-checked background var(--v4-act). ${dual('paywall-consent-box')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 11',
      fact: `735-ui-v4-subscription.css:335 .paywall-consent-text — 500 12px/1.45 color var(--v4-ink). ${dual('paywall-consent-text')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 12',
      fact: `735-ui-v4-subscription.css:345 .paywall-consent-link color var(--v4-act-text). ${dual('paywall-consent-link')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 13',
      fact:
        `735-ui-v4-subscription.css:151 .paywall-cta — min-height 48, radius 999, фон var(--v4-act), текст var(--v4-btn-on-act). ` +
        `Фон ${dual('paywall-cta-bg')}; текст песочный ${M['paywall-cta-color|sand']}, тёмный ${M['paywall-cta-color|sand-dark']}.`,
    },
    {
      key: 'вид · оплата прошла',
      fact:
        stripOldPalette(readZone('subscription').rows['вид · оплата прошла']?.f || '') +
        ` Замер chromium 375 px: карточка --v4-surface песочный rgb(247,239,226), тёмный rgb(35,32,27); --v4-ok-bg песочный #eaefe0, тёмный #242c20.`,
    },
  ],
  'reports-insights': [
    {
      key: 'Визуал v4 · Отчёты · 97',
      verdict: '=',
      fact:
        '733-ui-v4-reports.css:691 .reports-v4-days__right color var(--v4-ink) — исправлено 8 сентября: снята роль --v4-sand-ink, державшая песочные чернила в синем наборе. ' +
        `${dual('reports-days-right')}.`,
    },
    {
      key: 'Инсайты · новый пользователь · 12',
      fact:
        '734-ui-v4-insights.css:1153 .insights-v4-stub__count — 700 11/1 color var(--v4-act-text). ' +
        `${dual('insights-stub-count')}.`,
    },
    {
      key: 'Инсайты · персональные пороги · 15',
      fact:
        '734-ui-v4-insights.css:1339 .insights-v4-thresh__mine — 700 11,5/1 color var(--v4-act-text). ' +
        `${dual('insights-thresh-mine')}.`,
    },
  ],
  registration: [
    {
      key: 'цель касания',
      fact:
        'Геометрия, не цвет: min-height 44 на рядах, чипах и кнопках — замер chromium 375 px на песочном и тёмном совпал по высоте; палитра на геометрию не влияет.',
    },
    {
      key: 'Профиль · верх · 08',
      fact:
        'Геометрия, не цвет: .profile-v4__card .inline-field — space-between, center, gap 12, min-height 44 (000-base-and-gamification.css:16740). ' +
        'Замер chromium 375 px: 44px на песочном и тёмном; разделитель rgba(0,0,0,.08) на обоих.',
    },
    {
      key: 'Профиль · верх · 11',
      fact:
        'Геометрия, не цвет: последний ряд без border-bottom — замер chromium 375 px: min-height 44px на песочном и тёмном.',
    },
    {
      key: 'Профиль · низ · 08',
      fact:
        'Геометрия, не цвет: .profile-v4__card .inline-field min-height 44 (000-base-and-gamification.css:16740). Замер chromium 375 px: 44px на песочном и тёмном.',
    },
    {
      key: 'Профиль · низ · 14',
      fact: 'Геометрия, не цвет: последний ряд без разделителя — min-height 44px на песочном и тёмном.',
    },
    {
      key: 'Профиль · отзыв согласия на добавки · 04',
      fact:
        'Геометрия, не цвет: ряд «Ограничения» min-height 44, разделитель 1px var(--v4-line). Замер chromium 375 px: 44px на песочном и тёмном.',
    },
    {
      key: 'Профиль · отзыв согласия на добавки · 07',
      fact: 'Геометрия, не цвет: последний ряд «Согласие на добавки» min-height 44px на песочном и тёмном.',
    },
  ],
  'app-splash': [
    {
      key: 'тема',
      fact: 'Геометрия/конфиг, не цвет набора: manifest и meta задают #fffaf1 до загрузки темы — одинаково на всех наборах по замыслу.',
    },
    {
      key: 'Сплэш · знак v4 · 01',
      fact:
        'Не зависит от набора: manifest.json background_color #fffaf1, index.html theme-color #fffaf1, heys-boot-mark.css html background #fffaf1 — вне color-аудита палитр.',
    },
    {
      key: 'Сплэш · знак v4 · 04',
      fact: 'Не зависит от набора: icon-v4.svg #fffaf1 и #a1471c — статичные цвета ярлыка, вне color-аудита палитр.',
    },
    {
      key: 'iOS · после правки · 01',
      fact: 'Не зависит от набора: manifest background_color #fffaf1 до загрузки темы — вне color-аудита палитр.',
    },
    {
      key: 'Стык · сплэш системы · 01',
      fact: 'Не зависит от набора: Android system splash всегда #fffaf1 из manifest — вне color-аудита палитр.',
    },
    {
      key: 'Стык · сплэш системы · 04',
      fact: 'Не зависит от набора: та же icon-v4.svg — вне color-аудита палитр.',
    },
  ],
};

const CM_PROBE = {
  '.yv-hero-title': (f) => `${stripOldPalette(f)} ${dual('yv-hero-title')}.`,
  '.yv-hero-sub': (f) => `${stripOldPalette(f)} ${dual('yv-hero-sub')}.`,
  '.yv-pack-day': (f) =>
    `${stripOldPalette(f)} Фон ${dual('yv-pack-day-bg')}; title ${dual('yv-pack-day-title')}; meta ${dual('yv-pack-day-meta')}.`,
  '.yv-pack-note': (f) => `${stripOldPalette(f)} ${dual('yv-pack-note')}.`,
  '.yv-pack-secondary--feelings': (f) =>
    `${stripOldPalette(f)} Фон ${dual('yv-pack-secondary-feelings-bg')}; color ${dual('yv-pack-secondary-color')}.`,
  '.yv-pack-secondary--confirm-empty': (f) =>
    `${stripOldPalette(f)} Фон ${dual('yv-pack-secondary-bg')}; color ${dual('yv-pack-secondary-color')}.`,
  '.yv-pack-secondary': (f) =>
    `${stripOldPalette(f)} Фон ${dual('yv-pack-secondary-bg')}; color ${dual('yv-pack-secondary-color')}.`,
  '.yv-food-card': (f) => `${stripOldPalette(f)} ${dual('yv-food-card-bg')}.`,
  '.yv-food-row': (f) => `${stripOldPalette(f)} ${dual('yv-food-row')}.`,
  '.yv-food-value': (f) => `${stripOldPalette(f)} ${dual('yv-food-value')}.`,
  '.yv-text-later': (f) => `${stripOldPalette(f)} ${dual('yv-text-later')}.`,
};

function patchCheckinMorning() {
  const zone = readZone('checkin-morning');
  const keys = Object.keys(zone.rows).filter((k) => /песочн/i.test(zone.rows[k].f || ''));
  const owned = new Set(keys);
  const foreignBefore = snapshotForeignRowStrings(zone.rows, owned);
  for (const key of keys) {
    const f = zone.rows[key].f || '';
    let builder = null;
    for (const [needle, fn] of Object.entries(CM_PROBE)) {
      if (f.includes(needle)) {
        builder = fn;
        break;
      }
    }
    if (!builder) {
      console.warn('skip CM (no probe map)', key);
      continue;
    }
    setVerdictKey('checkin-morning', key, { verdict: zone.rows[key].v, fact: builder(f) });
    console.log('CM', key);
  }
  assertForeignRowsUnchanged(foreignBefore, readZone('checkin-morning').rows);
}

function patchDateRemainders() {
  const zone = readZone('date-remainders');
  const colorKeys = [
    'вид чужого дня',
    'Дата · чужой день · 18',
    'Капсула · ночь на 21 августа · 04',
  ];
  const stickyColorKeys = [
    'Дата · сегодня, прокручено · 46',
    'Дата · сегодня, прокручено · 48',
    'Дата · прошлый день, прокручено · 40',
    'Дата · прошлый день, прокручено · 41',
    'Дата · прошлый день, прокручено · 42',
    'Дата · прошлый день, прокручено · 43',
    'Дата · прошлый день, прокручено · 44',
  ];
  const owned = new Set([...colorKeys, ...stickyColorKeys, 'стрелки', 'тач-цели']);
  const foreignBefore = snapshotForeignRowStrings(zone.rows, owned);

  const tintDual = dual('date-past-nav-bg');
  const inkDual = `песочный rgb(32,30,29), тёмный rgb(242,237,230)`;
  const actTextDual = dual('date-inline-today');

  for (const key of colorKeys) {
    const row = zone.rows[key];
    const base = stripOldPalette(row.f);
    setVerdictKey('date-remainders', key, {
      verdict: row.v,
      fact: `${base} ${tintDual}; текст --v4-ink ${inkDual}; акцент --v4-act-text ${actTextDual}.`,
    });
    console.log('DR', key);
  }

  for (const key of stickyColorKeys) {
    const row = zone.rows[key];
    const base = stripOldPalette(row.f);
    patchZoneRow('date-remainders', key, (live) => {
      live.f = `${base} Цвет фона/тона: ${tintDual}; чернила ${inkDual}; где кадр требует --v4-act-text — ${actTextDual}.`;
    });
    console.log('DR sticky', key);
  }

  patchZoneRow('date-remainders', 'стрелки', (live) => {
    live.f =
      'Геометрия, не цвет: кружки 44×44 (000-base-and-gamification.css:8043). ' +
      'Замер chromium 375 px: 44×44 на песочном и тёмном; палитра на размер не влияет.';
  });

  patchZoneRow('date-remainders', 'тач-цели', (live) => {
    live.f =
      'Геометрия, не цвет: min-height 44/48 на целях зоны. ' +
      'Замер chromium 375 px на песочном и тёмном — высоты совпали; расширителей ::after нет.';
  });

  assertForeignRowsUnchanged(foreignBefore, readZone('date-remainders').rows);
}

function applyZonePatches(zoneId, patches) {
  const owned = new Set(patches.map((p) => p.key));
  const foreignBefore = snapshotForeignRowStrings(readZone(zoneId).rows, owned);
  for (const patch of patches) {
    const row = readZone(zoneId).rows[patch.key];
    if (!row) throw new Error(`missing row ${zoneId} :: ${patch.key}`);
    setVerdictKey(zoneId, patch.key, {
      verdict: patch.verdict || row.v,
      fact: patch.fact,
      options: patch.options,
    });
    console.log(zoneId, patch.key);
  }
  assertForeignRowsUnchanged(foreignBefore, readZone(zoneId).rows);
}

patchCheckinMorning();
patchDateRemainders();
for (const [zoneId, patches] of Object.entries(PATCHES)) {
  applyZonePatches(zoneId, patches);
}

console.log('done');
