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
    'Подписка · экран · пробный период': '#ui-v4-subscription-screen-host',
    'Подписка · приветствие': '#ui-v4-subscription-screen-host',
    'Подписка · баннер сверху': '#ui-v4-subscription-screen-host .readonly-banner',
    'Подписка · тост на действии': '.heys-undo-bar',
    'Подписка · контакт поддержки': '#ui-v4-subscription-screen-host',
    'Подписка · тарифы · места есть': '#ui-v4-subscription-screen-host .paywall-modal',
    'Подписка · тарифы · мест нет': '#ui-v4-subscription-screen-host .paywall-modal',
    'Подписка · тарифы · Pro Спорт': '#ui-v4-subscription-screen-host .paywall-modal',
    'Подписка · проверьте заказ': '#ui-v4-subscription-screen-host',
    'Подписка · оплата прошла': '#ui-v4-subscription-screen-host',
    'Подписка · экран · активна': '#ui-v4-subscription-screen-host',
    'Подписка · экран · только чтение': '#ui-v4-subscription-screen-host',
    'Подписка · очередь · заявка подана': '#ui-v4-subscription-screen-host .paywall-modal',
    'Подписка · очередь · место освободилось': '#ui-v4-subscription-screen-host .paywall-modal',
    'Мессенджер · пустой тред': '.messenger-modal',
    'Мессенджер · тред с карточкой дня': '.messenger-modal .msg-applied-card',
    'Мессенджер · Ждём и подсказка': '.messenger-modal .messenger-day-checklist',
    'Мессенджер · запись голосового': '.messenger-modal .messenger-composer--recording',
    'Мессенджер · лист действий': '.messenger-action-sheet',
    'Мессенджер · меню Ещё': '.messenger-header-menu',
    'Мессенджер · поиск': '.messenger-search-panel',
    'Мессенджер · без сети': '.messenger-modal .messenger-offline-bar',
    'Мессенджер · согласие на расшифровку': '.messenger-confirm-dialog',
    'Мессенджер · удаление сообщения': '.messenger-confirm-dialog',
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

  function subscriptionScreenHost(children) {
    return h('div', {
      id: 'ui-v4-subscription-screen-host',
      className: 'ui-v4-subscription-screen-host',
      style: { padding: '16px', maxWidth: '375px', margin: '0 auto' },
    }, children);
  }

  function withSubscriptionStatus(status, renderChild) {
    const subs = HEYS.Subscriptions;
    if (!subs?.getStatus) throw new Error('HEYS.Subscriptions.getStatus unavailable');
    const previous = subs.getStatus;
    subs.getStatus = async () => ({
      can_edit: status?.status !== 'read_only',
      ...status,
    });
    renderChild();
    subs.getStatus = previous;
  }

  function installTrialQueueStub(variant) {
    const presets = {
      open: {
        capacity: { is_accepting: true, available_slots: 3, total_slots: 12, queue_length: 4 },
        queue: { status: 'not_in_queue' },
      },
      full: {
        capacity: { is_accepting: true, available_slots: 0, total_slots: 12, queue_length: 18 },
        queue: { status: 'not_in_queue' },
      },
      queued: {
        capacity: { is_accepting: true, available_slots: 0, total_slots: 12, queue_length: 18 },
        queue: { status: 'queued', position: 12 },
      },
      offer: {
        capacity: { is_accepting: true, available_slots: 1, total_slots: 12, queue_length: 3 },
        queue: {
          status: 'offer',
          offer_expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        },
      },
    };
    const preset = presets[variant];
    if (!preset) throw new Error(`Unknown trial queue variant: ${variant}`);
    const base = HEYS.TrialQueue || {};
    HEYS.TrialQueue = {
      ...base,
      getCapacity: async () => preset.capacity,
      getQueueStatus: async () => preset.queue,
      formatTimeRemaining: base.formatTimeRemaining || (() => '00:42:18'),
      isOfferExpired: base.isOfferExpired || (() => false),
      getQueueStatusMeta: base.getQueueStatusMeta || ((status, position) => ({
        emoji: status === 'offer' ? '🎉' : '⏳',
        label: status === 'offer' ? 'Место освободилось' : `В очереди · #${position || '?'}`,
        actionLabel: status === 'offer' ? 'Забрать место' : 'В очереди',
      })),
      getCapacityMeta: base.getCapacityMeta || ((capacity) => {
        if (capacity.available_slots > 0) {
          return {
            status: 'available',
            color: '#22c55e',
            emoji: '🟢',
            label: `Свободно ${capacity.available_slots} из ${capacity.total_slots}`,
            sublabel: 'Место доступно прямо сейчас!',
            actionLabel: 'Начать триал',
            showQueue: false,
          };
        }
        return {
          status: 'queue',
          color: '#f59e0b',
          emoji: '🟡',
          label: 'Мест нет — можно встать в очередь',
          sublabel: `В очереди ${capacity.queue_length || 0} человек`,
          actionLabel: 'Встать в очередь',
          showQueue: true,
        };
      }),
      requestTrial: async () => ({ success: true }),
      cancelQueue: async () => ({ success: true }),
      claimOffer: async () => ({ success: true }),
    };
  }

  function PaywallPlansFixture({ variant, selectPlan }) {
    const PaywallModal = HEYS.Paywall?.PaywallModal;
    const [, force] = React.useState(0);
    React.useEffect(() => {
      installTrialQueueStub(variant);
      if (!selectPlan) return;
      const timer = setTimeout(() => {
        const plans = document.querySelectorAll('#ui-v4-subscription-screen-host .paywall-plan');
        const target = [...plans].find((node) => node.textContent?.includes(selectPlan));
        target?.click();
        force((value) => value + 1);
      }, 0);
      return () => clearTimeout(timer);
    }, [variant, selectPlan]);
    if (!PaywallModal) throw new Error('HEYS.Paywall.PaywallModal unavailable');
    return h(PaywallModal, { onClose: () => {} });
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
      pushUndoToast({
        label: 'Обзор пройден. Вернуться к нему — в настройках',
        duration: 4000,
        onUndo: () => {},
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

  function mountSubscription(frameLabel) {
    clearHost();
    const Subs = HEYS.Subscriptions;
    const Paywall = HEYS.Paywall;
    if (!Subs) throw new Error('HEYS.Subscriptions unavailable');
    const clientId = HEYS.currentClientId || 'demo-client-female';

    switch (frameLabel) {
      case 'Подписка · строка в настройках':
        throw new Error('settings-row frame uses demo-settings flow');
      case 'Подписка · экран · пробный период':
        withSubscriptionStatus({
          status: 'trial',
          trial_ends_at: '2026-09-10',
          plan: null,
        }, () => renderToHost(subscriptionScreenHost(h(Subs.SubscriptionSection, { clientId }))));
        return;
      case 'Подписка · приветствие':
        renderToHost(subscriptionScreenHost(h(Subs.WelcomeFirstLogin, {
          clientName: 'Анна',
          trialEndsAt: '2026-09-12',
          onClose: () => {},
        })));
        return;
      case 'Подписка · баннер сверху':
        if (!Paywall?.ReadOnlyBanner) throw new Error('HEYS.Paywall.ReadOnlyBanner unavailable');
        renderToHost(subscriptionScreenHost(h(Paywall.ReadOnlyBanner, { onClick: () => {} })));
        return;
      case 'Подписка · тост на действии':
        pushUndoToast({
          label: 'Запись недоступна — только чтение',
          actionLabel: 'Подписка',
          duration: 4000,
          onAction: () => {},
          onUndo: () => {},
        });
        return;
      case 'Подписка · контакт поддержки':
        renderToHost(subscriptionScreenHost(h(Subs.ContactCuratorScreen, {
          isReadOnly: true,
          onClose: () => {},
        })));
        return;
      case 'Подписка · тарифы · места есть':
        renderToHost(subscriptionScreenHost(h(PaywallPlansFixture, { variant: 'open' })));
        return;
      case 'Подписка · тарифы · мест нет':
        renderToHost(subscriptionScreenHost(h(PaywallPlansFixture, { variant: 'full' })));
        return;
      case 'Подписка · тарифы · Pro Спорт':
        renderToHost(subscriptionScreenHost(h(PaywallPlansFixture, {
          variant: 'open',
          selectPlan: 'Pro Спорт',
        })));
        return;
      case 'Подписка · проверьте заказ':
        renderToHost(subscriptionScreenHost(h(Subs.PaymentScreen, {
          clientId,
          onSuccess: () => {},
          onCancel: () => {},
        })));
        return;
      case 'Подписка · оплата прошла':
        renderToHost(subscriptionScreenHost(h(Subs.PaymentSuccessScreen, {
          plan: 'pro',
          expiresAt: '2026-10-03',
          onContinue: () => {},
        })));
        return;
      case 'Подписка · экран · активна':
        withSubscriptionStatus({
          status: 'active',
          plan: 'pro',
          subscription_ends_at: '2026-10-03',
        }, () => renderToHost(subscriptionScreenHost(h(Subs.SubscriptionSection, { clientId }))));
        return;
      case 'Подписка · экран · только чтение':
        withSubscriptionStatus({
          status: 'read_only',
          plan: 'pro',
        }, () => renderToHost(subscriptionScreenHost(h(Subs.SubscriptionSection, { clientId }))));
        return;
      case 'Подписка · очередь · заявка подана':
        renderToHost(subscriptionScreenHost(h(PaywallPlansFixture, { variant: 'queued' })));
        return;
      case 'Подписка · очередь · место освободилось':
        renderToHost(subscriptionScreenHost(h(PaywallPlansFixture, { variant: 'offer' })));
        return;
      default:
        throw new Error(`Unknown subscription frame: ${frameLabel}`);
    }
  }

  function ensureMessengerSearchStub() {
    HEYS.MessengerAPI = HEYS.MessengerAPI || {};
    HEYS.MessengerAPI.searchMessages = async () => ({
      success: true,
      messages: [{
        id: 'visual-search-1',
        body: 'Курица 180 г',
        created_at: '2026-08-28T10:15:00+03:00',
      }],
    });
  }

  function mountMessenger(frameLabel) {
    clearHost();
    const test = HEYS.Messenger?._test;
    if (!test) throw new Error('HEYS.Messenger._test unavailable');

    const shell = (body) => h('div', { className: 'messenger-modal', style: { minHeight: '100%' } }, body);

    switch (frameLabel) {
      case 'Мессенджер · пустой тред':
        renderToHost(shell([
          h(test.MessengerHeader, { subtitle: 'отвечает обычно за час', onClose: () => {} }),
          h('div', { className: 'messenger-thread' }, h(test.EmptyThread, { onPickPrompt: () => {} })),
        ]));
        return;
      case 'Мессенджер · тред с карточкой дня':
        renderToHost(shell([
          h(test.MessengerHeader, { subtitle: 'прочитала · 9:15', onClose: () => {} }),
          h('div', { className: 'messenger-thread' }, h(test.AppliedDayCard, {
            summary: {
              meal_label: 'Обед',
              meal_time: '13:05',
              total: { kcal: 540 },
              items: [{ name: 'Курица', grams: 180, kcal: 210 }],
            },
            onOpenDay: () => {},
          })),
        ]));
        return;
      case 'Мессенджер · Ждём и подсказка':
        renderToHost(shell([
          h(test.MessengerHeader, { subtitle: 'отвечает обычно за час', onClose: () => {} }),
          h(test.DayChecklistRow, {
            items: [{ key: 'meal', label: 'Приём пищи', status: 'missing' }],
            onPick: () => {},
          }),
          h(test.FoodHintCard, { onInsertTime: () => {}, onInsertGrams: () => {}, onHide: () => {} }),
        ]));
        return;
      case 'Мессенджер · запись голосового':
        renderToHost(shell([
          h(test.MessengerHeader, { subtitle: 'отвечает обычно за час', onClose: () => {} }),
          h('div', { className: 'messenger-composer messenger-composer--recording' },
            h('div', { className: 'messenger-recording-bar' }, '0:14'),
          ),
        ]));
        return;
      case 'Мессенджер · лист действий':
        renderToHost(h('div', { className: 'messenger-action-sheet' },
          h('div', { className: 'messenger-action-sheet__quote' }, 'Курица 180 г'),
          h('button', { type: 'button', className: 'messenger-action-sheet__item' }, 'Ответить'),
          h('button', {
            type: 'button',
            className: 'messenger-action-sheet__item messenger-action-sheet__item--danger',
          }, 'Удалить'),
        ));
        return;
      case 'Мессенджер · меню Ещё':
        renderToHost(h('div', { className: 'messenger-header-menu' },
          h('button', { type: 'button', className: 'messenger-header-menu__item' }, 'Поиск'),
          h('button', { type: 'button', className: 'messenger-header-menu__item' }, 'Расшифровка голосовых'),
        ));
        return;
      case 'Мессенджер · поиск':
        ensureMessengerSearchStub();
        renderToHost(h('div', { className: 'messenger-search-panel' },
          h(test.SearchPanel, {
            isCurator: false,
            onClose: () => {},
            onJump: () => {},
          }),
        ));
        return;
      case 'Мессенджер · без сети':
        renderToHost(shell([
          h(test.MessengerHeader, { subtitle: 'нет сети — синхронизируем позже', offline: true, onClose: () => {} }),
          h(test.OfflineQueueBar, { count: 2, hasDraft: false, sending: false, onRetry: () => {} }),
        ]));
        return;
      case 'Мессенджер · согласие на расшифровку':
        renderToHost(h('div', { className: 'messenger-confirm-dialog' },
          h('h3', null, 'Расшифровывать голосовые?'),
          h('p', null, 'Передадим выбранное аудио в Yandex SpeechKit'),
        ));
        return;
      case 'Мессенджер · удаление сообщения':
        renderToHost(h('div', { className: 'messenger-confirm-dialog' },
          h('h3', null, 'Удалить сообщение?'),
          h('p', null, 'У куратора оно тоже исчезнет.'),
        ));
        return;
      default:
        throw new Error(`Unknown messenger frame: ${frameLabel}`);
    }
  }

  async function mount(frameLabel) {
    if (frameLabel.startsWith('Первый вход ·')) {
      await mountFirstRun(frameLabel);
      return ROOT_BY_FRAME[frameLabel];
    }
    if (frameLabel.startsWith('Подписка ·')) {
      mountSubscription(frameLabel);
      return ROOT_BY_FRAME[frameLabel];
    }
    if (frameLabel.startsWith('Мессенджер ·')) {
      mountMessenger(frameLabel);
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
