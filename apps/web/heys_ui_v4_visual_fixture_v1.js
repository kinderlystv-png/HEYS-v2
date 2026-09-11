// heys_ui_v4_visual_fixture_v1.js — детерминированные кадры для ui-v4 visual harness
(function mountUiV4VisualFixture(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  if (!React || !ReactDOM?.createRoot) return;

  const h = React.createElement;
  const HOST_ID = 'ui-v4-visual-fixture-host';

  const ROOT_BY_FRAME = Object.freeze({
    'Первый вход · шаг 1': '.tour-overlay',
    'Первый вход · шаг 2': '.tour-overlay',
    'Первый вход · шаг 3': '.tour-overlay',
    'Первый вход · шаг 4': '.tour-overlay',
    'Первый вход · обзор пройден': '.heys-undo-bar',
    'Первый вход · с компьютера': '.desktop-gate',
    'Подписка · строка в настройках': '.tab-settings-menu--v4-sheet .hdr-settings-sheet__row[data-settings-key="subscription"]',
    // Корни подписки — там, где их монтирует сам продукт: экран подписки —
    // секция профиля, модалки — свои контейнеры на body. Две модалки без
    // входа в продукте (приветствие зовёт монтаж первого входа, «оплата
    // прошла» — возврат из ЮKassa) монтируются в прозрачную рамку стенда.
    'Подписка · экран · пробный период': '#profile-section-subscription .sub-screen',
    'Подписка · приветствие': '#ui-v4-visual-fixture-host .paywall-modal',
    'Подписка · баннер сверху': '.readonly-banner--sticky',
    'Подписка · тост на действии': '.readonly-toast',
    'Подписка · контакт поддержки': '#heys-contact-support-host .paywall-modal',
    'Подписка · тарифы · места есть': '#heys-paywall-container .paywall-modal',
    'Подписка · тарифы · мест нет': '#heys-paywall-container .paywall-modal',
    'Подписка · тарифы · Pro Спорт': '#heys-paywall-container .paywall-modal',
    'Подписка · проверьте заказ': '#heys-paywall-container .paywall-order-card',
    'Подписка · оплата прошла': '#ui-v4-visual-fixture-host .paywall-modal',
    'Подписка · экран · активна': '#profile-section-subscription .sub-screen',
    'Подписка · экран · только чтение': '#profile-section-subscription .sub-screen',
    'Подписка · очередь · заявка подана': '#heys-paywall-container .paywall-modal',
    'Подписка · очередь · место освободилось': '#heys-paywall-container .paywall-modal',
    // Кадр мессенджера — целый экран; слои (лист, меню, диалоги) живут внутри
    // .messenger-modal, поэтому корень у всех десяти один.
    'Мессенджер · пустой тред': '.messenger-modal',
    'Мессенджер · тред с карточкой дня': '.messenger-modal',
    'Мессенджер · Ждём и подсказка': '.messenger-modal',
    'Мессенджер · запись голосового': '.messenger-modal',
    'Мессенджер · лист действий': '.messenger-modal',
    'Мессенджер · меню Ещё': '.messenger-modal',
    'Мессенджер · поиск': '.messenger-modal',
    'Мессенджер · без сети': '.messenger-modal',
    'Мессенджер · согласие на расшифровку': '.messenger-modal',
    'Мессенджер · удаление сообщения': '.messenger-modal',
  });

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('main');
      host.id = HOST_ID;
      Object.assign(host.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '20000',
        overflow: 'auto',
        background: 'var(--v4-bg, #fffaf3)',
      });
      document.body.appendChild(host);
    }
    return host;
  }

  function renderToHost(element) {
    const host = ensureHost();
    HEYS.__uiV4VisualFixtureRoot = HEYS.__uiV4VisualFixtureRoot || ReactDOM.createRoot(host);
    HEYS.__uiV4VisualFixtureRoot.render(element);
    return host;
  }

  function clearHost() {
    const host = document.getElementById(HOST_ID);
    if (HEYS.__uiV4VisualFixtureRoot) {
      HEYS.__uiV4VisualFixtureRoot.render(null);
    }
    if (host?.parentNode) host.parentNode.removeChild(host);
  }

  function pushUndoToast(payload) {
    if (!HEYS.Undo?.push) throw new Error('HEYS.Undo unavailable');
    HEYS.Undo.push(payload);
  }

  // ── Подписка ───────────────────────────────────────────────────────────
  // Стенд доводит приложение до состояния кадра настоящими входами продукта:
  // строка «Подписка» в листе настроек, пилюля липкого баннера, тап по
  // «Добавить приём пищи» в «только чтении», кнопка тарифа, галочка оферты.
  // Подменяется только то, чего на стенде нет: ответы сервера (статус
  // подписки, ёмкость очереди, прогноз срока заказа) и флаг фазы.
  // Прежний стенд рисовал компоненты в пустой рамке, а заглушку статуса
  // снимал синхронно, раньше чем экран её спросит: экран подписки получал
  // «нет подписки» и во всех трёх состояниях рисовал «Pro · активна» без
  // даты. Заглушка очереди ставилась эффектом родителя — уже после того, как
  // блок очереди сходил к настоящему серверу, — и четыре кадра очереди
  // показывали одно «Мест нет · в очереди 0».

  const SUBSCRIPTION_STATUS_BY_FRAME = Object.freeze({
    'Подписка · экран · пробный период': { status: 'trial', trial_ends_at: '2026-09-10', plan: null },
    'Подписка · экран · активна': { status: 'active', plan: 'pro', subscription_ends_at: '2026-10-03' },
    'Подписка · экран · только чтение': { status: 'read_only', plan: 'pro' },
  });

  function installSubscriptionServer(status) {
    const api = HEYS.YandexAPI;
    if (!api?.rpc) throw new Error('HEYS.YandexAPI.rpc unavailable');
    if (!api.__uiV4OriginalRpc) api.__uiV4OriginalRpc = api.rpc;
    const original = api.__uiV4OriginalRpc;
    api.rpc = function uiV4SubscriptionRpc(name, params) {
      if (name === 'get_subscription_status_by_session') {
        return Promise.resolve({ data: { can_edit: status.status !== 'read_only', ...status } });
      }
      return original.call(this, name, params);
    };
  }

  // «Только чтение» по всему приложению: кэш статуса, из которого читают
  // вкладка «Питание» (баннер) и гейт записи (тост), плюс событие смены
  // статуса — им приложение перерисовывается без перезагрузки.
  async function enterReadOnly() {
    const sub = HEYS.Subscription;
    if (!sub?.getCachedStatus) throw new Error('HEYS.Subscription.getCachedStatus unavailable');
    sub.getCachedStatus = () => 'read_only';
    sub.getCachedDetails = () => ({ status: 'read_only' });
    global.dispatchEvent(new CustomEvent('heys:subscription-changed', { detail: { status: 'read_only' } }));
    await waitFor(() => document.querySelector('.readonly-banner--sticky'), 'липкий баннер «только чтение»');
  }

  async function tapReadOnlyBannerPill() {
    const pill = await waitFor(
      () => document.querySelector('.readonly-banner--sticky .readonly-banner-pill'),
      'пилюля «Подписка» в баннере',
    );
    pill.click();
  }

  function installTrialQueueStub(variant) {
    // Числа — из кадров: «в очереди 4», «вы 3-й в очереди», таймер 1:47:12
    // (часы стенда стоят, поэтому таймер не уходит).
    const presets = {
      open: {
        capacity: { is_accepting: true, available_slots: 3, total_slots: 12, queue_length: 0 },
        queue: { status: 'not_in_queue' },
      },
      full: {
        capacity: { is_accepting: true, available_slots: 0, total_slots: 12, queue_length: 4 },
        queue: { status: 'not_in_queue' },
      },
      queued: {
        capacity: { is_accepting: true, available_slots: 0, total_slots: 12, queue_length: 4 },
        queue: { status: 'queued', position: 3 },
      },
      offer: {
        capacity: { is_accepting: true, available_slots: 1, total_slots: 12, queue_length: 3 },
        queue: {
          status: 'offer',
          offer_expires_at: new Date(Date.now() + ((1 * 60 + 47) * 60 + 12) * 1000).toISOString(),
        },
      },
    };
    const preset = presets[variant];
    if (!preset) throw new Error(`Unknown trial queue variant: ${variant}`);
    const base = HEYS.TrialQueue;
    if (!base?.formatTimeRemaining || !base?.isOfferExpired) {
      throw new Error('HEYS.TrialQueue unavailable');
    }
    HEYS.TrialQueue = {
      ...base,
      getCapacity: async () => preset.capacity,
      getQueueStatus: async () => preset.queue,
      requestTrial: async () => ({ success: true }),
      cancelQueue: async () => ({ success: true }),
      claimOffer: async () => ({ success: true }),
    };
  }

  function installOrderServer() {
    const api = HEYS.YandexAPI;
    if (!api) throw new Error('HEYS.YandexAPI unavailable');
    // «до 5 октября» — дата, которую возвращает сервер (строка «вид ·
    // проверьте заказ»: клиент её не вычисляет).
    api.getOrderPreview = async () => ({
      data: { projected_period_end: '2026-10-05', period_kind: 'estimate' },
      error: null,
    });
    // Наличие createPayment — условие, при котором тарифы ведут на «проверьте
    // заказ». До оплаты стенд не доходит: платёж не создаётся.
    api.createPayment = async () => ({ data: null, error: { message: 'stand' } });
  }

  function findButtonByText(root, text) {
    return [...root.querySelectorAll('button, [role="button"]')]
      .find((node) => node.textContent?.replace(/\s+/g, ' ').trim().includes(text)) || null;
  }

  function renderOverTheApp(element) {
    // Модалка без входа в продукте встаёт поверх живого приложения: рамка
    // стенда прозрачна, под затемнением виден экран, как на кадре.
    const host = renderToHost(element);
    host.style.background = 'transparent';
    return host;
  }

  async function mountFirstRun(frameLabel) {
    clearHost();
    if (frameLabel === 'Первый вход · с компьютера') {
      const DesktopGateScreen = HEYS.DesktopGateScreen;
      if (!DesktopGateScreen) throw new Error('DesktopGateScreen unavailable');
      renderToHost(h(DesktopGateScreen, { onLogout: () => {} }));
      return;
    }
    if (frameLabel === 'Первый вход · обзор пройден') {
      // Строка «вид · плашка «обзор пройден»»: действия нет, кольца нет.
      pushUndoToast({
        label: 'Обзор пройден. Вернуться к нему — в настройках',
        duration: 4000,
        notice: true,
      });
      return;
    }
    const stepMatch = /^Первый вход · шаг (\d+)$/.exec(frameLabel);
    if (!stepMatch) throw new Error(`Unknown first-run frame: ${frameLabel}`);
    const stepIndex = Number(stepMatch[1]) - 1;
    const tour = HEYS.OnboardingTour;
    if (!tour?.openVisualFixtureStep) throw new Error('OnboardingTour.openVisualFixtureStep unavailable');
    await tour.openVisualFixtureStep(stepIndex);
  }

  const TRIAL_QUEUE_VARIANT_BY_FRAME = Object.freeze({
    'Подписка · тарифы · места есть': 'open',
    'Подписка · тарифы · мест нет': 'full',
    'Подписка · очередь · заявка подана': 'queued',
    'Подписка · очередь · место освободилось': 'offer',
  });

  async function mountSubscription(frameLabel) {
    clearHost();
    const Subs = HEYS.Subscriptions;
    const Paywall = HEYS.Paywall;
    if (!Subs) throw new Error('HEYS.Subscriptions unavailable');
    if (!Paywall?.show) throw new Error('HEYS.Paywall.show unavailable');
    HEYS.config = HEYS.config || {};

    if (frameLabel === 'Подписка · строка в настройках') {
      throw new Error('settings-row frame uses demo-settings flow');
    }

    // Экран подписки: строка «Подписка» в листе настроек → секция профиля.
    const screenStatus = SUBSCRIPTION_STATUS_BY_FRAME[frameLabel];
    if (screenStatus) {
      installSubscriptionServer(screenStatus);
      await waitFor(
        () => typeof global.__heysToggleTabSettingsHandler === 'function',
        'обработчик листа настроек',
        30000,
      );
      global.__heysToggleTabSettingsHandler();
      const row = await waitFor(
        () => document.querySelector('.hdr-settings-sheet__row[data-settings-key="subscription"]'),
        'строка «Подписка» в листе настроек',
      );
      row.click();
      await waitFor(
        () => document.querySelector('#profile-section-subscription .sub-screen__status-card'),
        'экран подписки',
      );
      await sleep(600); // плавная прокрутка к секции
      return;
    }

    // Фаза 1 · «только чтение»: пилюля баннера на «Питании» → контакт поддержки.
    if (frameLabel === 'Подписка · контакт поддержки') {
      HEYS.config.paymentsEnabled = false;
      await enterReadOnly();
      await tapReadOnlyBannerPill();
      await waitFor(() => document.querySelector('#heys-contact-support-host .sub-contact'), 'контакт поддержки');
      return;
    }

    if (frameLabel === 'Подписка · баннер сверху') {
      await enterReadOnly();
      return;
    }

    // Тап по «Добавить приём пищи» в «только чтении» — вход кадра («тап по
    // «Добавить» в «только чтении»»). Текст тоста даёт вызывающий код.
    if (frameLabel === 'Подписка · тост на действии') {
      await enterReadOnly();
      const add = await waitFor(() => findButtonByText(document, 'Добавить приём пищи'), 'кнопка «Добавить приём пищи»');
      add.click();
      await waitFor(() => document.querySelector('.readonly-toast'), 'тост «только чтение»');
      return;
    }

    // Фаза 2 · тарифы и очередь: «только чтение», пилюля баннера → тарифы.
    const queueVariant = TRIAL_QUEUE_VARIANT_BY_FRAME[frameLabel];
    if (queueVariant) {
      HEYS.config.paymentsEnabled = true;
      installTrialQueueStub(queueVariant);
      await enterReadOnly();
      await tapReadOnlyBannerPill();
      await waitFor(
        () => {
          const title = document.querySelector('#heys-paywall-container .paywall-trial-title');
          // «Проверяем места…» — состояние загрузки блока, а не кадр.
          return title && !document.querySelector('#heys-paywall-container .paywall-trial-status--busy')?.textContent?.includes('Проверяем');
        },
        'блок пробного периода',
      );
      await sleep(200);
      return;
    }

    // Фаза 2 · доступ ещё есть: вход с экрана подписки → тарифы.
    if (frameLabel === 'Подписка · тарифы · Pro Спорт' || frameLabel === 'Подписка · проверьте заказ') {
      HEYS.config.paymentsEnabled = true;
      installTrialQueueStub('open');
      installOrderServer();
      if (!HEYS.currentClientId) throw new Error('HEYS.currentClientId пуст: «проверьте заказ» требует клиента');
      Paywall.show('subscription_screen');
      const modal = await waitFor(() => document.querySelector('#heys-paywall-container .paywall-modal'), 'модалка тарифов');
      if (frameLabel === 'Подписка · тарифы · Pro Спорт') {
        const plan = [...modal.querySelectorAll('.paywall-plan')].find((node) => node.textContent.includes('Pro Спорт'));
        if (!plan) throw new Error('карточка «Pro Спорт» не найдена');
        plan.click();
        await waitFor(() => document.querySelector('#heys-paywall-container .paywall-footnote'), 'подпись Pro Спорт');
        return;
      }
      const cta = await waitFor(() => document.querySelector('#heys-paywall-container .paywall-cta'), 'кнопка «Оформить Pro»');
      cta.click();
      const consent = await waitFor(() => document.querySelector('#heys-paywall-container .paywall-consent'), 'согласие с офертой');
      consent.click();
      await waitFor(() => document.querySelector('#heys-paywall-container .paywall-consent-box.is-checked'), 'галочка оферты');
      await waitFor(() => document.querySelector('#heys-paywall-container .paywall-order-period'), 'дата окончания заказа');
      return;
    }

    if (frameLabel === 'Подписка · приветствие') {
      renderOverTheApp(h(Subs.WelcomeFirstLogin, {
        clientName: 'Анна',
        trialEndsAt: '2026-09-12',
        onClose: () => {},
      }));
      return;
    }

    if (frameLabel === 'Подписка · оплата прошла') {
      // Срок — «До 5 октября»: дата, которую сервер вернул после оплаты.
      renderOverTheApp(h(Subs.PaymentSuccessScreen, {
        plan: 'pro',
        expiresAt: '2026-10-05',
        onContinue: () => {},
      }));
      return;
    }

    throw new Error(`Unknown subscription frame: ${frameLabel}`);
  }

  // ── Мессенджер ───────────────────────────────────────────────────────
  // Стенд открывает настоящий экран переписки (HEYS.Messenger.openModal) и
  // доводит его до состояния кадра теми же действиями, что и человек: тап по
  // «Ещё», долгое нажатие на сообщении, ввод текста, запись голосового. Прежний
  // стенд собирал похожий DOM из голых div с классами продукта, и пара «кадр —
  // приложение» сравнивала кадр с имитацией. Подменяется только то, чего на
  // стенде нет физически: ответы сервера (HEYS.MessengerAPI), загрузка файлов,
  // микрофон и признак сети. Данные повторяют форму ответов сервера, а не
  // текст кадра там, где сервер так ответить не может (например, чек-лист дня
  // знает один пункт «Приём пищи», а не «Ужин» и «Обед»).

  const MESSENGER_CURATOR_NAME = 'Ольга';
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

  /** Момент по часам стенда: сдвиг в днях от «сегодня» и время «ЧЧ:ММ[:СС]». */
  function at(dayOffset, time) {
    const now = new Date();
    const [hh, mm, ss = 0] = time.split(':').map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm, ss).toISOString();
  }

  function msg(id, role, dayOffset, time, body, extra = {}) {
    return {
      id: `visual-${id}`,
      sender_role: role,
      body,
      attachments: [],
      created_at: at(dayOffset, time),
      ...extra,
    };
  }

  function photoCanvas() {
    // Снимок еды нарисовать нечем — ставим спокойную «фотографию» тарелки,
    // чтобы в паре было видно место и размер снимка, как у заглушки кадра.
    const canvas = document.createElement('canvas');
    canvas.width = 680;
    canvas.height = 472;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 680, 472);
    bg.addColorStop(0, '#b9a58a');
    bg.addColorStop(1, '#8c7a63');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 680, 472);
    ctx.fillStyle = '#efe9df';
    ctx.beginPath();
    ctx.ellipse(340, 236, 210, 170, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a6b3f';
    ctx.beginPath();
    ctx.ellipse(290, 230, 95, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c9a1';
    ctx.beginPath();
    ctx.ellipse(410, 250, 80, 55, 0.3, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  }

  let photoUrlCache = null;
  function photoUrl() {
    photoUrlCache = photoUrlCache || photoCanvas().toDataURL('image/jpeg', 0.85);
    return photoUrlCache;
  }

  /** Тихая WAV-запись нужной длины: у голосового куратора длительность берётся из файла. */
  function silentWavUrl(seconds) {
    const rate = 8000;
    const samples = rate * seconds;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    text(36, 'data');
    view.setUint32(40, samples, true);
    new Uint8Array(buffer, 44).fill(128);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function searchableText(message) {
    return message.body || (message.attachments || []).map((att) => att.transcript_text).find(Boolean) || '';
  }

  function installMessengerApi(state) {
    const base = HEYS.MessengerAPI || {};
    const audioUrls = new Map();
    HEYS.MessengerAPI = {
      ...base,
      // Сервер отдаёт страницу от новых к старым.
      getThread: async (opts = {}) => {
        let list = state.thread.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        if (opts.before_ts) list = list.filter((m) => m.created_at < opts.before_ts);
        return { success: true, messages: list.slice(0, opts.limit || 50) };
      },
      getDayChecklist: async () => ({ success: true, items: state.checklist || [] }),
      getTranscriptionConsent: async () => ({ success: true, ...state.consent }),
      setTranscriptionConsent: async (granted) => {
        state.consent = {
          granted: !!granted,
          decided: true,
          created_at: new Date().toISOString(),
          revoked_at: null,
          version: '1.1',
        };
        return { success: true, ...state.consent };
      },
      // Сервер ищет подстрокой (ILIKE по тексту и расшифровке), без словоформ.
      searchMessages: async ({ q, type } = {}) => {
        const needle = String(q || '').toLowerCase();
        const hits = (state.search || []).filter((m) => {
          if (!searchableText(m).toLowerCase().includes(needle)) return false;
          if (type === 'image') return m.attachments.some((att) => att.type === 'image');
          if (type === 'audio') return m.attachments.some((att) => att.type === 'audio');
          if (type === 'applied') return !!m.applied_at;
          return true;
        });
        return { success: true, messages: hits };
      },
      send: async (payload) => {
        if (state.networkDown) return { success: false, error: 'network_error' };
        const created_at = new Date().toISOString();
        const id = `visual-sent-${state.thread.length + 1}`;
        state.thread.push({
          id,
          sender_role: 'client',
          body: payload.body,
          attachments: payload.attachments || [],
          created_at,
        });
        return { success: true, message_id: id, created_at };
      },
      markRead: async () => ({ success: true }),
      setAcked: async (id, value) => ({ success: true, acked_at: value ? new Date().toISOString() : null }),
      setDone: async (id, value) => ({ success: true, done_at: value ? new Date().toISOString() : null }),
      deleteMessage: async () => ({ success: true }),
      editMessage: async () => ({ success: true, edited_at: new Date().toISOString() }),
      getInbox: async () => ({ success: true, inbox: [] }),
      refreshInbox: () => {},
      refreshFabUnread: () => {},
      fetchPhotoBlob: async () => ({ success: true, objectUrl: photoUrl() }),
      fetchAudioBlob: async (path) => {
        const att = state.thread.flatMap((m) => m.attachments).find((a) => a.path === path);
        const seconds = Math.max(1, Math.round((att?.duration_ms || 1000) / 1000));
        if (!audioUrls.has(path)) audioUrls.set(path, silentWavUrl(seconds));
        return { success: true, objectUrl: audioUrls.get(path) };
      },
    };
  }

  function installMediaStubs() {
    HEYS.StoragePhotos = HEYS.StoragePhotos || {};
    HEYS.StoragePhotos.uploadPhoto = async (dataUrl, clientId, day, mealId) => ({
      url: `https://visual.invalid/${mealId}.jpg`,
      path: `visual/${mealId}.jpg`,
    });
    HEYS.StorageMedia = HEYS.StorageMedia || {};
    HEYS.StorageMedia.uploadAudio = async (dataUrl, clientId, day, mealId, meta = {}) => ({
      url: '',
      path: `visual/${mealId}.wav`,
      mime: meta.blob?.type || 'audio/wav',
      size_bytes: meta.blob?.size || 0,
    });
    // Микрофона у стенда нет: отдаём настоящий поток из генератора звука,
    // и MediaRecorder продукта пишет его как обычную запись.
    const devices = navigator.mediaDevices || {};
    devices.getUserMedia = async () => {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      const ctx = new Ctx();
      try { await ctx.resume(); } catch (_) { /* без жеста может остаться suspended */ }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    };
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
    }
  }

  /** Часы стенда заморожены; «прошло N секунд» — это новые замороженные часы позже. */
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

  function goOffline() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    global.dispatchEvent(new Event('offline'));
  }

  function modalNode(selector) {
    return document.querySelector(`.messenger-modal ${selector}`);
  }

  function typeInto(element, text) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function tapSend() {
    const button = await waitFor(() => {
      const node = modalNode('.messenger-send');
      return node && !node.disabled ? node : null;
    }, 'кнопка отправки активна');
    button.click();
  }

  /** Долгое нажатие: касание без отпускания дольше порога долгого нажатия. */
  async function longPress(element) {
    let event;
    try {
      event = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
    } catch (_) {
      event = new Event('touchstart', { bubbles: true, cancelable: true });
    }
    element.dispatchEvent(event);
    await sleep((HEYS.longPress?.MS ?? 350) + 150);
  }

  async function pickPhoto(name) {
    const input = modalNode('input[type="file"]');
    const blob = await new Promise((resolve) => photoCanvas().toBlob(resolve, 'image/jpeg', 0.85));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function openMoreMenu() {
    modalNode('.messenger-header-button[aria-label="Ещё"]').click();
    return waitFor(() => modalNode('.messenger-header-menu'), 'меню «Ещё»');
  }

  function lastOwnRow() {
    const rows = document.querySelectorAll('.messenger-modal .msg-row-mine[data-message-id]');
    return rows[rows.length - 1] || null;
  }

  // Переписка трёх кадров над одним тредом: лист действий, меню «Ещё» и
  // удаление рисуют одно и то же «Обед … · Приняла, соберу день.».
  const lunchThread = () => [
    msg('lunch', 'client', 0, '13:07', 'Обед в 13:05, гречка 180 г, грудка 120 г', {
      seen_at: at(0, '13:12'),
      done_at: at(0, '13:31'),
    }),
    msg('lunch-reply', 'curator', 0, '13:31', 'Приняла, соберу день.'),
  ];
  const consentGranted = () => ({
    granted: true,
    decided: true,
    created_at: at(-3, '10:00'),
    revoked_at: null,
    version: '1.1',
  });
  const consentUndecided = () => ({ granted: false, decided: false, created_at: null, revoked_at: null });

  // Поиск: всё, что сервер вернул бы на «гречка» подстрокой, от новых к старым.
  const buckwheatSearch = () => [
    msg('s1', 'client', 0, '13:07', 'Обед в 13:05, гречка 180 г, грудка 120 г'),
    msg('s2', 'client', -1, '19:44', 'Ужин: гречка 150 г и салат с маслом 12 г'),
    msg('s3', 'client', -2, '13:20', 'Обед в 13:10, гречка 160 г и котлета 110 г'),
    msg('s4', 'client', -3, '19:02', null, {
      attachments: [{
        type: 'audio',
        path: 'visual/search-voice.ogg',
        mime: 'audio/ogg',
        duration_ms: 21000,
        transcript_status: 'ready',
        transcript_text: 'На ужин гречка с грибами, граммов двести, и чай без сахара',
      }],
    }),
    msg('s5', 'curator', -4, '13:20', 'Гречка варёная — около 110 ккал на сто грамм, сухая втрое больше'),
    msg('s6', 'client', -8, '12:10', 'Гречка каждый день — это нормально?'),
    msg('s7', 'client', -9, '13:00', 'Обед: гречка 150 г, индейка 100 г'),
    msg('s8', 'client', -10, '19:30', 'Ужин в 19:20: гречка 120 г, огурцы'),
    msg('s9', 'client', -11, '08:40', 'Завтрак: гречка с молоком, 200 г'),
    msg('s10', 'client', -12, '13:15', 'Гречка 170 г и тушёные овощи'),
    msg('s11', 'client', -13, '19:05', 'Ужин: гречка 140 г, творог 100 г'),
    msg('s12', 'client', -14, '13:40', 'Обед в 13:30, гречка 180 г, курица 120 г'),
    msg('s13', 'curator', -15, '10:00', 'Если гречка на ужин — порцию лучше уменьшить до 120 г'),
    msg('s14', 'client', -16, '13:05', 'Обед: гречка 160 г, рыба 130 г'),
    msg('s15', 'client', -17, '19:10', 'Ужин: гречка 130 г и салат'),
    msg('s16', 'client', -18, '08:30', 'Завтрак: гречка 150 г и яйцо'),
    msg('s17', 'client', -19, '13:20', 'Обед: гречка 170 г, говядина 100 г'),
    msg('s18', 'client', -20, '19:40', 'Ужин: гречка 120 г и кефир'),
  ];

  const MESSENGER_SCENES = {
    'Мессенджер · пустой тред': {
      state: () => ({ thread: [], checklist: [], consent: consentUndecided() }),
    },
    'Мессенджер · тред с карточкой дня': {
      state: () => ({
        // Четырнадцать сообщений старше порога истории прячутся за «Показать ранее».
        thread: [
          ...Array.from({ length: 14 }, (_, i) => msg(
            `old-${i}`,
            i % 2 ? 'curator' : 'client',
            -45 - i,
            '12:00',
            i % 2 ? 'Приняла.' : 'Обед в 12:00, суп 250 г',
          )),
          msg('lunch-photo', 'client', 0, '13:07:00', null, {
            seen_at: at(0, '13:12'),
            done_at: at(0, '13:31'),
            attachments: [{
              type: 'image',
              path: 'visual/lunch.jpg',
              url: '',
              width: 1200,
              height: 832,
              mime: 'image/jpeg',
            }],
          }),
          msg('lunch-text', 'client', 0, '13:07:20', 'Обед в 13:05 — гречка 180 г, куриная грудка 120 г', {
            seen_at: at(0, '13:12'),
            done_at: at(0, '13:31'),
            applied_at: at(0, '13:41'),
            applied_summary: {
              meal_label: 'Обед',
              meal_time: '13:05',
              items: [
                { name: 'Гречка варёная', grams: 180, kcal: 210 },
                { name: 'Куриная грудка', grams: 120, kcal: 198 },
                { name: 'Масло оливковое', grams: 14, kcal: 132 },
              ],
              total: { kcal: 540 },
            },
          }),
          msg('lunch-reply', 'curator', 0, '13:31', 'Приняла. Гречку записала как варёную, грудку без кожи — соберу день.'),
        ],
        checklist: [],
        consent: consentGranted(),
      }),
    },
    'Мессенджер · Ждём и подсказка': {
      state: () => ({
        thread: [
          msg('weight', 'client', 0, '08:12', 'Вес утром: 71,4 кг', { seen_at: at(0, '08:30'), done_at: at(0, '08:40') }),
          msg('weight-reply', 'curator', 0, '08:40', 'Хорошо. За неделю минус 400 г — идём по плану.'),
          msg('lunch', 'client', 0, '13:07', 'Обед в 13:05, гречка 180 г, грудка 120 г', { seen_at: at(0, '13:12') }),
        ],
        // Форма ответа /messages/day-checklist в 13:15: приём и вес внесены,
        // вода отстаёт, активность ещё не наступила.
        checklist: [
          { key: 'meal', label: 'Приём пищи', status: 'done', due_from: '12:00', done_at_local: '13:05' },
          { key: 'weight', label: 'Вес утром', status: 'done', due_from: '09:00' },
          { key: 'water', label: 'Вода', status: 'missing', deficit_ml: 600 },
          { key: 'activity', label: 'Активность', status: 'skipped', due_from: '19:00' },
        ],
        consent: consentGranted(),
      }),
      drive: async () => {
        await waitFor(() => modalNode('.messenger-day-checklist'), 'строка «Ждём»');
        await waitFor(() => modalNode('.messenger-food-hint'), 'подсказка «время и граммы»');
        typeInto(modalNode('.messenger-input'), 'Ужин в 19:20, ');
      },
    },
    'Мессенджер · запись голосового': {
      state: () => ({
        thread: [
          msg('weight-intent', 'client', -1, '08:12', null, {
            intent_type: 'weight',
            intent_payload: { weight_kg: 71.4 },
            seen_at: at(-1, '08:30'),
            done_at: at(-1, '09:02'),
          }),
          msg('voice-reply', 'curator', -1, '09:02', null, {
            attachments: [{
              type: 'audio',
              path: 'visual/voice-0902.ogg',
              mime: 'audio/ogg',
              duration_ms: 32000,
              transcript_status: 'ready',
              transcript_text: 'Хорошо идёте. На ужин добавьте белок — грудку или творог, граммов сто пятьдесят.',
            }],
          }),
        ],
        checklist: [],
        consent: consentGranted(),
      }),
      drive: async () => {
        modalNode('.messenger-voice').click();
        await waitFor(() => modalNode('.messenger-recording-live'), 'запись идёт');
        advanceClock(14000);
        await waitFor(() => modalNode('.messenger-recording-time')?.textContent === '0:14', 'таймер 0:14');
      },
    },
    'Мессенджер · лист действий': {
      state: () => ({ thread: lunchThread(), checklist: [], consent: consentGranted() }),
      drive: async () => {
        await longPress(await waitFor(lastOwnRow, 'своё сообщение'));
        await waitFor(() => modalNode('.messenger-action-sheet'), 'лист действий');
      },
    },
    'Мессенджер · меню Ещё': {
      state: () => ({
        thread: lunchThread(),
        checklist: [],
        consent: { ...consentGranted(), created_at: '2026-09-02T10:00:00+03:00' },
      }),
      drive: openMoreMenu,
    },
    'Мессенджер · поиск': {
      state: () => ({ thread: lunchThread(), checklist: [], consent: consentGranted(), search: buckwheatSearch() }),
      drive: async () => {
        await openMoreMenu();
        const item = [...document.querySelectorAll('.messenger-modal .messenger-header-menu__item')]
          .find((node) => node.textContent.includes('Поиск'));
        item.click();
        const input = await waitFor(() => modalNode('.messenger-search__input'), 'поле поиска');
        typeInto(input, 'гречка');
        await waitFor(() => modalNode('.messenger-search__item'), 'результаты поиска');
      },
    },
    'Мессенджер · без сети': {
      state: () => ({
        thread: [msg('ask-dinner', 'curator', 0, '18:30', 'Пришлите ужин, когда поедите.')],
        checklist: [],
        consent: consentGranted(),
      }),
      // Два неотправленных сообщения, как в кадре: связь пропала на отправке
      // (запрос не дошёл), затем сеть пропала совсем, и человек начал черновик.
      drive: async (state) => {
        state.networkDown = true;
        typeInto(modalNode('.messenger-input'), 'Ужин в 19:20, творог 200 г');
        await tapSend();
        await waitFor(() => document.querySelectorAll('.messenger-modal .msg-bubble-queued').length === 1, 'первое в очереди');
        await pickPhoto('dinner.jpg');
        await waitFor(() => modalNode('.messenger-pending-photo.status-done'), 'фото загружено');
        await tapSend();
        await waitFor(() => document.querySelectorAll('.messenger-modal .msg-bubble-queued').length === 2, 'второе в очереди');
        goOffline();
        typeInto(modalNode('.messenger-input'), 'Спрошу завтра про пере');
        await waitFor(() => modalNode('.messenger-offline-bar'), 'полоса без сети');
      },
    },
    'Мессенджер · согласие на расшифровку': {
      state: () => ({
        thread: [msg('ask-day', 'curator', 0, '18:30', 'Пришлите, как прошёл день.')],
        checklist: [],
        consent: consentUndecided(),
      }),
      // Согласие спрашивается один раз, после отправки первого голосового:
      // записываем, останавливаем, отправляем — и ждём диалог.
      drive: async () => {
        modalNode('.messenger-voice').click();
        await waitFor(() => modalNode('.messenger-recording-live'), 'запись идёт');
        advanceClock(6000);
        await sleep(1500);
        modalNode('.messenger-voice').click();
        await waitFor(() => modalNode('.messenger-audio-draft.status-done'), 'голосовое загружено', 15000);
        await tapSend();
        await waitFor(() => modalNode('.messenger-consent-dialog'), 'диалог согласия');
      },
    },
    'Мессенджер · удаление сообщения': {
      state: () => ({ thread: lunchThread(), checklist: [], consent: consentGranted() }),
      drive: async () => {
        await longPress(await waitFor(lastOwnRow, 'своё сообщение'));
        const remove = await waitFor(() => modalNode('.messenger-action-sheet__item--danger'), 'пункт «Удалить»');
        remove.click();
        await waitFor(() => modalNode('.messenger-confirm-dialog'), 'диалог удаления');
      },
    },
  };

  async function mountMessenger(frameLabel) {
    clearHost();
    const scene = MESSENGER_SCENES[frameLabel];
    if (!scene) throw new Error(`Unknown messenger frame: ${frameLabel}`);
    await waitFor(() => typeof HEYS.Messenger?.openModal === 'function', 'HEYS.Messenger', 30000);
    // Имя куратора у демо-клиента нигде не записано, а кадр называет его.
    HEYS.curatorDisplayName = MESSENGER_CURATOR_NAME;
    const state = scene.state();
    installMessengerApi(state);
    installMediaStubs();
    HEYS.Messenger.closeModal?.();
    HEYS.Messenger.openModal();
    await waitFor(
      () => modalNode('.messenger-thread .msg-row') || modalNode('.messenger-thread .messenger-empty'),
      'тред загружен',
    );
    if (scene.drive) await scene.drive(state);
    await sleep(200);
  }

  async function mount(frameLabel) {
    if (frameLabel.startsWith('Первый вход ·')) {
      await mountFirstRun(frameLabel);
      return ROOT_BY_FRAME[frameLabel];
    }
    if (frameLabel.startsWith('Подписка ·')) {
      await mountSubscription(frameLabel);
      return ROOT_BY_FRAME[frameLabel];
    }
    if (frameLabel.startsWith('Мессенджер ·')) {
      await mountMessenger(frameLabel);
      return ROOT_BY_FRAME[frameLabel];
    }
    throw new Error(`Unknown visual frame zone for «${frameLabel}»`);
  }

  HEYS.uiV4VisualFixture = {
    mount,
    rootSelectorFor(frameLabel) {
      const selector = ROOT_BY_FRAME[frameLabel];
      if (!selector) throw new Error(`No root selector for «${frameLabel}»`);
      return selector;
    },
    clear: clearHost,
    ROOT_BY_FRAME,
  };
})(typeof window !== 'undefined' ? window : globalThis);
