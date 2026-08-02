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

  it('при prefers-reduced-motion гаснет всё, что движется само', () => {
    // Скелетон, пульс записи и волна проигрывания — самодвижущиеся анимации;
    // подъезд модалки заменяется появлением без сдвига.
    const block = cssSource.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)[0];
    expect(block).toContain('.messenger-skeleton__bubble');
    expect(block).toContain('.messenger-recording-dot');
    expect(block).toContain('.msg-audio.is-playing .msg-audio-wave span');
    expect(block).toContain('animation: none');
    // Тост едет transition по transform, а не анимацией — гасить его надо иначе.
    expect(block).toContain('.messenger-inapp-toast');
    expect(block).toMatch(/transition: opacity/);
  });

  it('тёмная тема полосы записи и черновика аудио задана один раз', () => {
    // Раньше новое правило дописывалось вниз файла и перекрывало старое лишь
    // частично: черновик оставался сине-серым, а у полосы висела чужая тень.
    const rules = cssSource.match(/\[data-theme="dark"\] \.messenger-recording-live/g) || [];
    expect(rules).toHaveLength(1);

    const block = cssSource.match(/\[data-theme="dark"\] \.messenger-recording-live,\n\[data-theme="dark"\] \.messenger-audio-draft \{[^}]*\}/)[0];
    expect(block).toContain('#2a1b1d');
    expect(block).toContain('box-shadow: none');
  });

  it('ни одно свойство не задано одному селектору дважды в одном контексте', () => {
    // Правка раз за разом дописывалась вниз файла вместо изменения исходного
    // правила, и новая версия перекрывала старую лишь частично.
    //
    // Парсер ведёт стек контекста (медиа-условия), а не просто «нулевая
    // глубина» — иначе всё внутри @media пропускается целиком. Именно там
    // жила регрессия с min-height: 90px в блоке 420 px, перекрывавшая базовое
    // правило .messenger-input: контекст у них разный (глобально vs внутри
    // @media (max-width: 420px)), а конфликт — про совпадающий контекст.
    //
    // Конфликт свойства считается по количеству объявлений, содержащих его, а
    // не по пересечению с первым: если color задан во втором и третьем
    // объявлении, а в первом его нет, это всё равно два объявления одного
    // свойства для одного селектора в одном контексте.
    const stripped = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
    const contextStack = [];
    const rules = [];
    let depth = 0;
    let buffer = '';
    for (let i = 0; i < stripped.length; i += 1) {
      const ch = stripped[i];
      if (ch === '{') {
        const head = buffer.trim();
        buffer = '';
        if (head.startsWith('@')) {
          contextStack.push(head);
        } else if (head) {
          const context = contextStack.join(' > ');
          let j = i + 1;
          let inner = 1;
          while (inner > 0 && j < stripped.length) {
            if (stripped[j] === '{') inner += 1;
            else if (stripped[j] === '}') inner -= 1;
            j += 1;
          }
          const body = stripped.slice(i + 1, j - 1);
          for (const part of head.split(',')) {
            const sel = part.replace(/\s+/g, ' ').trim();
            if (sel) rules.push([`${context}::${sel}`, body]);
          }
          i = j - 1;
          continue;
        } else {
          contextStack.push('');
        }
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        contextStack.pop();
        buffer = '';
      } else {
        buffer += ch;
      }
    }

    // (prop, value) в порядке объявления — не только имя свойства: конфликт
    // это разные значения одного свойства, а не сам факт повтора. `height:
    // 90vh; height: 90dvh;` — осознанный фолбэк для браузеров без dvh, и это
    // не баг: обе строки нормализуются к одному виду.
    const declarationsOf = (body) => body
      .split(';')
      .filter((line) => line.includes(':'))
      .map((line) => {
        const at = line.indexOf(':');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      });
    const normalize = (value) => value.replace(/dvh/g, 'vh').replace(/dvw/g, 'vw');

    const byKeyProp = new Map(); // "key::prop" -> value[]
    for (const [key, body] of rules) {
      for (const [prop, value] of declarationsOf(body)) {
        const propKey = `${key} :: ${prop}`;
        if (!byKeyProp.has(propKey)) byKeyProp.set(propKey, []);
        byKeyProp.get(propKey).push(value);
      }
    }

    const conflicts = [];
    for (const [propKey, values] of byKeyProp) {
      if (values.length < 2) continue;
      const normalized = new Set(values.map(normalize));
      if (normalized.size > 1) conflicts.push(`${propKey} (${values.join(' vs ')})`);
    }
    expect(conflicts).toEqual([]);
  });

  it('в компонентном файле нет !important', () => {
    // !important здесь — не про специфичность компонента, а про войну с чужим
    // глобальным стилем: он либо не нужен (значение и так побеждает), либо
    // сигнализирует, что что-то извне перебивает поле, и это стоит найти и
    // починить в источнике, а не заглушать локально.
    expect(cssSource).not.toContain('!important');
  });

  it('в файле не осталось системного алого', () => {
    // На плитке с ошибкой заливка и outline были разными красными.
    expect(cssSource).not.toContain('rgba(220, 38, 38');
    expect(cssSource).not.toContain('#dc2626');
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
