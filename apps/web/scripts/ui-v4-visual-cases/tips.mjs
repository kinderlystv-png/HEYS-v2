// Стенды советов (tips) для пар «макет — приложение».
//
// Кадры зоны — целые экраны 375×706 вкладки «Питание» под шторкой, панелью
// или всплывающим советом. Стенд открывает настоящий экран (лампочка в шапке,
// свайпы по карточке, ссылки детали, строка «Советы куратора» в настройках) —
// сцены в apps/web/heys_ui_v4_visual_fixture_zones_v1.js. Подменяется только
// вывод движка советов: набрать день под ровно эти советы нельзя.
//
// Снимок — окно целиком; пара собирается по плану tmp/pairs/plan.tips.json
// (кадр канваса переснимается сборщиком пар). Кадр «Адреса» — пояснение
// дизайнера о шапке, экрана за ним нет, стенд ему не заводится.

const CANVAS_FILE = 'tips.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';
const VIEWPORT = { width: 375, height: 706 };

const PALETTES = Object.freeze({
  sand: { suffix: '', id: 'sand' },
  'sand-dark': { suffix: ' · тёмная', id: 'sand-dark' },
  blue: { suffix: ' · синяя', id: 'blue' },
  'blue-dark': { suffix: ' · сине-тёмная', id: 'blue-dark' },
});

// Всплывающий совет показывается только при включённых советах — как у
// человека, который их не выключал.
const TOASTS_ON = Object.freeze({
  heys_advice_settings: { toastsEnabled: true, soundEnabled: false, demoSeeded: true },
});

const FRAMES = [
  { id: 'tips-drawer', label: 'Советы · шторка', root: '.advice-list-container--v4', palettes: ['sand', 'sand-dark'] },
  { id: 'tips-rate-panel', label: 'Совет · панель оценки', root: '.advice-list-item-wrapper--rating', palettes: ['sand', 'sand-dark', 'blue', 'blue-dark'] },
  { id: 'tips-unsaved', label: 'Советы · не сохранено', root: '.advice-v4-panel--sync', palettes: ['sand', 'sand-dark', 'blue', 'blue-dark'] },
  { id: 'tips-detail', label: 'Совет · деталь', root: '.advice-v4-detail', palettes: ['sand', 'sand-dark'] },
  { id: 'tips-science', label: 'Научное описание', root: '.advice-v4-science', palettes: ['sand', 'sand-dark', 'blue', 'blue-dark'] },
  { id: 'tips-toast', label: 'Совет · всплывающий', root: '.advice-v4-toast-card', palettes: ['sand', 'sand-dark'], lsKeys: TOASTS_ON },
  { id: 'tips-toast-rated', label: 'Совет · оценка после свайпа', root: '.advice-v4-panel--read', palettes: ['sand', 'sand-dark'], lsKeys: TOASTS_ON },
  { id: 'tips-hide-undo', label: 'Совет · отмена с таймером', root: '.advice-v4-panel--hide', palettes: ['sand', 'sand-dark'] },
  { id: 'tips-empty', label: 'Советы · пусто', root: '.advice-v4-empty-toast', palettes: ['sand', 'sand-dark'] },
  { id: 'tips-disclaimer', label: 'Оговорка', root: '.advice-v4-disclaimer-card', palettes: ['sand', 'sand-dark', 'blue', 'blue-dark'] },
  { id: 'tips-advice-settings', label: 'Настройки советов', root: '.advice-v4-settings', palettes: ['sand', 'sand-dark', 'blue', 'blue-dark'] },
];

function frameCases(frame) {
  return frame.palettes.map((paletteKey) => {
    const palette = PALETTES[paletteKey];
    return {
      id: `${frame.id}-${palette.id}`,
      zone: 'tips',
      status: 'automated',
      gate: 'diagnostic',
      kind: 'demo-v4-visual-frame',
      frameLabel: frame.label,
      tab: 'diary',
      themeId: palette.id,
      stubGamificationMerge: true,
      fixtureScript: FIXTURE_SCRIPT,
      rootSelector: frame.root,
      viewport: VIEWPORT,
      ...(frame.lsKeys ? { fixtureLsKeys: frame.lsKeys } : {}),
      // Кадр для плана пары: экран целиком, кадр переснимает сборщик.
      pairFrame: { file: CANVAS_FILE, label: `${frame.label}${palette.suffix}`, palette: palette.id },
    };
  });
}

// Кадр «Настройки · лист» этой зоны — тот же лист настроек, что и в
// settings-system: открывается штатным сценарием листа.
const SETTINGS_SHEET_CASES = ['sand', 'sand-dark'].map((paletteKey) => {
  const palette = PALETTES[paletteKey];
  return {
    id: `tips-settings-sheet-${palette.id}`,
    zone: 'tips',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-settings',
    tab: 'widgets',
    themeId: palette.id,
    stubGamificationMerge: true,
    rootSelector: '.tab-settings-menu--v4-sheet',
    viewport: VIEWPORT,
    pairFrame: { file: CANVAS_FILE, label: `Настройки · лист${palette.suffix}`, palette: palette.id },
  };
});

export const TIPS_VISUAL_CASES = Object.freeze([
  ...FRAMES.flatMap(frameCases),
  ...SETTINGS_SHEET_CASES,
]);
