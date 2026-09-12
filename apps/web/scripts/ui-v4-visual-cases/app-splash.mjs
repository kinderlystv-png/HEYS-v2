// Стенды сплэша (app-splash) для пар «макет — приложение».
//
// Из восьми кадров зоны шесть рисует платформа (системный сплэш Android и
// iPhone из иконки и манифеста) — вёрстки там нет, и стенда им не бывает.
// Два кадра стыка — наши: загрузчик index.html на холодном старте (тот же
// стенд, что у знака ожидания) и Главная сразу после него.
//
// Зона стоит в DOM-гейте (UI_V4_DOM_GATE_ZONES); стенды диагностические.

import { bootMarkCase } from './spinners.mjs';

const CANVAS_FILE = 'app-splash.v4.dc.html';

export const APP_SPLASH_VISUAL_CASES = Object.freeze([
  {
    ...bootMarkCase({ id: 'app-splash-boot-mark-sand', zone: 'app-splash', label: 'Стык · загрузчик', themeId: 'sand', stage: 'loading' }),
    pairFrame: { file: CANVAS_FILE, label: 'Стык · загрузчик', palette: 'sand' },
  },
  {
    // Главная после загрузчика — обычная Главная демо-режима в размере кадра.
    id: 'app-splash-home-sand',
    zone: 'app-splash',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: { width: 375, height: 706 },
    pairFrame: { file: CANVAS_FILE, label: 'Стык · Главная', palette: 'sand' },
  },
]);
