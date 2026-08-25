// Лестница слоёв: тест на отношения, а не на числа.
//
// Контракт — home-widgets.v4.dc.html, строка «порядок слоёв · правило
// продукта»: снизу вверх экран → липкая капсула даты → нижняя навигация и
// плавающая кнопка → бар отмены → шторки и листы с их затемнением → модалка
// обновления и офлайн-баннер. Плюс местные оговорки зон: лист куратора над
// всем, кроме слоя обновления (curator-edits), слой обновления выше всего
// (pwa-update), бар отмены остаётся под открытым листом (undo-bar).
//
// Проверяются пары. Тест на «здесь 1205» переживёт ровно одну правку чисел;
// тест на «лист выше своего затемнения» переживёт любую.

import fs from 'fs';
import path from 'path';

import postcss from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const LADDER_FILE = 'styles/modules/002-ui-v4-palette-roles.css';

const read = (rel) => fs.readFileSync(path.join(WEB, rel), 'utf8');

/** Ступени лестницы: --v4-z-* из файла ролей. */
function readLadder() {
  const src = read(LADDER_FILE);
  const steps = new Map();
  for (const m of src.matchAll(/--v4-z-([a-z0-9-]+)\s*:\s*(\d+)\s*;/g)) {
    steps.set(`v4-z-${m[1]}`, Number(m[2]));
  }
  return steps;
}

let ladder;
beforeAll(() => {
  ladder = readLadder();
});

/**
 * Значение z-index для селектора: либо ссылка на ступень
 * (`var(--v4-z-…, N)` / `calc(var(--v4-z-…, N) ± K)`), либо число.
 * Ссылка резолвится по лестнице, а не по запасному значению — иначе тест
 * молча пропустил бы расхождение ступени и запаса.
 */
const roots = new Map();
function rootOf(rel) {
  if (!roots.has(rel)) roots.set(rel, postcss.parse(read(rel), { from: rel }));
  return roots.get(rel);
}

function zOf(rel, selector) {
  // Селектор встречается и в группах без z-index (общие роли, user-select),
  // и в тематических переопределениях — берём последнее объявление z-index
  // в правиле ровно с этим селектором: оно и выигрывает каскад.
  let raw = null;
  rootOf(rel).walkRules((rule) => {
    if (!rule.selectors.some((one) => one.trim() === selector)) return;
    rule.walkDecls('z-index', (decl) => {
      raw = decl.value.trim();
    });
  });
  expect(raw, `у ${selector} в ${rel} нет своего z-index`).not.toBeNull();
  const ref = /var\(\s*--(v4-z-[a-z0-9-]+)\s*,\s*(\d+)\s*\)/.exec(raw);
  if (!ref) {
    expect(raw, `${selector} — голое число, ступень не названа`).toMatch(/^\d+$/);
    return Number(raw);
  }

  const step = ladder.get(ref[1]);
  expect(step, `ступень --${ref[1]} не объявлена в ${LADDER_FILE}`).toBeTypeOf('number');
  // Запасное значение обязано совпадать со ступенью: критический CSS может
  // встать раньше файла ролей, и расхождение дало бы другой порядок слоёв.
  expect(Number(ref[2]), `запас у --${ref[1]} разошёлся со ступенью`).toBe(step);

  const shift = /calc\(\s*var\([^)]*\)\s*([+-])\s*(\d+)\s*\)/.exec(raw);
  if (!shift) return step;
  return shift[1] === '+' ? step + Number(shift[2]) : step - Number(shift[2]);
}

// Ключевые слои продукта: имя рунга → где объявлен.
const LAYER = {
  nav: ['styles/modules/000-base-and-gamification.css', '.tabs'],
  navCritical: ['styles/critical.css', '.tabs'],
  fabAdvice: ['styles/modules/400-water-and-hydration.css', '.fab-group'],
  fabEdit: ['styles/modules/730-widgets-dashboard.css', '.widgets-fab-left'],
  fabQuick: ['styles/modules/730-widgets-dashboard.css', '.widgets-quick-fab-wrap'],
  navProgress: ['styles/modules/000-base-and-gamification.css', '.crs-bar-container'],
  undo: ['styles/heys-components.css', '.heys-undo-bar'],
  sheetScrimWidget: ['styles/modules/730-widgets-dashboard.css', '.widget-wd-sheet__scrim'],
  sheetWidget: ['styles/modules/730-widgets-dashboard.css', '.widget-wd-sheet'],
  sheetBlockerWidget: ['styles/modules/730-widgets-dashboard.css', '.widget-wd-sheet__blocker'],
  sheetScrimSettings: [
    'styles/modules/000-base-and-gamification.css',
    '.tab-settings-backdrop--v4-popover',
  ],
  sheetSettings: [
    'styles/modules/000-base-and-gamification.css',
    '.tab-settings-menu.tab-settings-menu--v4-sheet',
  ],
  sheetNotifyDetail: ['styles/modules/000-base-and-gamification.css', '.notify-detail-backdrop'],
  sheetScrimDate: [
    'styles/modules/000-base-and-gamification.css',
    '.date-picker-backdrop.date-picker-backdrop--v4-modal',
  ],
  sheetDate: [
    'styles/modules/000-base-and-gamification.css',
    '.date-picker-dropdown.date-picker-sheet',
  ],
  sheetNutrition: ['styles/modules/732-ui-v4-nutrition.css', '.nutrition-v4-sheet-backdrop'],
  sheetScrimActivity: ['styles/modules/731-ui-v4-activity.css', '.activity-v4-sheet-backdrop'],
  sheetActivity: ['styles/modules/731-ui-v4-activity.css', '.activity-v4-sheet'],
  sheetScrimWater: ['styles/modules/400-water-and-hydration.css', '.water-custom-sheet__scrim'],
  sheetScrimAps: ['styles/modules/600-steps-and-aps.css', '.aps-v4-exit-backdrop'],
  sheetAps: ['styles/modules/600-steps-and-aps.css', '.aps-v4-exit-dialog'],
  toast: ['styles/modules/500-pwa-and-offline.css', '.update-toast'],
  toastContainer: ['styles/modules/002-ui-v4-palette-roles.css', '#heys-toast-container'],
  offlineBanner: ['styles/modules/000-base-and-gamification.css', '.offline-banner'],
  curatorSheet: ['styles/modules/500-pwa-and-offline.css', '.ca-modal-backdrop'],
  syncLock: ['styles/heys-components.css', '.sync-lock-overlay'],
  levelUp: ['styles/heys-components.css', '.level-up-modal'],
  install: ['styles/modules/500-pwa-and-offline.css', '.ios-home-install-backdrop'],
  update: ['styles/heys-components.css', '.heys-update-prompt'],
};

const z = (name) => zOf(...LAYER[name]);

describe('лестница слоёв — ступени объявлены в одном месте', () => {
  it('все рунги контракта есть в файле ролей', () => {
    for (const step of [
      'v4-z-date-capsule',
      'v4-z-nav',
      'v4-z-fab',
      'v4-z-nav-progress',
      'v4-z-undo',
      'v4-z-sheet-blocker',
      'v4-z-sheet-scrim',
      'v4-z-sheet',
      'v4-z-sheet-2',
      'v4-z-offline-banner',
      'v4-z-curator-sheet',
      'v4-z-sync-lock',
      'v4-z-level-up',
      'v4-z-install',
      'v4-z-update',
    ]) {
      expect(ladder.get(step), `ступень --${step} пропала из лестницы`).toBeTypeOf('number');
    }
  });

  it('ступени идут по порядку контракта', () => {
    const order = [
      'v4-z-date-capsule',
      'v4-z-nav',
      'v4-z-fab',
      'v4-z-nav-progress',
      'v4-z-undo',
      'v4-z-sheet-blocker',
      'v4-z-sheet-scrim',
      'v4-z-sheet',
      'v4-z-sheet-2',
      'v4-z-curator-sheet',
      'v4-z-sync-lock',
      'v4-z-level-up',
      'v4-z-install',
      'v4-z-update',
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        ladder.get(order[i]),
        `${order[i]} должна стоять выше ${order[i - 1]}`,
      ).toBeGreaterThan(ladder.get(order[i - 1]));
    }
  });

  it('блокировщик касаний ниже затемнения — он живёт только в кадре закрытия', () => {
    expect(ladder.get('v4-z-sheet-blocker')).toBeLessThan(ladder.get('v4-z-sheet-scrim'));
  });
});

describe('лестница слоёв — пары продукта', () => {
  it('навигация и плавающая кнопка: кнопка над рядом вкладок, полоса над обеими', () => {
    expect(z('fabAdvice')).toBeGreaterThan(z('nav'));
    expect(z('fabEdit')).toBeGreaterThan(z('nav'));
    expect(z('fabQuick')).toBeGreaterThan(z('nav'));
    expect(z('navProgress')).toBeGreaterThan(z('fabAdvice'));
  });

  it('критический CSS и модуль дают навигации одну ступень', () => {
    expect(z('navCritical')).toBe(z('nav'));
  });

  it('бар отмены выше навигации и кнопки, но ниже любой шторки', () => {
    expect(z('undo')).toBeGreaterThan(z('nav'));
    expect(z('undo')).toBeGreaterThan(z('fabAdvice'));
    expect(z('undo')).toBeGreaterThan(z('navProgress'));
    for (const sheet of [
      'sheetScrimWidget',
      'sheetScrimSettings',
      'sheetScrimDate',
      'sheetNutrition',
      'sheetScrimActivity',
      'sheetScrimWater',
      'sheetScrimAps',
    ]) {
      expect(z(sheet), `${sheet} должна быть выше бара отмены`).toBeGreaterThan(z('undo'));
    }
  });

  it('лист стоит над своим затемнением', () => {
    expect(z('sheetWidget')).toBeGreaterThan(z('sheetScrimWidget'));
    expect(z('sheetDate')).toBeGreaterThan(z('sheetScrimDate'));
    expect(z('sheetActivity')).toBeGreaterThan(z('sheetScrimActivity'));
    expect(z('sheetAps')).toBeGreaterThan(z('sheetScrimAps'));
    expect(z('sheetBlockerWidget')).toBeLessThan(z('sheetScrimWidget'));
  });

  it('все шторки продукта стоят на одном рунге — второй лестницы нет', () => {
    const scrims = [
      'sheetScrimWidget',
      'sheetScrimSettings',
      'sheetScrimDate',
      'sheetNutrition',
      'sheetScrimActivity',
      'sheetScrimWater',
      'sheetScrimAps',
    ].map(z);
    expect(new Set(scrims).size, `затемнения разъехались: ${scrims.join(', ')}`).toBe(1);

    const sheets = ['sheetWidget', 'sheetDate', 'sheetActivity', 'sheetAps'].map(z);
    expect(new Set(sheets).size, `листы разъехались: ${sheets.join(', ')}`).toBe(1);
  });

  it('лист «Настроить подробно» встаёт над шторкой настроек и её затемнением', () => {
    expect(z('sheetNotifyDetail')).toBeGreaterThan(z('sheetSettings'));
    expect(z('sheetNotifyDetail')).toBeGreaterThan(z('sheetScrimSettings'));
  });

  it('лист куратора выше любой шторки и ниже слоя обновления', () => {
    expect(z('curatorSheet')).toBeGreaterThan(z('sheetWidget'));
    expect(z('curatorSheet')).toBeGreaterThan(z('sheetActivity'));
    expect(z('curatorSheet')).toBeLessThan(z('update'));
  });

  it('замок синхронизации, слой уровня и подложка установки — вердикт зоны curator-edits', () => {
    expect(z('syncLock')).toBeGreaterThan(z('curatorSheet'));
    expect(z('levelUp')).toBeGreaterThan(z('syncLock'));
    expect(z('install')).toBeGreaterThan(z('levelUp'));
  });

  it('слой обновления — над всем', () => {
    for (const name of Object.keys(LAYER)) {
      if (name === 'update') continue;
      expect(z('update'), `слой обновления должен быть выше ${name}`).toBeGreaterThan(z(name));
    }
  });

  it('офлайн-баннер — второй сверху: выше кураторского листа и его соседей', () => {
    // Зоны спорили, кто выше, и до шестнадцатой сборки мы держали вердикт
    // curator-edits — баннер стоял ниже листа. Сборка спор сняла в пользу
    // баннера: «офлайн это состояние оболочки, знать о нём надо раньше, чем
    // читать чужие правки». Отступления здесь больше нет.
    expect(z('offlineBanner')).toBeGreaterThan(z('sheetWidget'));
    expect(z('offlineBanner')).toBeGreaterThan(z('undo'));
    expect(z('offlineBanner')).toBeGreaterThan(z('curatorSheet'));
    // Лестница называет баннер вторым сверху, а замок синхронизации, слой
    // уровня и подложку установки не перечисляет вовсе — значит и они ниже.
    expect(z('offlineBanner')).toBeGreaterThan(z('syncLock'));
    expect(z('offlineBanner')).toBeGreaterThan(z('levelUp'));
    expect(z('offlineBanner')).toBeGreaterThan(z('install'));
    expect(z('offlineBanner')).toBeLessThan(z('update'));
  });

  it('обычный тост стоит выше бара отмены и ниже шторок', () => {
    // Строка «порядок слоёв · правило продукта»: «Обычный тост стоит ниже
    // шторок, а не поверх них». Прежде тост жил голым числом 10002 — выше
    // всех листов и вровень с кураторским, то есть порядок между ними
    // задавала разметка.
    expect(z('toast')).toBeGreaterThan(z('undo'));
    expect(z('toast')).toBeLessThan(z('sheetScrimActivity'));
    expect(z('toastContainer')).toBeGreaterThan(z('undo'));
    expect(z('toastContainer')).toBeLessThan(z('sheetScrimActivity'));
    expect(z('toast')).toBeLessThan(z('curatorSheet'));
  });

  it('тоста «Доступна новая версия» в продукте больше нет', () => {
    // pwa-update.v4.dc.html, «мягкие уведомления»: бейдж, toast, системный
    // баннер — не рисуем. Функция HEYS.showUpdateToast не вызывалась ниоткуда.
    for (const f of [
      'heys_app_update_notifications_v1.js',
      'heys_app_overlays_v1.js',
      'heys_app_overlays_props_v1.js',
      'heys_app_banner_state_v1.js',
      'heys_app_root_impl_v1.js',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/showUpdateToast/);
      expect(src, f).not.toContain('dismissUpdateToast');
    }
    // Строкой, а не подстрокой: слова живут в комментарии, который объясняет
    // удаление, и запрещать их там значило бы стирать причину.
    expect(read('heys_app_overlays_v1.js')).not.toContain("'Доступна новая версия!'");
    expect(read('heys_app_overlays_v1.js')).not.toContain("className: 'update-toast-btn'");
  });
});

describe('лестница слоёв — числа не расползаются обратно в JS', () => {
  it('бар отмены больше не несёт инлайновый z-index', () => {
    const src = read('heys_undo_v1.js');
    expect(src).not.toMatch(/zIndex\s*:\s*\d/);
    expect(src).not.toMatch(/style\.zIndex\s*=/);
  });

  it('шторка выдачи доступа к пушам ссылается на ступень, а не на число', () => {
    const src = read('heys_app_shell_v1.js');
    const at = src.indexOf("className: 'sheet-push-access-sign'");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 800);
    expect(block).toMatch(/zIndex: 'var\(--v4-z-sheet-scrim, \d+\)'/);
  });
});
