// Смоук настоящего экрана переписки против контракта messenger.v4: модалка
// монтируется целиком (не подкомпонентами по отдельности), сервер подменён
// ответами той же формы. Сценарии — те, что нашла честная пара «кадр —
// приложение» после перевода стенда на живой экран.
import fs from 'fs';
import path from 'path';

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

// «Сейчас» для всех сценариев — 5 сентября, 13:45 (как у стенда).
const NOW = new Date(2026, 8, 5, 13, 45);
const at = (day, h, m) => new Date(2026, 8, day, h, m).toISOString();

function loadMessenger() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger;
}

function installHeys({ thread, consent }) {
  window.HEYS = {
    currentClientId: 'client-a',
    ui: { setSelectedDate: vi.fn(), switchTab: vi.fn() },
    MessengerAPI: {
      // Сервер отдаёт страницу от новых к старым.
      getThread: vi.fn(async () => ({ success: true, messages: thread.slice().reverse() })),
      getDayChecklist: vi.fn(async () => ({ success: true, items: [] })),
      getTranscriptionConsent: vi.fn(async () => ({ success: true, ...consent })),
      setTranscriptionConsent: vi.fn(async () => ({ success: true, ...consent })),
      markRead: vi.fn(async () => ({ success: true })),
      setAcked: vi.fn(async () => ({ success: true, acked_at: NOW.toISOString() })),
      send: vi.fn(),
    },
  };
}

const THREAD = [
  // 16 августа — 20 дней назад: по контракту «история» (30 дней) ещё не прячется.
  {
    id: 'm0',
    sender_role: 'client',
    body: 'Вес утром: 72,1 кг',
    created_at: new Date(2026, 7, 16, 8, 0).toISOString(),
    attachments: [],
  },
  {
    id: 'm1',
    sender_role: 'client',
    body: 'Вес утром: 71,4 кг',
    created_at: at(5, 8, 12),
    done_at: at(5, 8, 40),
    attachments: [],
  },
  {
    id: 'm2',
    sender_role: 'client',
    body: 'Обед в 13:05, гречка 180 г',
    created_at: at(5, 13, 7),
    seen_at: at(5, 13, 12),
    done_at: at(5, 13, 31),
    applied_at: at(5, 13, 41),
    applied_summary: {
      meal_label: 'Обед',
      meal_time: '13:05',
      items: [{ name: 'Гречка варёная', grams: 180, kcal: 210 }],
      total: { kcal: 210 },
    },
    attachments: [],
  },
  {
    id: 'c1',
    sender_role: 'curator',
    body: 'Приняла, соберу день.',
    created_at: at(5, 13, 31),
    attachments: [],
  },
];

async function mountThread({
  consent = { granted: true, decided: true, created_at: at(2, 10, 0) },
} = {}) {
  installHeys({ thread: THREAD, consent });
  const { MessengerModal } = loadMessenger();
  const onClose = vi.fn();
  const view = render(RealReact.createElement(MessengerModal, { onClose }));
  await waitFor(() =>
    expect(view.container.querySelectorAll('.msg-row[data-message-id]')).toHaveLength(4),
  );
  return { ...view, onClose };
}

const row = (container, id) => container.querySelector(`.msg-row[data-message-id="${id}"]`);
const sheetItems = (container) =>
  [...container.querySelectorAll('.messenger-action-sheet__item')].map((node) =>
    node.textContent.trim(),
  );

describe('экран переписки против контракта messenger.v4', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
    localStorage.clear();
  });

  it('строка состояния одна — у последнего своего сообщения; время в каждом пузыре', async () => {
    const { container } = await mountThread();

    const statuses = container.querySelectorAll('.msg-status');
    expect(statuses).toHaveLength(1);
    expect(row(container, 'm2').contains(statuses[0])).toBe(true);
    expect(statuses[0].textContent).toBe('Внесено в день · 13:41');

    // У предыдущих своих — только время в пузыре, без «Обработано».
    expect(row(container, 'm1').querySelector('.msg-bubble .msg-time').textContent).toBe('8:12');
    expect(row(container, 'c1').querySelector('.msg-bubble .msg-time').textContent).toBe('13:31');
    for (const bubble of container.querySelectorAll('.msg-bubble')) {
      expect(bubble.querySelector('.msg-time')).toBeTruthy();
    }
  });

  it('история прячется только старше 30 дней', async () => {
    const { container } = await mountThread();
    expect(row(container, 'm0')).toBeTruthy();
    expect(container.querySelector('.messenger-show-older')).toBeNull();
  });

  it('долгое нажатие: на чужом — «Ответить», «Принять», «Скопировать текст»', async () => {
    const { container } = await mountThread();

    fireEvent.touchStart(row(container, 'c1'));
    await waitFor(() => expect(container.querySelector('.messenger-action-sheet')).toBeTruthy());
    expect(sheetItems(container)).toEqual(['Ответить', 'Принять', 'Скопировать текст']);

    fireEvent.click([...container.querySelectorAll('.messenger-action-sheet__item')][1]);
    await waitFor(() => expect(window.HEYS.MessengerAPI.setAcked).toHaveBeenCalledWith('c1', true));
    expect(container.querySelector('.messenger-action-sheet')).toBeNull();
  });

  it('долгое нажатие: на своём — «Изменить», «Скопировать текст», «Удалить»', async () => {
    const { container } = await mountThread();

    fireEvent.touchStart(row(container, 'm1'));
    await waitFor(() => expect(container.querySelector('.messenger-action-sheet')).toBeTruthy());
    expect(sheetItems(container)).toEqual(['Изменить', 'Скопировать текст', 'Удалить']);
  });

  it('«Открыть день» на карточке ведёт на «Питание» дня сообщения и закрывает переписку', async () => {
    const { container, onClose } = await mountThread();

    const open = container.querySelector('.msg-applied-card__open');
    expect(open?.textContent).toBe('Открыть день');
    fireEvent.click(open);

    expect(onClose).toHaveBeenCalled();
    expect(window.HEYS.ui.setSelectedDate).toHaveBeenCalledWith('2026-09-05');
    expect(window.HEYS.ui.switchTab).toHaveBeenCalledWith('diary');
  });

  it('меню «Ещё» называет дату согласия словами: «включена с 2 сентября»', async () => {
    const { container } = await mountThread();

    await act(async () => {
      fireEvent.click(container.querySelector('.messenger-header-button[aria-label="Ещё"]'));
    });
    const hints = [...container.querySelectorAll('.messenger-header-menu__hint')].map(
      (n) => n.textContent,
    );
    expect(hints).toContain('включена с 2 сентября');
  });
});

describe('мелкие правила контракта messenger.v4', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(NOW);
    window.HEYS = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('«Ждём»: недостающие идут первыми, в каком бы порядке ни пришли с сервера', () => {
    const { DayChecklistRow } = loadMessenger()._test;
    const items = [
      { key: 'meal', label: 'Приём пищи', status: 'done' },
      { key: 'weight', label: 'Вес утром', status: 'done' },
      { key: 'water', label: 'Вода', status: 'missing' },
    ];
    const { container } = render(RealReact.createElement(DayChecklistRow, { items }));
    const chips = [...container.querySelectorAll('.messenger-day-checklist__chip')].map(
      (n) => n.textContent,
    );
    expect(chips).toEqual(['Вода', 'Приём пищи', 'Вес утром']);
  });

  it('вес в карточке намерения — с десятичной запятой', () => {
    const { MessageBubble } = loadMessenger()._test;
    const { container } = render(
      RealReact.createElement(MessageBubble, {
        viewerRole: 'client',
        message: {
          id: 'w1',
          sender_role: 'client',
          body: null,
          intent_type: 'weight',
          intent_payload: { weight_kg: 71.4 },
          created_at: at(5, 8, 12),
        },
      }),
    );
    expect(container.querySelector('.msg-intent__value').textContent).toBe('71,4 кг');
  });

  it('голосовое, пока файл грузится, не получает пустой src и не пишет «не удалось воспроизвести»', () => {
    const { MessageBubble } = loadMessenger()._test;
    const { container } = render(
      RealReact.createElement(MessageBubble, {
        viewerRole: 'client',
        message: {
          id: 'v1',
          sender_role: 'curator',
          body: null,
          created_at: at(5, 9, 2),
          attachments: [
            { type: 'audio', path: 'x/voice.ogg', mime: 'audio/ogg', duration_ms: 32000 },
          ],
        },
      }),
    );
    const audio = container.querySelector('audio');
    expect(audio.hasAttribute('src')).toBe(false);
    expect(container.textContent).not.toContain('не удалось воспроизвести');
    expect(container.querySelector('.msg-audio-meta').textContent).toContain('0:32');
  });

  it('поиск: строка результата «Вчера · 19:44» без даты во времени и без заголовка дня', async () => {
    const { SearchPanel } = loadMessenger()._test;
    window.HEYS.MessengerAPI = {
      searchMessages: vi.fn(async () => ({
        success: true,
        messages: [
          {
            id: 's1',
            sender_role: 'client',
            body: 'Ужин: гречка 150 г',
            created_at: at(4, 19, 44),
          },
        ],
      })),
    };
    const { container } = render(
      RealReact.createElement(SearchPanel, { isCurator: false, onJump: () => {} }),
    );
    fireEvent.change(container.querySelector('.messenger-search__input'), {
      target: { value: 'гречка' },
    });
    await waitFor(() => expect(container.querySelector('.messenger-search__item')).toBeTruthy());

    expect(container.querySelector('.messenger-search__meta').textContent).toBe('Вчера · 19:44');
    expect(container.querySelector('.messenger-search__day')).toBeNull();
  });
});
