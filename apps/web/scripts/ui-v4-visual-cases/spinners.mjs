// Стенды знака ожидания (spinners) для пар «макет — приложение».
//
// Холодный старт снимается без демо-режима: страница открывается с признаком
// сессии, бандлы приложения подменяются пустыми файлами, и знак ожидания из
// index.html остаётся на экране; отказ поднимает тот же __heysBootWait.showFail,
// что и сторож загрузки. «Успех» и «ошибка» — экранный знак HEYS.WaitMark в
// состоянии ответа, как его показывает шаг сохранения профиля (сцены в
// apps/web/heys_ui_v4_visual_fixture_zones_v1.js).
//
// Зона стоит в DOM-гейте (UI_V4_DOM_GATE_ZONES); стенды диагностические,
// гейт не трогают. Пары — по плану tmp/pairs/plan.spinners.json.

const CANVAS_FILE = 'spinners.v4.dc.html';
const FIXTURE_SCRIPT = 'apps/web/heys_ui_v4_visual_fixture_zones_v1.js';
const VIEWPORT = { width: 375, height: 706 };

// Бандлы приложения отдаются пустыми: страница «грузится» и не догружается.
const BOOT_STUBS = Object.freeze(['**/*.bundle.*.js', '**/react-bundle.js']);

function themeSeed(themeId) {
  return {
    heys_pin_auth_client: 'visual-boot-client',
    heys_theme_id: themeId,
    heys_theme_mode_pref: themeId.endsWith('-dark') ? 'dark' : 'light',
    heys_theme_explicit: '1',
  };
}

export function bootMarkCase({ id, zone, label, themeId, stage }) {
  return {
    id,
    zone,
    status: 'automated',
    gate: 'diagnostic',
    kind: 'login',
    themeId,
    localSeed: themeSeed(themeId),
    ...(stage === 'fail-again' ? { sessionSeed: { heys_boot_fail_count: 1 } } : {}),
    stubScripts: BOOT_STUBS,
    bootStage: stage,
    rootSelector: stage === 'loading' ? '.heys-boot-mark' : '.heys-boot-mark.is-fail',
    viewport: VIEWPORT,
    pairFrame: { file: CANVAS_FILE, label, palette: themeId },
  };
}

export const SPINNERS_VISUAL_CASES = Object.freeze([
  {
    id: 'spinner-success-sand',
    zone: 'spinners',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-v4-visual-frame',
    frameLabel: 'Спиннер · успех',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    fixtureScript: FIXTURE_SCRIPT,
    rootSelector: '.heys-wait-mark.is-ok',
    viewport: VIEWPORT,
    pairFrame: { file: CANVAS_FILE, label: 'Спиннер · успех', palette: 'sand' },
  },
  {
    id: 'spinner-error-sand',
    zone: 'spinners',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-v4-visual-frame',
    frameLabel: 'Спиннер · ошибка',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    fixtureScript: FIXTURE_SCRIPT,
    rootSelector: '.heys-wait-mark.is-fail',
    viewport: VIEWPORT,
    pairFrame: { file: CANVAS_FILE, label: 'Спиннер · ошибка', palette: 'sand' },
  },
  bootMarkCase({ id: 'spinner-boot-fail-sand', zone: 'spinners', label: 'Спиннер · не удалось запустить', themeId: 'sand', stage: 'fail' }),
  bootMarkCase({ id: 'spinner-boot-fail-again-sand', zone: 'spinners', label: 'Спиннер · вторая неудача', themeId: 'sand', stage: 'fail-again' }),
  bootMarkCase({ id: 'spinner-boot-fail-sand-dark', zone: 'spinners', label: 'Спиннер · ошибка старта песочная тёмная', themeId: 'sand-dark', stage: 'fail' }),
  bootMarkCase({ id: 'spinner-boot-fail-blue', zone: 'spinners', label: 'Спиннер · ошибка старта синяя', themeId: 'blue', stage: 'fail' }),
  bootMarkCase({ id: 'spinner-boot-fail-blue-dark', zone: 'spinners', label: 'Спиннер · ошибка старта синяя тёмная', themeId: 'blue-dark', stage: 'fail' }),
]);
