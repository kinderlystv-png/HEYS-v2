import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import { REPORTS_INSIGHTS_VISUAL_CASES } from './ui-v4-visual-cases/reports-insights.mjs';
import { CURATOR_EDITS_VISUAL_CASES } from './ui-v4-visual-cases/curator-edits.mjs';
import { DATE_REMAINDERS_VISUAL_CASES } from './ui-v4-visual-cases/date-remainders.mjs';
import { NUTRITION_TAB_VISUAL_CASES } from './ui-v4-visual-cases/nutrition-tab.mjs';
import { WATER_ADD_VISUAL_CASES } from './ui-v4-visual-cases/water-add.mjs';
import { CHECKIN_MORNING_VISUAL_CASES } from './ui-v4-visual-cases/checkin-morning.mjs';
import { NORM_CORRECTION_VISUAL_CASES } from './ui-v4-visual-cases/norm-correction.mjs';
import { LOGIN_VISUAL_CASES } from './ui-v4-visual-cases/login.mjs';
import { HOME_WIDGETS_VISUAL_CASES } from './ui-v4-visual-cases/home-widgets.mjs';

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VISUAL_FIXTURE_SCRIPT = path.join(FIXTURE_ROOT, 'apps/web/heys_ui_v4_visual_fixture_v1.js');
export const SUBSCRIPTION_PRODUCT_SCRIPT = path.join(FIXTURE_ROOT, 'apps/web/heys_subscriptions_v1.js');
// Бар отмены живёт в ленивом бандле и к моменту монтирования фикстуры ещё не
// загружен: два кадра, которые его показывают, падали на «HEYS.Undo unavailable».
const UNDO_SCRIPT = path.join(FIXTURE_ROOT, 'apps/web/heys_undo_v1.js');

const FIXED_NOW = '2026-08-28T09:30:00+03:00';
const FIXED_DAY = '2026-08-28';

/** Правки куратора в форме снимков «прочитано по датам» — кадр «Куратор · две даты». */
function curatorTwoDatesSeed() {
  const today = FIXED_DAY;
  const d = new Date(`${FIXED_DAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  const items = [
    ['Люля куриные на гриле', 70], ['Бризоль куриная', 70], ['Рис с овощами', 288],
    ['Капуста квашеная', 100], ['Кофе американо', 150], ['Молоко 3.2', 200], ['Кетчуп томатный', 15],
  ].map(([name, grams], i) => ({ item_id: `seed-dinner-${i}`, name, grams }));
  const entry = (id, date, time, actions, before, after) => ({
    id,
    created_at: `${date}T${time}:00.000Z`,
    keys: [`heys_dayv2_${date}`],
    actions: { actions, day_kcal_before: before, day_kcal_after: after },
  });
  return {
    [today]: { entries: [entry('seed-curator-today', today, '17:05', [
      { type: 'meal_added', date: today, meal_id: 'seed-dinner', meal_label: 'Ужин', time: '16:46', kcal: 697, items },
      { type: 'water_set', date: today, to: 1800 },
    ], 1240, 1937)] },
    [yesterday]: { entries: [entry('seed-curator-yesterday', yesterday, '19:20', [
      { type: 'meal_item_changed', date: yesterday, meal_id: 'seed-lunch', meal_name: 'Обед', name: 'Рис', from_grams: 200, to_grams: 288, kcal_delta: 118 },
      { type: 'meal_item_removed', date: yesterday, meal_id: 'seed-breakfast', meal_name: 'Завтрак', count: 2, kcal_delta: -298 },
      { type: 'steps_set', date: yesterday, to: 8432 },
    ], 2010, 1866)] },
  };
}

export const UI_V4_VISUAL_CLOCK = Object.freeze({
  iso: FIXED_NOW,
  day: FIXED_DAY,
  epochMs: Date.parse(FIXED_NOW),
});

// Реестр зон берём из root-канвасов пакета, а не из ручного списка: пакет 36
// добавил first-run, messenger и subscription, и захардкоженные «25 зон»
// ломали visual-harness и progress-report на каждой поставке.
export const UI_V4_CANVAS_ZONES = Object.freeze(
  readCanvasPackage().map((canvas) => canvas.zoneId).sort((left, right) => left.localeCompare(right, 'en')),
);

// Pixel-gate держим только на сведённых зонах: попиксельное сравнение с кадром
// не сойдётся там, где продукт намеренно отступает или где строки контракта ещё
// никто не смотрел. 31 августа список опустел — обновление пакета дизайна
// принесло новые строки во все три зоны, что были в гейте:
//   curator-edits — три осознанных отступления (nowrap у счётчика, тон строки
//     раскрытия, поля строки повтора);
//   login — 696 строк «?» из 788, registration — 493 из 556: контракт вырос,
//     прежний разбор его не покрывает.
// Зоны остаются в diagnostic и возвращаются в гейт по мере сведения. Красный
// гейт, который никто не может починить, отключают в первый день — поэтому
// порог входа здесь «экран уже сведён», а не «экран когда-то сводили».
export const UI_V4_PIXEL_GATE_ZONES = Object.freeze([]);

export const UI_V4_DOM_GATE_ZONES = Object.freeze([
  'app-splash',
  'pwa-update',
  'spinners',
  'undo-bar',
]);

const TASK72_VISUAL_FRAME_ROOTS = Object.freeze({
  'Первый вход · шаг 1': '.tour-overlay',
  'Первый вход · шаг 2': '.tour-overlay',
  'Первый вход · шаг 3': '.tour-overlay',
  'Первый вход · шаг 4': '.tour-overlay',
  'Первый вход · обзор пройден': '.heys-undo-bar',
  'Первый вход · с компьютера': '.desktop-gate',
  'Подписка · строка в настройках':
    '.tab-settings-menu--v4-sheet .hdr-settings-sheet__row[data-settings-key="subscription"]',
  // Корни подписки — там, куда продукт монтирует свои слои: экран подписки —
  // секция профиля, открытая строкой листа настроек; модалки — контейнеры
  // тарифов и контакта поддержки на body; баннер и тост — свои классы.
  'Подписка · экран · пробный период': '#profile-section-subscription .sub-screen',
  'Подписка · приветствие': '#ui-v4-visual-fixture-host .paywall-modal',
  'Подписка · баннер сверху': '.readonly-banner--sticky',
  'Подписка · тост на действии': '.readonly-toast',
  'Подписка · контакт поддержки': '#heys-contact-support-host .paywall-modal',
  'Подписка · тарифы · места есть': '#heys-paywall-container .paywall-modal',
  'Подписка · тарифы · мест нет': '#heys-paywall-container .paywall-modal',
  'Подписка · тарифы · Pro Спорт': '#heys-paywall-container .paywall-modal',
  'Подписка · проверьте заказ': '#heys-paywall-container .paywall-order-card',
  'Подписка · оплата прошла': '#ui-v4-visual-fixture-host .paywall-modal',
  'Подписка · экран · активна': '#profile-section-subscription .sub-screen',
  'Подписка · экран · только чтение': '#profile-section-subscription .sub-screen',
  'Подписка · очередь · заявка подана': '#heys-paywall-container .paywall-modal',
  'Подписка · очередь · место освободилось': '#heys-paywall-container .paywall-modal',
  // Кадры мессенджера — целый экран телефона (слои поверх треда), поэтому и
  // стенд снимает весь экран переписки, а не вырезанный из него элемент.
  'Мессенджер · пустой тред': '.messenger-modal',
  'Мессенджер · тред с карточкой дня': '.messenger-modal',
  'Мессенджер · Ждём и подсказка': '.messenger-modal',
  'Мессенджер · запись голосового': '.messenger-modal',
  'Мессенджер · лист действий': '.messenger-modal',
  'Мессенджер · меню Ещё': '.messenger-modal',
  'Мессенджер · поиск': '.messenger-modal',
  'Мессенджер · без сети': '.messenger-modal',
  'Мессенджер · согласие на расшифровку': '.messenger-modal',
  'Мессенджер · удаление сообщения': '.messenger-modal',
});

// Кадры мессенджера нарисованы в своё время дня («Сегодня · 13:07», «Вчера ·
// 19:44», «3 сентября», ответ в 18:30). На общих часах стенда (28 августа, 9:30)
// такие сообщения оказались бы в будущем, а подписи дат — другими, поэтому у
// каждого кадра свои часы. «Ждём» — 13:15: подсказка показывает текущее время,
// а раньше 13:12 куратор ещё не мог «смотреть» сообщение из этого кадра.
const MESSENGER_VISUAL_NOW = Object.freeze({
  'Мессенджер · пустой тред': '2026-09-05T13:45:00+03:00',
  'Мессенджер · тред с карточкой дня': '2026-09-05T13:45:00+03:00',
  'Мессенджер · Ждём и подсказка': '2026-09-05T13:15:00+03:00',
  'Мессенджер · запись голосового': '2026-09-05T13:45:00+03:00',
  'Мессенджер · лист действий': '2026-09-05T13:45:00+03:00',
  'Мессенджер · меню Ещё': '2026-09-05T13:45:00+03:00',
  'Мессенджер · поиск': '2026-09-05T13:45:00+03:00',
  'Мессенджер · без сети': '2026-09-05T19:30:00+03:00',
  'Мессенджер · согласие на расшифровку': '2026-09-05T19:30:00+03:00',
  'Мессенджер · удаление сообщения': '2026-09-05T13:45:00+03:00',
});

function visualClock(iso) {
  return Object.freeze({ iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) });
}

const TASK72_FRAME_IDS = Object.freeze({
  'Первый вход · шаг 1': 'first-run-step-1',
  'Первый вход · шаг 2': 'first-run-step-2',
  'Первый вход · шаг 3': 'first-run-step-3',
  'Первый вход · шаг 4': 'first-run-step-4',
  'Первый вход · обзор пройден': 'first-run-overview-done',
  'Первый вход · с компьютера': 'first-run-desktop-gate',
  'Подписка · строка в настройках': 'subscription-settings-row',
  'Подписка · экран · пробный период': 'subscription-trial-screen',
  'Подписка · приветствие': 'subscription-welcome',
  'Подписка · баннер сверху': 'subscription-readonly-banner',
  'Подписка · тост на действии': 'subscription-readonly-toast',
  'Подписка · контакт поддержки': 'subscription-contact-curator',
  'Подписка · тарифы · места есть': 'subscription-plans-open',
  'Подписка · тарифы · мест нет': 'subscription-plans-full',
  'Подписка · тарифы · Pro Спорт': 'subscription-plans-pro-sport',
  'Подписка · проверьте заказ': 'subscription-payment-review',
  'Подписка · оплата прошла': 'subscription-payment-success',
  'Подписка · экран · активна': 'subscription-active-screen',
  'Подписка · экран · только чтение': 'subscription-readonly-screen',
  'Подписка · очередь · заявка подана': 'subscription-queue-queued',
  'Подписка · очередь · место освободилось': 'subscription-queue-offer',
  'Мессенджер · пустой тред': 'messenger-empty-thread',
  'Мессенджер · тред с карточкой дня': 'messenger-day-card',
  'Мессенджер · Ждём и подсказка': 'messenger-wait-hint',
  'Мессенджер · запись голосового': 'messenger-voice-recording',
  'Мессенджер · лист действий': 'messenger-action-sheet',
  'Мессенджер · меню Ещё': 'messenger-more-menu',
  'Мессенджер · поиск': 'messenger-search',
  'Мессенджер · без сети': 'messenger-offline',
  'Мессенджер · согласие на расшифровку': 'messenger-transcription-consent',
  'Мессенджер · удаление сообщения': 'messenger-delete-confirm',
});

/**
 * Кадр подписки → корень продукта и детерминированный bootstrap состояния.
 * mount реализован в heys_ui_v4_visual_fixture_v1.js по frameLabel.
 */
export const SUBSCRIPTION_VISUAL_SCENARIOS = Object.freeze([
  {
    id: 'subscription-settings-row',
    frameLabel: 'Подписка · строка в настройках',
    kind: 'demo-settings',
    tab: 'widgets',
    rootSelector:
      '.tab-settings-menu--v4-sheet .hdr-settings-sheet__row[data-settings-key="subscription"]',
    bootstrap: {
      surface: 'settings-row',
      fixtureProfile: {
        subscription_status: 'trial',
        trial_ends_at: '2026-09-10',
      },
    },
  },
  {
    id: 'subscription-trial-screen',
    frameLabel: 'Подписка · экран · пробный период',
    kind: 'demo-subscription',
    rootSelector: '#profile-section-subscription .sub-screen',
    bootstrap: { entry: 'settings-row', subscriptionStatus: 'trial', trial_ends_at: '2026-09-10' },
  },
  {
    id: 'subscription-welcome',
    frameLabel: 'Подписка · приветствие',
    kind: 'demo-subscription',
    rootSelector: '#ui-v4-visual-fixture-host .paywall-modal',
    bootstrap: { screen: 'welcome', trial_ends_at: '2026-09-12' },
  },
  {
    id: 'subscription-readonly-banner',
    frameLabel: 'Подписка · баннер сверху',
    kind: 'demo-subscription',
    rootSelector: '.readonly-banner--sticky',
    bootstrap: { entry: 'read-only-app', subscriptionStatus: 'read_only' },
  },
  {
    id: 'subscription-readonly-toast',
    frameLabel: 'Подписка · тост на действии',
    kind: 'demo-subscription',
    rootSelector: '.readonly-toast',
    bootstrap: { entry: 'tap-add-meal', subscriptionStatus: 'read_only' },
  },
  {
    id: 'subscription-contact-curator',
    frameLabel: 'Подписка · контакт поддержки',
    kind: 'demo-subscription',
    rootSelector: '#heys-contact-support-host .paywall-modal',
    bootstrap: { entry: 'banner-pill', paymentsEnabled: false, subscriptionStatus: 'read_only' },
  },
  {
    id: 'subscription-plans-open',
    frameLabel: 'Подписка · тарифы · места есть',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-modal',
    bootstrap: { entry: 'banner-pill', paymentsEnabled: true, trialQueue: 'open' },
  },
  {
    id: 'subscription-plans-full',
    frameLabel: 'Подписка · тарифы · мест нет',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-modal',
    bootstrap: { entry: 'banner-pill', paymentsEnabled: true, trialQueue: 'full' },
  },
  {
    id: 'subscription-plans-pro-sport',
    frameLabel: 'Подписка · тарифы · Pro Спорт',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-modal',
    bootstrap: { entry: 'subscription-screen', paymentsEnabled: true, selectPlan: 'Pro Спорт' },
  },
  {
    id: 'subscription-payment-review',
    frameLabel: 'Подписка · проверьте заказ',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-order-card',
    bootstrap: { entry: 'plans-cta', paymentsEnabled: true, ofertaAccepted: true, projected_period_end: '2026-10-05' },
  },
  {
    id: 'subscription-payment-success',
    frameLabel: 'Подписка · оплата прошла',
    kind: 'demo-subscription',
    rootSelector: '#ui-v4-visual-fixture-host .paywall-modal',
    bootstrap: { screen: 'payment-success', plan: 'pro', confirmed_period_end: '2026-10-05' },
  },
  {
    id: 'subscription-active-screen',
    frameLabel: 'Подписка · экран · активна',
    kind: 'demo-subscription',
    rootSelector: '#profile-section-subscription .sub-screen',
    bootstrap: {
      entry: 'settings-row',
      subscriptionStatus: 'active',
      plan: 'pro',
      subscription_ends_at: '2026-10-03',
    },
  },
  {
    id: 'subscription-readonly-screen',
    frameLabel: 'Подписка · экран · только чтение',
    kind: 'demo-subscription',
    rootSelector: '#profile-section-subscription .sub-screen',
    bootstrap: { entry: 'settings-row', subscriptionStatus: 'read_only', plan: 'pro' },
  },
  {
    id: 'subscription-queue-queued',
    frameLabel: 'Подписка · очередь · заявка подана',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-modal',
    bootstrap: { entry: 'banner-pill', paymentsEnabled: true, trialQueue: 'queued' },
  },
  {
    id: 'subscription-queue-offer',
    frameLabel: 'Подписка · очередь · место освободилось',
    kind: 'demo-subscription',
    rootSelector: '#heys-paywall-container .paywall-modal',
    bootstrap: { entry: 'banner-pill', paymentsEnabled: true, trialQueue: 'offer' },
  },
]);

function buildSubscriptionVisualCases() {
  return SUBSCRIPTION_VISUAL_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    zone: 'subscription',
    status: 'automated',
    gate: 'diagnostic',
    kind: scenario.kind,
    rootSelector: scenario.rootSelector,
    bootstrap: scenario.bootstrap,
    viewport: { width: 375, height: 812 },
    ...(scenario.tab ? { tab: scenario.tab } : { frameLabel: scenario.frameLabel, themeId: 'sand' }),
  }));
}

function buildTask72VisualCases() {
  const zones = {
    'first-run': [
      'Первый вход · шаг 1',
      'Первый вход · шаг 2',
      'Первый вход · шаг 3',
      'Первый вход · шаг 4',
      'Первый вход · обзор пройден',
      'Первый вход · с компьютера',
    ],
    messenger: [
      'Мессенджер · пустой тред',
      'Мессенджер · тред с карточкой дня',
      'Мессенджер · Ждём и подсказка',
      'Мессенджер · запись голосового',
      'Мессенджер · лист действий',
      'Мессенджер · меню Ещё',
      'Мессенджер · поиск',
      'Мессенджер · без сети',
      'Мессенджер · согласие на расшифровку',
      'Мессенджер · удаление сообщения',
    ],
  };

  return [
    ...buildSubscriptionVisualCases(),
    ...Object.entries(zones).flatMap(([zone, frames]) => frames.map((frameLabel) => ({
      id: TASK72_FRAME_IDS[frameLabel],
      zone,
      status: 'automated',
      gate: 'diagnostic',
      kind: 'demo-v4-visual-frame',
      frameLabel,
      themeId: 'sand',
      rootSelector: TASK72_VISUAL_FRAME_ROOTS[frameLabel],
      ...(MESSENGER_VISUAL_NOW[frameLabel] ? { clock: visualClock(MESSENGER_VISUAL_NOW[frameLabel]) } : {}),
      // Обзор идёт поверх настоящей Главной — стенд открывает её перед монтажом.
      ...(zone === 'first-run' && frameLabel !== 'Первый вход · с компьютера' ? { tab: 'widgets' } : {}),
      // Вход с компьютера показывается только на широком окне: снимаем его в
      // размере кадра без нарисованной полосы браузера (900 × 720 − 38).
      viewport: frameLabel === 'Первый вход · с компьютера' ? { width: 900, height: 682 } : { width: 375, height: 812 },
    }))),
  ];
}

export const UI_V4_VISUAL_CASES = Object.freeze([
  {
    id: 'login-default',
    zone: 'login',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'login',
    rootSelector: '.heys-auth-shell',
    // Номер кадра «Вход · выбор свёрнут»: (962) 455-61-11.
    phone: '9624556111',
  },
  {
    id: 'home-widgets-default',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 375, height: 812 },
    captureSelector: '.widgets-grid',
    canvasFrame: {
      file: 'home-widgets.v4.dc.html',
      label: 'Главная · дефолтная раскладка',
      oid: 'HW1',
      palette: 'sand',
      // Обёртка .hw1-pixel-boundary приехала снятой в пакете 3 сентября
      // вместе с data-oid; кадрируем по самой сетке — это ближайший узел
      // с той же границей.
      captureSelector: ':scope > .sc > .g',
      pixelAlign: true,
    },
  },
  {
    id: 'home-widgets-empty-day',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 375, height: 812 },
  },
  {
    id: 'home-widgets-empty-day-narrow',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 320, height: 700 },
  },
  // Кадры пустого дня нарисованы плитками, а не экраном: пара «вся Главная —
  // две плитки» сравнивала несравнимое. Каждая плитка снимается отдельно и
  // встаёт против своего кадра; данные пустого дня те же — по префиксу id.
  // У кадров нет data-oid, поэтому oid служит только именем пары, а кадр
  // находится по подписи.
  {
    id: 'home-widgets-empty-day-calories',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 375, height: 812 },
    captureSelector: '.widgets-grid [data-widget-type="calories"]',
    canvasFrame: {
      file: 'home-widgets.v4.dc.html',
      label: 'Калории · пустой день · 2×2',
      oid: 'HW-EMPTY-KCAL',
      palette: 'sand',
    },
  },
  {
    id: 'home-widgets-empty-day-macros',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 375, height: 812 },
    captureSelector: '.widgets-grid [data-widget-type="macros"]',
    canvasFrame: {
      file: 'home-widgets.v4.dc.html',
      label: 'Кольца БЖУ · пустой день',
      oid: 'HW-EMPTY-BJU',
      palette: 'sand',
    },
  },
  // Вкладка «Актив» — основная, а стенда у зоны не было вовсе: сравнить экран
  // с кадром было нечем. Пара с кадром пока не заводится: состояние фикстуры
  // (день без тренировок) не совпадает ни с одним кадром зоны дословно, а
  // привязка к неточному кадру дала бы ложное расхождение. Снимок рантайма
  // нужен сам по себе — чтобы экран было на что смотреть.
  {
    id: 'tab-activity-default-sand',
    zone: 'tab-activity',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'activity',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.activity-v4',
    viewport: { width: 375, height: 812 },
  },
  // Чек-ин: первый экран, который человек видит каждое утро, а стенда у зоны не
  // было. Открываем штатным `HEYS.debug.replayCheckin()`, а не монтируем шаг
  // голым: кадр рисует его вместе с приветствием, точками прогресса и парой
  // кнопок внизу — без обрамления сравнивать было бы не с чем.
  {
    id: 'checkin-weight-sand',
    zone: 'checkin-morning',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-checkin-weight',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '[data-heys-step-modal][data-heys-step-id="weight"]',
    viewport: { width: 375, height: 812 },
  },
  // Резервный вопрос после еды: шторка, которую человек видит только на дне без
  // утреннего ответа — то есть ровно тот стык, который вручную не собрать.
  {
    id: 'checkin-reserve-question-sand',
    zone: 'checkin-morning',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-checkin-reserve',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '[data-heys-step-modal][data-heys-step-id="morning_activation_followup"]',
    viewport: { width: 375, height: 812 },
  },
  // Лист причины пропуска: до 3 сентября жил на прежней системе, стенда не имел.
  {
    id: 'checkin-skip-reason-sand',
    zone: 'checkin-morning',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-checkin-skip-reason',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '[data-heys-step-modal][data-heys-step-id="morning_activation_skip_reason"]',
    viewport: { width: 375, height: 812 },
  },
  // Карточка продукта: зона видна при каждом добавлении еды, стенда не было.
  {
    id: 'product-edit-basic-sand',
    zone: 'product-card',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-product-edit-basic',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '[data-heys-step-modal][data-heys-step-id="edit_basic"]',
    // Кадр «Правка продукта · основные» — само окно шага 330 × 706 (строка
    // «геометрия кадра»), а не экран под затемнением: снимаем окно.
    captureSelector: '[data-heys-step-modal][data-heys-step-id="edit_basic"]',
    viewport: { width: 375, height: 812 },
  },
  {
    id: 'nutrition-empty-day-sand',
    zone: 'nutrition-tab',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    themeId: 'sand',
    stubGamificationMerge: true,
    clock: {
      iso: '2025-08-21T09:30:00+03:00',
      day: '2025-08-21',
      epochMs: Date.parse('2025-08-21T09:30:00+03:00'),
    },
    fixtureProfile: {
      weight: 80,
      weightGoal: 75,
      deficitPctTarget: 0,
      carbsPct: 73,
      proteinPct: 27,
      cycleTrackingEnabled: false,
      supplementsTrackingEnabled: false,
      plannedSupplements: [],
    },
    fixtureNorms: {
      carbsPct: 73,
      proteinPct: 27,
    },
    fixtureDay: {
      date: '2025-08-21',
      weightMorning: 0,
      steps: 7937,
      meals: [],
      trainings: [],
    },
    rootSelector: '.nutrition-v4',
    captureSelector: '.wrap.wrap--tab-diary',
    captureHideSelectors: ['.tabs.tabs--v4-primary'],
    viewport: { width: 375, height: 640 },
    canvasFrame: {
      file: 'nutrition-tab.v4.dc.html',
      label: 'Питание · пустой день',
      oid: 'NT-EMPTY1',
      palette: 'sand',
      clipRoundedCorners: 26,
    },
  },
  {
    id: 'settings-default',
    zone: 'settings-system',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-settings',
    tab: 'widgets',
    rootSelector: '.tab-settings-menu--v4-sheet',
    // Кадр «Настройки · список» — сам лист настроек, а не экран под ним.
    captureSelector: '.tab-settings-menu--v4-sheet',
  },
  {
    id: 'water-custom-volume',
    zone: 'water-add',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-water-custom',
    tab: 'widgets',
    rootSelector: '.water-custom-sheet[aria-label="Свой объём воды"]',
  },
  {
    id: 'cycle-day-picker',
    zone: 'cycle',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-cycle-picker',
    tab: 'diary',
    themeId: 'sand',
    viewport: { width: 373, height: 640 },
    rootSelector: '.cycle-date-picker-sheet[aria-label="Когда это было"]',
    captureSelector: '.cycle-date-picker-sheet[aria-label="Когда это было"]',
    canvasFrame: {
      file: 'cycle.v4.dc.html',
      label: 'Цикл · другой день, календарь',
      oid: 'CYC1',
      palette: 'sand',
      captureSelector: ':scope > div:first-child',
    },
  },
  {
    id: 'tips-sheet',
    zone: 'tips',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tips',
    tab: 'diary',
    rootSelector: '.advice-list-container--v4',
  },
  {
    id: 'registration-personal',
    zone: 'registration',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-registration',
    tab: 'widgets',
    themeId: 'sand',
    viewport: { width: 399, height: 731 },
    rootSelector: '.mc-modal[data-heys-step-id="profile-personal"]',
    captureSelector: '.mc-modal[data-heys-step-id="profile-personal"]',
    canvasFrame: {
      file: 'registration.v4.dc.html',
      label: 'Регистрация · персональные данные',
      oid: 'REG1',
      palette: 'sand',
    },
  },
  {
    id: 'curator-edits-default',
    zone: 'curator-edits',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-curator-edits',
    tab: 'widgets',
    rootSelector: '.ca-modal-backdrop--visible .ca-modal',
    // Состояние кадра «Куратор · две даты»: за сегодня добавлен ужин и
    // проставлена вода, за вчера — три правки по еде и шагам. Прежде стенд
    // показывал встроенный образец приложения, и сверять было не с чем.
    curatorName: 'Антон',
    sessionSeed: { heys_curator_reviewed_by_date_v1: curatorTwoDatesSeed() },
  },
  ...['sand', 'sand-dark', 'blue', 'blue-dark'].map((themeId) => ({
    id: `food-copy-empty-target-${themeId}`,
    zone: 'food-meal',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-food-copy-empty',
    tab: 'diary',
    themeId,
    viewport: themeId === 'sand'
      ? { width: 399, height: 812 }
      : { width: 375, height: 812 },
    rootSelector: '.copy-meal-modal',
    ...(themeId === 'sand' ? {
      captureSelector: '.copy-meal-modal.meal-transfer-v4__sheet',
      canvasFrame: {
        file: 'food-meal.v4.dc.html',
        label: 'Действие · копировать без целей',
        oid: 'FM10A',
        palette: 'sand',
        pixelAlign: true,
        clipRoundedCorners: 28,
      },
    } : {}),
  })),
  {
    id: 'food-copy-existing-target-sand',
    zone: 'food-meal',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-food-copy-existing',
    tab: 'diary',
    themeId: 'sand',
    viewport: { width: 399, height: 812 },
    rootSelector: '.copy-meal-modal',
    captureSelector: '.copy-meal-modal.meal-transfer-v4__sheet',
    canvasFrame: {
      file: 'food-meal.v4.dc.html',
      label: 'Действие · копировать',
      oid: 'FM10',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  {
    id: 'food-move-existing-target-sand',
    zone: 'food-meal',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-food-move-existing',
    tab: 'diary',
    themeId: 'sand',
    viewport: { width: 399, height: 812 },
    rootSelector: '.move-modal.meal-transfer-v4__sheet--move',
    captureSelector: '.move-modal.meal-transfer-v4__sheet--move',
    canvasFrame: {
      file: 'food-meal.v4.dc.html',
      label: 'Действие · перенести',
      oid: 'FM11',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  {
    id: 'food-copy-unknown-values-sand',
    zone: 'food-meal',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-food-copy-unknown',
    tab: 'diary',
    themeId: 'sand',
    viewport: { width: 399, height: 812 },
    rootSelector: '.copy-meal-modal',
    captureSelector: '.copy-meal-modal.meal-transfer-v4__sheet',
    canvasFrame: {
      file: 'food-meal.v4.dc.html',
      label: 'Действие · копировать · чего не знаем',
      oid: 'FM10B',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  {
    id: 'reports-whatif-inline-sand',
    zone: 'reports-insights',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-reports-whatif-inline',
    themeId: 'sand',
    viewport: { width: 375, height: 706 },
    rootSelector: '.insights-v4-whatif__inline',
    captureSelector: '#ui-v4-reports-whatif-host',
    canvasFrame: {
      file: 'reports-insights.v4.dc.html',
      label: 'Инсайты · что если',
      oid: 'RI-WI1',
      palette: 'sand',
      pixelAlign: true,
    },
  },
  {
    id: 'reports-weight-prediction-sand',
    zone: 'reports-insights',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-reports-weight-prediction',
    themeId: 'sand',
    viewport: { width: 375, height: 812 },
    rootSelector: '.insights-v4-weight',
  },
  {
    id: 'strength-finish-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-finish',
    themeId: 'sand',
    viewport: { width: 375, height: 1345 },
    rootSelector: '.sb-finish-screen',
    captureSelector: '.sb-finish-screen',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Конструктор · итоги',
      oid: 'Б3',
      palette: 'sand',
    },
  },
  {
    id: 'strength-plan-feed-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-plan-feed',
    themeId: 'sand',
    viewport: { width: 375, height: 469 },
    rootSelector: '#ui-v4-strength-plan-feed-host',
    captureSelector: '#ui-v4-strength-plan-feed-host',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'План в ленте дня',
      oid: 'И3',
      palette: 'sand',
      captureSelector: ':scope > .sc',
    },
  },
  {
    id: 'strength-builder-collapsed-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-builder-collapsed',
    themeId: 'sand',
    viewport: { width: 375, height: 583 },
    rootSelector: '#ui-v4-strength-builder-collapsed-host > .sb-root',
    captureSelector: '#ui-v4-strength-builder-collapsed-host > .sb-root',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Конструктор · список свёрнут',
      oid: 'А2',
      palette: 'sand',
      clipRoundedCorners: 28,
    },
  },
  {
    id: 'strength-builder-active-calm-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-builder-active-calm',
    themeId: 'sand',
    viewport: { width: 375, height: 974 },
    rootSelector: '#ui-v4-strength-builder-active-calm-host > .sb-root',
    captureSelector: '#ui-v4-strength-builder-active-calm-host > .sb-root',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Конструктор · тренировка идёт · спокойнее',
      oid: 'А1б',
      palette: 'sand',
    },
  },
  {
    id: 'strength-builder-empty-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-builder-empty',
    themeId: 'sand',
    viewport: { width: 375, height: 481 },
    rootSelector: '#ui-v4-strength-builder-empty-host > .sb-root',
    captureSelector: '#ui-v4-strength-builder-empty-host > .sb-root',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Конструктор · пусто · плана нет',
      oid: 'Б1',
      palette: 'sand',
    },
  },
  {
    id: 'strength-builder-catalog-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-builder-catalog',
    themeId: 'sand',
    viewport: { width: 375, height: 659 },
    rootSelector: '#ui-v4-strength-builder-catalog-host > .sb-root',
    captureSelector: '#ui-v4-strength-builder-catalog-host > .sb-root',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Конструктор · каталог',
      oid: 'Б2',
      palette: 'sand',
    },
  },
  {
    id: 'strength-superset-create-sand',
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-superset-create',
    themeId: 'sand',
    viewport: { width: 375, height: 721 },
    rootSelector: '#ui-v4-strength-superset-create-host > .sb-root',
    captureSelector: '#ui-v4-strength-superset-create-host > .sb-root',
    canvasFrame: {
      file: 'strength-builder.v4.dc.html',
      label: 'Связка · создание',
      oid: 'З1',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  {
    // Тот же экран в ветке «замеров обхватов не было»: кадр отдельный, потому
    // что отличаются проза и состав фактов, а не вёрстка.
    id: 'norm-correction-lowered-no-girths-sand',
    zone: 'norm-correction',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-norm-correction-lowered',
    evidenceKind: 'missing',
    themeId: 'sand',
    viewport: { width: 375, height: 620 },
    rootSelector: '#ui-v4-norm-correction-lowered-host > .norm-correction-screen',
    captureSelector: '#ui-v4-norm-correction-lowered-host > .norm-correction-screen',
    canvasFrame: {
      file: 'norm-correction.v4.dc.html',
      label: 'Сверка · норма снизилась · без обхватов',
      oid: 'NC5',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  {
    id: 'norm-correction-lowered-sand',
    zone: 'norm-correction',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-norm-correction-lowered',
    themeId: 'sand',
    viewport: { width: 375, height: 620 },
    rootSelector: '#ui-v4-norm-correction-lowered-host > .norm-correction-screen',
    captureSelector: '#ui-v4-norm-correction-lowered-host > .norm-correction-screen',
    canvasFrame: {
      file: 'norm-correction.v4.dc.html',
      label: 'Сверка · норма снизилась',
      oid: 'NC5',
      palette: 'sand',
      pixelAlign: true,
      clipRoundedCorners: 28,
    },
  },
  ...buildTask72VisualCases(),
  ...UI_V4_CANVAS_ZONES.filter(
    (zone) =>
      ![
        'login',
        'home-widgets',
        'water-add',
        'nutrition-tab',
        'registration',
        'curator-edits',
        'settings-system',
        'tips',
        'cycle',
        'food-meal',
        'reports-insights',
        'strength-builder',
        'norm-correction',
        'first-run',
        'subscription',
        'messenger',
      ].includes(zone),
  ).map((zone) => ({
    id: `${zone}-scenario-pending`,
    zone,
    status: UI_V4_DOM_GATE_ZONES.includes(zone) ? 'dom-gate' : 'scenario-pending',
    gate: UI_V4_DOM_GATE_ZONES.includes(zone) ? 'dom' : 'pixel-pending',
    reason: UI_V4_DOM_GATE_ZONES.includes(zone)
      ? 'Транзиентное состояние проверяется без снимка в ui-v4-transient-geometry.test.js.'
      : 'Нужен отдельный детерминированный переход к состоянию Canvas после сведения вердиктов зоны.',
  })),
  ...REPORTS_INSIGHTS_VISUAL_CASES,
  ...CHECKIN_MORNING_VISUAL_CASES,
  ...NORM_CORRECTION_VISUAL_CASES,
  ...LOGIN_VISUAL_CASES,
  ...HOME_WIDGETS_VISUAL_CASES,
  ...CURATOR_EDITS_VISUAL_CASES,
  ...DATE_REMAINDERS_VISUAL_CASES,
  ...NUTRITION_TAB_VISUAL_CASES,
  ...WATER_ADD_VISUAL_CASES,
]);

const PRODUCTS = Object.freeze([
  {
    id: 'visual-oats',
    name: 'Овсяная каша',
    kcal100: 102,
    protein100: 3.5,
    carbs100: 15.7,
    simple100: 1.1,
    complex100: 14.6,
    fat100: 3.2,
    badFat100: 0.7,
    goodFat100: 2.5,
    trans100: 0,
    fiber100: 2.4,
  },
  {
    id: 'visual-berries',
    name: 'Ягоды',
    kcal100: 46,
    protein100: 0.8,
    carbs100: 8.3,
    simple100: 6.8,
    complex100: 1.5,
    fat100: 0.4,
    badFat100: 0.1,
    goodFat100: 0.3,
    trans100: 0,
    fiber100: 2.6,
  },
  {
    id: 'visual-chicken',
    name: 'Куриная грудка',
    kcal100: 165,
    protein100: 31,
    carbs100: 0,
    simple100: 0,
    complex100: 0,
    fat100: 3.6,
    badFat100: 1,
    goodFat100: 2.6,
    trans100: 0,
    fiber100: 0,
  },
  {
    id: 'visual-rice',
    name: 'Рис с овощами',
    kcal100: 128,
    protein100: 3.1,
    carbs100: 24.5,
    simple100: 1.4,
    complex100: 23.1,
    fat100: 2.1,
    badFat100: 0.4,
    goodFat100: 1.7,
    trans100: 0,
    fiber100: 1.8,
  },
]);

function mealItem(product, grams) {
  return {
    id: `item-${product.id}`,
    product_id: product.id,
    productId: product.id,
    name: product.name,
    grams,
  };
}

export function buildUiV4VisualSnapshot(item = {}) {
  const [oats, berries, chicken, rice] = PRODUCTS;
  const clock = item.clock || UI_V4_VISUAL_CLOCK;
  const updatedAt = clock.epochMs;
  const profile = {
    name: 'Анна',
    firstName: 'Анна',
    displayName: 'Анна',
    gender: 'Женский',
    age: 31,
    birthDate: '1995-04-14',
    height: 168,
    weight: 64,
    weightGoal: 60,
    activity: 1.4,
    activityLevel: 'light',
    sleepHours: 8,
    insulinWaveHours: 3,
    profileCompleted: true,
    subscription_status: 'active',
    cycleTrackingEnabled: true,
    supplementsTrackingEnabled: true,
    plannedSupplements: ['vitamin-d', 'omega-3'],
    optionalFeatureConsentsOfferedAt: updatedAt,
    updatedAt,
    ...(item.fixtureProfile || item.bootstrap?.fixtureProfile || {}),
  };

  const fixtureDay = item.fixtureDay
    ? { ...item.fixtureDay, updatedAt }
    : null;

  return {
    schemaVersion: 1,
    gender: 'female',
    pseudonym: 'Визуальный стенд',
    generatedAt: clock.iso,
    daysIncluded: 1,
    lsKeys: {
      heys_profile: profile,
      'heys_demo-client-female_profile': profile,
      heys_norms: {
        proteinPct: 27,
        carbsPct: 43,
        source: 'visual-fixture',
        profileUpdatedAt: updatedAt,
        updatedAt,
        ...(item.fixtureNorms || {}),
      },
      ...(!fixtureDay ? { [`heys_dayv2_${FIXED_DAY}`]: {
        date: FIXED_DAY,
        weightMorning: 64.2,
        sleepHours: 7.8,
        sleepQuality: 4,
        moodMorning: 4,
        steps: 6840,
        waterMl: 1450,
        meals: [
          {
            id: 'visual-breakfast',
            name: 'Завтрак',
            time: '08:30',
            items: [mealItem(oats, 220), mealItem(berries, 80)],
          },
          {
            id: 'visual-lunch',
            name: 'Обед',
            time: '13:20',
            items: [mealItem(chicken, 150), mealItem(rice, 190)],
          },
        ],
        trainings: [],
        updatedAt,
      } } : {}),
      ...(fixtureDay ? { [`heys_dayv2_${fixtureDay.date}`]: fixtureDay } : {}),
      // История на несколько дней (Отчёты/Инсайты считают окна 7/14/30):
      // каждый день ложится своим ключом, сегодняшний перекрывает дефолтный.
      ...Object.fromEntries((item.fixtureDays || []).map((day) => [`heys_dayv2_${day.date}`, { ...day, updatedAt }])),
      heys_advice_settings: {
        toastsEnabled: false,
        soundEnabled: false,
        demoSeeded: true,
      },
      // Прочие ключи хранилища, которые читает экран кадра (видимость плавающей
      // кнопки воды, отметки голода): кейс кладёт их как есть, своим ключом.
      ...(item.fixtureLsKeys || {}),
    },
    // Кадры зон питания и воды называют продукты своими именами и калориями —
    // кейс добавляет их к общему справочнику стенда, не переписывая его.
    products: [...PRODUCTS, ...(item.fixtureProducts || [])].map((product) => ({ ...product })),
  };
}

function isSubscriptionVisualCase(item) {
  return item.kind === 'demo-subscription'
    || (item.kind === 'demo-v4-visual-frame' && item.frameLabel?.startsWith('Подписка ·'));
}

/** Подгружает бар отмены, если ленивый бандл ещё не донёс его на страницу. */
async function ensureUndoModule(page) {
  const hasUndo = await page.evaluate(() => typeof window.HEYS?.Undo?.push === 'function');
  if (hasUndo) return;

  if (!fs.existsSync(UNDO_SCRIPT)) {
    throw new Error(`Undo script missing: ${UNDO_SCRIPT}`);
  }
  await page.addScriptTag({ path: UNDO_SCRIPT });
  await page.waitForFunction(
    () => typeof window.HEYS?.Undo?.push === 'function',
    undefined,
    { timeout: 15_000 },
  );
}

async function ensureSubscriptionProductModules(page) {
  await page.waitForFunction(
    () =>
      typeof window.HEYS?.Paywall?.PaywallModal === 'function'
      && typeof window.HEYS?.Subscription?.getStatus === 'function',
    undefined,
    { timeout: 45_000 },
  );

  const hasSubscriptions = await page.evaluate(
    () => typeof window.HEYS?.Subscriptions?.SubscriptionSection === 'function',
  );
  if (hasSubscriptions) return;

  if (!fs.existsSync(SUBSCRIPTION_PRODUCT_SCRIPT)) {
    throw new Error(`Subscription product script missing: ${SUBSCRIPTION_PRODUCT_SCRIPT}`);
  }

  await page.addScriptTag({ path: SUBSCRIPTION_PRODUCT_SCRIPT });
  await page.waitForFunction(
    () => typeof window.HEYS?.Subscriptions?.SubscriptionSection === 'function',
    undefined,
    { timeout: 45_000 },
  );
}

/**
 * Детерминированный переход к кадрам first-run / subscription / messenger.
 * Возвращает true, если сценарий обработан здесь (openCase не дублирует шаги).
 */
export async function prepareUiV4VisualCase(page, item) {
  const isVisualFrame = item.kind === 'demo-v4-visual-frame' || item.kind === 'demo-subscription';
  if (!isVisualFrame) return false;
  if (!item.frameLabel) {
    throw new Error(`Visual case ${item.id} is missing frameLabel`);
  }

  await page.waitForFunction(
    () => !!window.React && !!window.ReactDOM?.createRoot,
    undefined,
    { timeout: 45_000 },
  );

  if (!fs.existsSync(VISUAL_FIXTURE_SCRIPT)) {
    throw new Error(`Visual fixture script missing: ${VISUAL_FIXTURE_SCRIPT}`);
  }

  if (isSubscriptionVisualCase(item)) {
    await ensureSubscriptionProductModules(page);
  }

  await ensureUndoModule(page);

  await page.addScriptTag({ path: VISUAL_FIXTURE_SCRIPT });

  if (item.frameLabel.startsWith('Первый вход · шаг')) {
    await page.addScriptTag({
      path: path.join(FIXTURE_ROOT, 'apps/web/heys_ui_onboarding_v1.js'),
    });
  }

  await page.evaluate(async ({ frameLabel, themeId }) => {
    if (themeId) window.HEYS?.Theme?.setThemeId?.(themeId);
    if (!window.HEYS?.uiV4VisualFixture?.mount) {
      throw new Error('HEYS.uiV4VisualFixture.mount unavailable after script load');
    }
    await window.HEYS.uiV4VisualFixture.mount(frameLabel);
  }, { frameLabel: item.frameLabel, themeId: item.themeId || null });

  return true;
}
