// Стенды системных настроек (settings-system) для пар «макет — приложение».
//
// Все четыре кадра открываются настоящим путём человека, без имитации: лист
// настроек поднимает тот же обработчик, что и иконка в шапке
// (`window.__heysToggleTabSettingsHandler`), створки — клики по своим строкам
// («Диагностика», «Оформление», «Настроить подробно»), лист «Домашний экран» —
// штатный `HEYS.push.showIosHomeInstallGuide`. Сцены живут в
// apps/web/heys_ui_v4_visual_fixture_zones_v1.js; подменяется только ответ о
// подписке на пуши (строка «Настроить подробно» доступна лишь при включённых
// уведомлениях) — это ответ платформы, а не продуктовый компонент.
//
// Кадр «Настройки · список» снимает стенд settings-default в общем реестре.

const CANVAS_FILE = 'settings-system.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';
const VIEWPORT = { width: 375, height: 812 };

const FRAMES = [
  {
    id: 'settings-diagnostics',
    label: 'Настройки · диагностика',
    oid: 'SET-DIAG',
    // Ждём саму створку, а снимаем лист целиком — кадр рисует лист, докрученный
    // до низа, со створкой и строкой сборки.
    root: '.hdr-settings-sheet__diag-panel',
    capture: '.tab-settings-menu--v4-sheet',
  },
  {
    id: 'settings-home-screen-sheet',
    label: 'Домашний экран · лист',
    oid: 'SET-HOME',
    root: '.ios-home-install-modal',
    capture: '.ios-home-install-modal',
  },
  {
    id: 'settings-notify-detail',
    label: 'Настройки · настроить подробно',
    oid: 'SET-NOTIFY',
    root: '.notify-detail',
    capture: '.notify-detail',
  },
  {
    id: 'settings-fab-chips',
    label: 'Настройки · чипы быстрых действий',
    oid: 'SET-FAB',
    // Кадр рисует «Оформление» отдельным экраном; в продукте это раскрытая
    // створка строки «Оформление» — снимаем её целиком, расхождение состава
    // разобрано в UI_V4_FINDINGS.
    root: '.hdr-settings-sheet__fab-card',
    capture: '.hdr-settings-sheet__panel',
  },
];

export const SETTINGS_SYSTEM_VISUAL_CASES = Object.freeze(FRAMES.map((frame) => ({
  id: `${frame.id}-sand`,
  zone: 'settings-system',
  status: 'automated',
  gate: 'diagnostic',
  kind: 'demo-v4-visual-frame',
  frameLabel: frame.label,
  tab: 'widgets',
  themeId: 'sand',
  stubGamificationMerge: true,
  fixtureScript: FIXTURE_SCRIPT,
  rootSelector: frame.root,
  captureSelector: frame.capture,
  viewport: VIEWPORT,
  canvasFrame: { file: CANVAS_FILE, label: frame.label, oid: frame.oid, palette: 'sand' },
})));
