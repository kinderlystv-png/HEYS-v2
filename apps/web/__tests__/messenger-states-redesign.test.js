import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/1000-messenger.css'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

describe('пустой тред и скелетон', () => {
  beforeEach(() => { window.HEYS = {}; });
  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('клиенту объясняют, что писать, и дают заготовки', () => {
    const { EmptyThread } = loadMessengerComponentInternals();
    const onPickPrompt = vi.fn();

    const { getByText } = render(RealReact.createElement(EmptyThread, { onPickPrompt }));
    expect(getByText('Здесь начнётся переписка с куратором')).toBeTruthy();

    fireEvent.click(getByText('Вес утром'));
    expect(onPickPrompt).toHaveBeenCalledWith('Вес утром: ');
  });

  it('куратору заготовки не показываем — он не отчитывается', () => {
    const { EmptyThread } = loadMessengerComponentInternals();

    const { container, getByText } = render(RealReact.createElement(EmptyThread, { isCurator: true }));
    expect(getByText('Нет сообщений от этого клиента')).toBeTruthy();
    expect(container.querySelector('.messenger-empty__prompts')).toBeNull();
  });

  it('вместо «Загружаю...» показывается скелетон в форме треда', () => {
    const { ThreadSkeleton } = loadMessengerComponentInternals();

    const { container } = render(RealReact.createElement(ThreadSkeleton));
    expect(container.querySelectorAll('.messenger-skeleton__bubble')).toHaveLength(3);
    expect(messengerSource).not.toMatch(/messenger-loading/);
  });

  it('мерцание скелетона отключается при prefers-reduced-motion', () => {
    expect(cssSource).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.messenger-skeleton__bubble \{\s*animation: none/);
  });
});

describe('лайтбокс', () => {
  beforeEach(() => { window.HEYS = {}; });
  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  const attachments = [
    { path: 'a.webp', url: 'https://example.test/a.webp' },
    { path: 'b.webp', url: 'https://example.test/b.webp' },
    { path: 'c.webp', url: 'https://example.test/c.webp' },
  ];

  it('счётчик и лента миниатюр появляются только при нескольких фото', () => {
    const { PhotoLightbox } = loadMessengerComponentInternals();

    const single = render(RealReact.createElement(PhotoLightbox, {
      attachments: [attachments[0]], index: 0, onClose: () => {},
    }));
    expect(single.container.querySelector('.messenger-lightbox__strip')).toBeNull();
    expect(single.container.querySelector('.messenger-lightbox__counter')).toBeNull();

    const many = render(RealReact.createElement(PhotoLightbox, {
      attachments, index: 1, onClose: () => {},
    }));
    expect(many.container.querySelector('.messenger-lightbox__counter').textContent).toBe('2 / 3');
    expect(many.container.querySelectorAll('.messenger-lightbox__thumb')).toHaveLength(3);
    expect(many.container.querySelectorAll('.messenger-lightbox__thumb.is-active')).toHaveLength(1);
  });

  it('Escape закрывает, стрелки листают по кругу', () => {
    const { PhotoLightbox } = loadMessengerComponentInternals();
    const onClose = vi.fn();
    const onIndexChange = vi.fn();

    render(RealReact.createElement(PhotoLightbox, {
      attachments, index: 2, onClose, onIndexChange,
    }));

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onIndexChange).toHaveBeenCalledWith(0);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('свайп листает, короткое движение — нет', () => {
    const { PhotoLightbox } = loadMessengerComponentInternals();
    const onIndexChange = vi.fn();

    const { container } = render(RealReact.createElement(PhotoLightbox, {
      attachments, index: 0, onClose: () => {}, onIndexChange,
    }));
    const root = container.querySelector('.messenger-lightbox');

    fireEvent.touchStart(root, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 120 }] });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    onIndexChange.mockClear();
    fireEvent.touchStart(root, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 185 }] });
    expect(onIndexChange).not.toHaveBeenCalled();
  });
});

describe('интент-сообщения', () => {
  beforeEach(() => { window.HEYS = {}; });
  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('приём пищи разбирается на кикер, название, вес и КБЖУ', () => {
    const { buildIntentCard } = loadMessengerComponentInternals();

    expect(buildIntentCard({
      intent_type: 'meal',
      intent_payload: { product_name: 'Овсянка', grams: 220, kcal: 178, protein: 6, fat: 3, carbs: 32 },
    })).toEqual({
      kicker: 'Приём пищи',
      title: 'Овсянка',
      value: '220 г',
      details: '178 ккал · Б 6 · Ж 3 · У 32',
    });
  });

  it('без КБЖУ третьей строки нет', () => {
    const { buildIntentCard } = loadMessengerComponentInternals();
    const card = buildIntentCard({ intent_type: 'meal', intent_payload: { product_name: 'Кофе', grams: 200 } });

    expect(card.details).toBeNull();
  });

  it('вес показывается одной крупной строкой', () => {
    const { buildIntentCard, IntentCard } = loadMessengerComponentInternals();
    const card = buildIntentCard({ intent_type: 'weight', intent_payload: { weight_kg: 81.4 } });

    expect(card).toEqual({ kicker: 'Вес', value: '81.4 кг', valueLarge: true });
    const { container } = render(RealReact.createElement(IntentCard, { card }));
    expect(container.querySelector('.msg-intent__row--single')).toBeTruthy();
  });

  it('интент рисуется карточкой, а не строкой с эмодзи', () => {
    const { MessageBubble } = loadMessengerComponentInternals();

    const { container } = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'client',
      onDelete: () => {},
      message: {
        id: 'i1',
        sender_role: 'client',
        created_at: new Date().toISOString(),
        intent_type: 'training',
        intent_payload: { training_type: 'Бег', duration_min: 50 },
      },
    }));

    expect(container.querySelector('.msg-intent__kicker').textContent).toBe('Тренировка');
    expect(container.textContent).not.toMatch(/[🍽🏋⚖]/u);
  });

  it('интент нельзя редактировать, но можно удалить', () => {
    const { MessageBubble } = loadMessengerComponentInternals();

    const { container } = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'client',
      onDelete: () => {},
      message: {
        id: 'i2',
        sender_role: 'client',
        created_at: new Date().toISOString(),
        intent_type: 'weight',
        intent_payload: { weight_kg: 80 },
      },
    }));

    const actions = [...container.querySelectorAll('.msg-action')].map((b) => b.textContent);
    expect(actions).toEqual(['Удалить']);
  });
});

describe('контраст и узкий экран', () => {
  it('мета-текст поднят до читаемого контраста', () => {
    // 11px #A8B0B8 на #FCFBF8 давал ~2.5:1 — ниже нормы.
    const meta = cssSource.match(/\.msg-meta,\n\.msg-edited-marker \{[^}]*\}/)[0];
    expect(meta).toMatch(/color:\s*#667079/);
    expect(cssSource).toMatch(/\[data-theme="dark"\] \.msg-meta,\n\[data-theme="dark"\] \.msg-edited-marker \{\s*color:\s*#8b949d/);
  });

  it('на 320 px уменьшаются шапка, кнопки и поле', () => {
    const narrow = cssSource.match(/@media \(max-width: 359px\) \{[\s\S]*?\n\}/)[0];
    expect(narrow).toMatch(/\.messenger-avatar \{\s*width: 36px/);
    expect(narrow).toMatch(/\.messenger-send \{\s*width: 42px/);
    expect(narrow).toMatch(/max-width: 88%/);
  });
});
