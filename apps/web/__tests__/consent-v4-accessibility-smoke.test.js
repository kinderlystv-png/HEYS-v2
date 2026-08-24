// Смоук зоны registration (согласия) + строки «когда есть» зоны spinners.
// Проверяется рендером, а не чтением исходника: ловушка фокуса в шторке
// подписи, озвученный прогресс чтения, названная словами причина
// недоступности кнопки и галочка после подписания руками не собираются.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

// У каждого документа своя актуальная версия, и загрузчик её проверяет:
// отдать всем один текст — значит получить экран «CDN отдаёт устаревшую версию».
function docMarkdown(url) {
  const version = (/\/v(\d+(?:\.\d+)?)\//.exec(String(url))
    || /[?&]v=(\d+(?:\.\d+)?)/.exec(String(url))
    || [null, '1.0'])[1];
  return [
    '# Документ',
    '',
    `**Версия:** ${version}`,
    '',
    '**В силе с:** 14 августа 2026',
    '',
    'Текст документа для смоука.',
    '',
  ].join('\n');
}

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  // Гасим boot-контроллер холодного старта: из него нужен только HEYS.WaitMark.
  window.__heysLoadingProgress = { skippedForTest: true };
  loadScript('heys_loading_progress_v1.js');
  loadScript('heys_auth_pin_keypad_v1.js');
  loadScript('heys_consents_v1.js');
});

let roots = [];

function renderNode(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  roots.push({ root, host });
  return host;
}

beforeEach(() => {
  window.HEYS.auth = Object.assign({}, window.HEYS.auth, {
    validatePinStrict: (value) => /^\d{4}$/.test(String(value || '')),
  });
  global.fetch = vi.fn(async (url) => ({
    ok: true,
    status: 200,
    text: async () => docMarkdown(url),
  }));
});

afterEach(() => {
  act(() => { roots.forEach(({ root }) => root.unmount()); });
  roots.forEach(({ host }) => host.remove());
  roots = [];
  vi.restoreAllMocks();
  localStorage.clear();
});

// Предки тоже содержат текст, поэтому берём самый глубокий совпавший узел.
function findByText(host, selector, text) {
  return Array.from(host.querySelectorAll(selector))
    .filter((el) => (el.textContent || '').includes(text))
    .pop();
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function click(el) {
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

function pressKey(target, key, init) {
  act(() => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', {
      key, bubbles: true, cancelable: true, ...(init || {}),
    }));
  });
}

// ── Документ: прогресс и причина недоступности ────────────────────────────
describe('согласия · документ: прогресс озвучен, причина названа словами', () => {
  const geometry = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 };
  const GEOM_PROPS = ['scrollTop', 'scrollHeight', 'clientHeight'];
  const savedGeom = new Map();

  function ownerOf(prop) {
    let owner = window.HTMLElement.prototype;
    while (owner && !Object.getOwnPropertyDescriptor(owner, prop)) owner = Object.getPrototypeOf(owner);
    return owner || window.HTMLElement.prototype;
  }

  beforeEach(() => {
    // Без реальной геометрии jsdom считает документ коротким и сразу
    // засчитывает его прочитанным — состояние «ещё не дочитано» не воспроизвести.
    // Дескрипторы сохраняем и возвращаем: удалить их насовсем — значит сломать
    // соседние тесты, которым нужен именно короткий документ.
    geometry.scrollTop = 0;
    GEOM_PROPS.forEach((prop) => {
      const owner = ownerOf(prop);
      savedGeom.set(prop, { owner, desc: Object.getOwnPropertyDescriptor(owner, prop) });
      Object.defineProperty(owner, prop, {
        configurable: true,
        get: () => geometry[prop],
        set: (value) => { geometry[prop] = value; },
      });
    });
  });

  afterEach(() => {
    savedGeom.forEach(({ owner, desc }, prop) => {
      if (desc) Object.defineProperty(owner, prop, desc);
      else delete owner[prop];
    });
    savedGeom.clear();
  });

  async function renderDoc(onAccept) {
    let host;
    await act(async () => {
      host = renderNode(React.createElement(window.HEYS.Consents.FullTextModal, {
        type: 'user_agreement',
        onClose: () => {},
        onAccept,
      }));
    });
    return host;
  }

  it('полоса чтения — progressbar с процентом', async () => {
    const host = await renderDoc(() => {});
    const bar = host.querySelector('.consent-fulltext__progress-track');
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuetext')).toContain('0 %');

    const scroller = host.querySelector('.consent-fulltext__scroll');
    geometry.scrollTop = 750; // 750 / (2000 - 500) = 50 %
    act(() => { scroller.dispatchEvent(new window.Event('scroll', { bubbles: false })); });
    expect(host.querySelector('.consent-fulltext__progress-track').getAttribute('aria-valuenow')).toBe('50');
  });

  it('до дочитывания кнопка называет причину и не выпадает из обхода', async () => {
    const onAccept = vi.fn();
    const host = await renderDoc(onAccept);

    const accept = host.querySelector('.consent-fulltext__accept');
    const reason = host.querySelector('.consent-fulltext__scroll-hint');
    expect(reason.textContent).toContain('Долистайте до конца');
    expect(accept.disabled).toBe(false); // остаётся фокусируемой
    expect(accept.getAttribute('aria-disabled')).toBe('true');
    expect(accept.getAttribute('aria-describedby')).toBe(reason.id);
    expect(reason.id).toBeTruthy();

    click(accept);
    expect(onAccept).not.toHaveBeenCalled();

    const scroller = host.querySelector('.consent-fulltext__scroll');
    geometry.scrollTop = 1500;
    act(() => { scroller.dispatchEvent(new window.Event('scroll', { bubbles: false })); });

    const ready = host.querySelector('.consent-fulltext__accept');
    expect(ready.getAttribute('aria-disabled')).toBe(null);
    expect(ready.getAttribute('aria-describedby')).toBe(null);
    click(ready);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

// ── Экран согласий: вид шага и обязательность словом ──────────────────────
describe('согласия · вид шага и подпись обязательности', () => {
  function renderScreen() {
    return renderNode(React.createElement(window.HEYS.Consents.ConsentScreen, {
      clientId: 'smoke-client',
      phone: null,
      diagnosticReplay: true,
      onComplete: () => {},
      onCancel: () => {},
      onError: () => {},
    }));
  }

  it('пояснение стоит под заголовком шага: 12 px/500, тон чернил 55 %', () => {
    const host = renderScreen();
    const title = findByText(host, 'div', 'Согласия и условия');
    expect(title).toBeTruthy();
    expect(title.style.marginTop).toBe('6px');
    const hint = title.nextElementSibling;
    expect(hint.textContent).toContain('Оба документа открываются целиком');
    expect(hint.style.marginTop).toBe('8px');
    expect(hint.style.font.replace(/\s+/g, ' ')).toContain('12px');
    expect(hint.style.font).toContain('500');
    expect(hint.style.color.replace(/\s/g, '')).toContain('.55');
  });

  it('обязательность названа словом, звёздочка уходит из озвучки', () => {
    const host = renderScreen();
    const star = Array.from(host.querySelectorAll('span'))
      .find((el) => el.textContent === '*');
    expect(star).toBeTruthy();
    expect(star.getAttribute('aria-hidden')).toBe('true');
    const word = star.nextElementSibling;
    expect(word.className).toContain('sr-only');
    expect(word.textContent).toContain('обязательно');
  });

  it('цель касания «Читать полностью» — 44, не 40', () => {
    const host = renderScreen();
    const link = findByText(host, 'button', 'Читать полностью');
    expect(link.style.minHeight).toBe('44px');
  });
});

// ── Шторка подписи: фокус, устройство, галочка ────────────────────────────
describe('согласия · шторка подписи', () => {
  async function openSignSheet() {
    const host = renderNode(React.createElement(window.HEYS.Consents.ConsentScreen, {
      clientId: 'smoke-client',
      phone: null,
      diagnosticReplay: true,
      onComplete: () => {},
      onCancel: () => {},
      onError: () => {},
    }));

    // Оба обязательных документа: открыть, дочитать (в jsdom документ короткий
    // и засчитывается сразу) и принять.
    for (let pass = 0; pass < 2; pass += 1) {
      const openBtn = Array.from(host.querySelectorAll('button'))
        .filter((el) => (el.textContent || '').includes('Читать полностью'))[pass];
      click(openBtn);
      // eslint-disable-next-line no-await-in-loop
      await flush();
      const accept = document.querySelector('.consent-fulltext__accept');
      expect(accept).toBeTruthy();
      click(accept);
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }

    const proceed = Array.from(host.querySelectorAll('button'))
      .find((el) => (el.textContent || '').trim() === 'Подписать');
    expect(proceed).toBeTruthy();
    click(proceed);
    await flush();

    const sheet = document.querySelector('.heys-consent-sign-sheet');
    expect(sheet).toBeTruthy();
    return { host, sheet };
  }

  function focusables(sheet) {
    return Array.from(sheet.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.getAttribute('aria-hidden') !== 'true');
  }

  it('фокус заперт внутри шторки подписи', async () => {
    const { sheet } = await openSignSheet();
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.contains(document.activeElement)).toBe(true);

    const items = focusables(sheet);
    expect(items.length).toBeGreaterThan(1);

    // Tab с последнего элемента возвращается на первый, а не уходит на фон.
    act(() => { items[items.length - 1].focus(); });
    pressKey(items[items.length - 1], 'Tab');
    expect(document.activeElement).toBe(items[0]);

    // Shift+Tab с первого уходит на последний, тоже внутри листа.
    pressKey(items[0], 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(items[items.length - 1]);

    // Фокус, оказавшийся на фоне, Tab возвращает в лист.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => { outside.focus(); });
    pressKey(outside, 'Tab');
    expect(sheet.contains(document.activeElement)).toBe(true);
    outside.remove();
  });

  it('полный текст из шторки не теряет фокус: ловушка молчит, пока он открыт', async () => {
    const { sheet } = await openSignSheet();
    const readBtn = Array.from(sheet.querySelectorAll('.heys-consent-sign-sheet__doc-link'))[0];
    expect(readBtn).toBeTruthy();
    click(readBtn);
    await flush();

    const accept = document.querySelector('.consent-fulltext__accept');
    expect(accept).toBeTruthy();
    act(() => { accept.focus(); });
    pressKey(accept, 'Tab');
    // Документ живёт вне листа — ловушка не должна выдёргивать из него фокус.
    expect(sheet.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).toBe(accept);
  });

  it('после подписания: галочка в кнопке, «Продолжить» и устройство в записи', async () => {
    const savedUa = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        + ' (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    try {
      await runSignedSheetChecks();
    } finally {
      if (savedUa) Object.defineProperty(window.navigator, 'userAgent', savedUa);
      else delete window.navigator.userAgent;
    }
  });

  async function runSignedSheetChecks() {
    const { sheet } = await openSignSheet();

    const keys = Array.from(sheet.querySelectorAll('.heys-auth-key'))
      .filter((el) => el.textContent.trim() === '7');
    expect(keys.length).toBe(1);
    for (let i = 0; i < 4; i += 1) {
      click(keys[0]);
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }

    const done = document.querySelector('.heys-consent-sign-sheet__done');
    expect(done).toBeTruthy();

    // Строка «после подписи»: документ и версия — в карточке, время и
    // устройство — в строке подписи.
    const meta = document.querySelector('.heys-consent-sign-sheet__done-meta');
    expect(meta.textContent).toMatch(/\d{2}:\d{2}/);
    expect(meta.textContent).toContain('iPhone · Safari');
    const versions = Array.from(document.querySelectorAll('.heys-consent-sign-sheet__doc-version'))
      .map((el) => el.textContent);
    expect(versions.length).toBe(2);
    versions.forEach((v) => expect(v).toMatch(/^в\. \d/));

    // Строка «когда есть» (spinners): дуга досчитывается до галочки, кнопка
    // ведёт дальше словом «Продолжить», а не «Готово».
    const primary = document.querySelector('.heys-consent-sign-sheet__primary');
    expect(primary.textContent).toContain('Продолжить');
    expect(primary.textContent).not.toContain('Готово');
    expect(primary.querySelector('.heys-wait-mark--button.is-ok')).toBeTruthy();
    expect(primary.querySelector('.heys-wait-mark__check')).toBeTruthy();
  }
});
