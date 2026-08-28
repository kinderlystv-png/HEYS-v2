import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const adviceUiSource = fs.readFileSync(
  path.join(webDir, 'day/_advice.js'),
  'utf8'
);

describe('advice v4 panels from canvas', () => {
  it('exposes read/hide/sync/service surfaces', () => {
    expect(adviceUiSource).toContain('renderAdviceReadFeedbackPanel');
    expect(adviceUiSource).toContain('renderAdviceHideUndoPanel');
    expect(adviceUiSource).toContain('renderAdviceSyncBanner');
    expect(adviceUiSource).toContain('renderAdviceServiceScreen');
    expect(adviceUiSource).toContain('AdviceRulesPoolModal');
    expect(adviceUiSource).toContain('advice-list-container--v4');
    expect(adviceUiSource).toContain('advice-v4-detail');
    expect(adviceUiSource).toContain('renderAdviceV4Icon');
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-up')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'thumb-down')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'cloud-off')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-left')");
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'chevron-right')");
    expect(adviceUiSource).toContain('advice-v4-icon--check');
    expect(adviceUiSource).toContain('advice-v4-sync-copy');
    expect(adviceUiSource).toContain('Совет скрыт до завтра');
    expect(adviceUiSource).toContain('advice-v4-hide-ring');
    expect(adviceUiSource).toContain('viewBox: \'0 0 36 36\'');
    expect(adviceUiSource).toContain('Понятно');
  });

  it('drawer title matches canvas without inline toggles', () => {
    expect(adviceUiSource).toMatch(/advice-list-title' \}, 'Советы'/);
    expect(adviceUiSource).not.toMatch(/💡 Советы/);
    expect(adviceUiSource).toContain('тап — открыть');
  });

  // Строка «служебные модалки»: техлог, диагностика и технические детали
  // клиенту недоступны, а их вход живёт в служебной створке настроек. Обе
  // половины строки закрыты: из шапки шторки советов вход снят, в служебной
  // створке (створка диагностики листа настроек) он стоит под признаком
  // куратора. Прежнее отступление — «створки в настройках нет, вход оставлен
  // в шапке» — снято 2026-08-25 вместе с самим входом из шапки.
  it('входа в служебное больше нет в шапке шторки советов', () => {
    const header = adviceUiSource.slice(
      adviceUiSource.indexOf("className: 'advice-list-header-actions'"),
      adviceUiSource.indexOf('advice-list-header-link--read-all'),
    );
    expect(header).not.toContain('advice-list-header-link--service');
    expect(header).not.toContain('onClick: openAdviceService');
    // Экран жив: он остаётся целью служебной створки.
    expect(adviceUiSource).toContain('renderAdviceServiceScreen');
  });

  it('служебный экран открывается событием и только куратору', () => {
    const at = adviceUiSource.indexOf("'heys:open-advice-service'");
    expect(at, 'служебный экран должен слушать событие створки').toBeGreaterThan(-1);
    const handler = adviceUiSource.slice(at - 700, at);
    expect(handler).toContain('if (!isCuratorReadOnlyMode()) return;');
    expect(handler).toContain('setAdviceServiceOpen(true)');
  });

  it('служебные слои рисуются и при закрытой шторке советов', () => {
    // Вход теперь в настройках: если бы служебный экран остался внутри
    // раннего return шторки, кнопка в створке ничего бы не открывала.
    expect(adviceUiSource).toContain('const serviceOverlays = React.createElement');
    expect(adviceUiSource).toMatch(
      /serviceLayersOpen\s*\?\s*serviceOverlays\s*:\s*null/,
    );
  });

  it('вход в служебное в створке настроек стоит под признаком куратора', () => {
    const shellSource = fs.readFileSync(
      path.join(webDir, 'heys_app_shell_v1.js'),
      'utf8',
    );
    // Служебная створка — это створка диагностики листа настроек.
    expect(shellSource).toContain("className: 'hdr-settings-sheet__diag-panel'");
    const at = shellSource.indexOf("'heys:open-advice-service'");
    expect(at, 'вход служебного экрана советов').toBeGreaterThan(-1);
    const guardAt = shellSource.lastIndexOf('isCuratorSettingsSession && React.createElement', at);
    expect(guardAt, 'вход должен стоять под признаком куратора').toBeGreaterThan(-1);
    const entry = shellSource.slice(guardAt, at + 200);
    expect(entry).toContain("hdr-settings-sheet__diag-btn");
    expect(entry).toContain("'heys:open-advice-service'");
    expect(entry).toContain('Служебное — советы');
    expect(shellSource).toContain(
      "const isCuratorSettingsSession",
    );
  });


  // Строка «служебные модалки» против строки «деталь»: ярус «Научное описание»
  // держит вход в технические детали, но клиенту он недоступен. Обе строки
  // сходятся на гейте по роли, а не на удалении входа.
  it('technical details entry is gated by curator role', () => {
    expect(adviceUiSource).toMatch(
      /hasEvidence && isCuratorReadOnlyMode\(\) && React\.createElement\('button'/,
    );
  });

  // Строка «панель оценки»: свайп влево сужает карточку на 96 px справа, панель
  // «Полезно?» встаёт в освободившемся месте, под карточкой ровно две кнопки.
  it('rating panel matches the «панель оценки» row', () => {
    expect(adviceUiSource).toContain('ADVICE_RATING_PANEL_WIDTH = 96');
    expect(adviceUiSource).toContain('advice-v4-rate-panel');
    expect(adviceUiSource).toContain("'Полезно?'");
    expect(adviceUiSource).toContain("'Помогло'");
    expect(adviceUiSource).toContain("'Не показывать такие'");
    expect(adviceUiSource).toContain(
      'Оба ответа меняют, что вы увидите дальше. Совет остаётся в списке.',
    );
    // Третьей кнопки нет: в ряду оценки ровно две.
    const actions = adviceUiSource.slice(
      adviceUiSource.indexOf("className: 'advice-v4-rate-actions'"),
      adviceUiSource.indexOf("className: 'advice-v4-rate-note'"),
    );
    expect(actions.match(/advice-v4-rate-btn--/g)).toHaveLength(2);
  });

  // Строка «не сохранено»: плашка --tint с новыми текстами и без «Повторить».
  it('offline plate matches the «не сохранено» row', () => {
    expect(adviceUiSource).toContain('Оценка не ушла — нет связи');
    expect(adviceUiSource).toContain(
      'Она сохранена на телефоне и отправится сама. Ничего делать не нужно.',
    );
    expect(adviceUiSource).not.toContain('Попробовать сейчас');
    expect(adviceUiSource).not.toContain('advice-v4-panel__retry');
    // Плашку поднимает очередь оценок, а не отметки прочтения: список советов
    // локальный, «не ушедшей» бывает только оценка (строка «офлайн»).
    expect(adviceUiSource).toContain("ADVICE_RATING_SYNC_KEY = 'heys_advice_outcomes_v1'");
  });

  it('detail screen tokens match ad2a canvas', () => {
    const cssSource = fs.readFileSync(
      path.join(webDir, 'styles/modules/400-water-and-hydration.css'),
      'utf8'
    );
    expect(adviceUiSource).toContain("renderAdviceV4Icon(React, 'close')");
    expect(adviceUiSource).toMatch(/Технические детали',\s*renderAdviceV4Icon\(React,\s*'chevron-right'\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail-overlay[\s\S]*?background:\s*var\(--v4-bg,\s*#fffaf1\)/);
    expect(cssSource).toMatch(/\.advice-v4-detail__close[\s\S]*?background:\s*#f7efe2/);

    // Строка «вид детали совета»: три яруса — карточки --c1 радиусом 18,
    // поля 14/16, зазор 8 (tips.v4.dc.html).
    const hero = cssSource.match(/\.advice-v4-detail__hero \{([^}]*)\}/)[1];
    expect(hero).toMatch(/background:\s*var\(--v4-c1/);
    expect(hero).toMatch(/border-radius:\s*18px/);
    expect(hero).toMatch(/padding:\s*14px 16px/);

    const science = cssSource.match(/\.advice-v4-detail__science-box \{([^}]*)\}/)[1];
    expect(science).toMatch(/background:\s*(?:var\(--v4-sand-surface,\s*#f7efe2\)|#f7efe2)/);
    expect(science).toMatch(/border-radius:\s*18px/);

    const detailsText = cssSource.match(/\.advice-v4-detail__text \{([^}]*)\}/)[1];
    expect(detailsText).not.toMatch(/background/);
    expect(detailsText).not.toMatch(/border-radius/);
  });

  // Строка «деталь»: экран, а не третий слой над шторкой — «два наложенных
  // листа на 330 px оставляют от содержимого полосу». Шапка экрана: надзаголовок
  // категории, заголовок, крестик.
  it('detail is a full screen with eyebrow, title and close', () => {
    const cssSource = fs.readFileSync(
      path.join(webDir, 'styles/modules/400-water-and-hydration.css'),
      'utf8',
    );
    const overlay = cssSource.match(/\.advice-v4-detail-overlay \{([^}]*)\}/)[1];
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/inset:\s*0/);
    // Фон непрозрачный: сквозь деталь шторка не просвечивает.
    expect(overlay).toMatch(/background:\s*var\(--v4-bg/);

    expect(adviceUiSource).toContain('advice-v4-detail__eyebrow');
    expect(adviceUiSource).toContain('advice-v4-detail__title');
    expect(adviceUiSource).toContain('advice-v4-detail__close');
  });

  it('exposes canvas overlays: disclaimer, settings, toast, empty, science', () => {
    expect(adviceUiSource).toContain('renderAdviceSharedOverlays');
    expect(adviceUiSource).toContain('AdviceMedicalDisclaimerGate');
    expect(adviceUiSource).toContain('renderAdviceSettingsScreen');
    expect(adviceUiSource).toContain('advice-v4-disclaimer-overlay');
    expect(adviceUiSource).toContain('advice-v4-settings');
    expect(adviceUiSource).toContain('advice-v4-toast-card');
    expect(adviceUiSource).toContain('Пока всё по плану — советов нет');
    expect(adviceUiSource).toContain('Первый совет');
    expect(adviceUiSource).toContain('Научное описание');
    expect(adviceUiSource).toContain('heys:open-advice-settings');
    expect(adviceUiSource).toMatch(/renderMedicalDisclaimer\(\) \{\s*return null;/);
  });

  it('settings groups match the canvas card geometry', () => {
    const cssSource = fs.readFileSync(
      path.join(webDir, 'styles/modules/400-water-and-hydration.css'),
      'utf8',
    );
    expect(adviceUiSource.match(/advice-v4-settings__group/g)).toHaveLength(2);

    const group = cssSource.match(/\.advice-v4-settings__group \{([^}]*)\}/)[1];
    expect(group).toMatch(/padding:\s*2px 16px/);
    expect(group).toMatch(/border-radius:\s*20px/);
    expect(group).toMatch(/background:\s*var\(--v4-surface, #f7efe2\)/);

    const row = cssSource.match(/\.advice-v4-settings__row \{([^}]*)\}/)[1];
    expect(row).toMatch(/padding:\s*13px 0/);
    expect(row).not.toMatch(/border-bottom/);
    expect(cssSource).toMatch(/\.advice-v4-settings__row-hint \{[\s\S]*?font:\s*500 11px\/1\.45/);
  });
});

// Поведение, а не текст: вход в служебное переехал в служебную створку
// настроек, значит служебный экран обязан открываться при закрытой шторке
// советов. Раньше он лежал за ранним `return null` шторки — из настроек
// кнопка ничего бы не открыла.
describe('служебный экран советов рисуется без шторки', () => {
  // Хуки не вызываются: renderManualAdviceList — обычная функция. Заглушки
  // нужны только чтобы модуль загрузился (React.memo на уровне модуля).
  const fakeReact = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props, children }),
    memo: (fn) => fn,
    forwardRef: (fn) => fn,
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: () => ({ current: null }),
  };

  const baseProps = {
    React: fakeReact,
    adviceTrigger: 'auto',
    toastVisible: false,
    adviceRelevant: [],
    badgeAdvices: [],
    totalAdviceCount: 0,
    ewsWarnings: [],
    medicalDisclaimerSessionDismissed: true,
    getSortedGroupedAdvices: () => ({ sorted: [], groups: {} }),
    adviceDiagnostics: null,
    adviceDiagnosticsOpen: false,
    adviceRulesPoolOpen: false,
    closeAdviceService: () => {},
    closeAdviceDiagnostics: () => {},
    closeAdviceRulesPool: () => {},
    openAdviceDiagnostics: () => {},
    openAdviceRulesPool: () => {},
    copyAdviceTrace: () => {},
  };

  const loadUi = () => {
    window.React = fakeReact;
    window.HEYS = {};
    new Function(adviceUiSource)();
    return window.HEYS.dayAdviceListUI;
  };

  const flatten = (node, acc = []) => {
    if (node === null || node === undefined || node === false) return acc;
    if (Array.isArray(node)) {
      node.forEach((n) => flatten(n, acc));
      return acc;
    }
    if (typeof node !== 'object') {
      acc.push(String(node));
      return acc;
    }
    if (node.props?.className) acc.push(String(node.props.className));
    flatten(node.children, acc);
    return acc;
  };

  it('закрытая шторка без служебных слоёв ничего не рисует', () => {
    const ui = loadUi();
    expect(ui.renderManualAdviceList({ ...baseProps, adviceServiceOpen: false })).toBeNull();
  });

  it('закрытая шторка со служебным экраном рисует именно его', () => {
    const ui = loadUi();
    const tree = ui.renderManualAdviceList({ ...baseProps, adviceServiceOpen: true });
    expect(tree).not.toBeNull();
    const classes = flatten(tree);
    expect(classes).toContain('advice-service-overlay');
    // Шторка советов при этом не разворачивается.
    expect(classes).not.toContain('advice-list-overlay');
  });
  it('открытая шторка советов по-прежнему рисуется', () => {
    const ui = loadUi();
    const advices = [{ id: 'a1', category: 'nutrition', text: 'x' }];
    const tree = ui.renderManualAdviceList({
      ...baseProps,
      adviceTrigger: 'manual',
      toastVisible: true,
      adviceRelevant: advices,
      totalAdviceCount: 1,
      adviceServiceOpen: false,
      dismissedAdvices: new Set(),
      hiddenUntilTomorrow: new Set(),
      adviceSwipeState: {},
      expandedAdviceId: null,
      lastDismissedAdvice: null,
      AdviceCard: () => null,
      ADVICE_CATEGORY_NAMES: { nutrition: 'Питание' },
      getSortedGroupedAdvices: (list) => ({ sorted: list, groups: { nutrition: list } }),
    });
    const classes = flatten(tree);
    expect(classes).toContain('advice-list-overlay');
    expect(classes).not.toContain('advice-service-overlay');
  });
});
