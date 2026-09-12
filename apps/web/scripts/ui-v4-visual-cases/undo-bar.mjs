// Стенды бара отмены (undo-bar) для пар «макет — приложение».
//
// Бар поднимается настоящим HEYS.Undo.push над вкладкой «Питание»; счётчик
// секунд — часы стенда, сдвинутые на нужную секунду (сцены в
// apps/web/heys_ui_v4_visual_fixture_zones_v1.js). Кадр рисует бар на плашке
// экрана, поэтому пара сводится по самому бару: узел .heys-undo-bar против
// узла бара в кадре.
//
// Зона стоит в DOM-гейте (UI_V4_DOM_GATE_ZONES); стенды диагностические.

const CANVAS_FILE = 'undo-bar.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';

const FRAMES = [
  { id: 'undo-bar-single', label: 'Отмена · одно удаление', oid: 'UB1' },
  { id: 'undo-bar-batch', label: 'Отмена · пачка', oid: 'UB2' },
  { id: 'undo-bar-product', label: 'Отмена · продукт', oid: 'UB3' },
];

export const UNDO_BAR_VISUAL_CASES = Object.freeze(FRAMES.map((frame) => ({
  id: `${frame.id}-sand`,
  zone: 'undo-bar',
  status: 'automated',
  gate: 'diagnostic',
  kind: 'demo-v4-visual-frame',
  frameLabel: frame.label,
  tab: 'diary',
  themeId: 'sand',
  stubGamificationMerge: true,
  fixtureScript: FIXTURE_SCRIPT,
  rootSelector: '.heys-undo-bar--visible',
  captureSelector: '.heys-undo-bar',
  viewport: { width: 375, height: 706 },
  canvasFrame: {
    file: CANVAS_FILE,
    label: frame.label,
    oid: frame.oid,
    palette: 'sand',
    // Четвёртый узел кадра — сам бар (плашка экрана и меню — контекст).
    captureSelector: ':scope > div:nth-child(4)',
  },
})));
