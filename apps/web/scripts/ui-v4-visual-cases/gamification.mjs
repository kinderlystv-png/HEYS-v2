// Стенды геймификации для пар «макет — приложение».
//
// Лист открывается тапом по шапке геймификации на Главной, вкладки — тапом по
// ярлыкам, новый уровень начисляется настоящим addXP (сцены в
// apps/web/heys_ui_v4_visual_fixture_zones_v1.js). Подменяются только данные
// хранилища, которых на стенде нет: накопленный опыт, достижения, миссии дня и
// дни серии — они ложатся в снимок до загрузки страницы.
//
// Снимок — окно целиком; пара собирается по плану tmp/pairs/plan.gamification.json.

const CANVAS_FILE = 'gamification.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';
const VIEWPORT = { width: 375, height: 812 };
const TODAY = '2026-08-28';

const PALETTES = Object.freeze({
  sand: { suffix: '', id: 'sand' },
  'sand-dark': { suffix: ' · тёмная', id: 'sand-dark' },
  blue: { suffix: ' · синяя', id: 'blue' },
  'blue-dark': { suffix: ' · сине-тёмная', id: 'blue-dark' },
});

function isoDaysAgo(days) {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// День в коридоре калорий (~1 580 ккал на продуктах стенда) — засчитывается в серию.
function streakDay(date) {
  const item = (name, product_id, grams) => ({ id: `${date}-${product_id}`, product_id, productId: product_id, name, grams });
  return {
    date,
    weightMorning: 64.4,
    steps: 7200,
    waterMl: 1600,
    meals: [
      { id: `${date}-breakfast`, name: 'Завтрак', time: '08:30', items: [item('Овсяная каша', 'visual-oats', 300), item('Ягоды', 'visual-berries', 300)] },
      { id: `${date}-lunch`, name: 'Обед', time: '13:20', items: [item('Куриная грудка', 'visual-chicken', 300), item('Рис с овощами', 'visual-rice', 500)] },
    ],
    trainings: [],
  };
}

// Серия 5 дней с прощённым вчера: пять дней в коридоре, вчера пусто.
const STREAK_DAYS = [2, 3, 4, 5, 6].map((days) => streakDay(isoDaysAgo(days)));

const MISSION = {
  protein_50: { id: 'protein_50', name: 'Белковый старт', icon: '🥚', desc: 'Набери 50% нормы белка', xp: 15, type: 'protein', category: 'quality', target: 50, minLevel: 1 },
  kcal_90: { id: 'kcal_90', name: 'Почти в норме', icon: '🎯', desc: 'Набери 90% нормы калорий', xp: 30, type: 'kcal', category: 'nutrition', target: 90, minLevel: 6 },
  water_5_times: { id: 'water_5_times', name: 'Водный марафон', icon: '🚿', desc: 'Запиши воду 5 раз', xp: 25, type: 'water_entries', category: 'water', target: 5, minLevel: 5 },
  log_2_meals: { id: 'log_2_meals', name: 'Два приёма', icon: '🍽️', desc: 'Запиши 2 приёма пищи', xp: 15, type: 'meals', category: 'nutrition', target: 2, minLevel: 1 },
  add_5_products: { id: 'add_5_products', name: 'Разнообразие', icon: '🥗', desc: 'Добавь 5 разных продуктов', xp: 20, type: 'products', category: 'nutrition', target: 5, minLevel: 1 },
  water_50: { id: 'water_50', name: 'Полпути', icon: '💧', desc: 'Выпей 50% нормы воды', xp: 15, type: 'water', category: 'water', target: 50, minLevel: 1 },
};

function mission(key, progress, completed = false) {
  return { ...MISSION[key], progress, completed };
}

function gameData({ totalXP, level, unlockedAchievements, missions, dailyActions, achievementProgress = {}, dailyXP = {} }) {
  const now = Date.parse(`${TODAY}T09:30:00+03:00`);
  return {
    version: 2,
    totalXP,
    level,
    unlockedAchievements,
    dailyXP: { [TODAY]: dailyXP },
    dailyBonusClaimed: null,
    dailyActions: { date: TODAY, count: dailyActions },
    weeklyChallenge: { weekStart: isoDaysAgo(4), target: 500, earned: 260, type: 'xp' },
    missionHistory: [],
    missionStats: { totalAttempts: 0, totalCompleted: 0, byType: {}, completionRate: 0, favoriteCategories: [], lastUpdated: null },
    dailyMissions: { date: TODAY, missions, completedCount: missions.filter((m) => m.completed).length, bonusClaimed: false },
    achievementProgress,
    stats: { totalProducts: 640, totalWater: 180, totalTrainings: 22, totalAdvicesRead: 48, perfectDays: 6, bestStreak: 9 },
    morningActivationStreak: { current: 0, lastDoneDate: null },
    _lastKnownEventCount: 0,
    createdAt: now - 90 * 86400000,
    updatedAt: now,
  };
}

// Кадры «обзор», «Достижения», «Уровни»: 29 298 XP — 18-й уровень, серия 5,
// двадцать достижений из 36, ближе всего — «Клетчатка-чемпион» 5 из 7.
const OVERVIEW = gameData({
  totalXP: 29298,
  level: 18,
  unlockedAchievements: [
    'streak_1', 'streak_2', 'streak_3', 'streak_5',
    'first_checkin', 'first_meal', 'first_product', 'first_steps', 'first_advice',
    'first_supplements', 'first_water', 'first_training', 'first_household',
    'advice_reader', 'balanced_macros', 'water_day', 'level_5', 'level_10', 'level_15', 'crash_avoided',
  ],
  missions: [mission('protein_50', 32), mission('kcal_90', 37), mission('water_5_times', 5, true)],
  dailyActions: 12,
  achievementProgress: { fiber_champion: { current: 5, target: 7 } },
  dailyXP: { checkin_complete: 1, meal_added: 2, product_added: 4, water_added: 1, steps_updated: 1 },
});

// Кадр «первый день»: серии нет, 120 XP — 2-й уровень, два первых достижения.
const FIRST_DAY = gameData({
  totalXP: 120,
  level: 2,
  unlockedAchievements: ['first_meal', 'first_product'],
  missions: [mission('log_2_meals', 1), mission('add_5_products', 1), mission('water_50', 17)],
  dailyActions: 3,
  dailyXP: { meal_added: 1, product_added: 2 },
});

// Тихая минута: 27 490 XP — ещё 17-й; настоящее начисление переводит на 18-й.
const CEREMONY = gameData({
  ...OVERVIEW,
  totalXP: 27490,
  level: 17,
  missions: OVERVIEW.dailyMissions.missions,
  unlockedAchievements: OVERVIEW.unlockedAchievements,
  dailyActions: 12,
  achievementProgress: OVERVIEW.achievementProgress,
  dailyXP: OVERVIEW.dailyXP[TODAY],
});

function lsKeys(data, withStreak) {
  return {
    heys_game: data,
    'heys_demo-client-female_game': data,
    ...(withStreak ? Object.fromEntries(STREAK_DAYS.map((day) => [`heys_dayv2_${day.date}`, day])) : {}),
  };
}

const FRAMES = [
  { id: 'game-first-day', label: 'Геймификация · первый день', root: '.game-v4-sheet', data: lsKeys(FIRST_DAY, false) },
  { id: 'game-overview', label: 'Геймификация · обзор', root: '.game-v4-sheet', data: lsKeys(OVERVIEW, true) },
  { id: 'game-achievements', label: 'Достижения', root: '.game-v4-sheet', data: lsKeys(OVERVIEW, true) },
  { id: 'game-levels', label: 'Уровни', root: '.game-v4-sheet', data: lsKeys(OVERVIEW, true) },
];

const CEREMONY_MS = [0, 420, 1200, 1600];

function ceremonyLabel(ms, palette) {
  // Палитра в метке кадра стоит перед временем: «Новый уровень · тёмная · 420 мс».
  return `Новый уровень${palette.suffix} · ${ms} мс`;
}

function baseCase(id, frameLabel, palette, root, data) {
  return {
    id,
    zone: 'gamification',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-v4-visual-frame',
    frameLabel,
    tab: 'widgets',
    themeId: palette.id,
    stubGamificationMerge: true,
    fixtureScript: FIXTURE_SCRIPT,
    rootSelector: root,
    viewport: VIEWPORT,
    fixtureLsKeys: data,
  };
}

export const GAMIFICATION_VISUAL_CASES = Object.freeze([
  ...FRAMES.flatMap((frame) => Object.values(PALETTES).map((palette) => ({
    ...baseCase(`${frame.id}-${palette.id}`, frame.label, palette, frame.root, frame.data),
    pairFrame: { file: CANVAS_FILE, label: `${frame.label}${palette.suffix}`, palette: palette.id },
  }))),
  ...CEREMONY_MS.flatMap((ms) => Object.values(PALETTES).map((palette) => ({
    ...baseCase(`game-level-up-${ms}ms-${palette.id}`, `Новый уровень · ${ms} мс`, palette, '.game-v4-sheet', lsKeys(CEREMONY, true)),
    pairFrame: { file: CANVAS_FILE, label: ceremonyLabel(ms, palette), palette: palette.id },
  }))),
]);
