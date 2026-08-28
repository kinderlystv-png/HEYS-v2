const FIXED_NOW = '2026-08-28T09:30:00+03:00';
const FIXED_DAY = '2026-08-28';

export const UI_V4_VISUAL_CLOCK = Object.freeze({
  iso: FIXED_NOW,
  day: FIXED_DAY,
  epochMs: Date.parse(FIXED_NOW),
});

export const UI_V4_CANVAS_ZONES = Object.freeze([
  'home-widgets',
  'water-add',
  'checkin-morning',
  'nutrition-tab',
  'date-remainders',
  'undo-bar',
  'app-splash',
  'curator-edits',
  'gamification',
  'login',
  'pwa-update',
  'questionnaire',
  'registration',
  'settings-system',
  'spinners',
  'tips',
  'cycle',
]);

export const UI_V4_PIXEL_GATE_ZONES = Object.freeze([
  'curator-edits',
  'login',
  'registration',
]);

export const UI_V4_DOM_GATE_ZONES = Object.freeze([
  'app-splash',
  'pwa-update',
  'spinners',
  'undo-bar',
]);

export const UI_V4_VISUAL_CASES = Object.freeze([
  {
    id: 'login-default',
    zone: 'login',
    status: 'automated',
    gate: 'pixel',
    kind: 'login',
    rootSelector: '.heys-auth-shell',
  },
  {
    id: 'home-widgets-default',
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    rootSelector: '.widgets-grid .widget',
  },
  {
    id: 'nutrition-default',
    zone: 'nutrition-tab',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    rootSelector: '.nutrition-v4',
  },
  {
    id: 'settings-default',
    zone: 'settings-system',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-settings',
    tab: 'widgets',
    rootSelector: '.tab-settings-menu--v4-sheet',
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
    rootSelector: '.nutrition-v4-block[data-block="cycle"]',
    preserveScroll: true,
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
    gate: 'pixel',
    kind: 'demo-registration',
    tab: 'widgets',
    rootSelector: '.mc-modal[data-heys-step-id="profile-personal"]',
  },
  {
    id: 'curator-edits-default',
    zone: 'curator-edits',
    status: 'automated',
    gate: 'pixel',
    kind: 'demo-curator-edits',
    tab: 'widgets',
    rootSelector: '.ca-modal-backdrop--visible .ca-modal',
  },
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

export function buildUiV4VisualSnapshot() {
  const [oats, berries, chicken, rice] = PRODUCTS;
  const updatedAt = UI_V4_VISUAL_CLOCK.epochMs;
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
    updatedAt,
  };

  return {
    schemaVersion: 1,
    gender: 'female',
    pseudonym: 'Визуальный стенд',
    generatedAt: UI_V4_VISUAL_CLOCK.iso,
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
      },
      [`heys_dayv2_${FIXED_DAY}`]: {
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
      },
      heys_advice_settings: {
        toastsEnabled: false,
        soundEnabled: false,
        demoSeeded: true,
      },
    },
    products: PRODUCTS.map((product) => ({ ...product })),
  };
}
