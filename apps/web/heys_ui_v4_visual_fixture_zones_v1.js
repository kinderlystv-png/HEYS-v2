// heys_ui_v4_visual_fixture_zones_v1.js — стенды зон tips · gamification ·
// spinners · pwa-update · undo-bar · settings-system для ui-v4 visual harness.
//
// Подключается стендом после heys_ui_v4_visual_fixture_v1.js (поле
// fixtureScript кейса) и расширяет HEYS.uiV4VisualFixture.mount своими
// кадрами. Каждый кадр доводится настоящими входами продукта: лампочка советов
// в шапке, шапка геймификации, лист настроек, бар отмены, служебный слой
// обновления. Подменяются только данные, которых на стенде нет физически:
// вывод движка советов, накопленный опыт и серия, ответ о подписке на пуши,
// версия сборки, часы.
(function mountUiV4VisualFixtureZones(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const fixture = HEYS.uiV4VisualFixture;
  if (!fixture || fixture.__zonesInstalled || !React || !ReactDOM?.createRoot) return;

  const h = React.createElement;
  const HOST_ID = 'ui-v4-visual-zones-host';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(check, label, timeoutMs = 8000) {
    // performance.now идёт по-настоящему: Date на стенде заморожен.
    const started = performance.now();
    for (;;) {
      const value = check();
      if (value) return value;
      if (performance.now() - started > timeoutMs) {
        throw new Error(`Стенд: не дождались «${label}»`);
      }
      await sleep(50);
    }
  }

  /** Часы стенда заморожены; «прошло N мс» — это новые замороженные часы позже. */
  function advanceClock(ms) {
    const Base = global.Date;
    const later = Base.now() + ms;
    class Later extends Base {
      constructor(...values) {
        super(...(values.length ? values : [later]));
      }
      static now() {
        return later;
      }
    }
    global.Date = Later;
  }

  function touch(target, x, y) {
    return new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y });
  }

  function fireTouch(target, type, x, y) {
    const t = touch(target, x, y);
    const init = { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] };
    target.dispatchEvent(new TouchEvent(type, init));
  }

  /** Горизонтальный свайп пальцем: касание, два шага движения, отпускание. */
  async function swipe(target, dx) {
    const box = target.getBoundingClientRect();
    const x0 = box.left + box.width / 2;
    const y0 = box.top + box.height / 2;
    fireTouch(target, 'touchstart', x0, y0);
    await sleep(30);
    fireTouch(target, 'touchmove', x0 + dx / 2, y0);
    await sleep(30);
    fireTouch(target, 'touchmove', x0 + dx, y0);
    await sleep(30);
    fireTouch(target, 'touchend', x0 + dx, y0);
    await sleep(120);
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '20000' });
      document.body.appendChild(host);
    }
    return host;
  }

  function renderOverTheApp(element) {
    const host = ensureHost();
    HEYS.__uiV4VisualZonesRoot = HEYS.__uiV4VisualZonesRoot || ReactDOM.createRoot(host);
    HEYS.__uiV4VisualZonesRoot.render(element);
    return host;
  }

  function findByText(root, selector, text) {
    return [...root.querySelectorAll(selector)]
      .find((node) => node.textContent?.replace(/\s+/g, ' ').trim().includes(text)) || null;
  }

  // ── Советы ────────────────────────────────────────────────────────────
  // Движок советов считает по данным дня, и набрать день так, чтобы он выдал
  // ровно советы кадра, нельзя; подменяется только его вывод — список советов.
  // Всё остальное (шторка, панели, деталь, свайпы, таймер отмены) — настоящий
  // код вкладки «Питание», куда советы попадают тапом по лампочке в шапке.

  const TRAINING_PROTEIN = {
    id: 'visual-protein-after-training',
    type: 'tip',
    category: 'training',
    icon: '🥚',
    priority: 40,
    text: 'После тренировки нужен белок',
    details: 'Подойдёт протеиновый коктейль, творог с бананом, куриная грудка с рисом или греческий йогурт с орехами. Порция от 25 до 40 г белка.',
    expertMeta: {
      actionNow: { label: 'Белок в течение двух часов после тренировки ускоряет восстановление мышц.' },
      science: {
        rationale: 'Синтез мышечного белка повышен 24–48 часов после нагрузки, пик — в первые часы. Порция 25–40 г в это окно даёт больший прирост, чем та же порция позже.',
        sources: [
          { org: 'Morton et al.', year: 2018, type: 'Метаанализ', n: 1863 },
          { org: 'Areta et al.', year: 2013, type: 'Рандомизированное', n: 24 },
          { org: 'Schoenfeld et al.', year: 2013, type: 'Метаанализ', n: 525 },
        ],
      },
    },
  };

  const tip = (id, category, text, extra = {}) => ({
    id: `visual-${id}`, type: 'tip', category, icon: '💡', priority: 50, text, ...extra,
  });

  const SHEET_ADVICES = () => [
    tip('sweets-evening', 'nutrition', 'Вечером сладкое усваивается хуже'),
    tip('gi-wave', 'nutrition', 'Гликемический индекс подходит активной волне'),
    TRAINING_PROTEIN,
    tip('long-training', 'training', '90 минут тренировки — серьёзная нагрузка'),
    tip('rest-sleep', 'training', 'Не забудьте про восстановление и сон.', { type: 'success' }),
  ];
  const RATING_ADVICES = () => [
    tip('sweets-no-protein', 'nutrition', 'Вечером сладкое чаще после дня без белка'),
    tip('gi-wave', 'nutrition', 'Гликемический индекс подходит активной волне'),
    TRAINING_PROTEIN,
    tip('long-training', 'training', '90 минут тренировки — серьёзная нагрузка'),
    tip('rest-sleep', 'training', 'Не забудьте про восстановление и сон.', { type: 'success' }),
  ];
  const SINGLE_ADVICE = () => [tip('sweets-no-protein', 'nutrition', 'Вечером сладкое чаще после дня без белка')];
  const TOAST_ADVICES = () => [TRAINING_PROTEIN];

  function installAdviceEngine(list) {
    const advice = HEYS.advice;
    if (!advice?.useAdviceEngine) throw new Error('HEYS.advice.useAdviceEngine unavailable');
    const original = advice.__uiV4OriginalEngine || advice.useAdviceEngine;
    advice.__uiV4OriginalEngine = original;
    advice.useAdviceEngine = function uiV4AdviceEngine(input) {
      const result = original.call(this, input) || {};
      return {
        ...result,
        primary: list[0] || null,
        relevant: list,
        badgeAdvices: list,
        adviceCount: list.length,
        allAdvices: list,
      };
    };
    // Вывод движка мемоизирован по его функции — новая функция даёт пересчёт
    // на ближайшем рендере дня.
    global.dispatchEvent(new CustomEvent('heys:profile-updated', { detail: { source: 'ui-v4-visual-zones' } }));
  }

  function adviceBulb() {
    return document.querySelector('.hdr-header-icon-btn--advice');
  }

  async function openAdviceDrawer(list) {
    installAdviceEngine(list);
    const bulb = await waitFor(adviceBulb, 'лампочка советов в шапке', 30000);
    if (list.length) {
      await waitFor(
        () => (bulb.getAttribute('aria-label') || bulb.textContent || '').includes(String(list.length)),
        `счётчик советов ${list.length}`,
      );
    } else {
      await sleep(400);
    }
    bulb.click();
  }

  async function adviceCard(text) {
    return waitFor(
      () => findByText(document, '.advice-list-container--v4 .advice-list-item-wrapper', text),
      `карточка «${text}»`,
    );
  }

  async function openAdviceToast(list) {
    installAdviceEngine(list);
    await sleep(300);
    // Вход всплывающего совета — начисление данных дня: продукт добавлен.
    global.dispatchEvent(new CustomEvent('heysProductAdded'));
    return waitFor(() => document.querySelector('.advice-v4-toast-card'), 'всплывающий совет', 15000);
  }

  const TIPS_SCENES = {
    'Советы · шторка': async () => {
      await openAdviceDrawer(SHEET_ADVICES());
      await waitFor(() => document.querySelector('.advice-list-container--v4'), 'шторка советов');
    },
    'Совет · панель оценки': async () => {
      await openAdviceDrawer(RATING_ADVICES());
      const card = await adviceCard('Вечером сладкое чаще после дня без белка');
      await swipe(card.querySelector('.advice-list-item-v4') || card, -90);
      await waitFor(() => document.querySelector('.advice-list-item-wrapper--rating'), 'панель оценки');
    },
    'Советы · не сохранено': async () => {
      // Оценка ушла в очередь облака и не подтверждена — так отвечает
      // очередь, когда связи нет.
      HEYS.cloud = HEYS.cloud || {};
      HEYS.cloud.getPendingItemsDetail = () => ({ queue: [{ k: 'heys_advice_outcomes_v1' }], inflight: [] });
      await openAdviceDrawer(SINGLE_ADVICE());
      await waitFor(() => document.querySelector('.advice-v4-panel--sync'), 'плашка «не сохранено»');
    },
    'Совет · деталь': async () => {
      await openAdviceDrawer(SHEET_ADVICES());
      const card = await adviceCard('После тренировки нужен белок');
      (findByText(card, 'button, [role="button"], a, span', 'Детали') || card).click();
      await waitFor(() => document.querySelector('.advice-v4-detail'), 'деталь совета');
    },
    'Научное описание': async () => {
      await TIPS_SCENES['Совет · деталь']();
      const link = await waitFor(() => document.querySelector('.advice-v4-detail__tech-link'), 'ссылка «Технические детали»');
      link.click();
      await waitFor(() => document.querySelector('.advice-v4-science'), 'научное описание');
    },
    'Совет · всплывающий': async () => {
      await openAdviceToast(TOAST_ADVICES());
    },
    'Совет · оценка после свайпа': async () => {
      await openAdviceToast(TOAST_ADVICES());
      const wrap = document.querySelector('.advice-v4-toast-wrap');
      await swipe(wrap, -120);
      await waitFor(() => document.querySelector('.advice-v4-panel--read'), 'панель оценки после свайпа');
    },
    'Совет · отмена с таймером': async () => {
      await openAdviceDrawer(SHEET_ADVICES());
      const card = await adviceCard('После тренировки нужен белок');
      await swipe(card.querySelector('.advice-list-item-v4') || card, 150);
      await waitFor(() => document.querySelector('.advice-v4-panel--hide'), 'панель «совет скрыт»');
      // Кадр снят на второй секунде отсчёта.
      advanceClock(1000);
      await waitFor(() => document.querySelector('.advice-v4-hide-ring__num')?.textContent === '2', 'кольцо на «2»');
    },
    'Советы · пусто': async () => {
      await openAdviceDrawer([]);
      await waitFor(() => document.querySelector('.advice-v4-empty-toast'), 'плашка «советов нет»');
    },
    'Оговорка': async () => {
      // Первый совет: оговорка ещё не принята.
      HEYS.store?.set?.('heys_advice_disclaimer_accepted_v1', false);
      try { localStorage.removeItem('heys_advice_disclaimer_accepted_v1'); } catch (_) { /* noop */ }
      await openAdviceDrawer(SHEET_ADVICES());
      await waitFor(() => document.querySelector('.advice-v4-disclaimer-card'), 'оговорка');
    },
    'Настройки советов': async () => {
      await waitFor(() => typeof global.__heysToggleTabSettingsHandler === 'function', 'обработчик листа настроек', 30000);
      global.__heysToggleTabSettingsHandler();
      const row = await waitFor(
        () => document.querySelector('.hdr-settings-sheet__row[data-settings-key="advice"]'),
        'строка «Советы куратора» в листе настроек',
      );
      row.click();
      await waitFor(() => document.querySelector('.advice-v4-settings'), 'настройки советов');
    },
  };

  // ── Геймификация ──────────────────────────────────────────────────────
  // Опыт, серия и достижения приходят из хранилища (стенд кладёт их до
  // загрузки). Лист открывается тапом по шапке геймификации, вкладки — тапом
  // по ярлыкам. Новый уровень начисляется настоящим addXP: движок сам
  // взводит тихую минуту и открывает «Уровни».

  function gameBar() {
    return document.querySelector('.game-bar');
  }

  async function openGameSheet(tabLabel) {
    const bar = await waitFor(gameBar, 'шапка геймификации', 30000);
    await waitFor(() => typeof HEYS.game?.getStats === 'function', 'движок геймификации', 30000);
    bar.click();
    const sheet = await waitFor(() => document.querySelector('.game-v4-sheet'), 'лист геймификации');
    if (tabLabel) {
      const tab = await waitFor(() => findByText(sheet, '.game-v4-sheet__tab', tabLabel), `вкладка «${tabLabel}»`);
      tab.click();
      await waitFor(() => findByText(sheet, '.game-v4-sheet__header-title', tabLabel), `заголовок «${tabLabel}»`);
    }
    await sleep(150);
    return sheet;
  }

  /**
   * Тихая минута, остановленная на нужной миллисекунде. Таймеры фаз церемонии
   * перехватываются и проигрываются вручную до момента t, а анимации CSS
   * ставятся на паузу в той же точке и вписываются в инлайновые стили —
   * снимок делается по замершему кадру, а не по случайному моменту.
   */
  async function levelCeremonyAt(t) {
    // Стенд снимает с «уменьшенным движением», а минута при нём не играет.
    const realMatchMedia = global.matchMedia.bind(global);
    global.matchMedia = (query) => {
      const result = realMatchMedia(query);
      if (/prefers-reduced-motion/.test(query)) {
        return { ...result, matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
      }
      return result;
    };
    const style = document.createElement('style');
    style.textContent = [
      '.game-v4-sheet.is-quiet-minute .game-v4-sheet__header,.game-v4-sheet.is-quiet-minute .game-v4-sheet__tabs,.game-v4-sheet.is-quiet-minute .game-v4-sheet__panel > *:not(.game-v4-sheet__hero){opacity:.2!important;transition:opacity 200ms ease!important}',
      '.game-v4-sheet.is-quiet-minute-return .game-v4-sheet__header,.game-v4-sheet.is-quiet-minute-return .game-v4-sheet__tabs,.game-v4-sheet.is-quiet-minute-return .game-v4-sheet__panel > *:not(.game-v4-sheet__hero){transition:opacity 300ms ease!important}',
      '.game-v4-sheet__hero-ring{display:block!important}',
      '.game-v4-sheet__hero-num-out{display:inline!important;animation:gameV4QuietNumOut 420ms cubic-bezier(0.4,0,1,1) forwards!important}',
      '.game-v4-sheet__hero-num-in{animation:gameV4QuietNumIn 420ms cubic-bezier(0.22,1.2,0.36,1) forwards!important}',
    ].join('\n');
    document.head.appendChild(style);

    await waitFor(gameBar, 'шапка геймификации', 30000);
    await waitFor(() => typeof HEYS.game?.addXP === 'function', 'движок геймификации', 30000);

    // Таймеры, поставленные с момента начисления до старта минуты, не
    // запускаются — их проигрывает стенд.
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const recorded = [];
    global.setTimeout = function recordingSetTimeout(fn, ms, ...args) {
      recorded.push({ fn, ms: Number(ms) || 0, args, fired: false });
      return -recorded.length;
    };
    global.clearTimeout = function recordingClearTimeout(id) {
      if (typeof id === 'number' && id < 0) {
        const entry = recorded[-id - 1];
        if (entry) entry.fired = true;
        return;
      }
      realClearTimeout(id);
    };
    // Настоящее начисление: с 27 490 XP один приём пищи переводит на 18-й.
    HEYS.game.addXP(10, 'meal_added');
    let sheet;
    try {
      sheet = await waitForReal(() => document.querySelector('.game-v4-sheet.is-quiet-minute, .game-v4-sheet.is-quiet-minute-return'), 'минута началась', realSetTimeout);
      await realSleep(120, realSetTimeout);
    } finally {
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }

    const birth = new Map();
    const noteAnimations = (at) => {
      for (const animation of document.getAnimations()) {
        if (!birth.has(animation)) birth.set(animation, at);
      }
    };
    noteAnimations(0);
    const due = recorded
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => !entry.fired && entry.ms <= t)
      .sort((a, b) => a.ms - b.ms || a.index - b.index);
    for (const entry of due) {
      recorded[entry.index].fired = true;
      entry.fn(...entry.args);
      await sleep(60);
      noteAnimations(entry.ms);
    }
    await sleep(60);
    for (const animation of document.getAnimations()) {
      const at = Math.max(0, t - (birth.get(animation) ?? t));
      try {
        animation.pause();
        animation.currentTime = at;
        animation.commitStyles();
        animation.cancel();
      } catch (_) { /* переход мог закончиться раньше */ }
    }
    return sheet;
  }

  function realSleep(ms, realSetTimeout) {
    return new Promise((resolve) => realSetTimeout(resolve, ms));
  }

  async function waitForReal(check, label, realSetTimeout, timeoutMs = 8000) {
    const started = performance.now();
    for (;;) {
      const value = check();
      if (value) return value;
      if (performance.now() - started > timeoutMs) throw new Error(`Стенд: не дождались «${label}»`);
      await realSleep(50, realSetTimeout);
    }
  }

  const GAME_SCENES = {
    'Геймификация · первый день': () => openGameSheet(null),
    'Геймификация · обзор': () => openGameSheet(null),
    'Достижения': () => openGameSheet('Достижения'),
    'Уровни': () => openGameSheet('Уровни'),
    'Новый уровень · 0 мс': () => levelCeremonyAt(0),
    'Новый уровень · 420 мс': () => levelCeremonyAt(420),
    'Новый уровень · 1200 мс': () => levelCeremonyAt(1200),
    'Новый уровень · 1600 мс': () => levelCeremonyAt(1600),
  };

  // ── Знак ожидания ─────────────────────────────────────────────────────
  // Итог действия с ответом сервера: тот же экран знака, что показывает шаг
  // сохранения профиля, в состоянии ответа.
  const SPINNER_SCENES = {
    'Спиннер · успех': async () => {
      await waitFor(() => HEYS.WaitMark?.render, 'HEYS.WaitMark', 30000);
      renderOverTheApp(h('div', { className: 'heys-wait-mark-overlay' },
        HEYS.WaitMark.render(React, { mode: 'screen', state: 'ok', title: 'Сохранено', text: 'Профиль обновлён.' })));
      await waitFor(() => document.querySelector('.heys-wait-mark.is-ok'), 'знак «сохранено»');
    },
    'Спиннер · ошибка': async () => {
      await waitFor(() => HEYS.WaitMark?.render, 'HEYS.WaitMark', 30000);
      renderOverTheApp(h('div', { className: 'heys-wait-mark-overlay' },
        HEYS.WaitMark.render(React, { mode: 'screen', state: 'fail', title: 'Не удалось', text: 'Проверьте связь.' })));
      await waitFor(() => document.querySelector('.heys-wait-mark.is-fail'), 'знак «не удалось»');
    },
  };

  // ── Обновление и офлайн ───────────────────────────────────────────────
  function setAppVersion(version) {
    HEYS.version = version;
    global.APP_VERSION = version;
  }

  async function waitPwa() {
    await waitFor(() => HEYS.PWA?.showUpdateModal && HEYS.PWA?.showManualRefreshPrompt, 'HEYS.PWA', 30000);
  }

  const PWA_SCENES = {
    'Обновление · готово': async () => {
      await waitPwa();
      setAppVersion('2026.08.19.1430.a1b2c3d');
      HEYS.PWA.showUpdateModal('ready');
      await waitFor(() => document.querySelector('#heys-update-modal .heys-update-modal__icon--done'), 'стадия «Готово»');
    },
    'Требуется обновление · с версией': async () => {
      await waitPwa();
      setAppVersion('2026.08.14.0910.f4d2b1c');
      HEYS.PWA.showManualRefreshPrompt('2026.08.19.1830');
      await waitFor(() => document.querySelector('#heys-manual-update-btn'), 'кнопка «Обновить сейчас»');
    },
    'Требуется обновление · без версии': async () => {
      await waitPwa();
      setAppVersion('2026.08.14.0910.f4d2b1c');
      HEYS.PWA.showManualRefreshPrompt();
      await waitFor(() => document.querySelector('#heys-manual-update-btn'), 'кнопка «Обновить сейчас»');
    },
    'Требуется обновление · iOS': async () => {
      await waitPwa();
      setAppVersion('2026.08.14.0910.f4d2b1c');
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      });
      HEYS.PWA.showManualRefreshPrompt('2026.08.19.1830');
      await waitFor(() => document.querySelector('.heys-update-prompt__steps'), 'два шага iOS');
    },
    'Офлайн-баннер': async () => {
      await waitFor(() => HEYS.PlatformAPIs?.showOfflineNotification, 'HEYS.PlatformAPIs.showOfflineNotification', 30000);
      HEYS.PlatformAPIs.showOfflineNotification();
      await waitFor(() => document.getElementById('heys-offline-banner'), 'офлайн-баннер');
    },
  };

  // ── Бар отмены ────────────────────────────────────────────────────────
  async function pushUndo(entries, batch) {
    await waitFor(() => HEYS.Undo?.push, 'HEYS.Undo', 30000);
    for (const label of entries) HEYS.Undo.push({ label, onUndo: () => {}, batch });
    await waitFor(() => document.querySelector('.heys-undo-bar--visible'), 'бар отмены');
  }

  async function undoAt(secondsPassed) {
    if (!secondsPassed) return;
    advanceClock(secondsPassed * 1000);
    const expected = String(5 - secondsPassed);
    await waitFor(() => document.querySelector('.heys-undo-bar__count')?.textContent === expected, `счётчик «${expected}»`);
  }

  const UNDO_SCENES = {
    'Отмена · одно удаление': async () => {
      await pushUndo(['Перекус удалён']);
    },
    'Отмена · пачка': async () => {
      await pushUndo(['Рис бурый удалён', 'Кефир удалён', 'Хлеб удалён'], { key: 'product', forms: ['продукт', 'продукта', 'продуктов'] });
      await undoAt(1);
    },
    'Отмена · продукт': async () => {
      await pushUndo(['Рис бурый удалён'], { key: 'product', forms: ['продукт', 'продукта', 'продуктов'] });
      await undoAt(3);
    },
  };

  // ── Настройки ─────────────────────────────────────────────────────────
  async function openSettingsSheet() {
    await waitFor(() => typeof global.__heysToggleTabSettingsHandler === 'function', 'обработчик листа настроек', 30000);
    global.__heysToggleTabSettingsHandler();
    return waitFor(() => document.querySelector('.tab-settings-menu--v4-sheet'), 'лист настроек');
  }

  const SETTINGS_SCENES = {
    'Настройки · диагностика': async () => {
      await openSettingsSheet();
      const toggle = await waitFor(() => document.querySelector('.hdr-settings-sheet__diag-toggle'), 'строка «Диагностика»');
      toggle.click();
      await waitFor(() => document.querySelector('.hdr-settings-sheet__diag-panel'), 'створка диагностики');
      await sleep(400);
    },
    'Домашний экран · лист': async () => {
      await waitFor(() => HEYS.push?.showIosHomeInstallGuide, 'HEYS.push', 30000);
      HEYS.push.showIosHomeInstallGuide({});
      await waitFor(() => document.querySelector('.ios-home-install-modal'), 'лист «Домашний экран»');
    },
    'Настройки · настроить подробно': async () => {
      // Строка открывается только при включённых пушах — так отвечает
      // подписка, когда она есть.
      await waitFor(() => HEYS.push?.getStatus, 'HEYS.push', 30000);
      HEYS.push.getStatus = async () => ({ subscribed: true, permission: 'granted', swAvailable: true, needsInstall: false, capable: true });
      await openSettingsSheet();
      const row = await waitFor(() => {
        const node = document.querySelector('.hdr-settings-sheet__row[data-settings-key="notify-detail"]');
        return node && !node.disabled && !node.classList.contains('is-disabled') && node.getAttribute('aria-disabled') !== 'true' ? node : null;
      }, 'строка «Настроить подробно» доступна');
      row.click();
      await waitFor(() => document.querySelector('.notify-detail'), 'лист «Уведомления»');
      await sleep(300);
    },
    'Настройки · чипы быстрых действий': async () => {
      await openSettingsSheet();
      const row = await waitFor(() => document.querySelector('.hdr-settings-sheet__row[data-settings-key="theme"]'), 'строка «Оформление»');
      row.click();
      await waitFor(() => document.querySelector('.hdr-settings-sheet__fab-card'), 'чипы быстрых действий');
      await sleep(400);
    },
  };

  const SCENES = { ...TIPS_SCENES, ...GAME_SCENES, ...SPINNER_SCENES, ...PWA_SCENES, ...UNDO_SCENES, ...SETTINGS_SCENES };

  const baseMount = fixture.mount;
  fixture.mount = async function mountWithZones(frameLabel) {
    const scene = SCENES[frameLabel];
    if (!scene) return baseMount.call(fixture, frameLabel);
    await scene();
    await sleep(200);
    return null;
  };
  fixture.__zonesInstalled = true;
  fixture.zoneScenes = SCENES;
})(typeof window !== 'undefined' ? window : globalThis);
