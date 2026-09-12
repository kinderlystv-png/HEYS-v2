// Стенды служебного слоя обновления (pwa-update) для пар «макет — приложение».
//
// Слои поднимаются теми же функциями продукта, что зовёт цикл обновления:
// HEYS.PWA.showUpdateModal('ready'), HEYS.PWA.showManualRefreshPrompt(version)
// и офлайн-баннер; подменяются только версия сборки и признак iOS (сцены в
// apps/web/heys_ui_v4_visual_fixture_zones_v1.js). Кадры «загрузка» и
// «перезагрузка» — анимация (data-demo="loop"), в пары не входят.
//
// Зона стоит в DOM-гейте (UI_V4_DOM_GATE_ZONES); стенды диагностические.

const CANVAS_FILE = 'pwa-update.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';
const VIEWPORT = { width: 375, height: 706 };

const FRAMES = [
  { id: 'pwa-update-ready', label: 'Обновление · готово', root: '#heys-update-modal .heys-update-modal__card' },
  { id: 'pwa-update-required', label: 'Требуется обновление · с версией', root: '#heys-update-modal .heys-update-prompt__card' },
  { id: 'pwa-update-required-no-version', label: 'Требуется обновление · без версии', root: '#heys-update-modal .heys-update-prompt__card' },
  { id: 'pwa-update-required-ios', label: 'Требуется обновление · iOS', root: '#heys-update-modal .heys-update-prompt__card' },
  { id: 'pwa-offline-banner', label: 'Офлайн-баннер', root: '#heys-offline-banner' },
];

export const PWA_UPDATE_VISUAL_CASES = Object.freeze(FRAMES.map((frame) => ({
  id: `${frame.id}-sand`,
  zone: 'pwa-update',
  status: 'automated',
  gate: 'diagnostic',
  kind: 'demo-v4-visual-frame',
  frameLabel: frame.label,
  tab: 'widgets',
  themeId: 'sand',
  stubGamificationMerge: true,
  fixtureScript: FIXTURE_SCRIPT,
  rootSelector: frame.root,
  viewport: VIEWPORT,
  pairFrame: { file: CANVAS_FILE, label: frame.label, palette: 'sand' },
})));
