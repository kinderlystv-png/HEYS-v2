// Смоук зоны spinners: пороги знака ожидания, ступени холодного старта и
// отсутствие поблочной загрузки. Руками это не собрать — нужно прожить 300 мс,
// 2 с, 5 с, 15 с и 60 с без продвижения байтов, а также поймать состояние
// дневника в те доли секунды, пока бандл пальцев ещё едет.
//
// Строки контракта spinners.v4.dc.html: «до 300 мс», «300 мс — 2 с»,
// «дольше 2 с», «три ступени», «вид ступеней холодного старта»,
// «вторая неудача», «поблочной загрузки нет», «скелетонов нет».
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

function bootMarkMarkup() {
  const html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
  const m = /<div class="heys-boot-mark"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html);
  if (!m) throw new Error('boot mark markup not found in index.html');
  return m[0];
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = {};
  document.documentElement.removeAttribute('data-heys-session');
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__heysLoadingProgress;
  delete window.__heysBootWait;
  delete window.HEYS;
  delete window.React;
  try { window.sessionStorage.clear(); } catch (_) { /* noop */ }
});

describe('знак ожидания: пороги 300 мс / 2 с / позже', () => {
  function mountScreen() {
    // Boot-контроллер холодного старта в этой группе не нужен — только WaitMark.
    window.__heysLoadingProgress = { skippedForTest: true };
    loadScript('heys_loading_progress_v1.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(window.HEYS.WaitMark.render(React, {
        mode: 'screen',
        state: 'wait',
        title: 'Сохраняем профиль',
        text: 'Связь медленная, ещё пробуем.',
      }));
    });
    return host;
  }

  it('до 300 мс не показывает ничего, потом голый знак, потом заголовок, потом причину', () => {
    const host = mountScreen();

    act(() => { vi.advanceTimersByTime(299); });
    expect(host.querySelector('.heys-wait-mark')).toBeNull();

    act(() => { vi.advanceTimersByTime(2); });
    expect(host.querySelector('.heys-wait-mark__disc')).not.toBeNull();
    expect(host.querySelector('.heys-wait-mark__title')).toBeNull();
    expect(host.querySelector('.heys-wait-mark__text')).toBeNull();

    // 300 мс — 2 с: знак без подписи.
    act(() => { vi.advanceTimersByTime(1600); });
    expect(host.querySelector('.heys-wait-mark__title')).toBeNull();

    // Дольше 2 с — заголовок. Причина ещё не приходит.
    act(() => { vi.advanceTimersByTime(200); });
    expect(host.querySelector('.heys-wait-mark__title').textContent).toBe('Сохраняем профиль');
    expect(host.querySelector('.heys-wait-mark__text')).toBeNull();

    // «Ещё позже» — причина задержки.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(host.querySelector('.heys-wait-mark__title').textContent).toBe('Сохраняем профиль');
    expect(host.querySelector('.heys-wait-mark__text').textContent).toBe('Связь медленная, ещё пробуем.');
  });

  it('без подписи знак остаётся озвученным для скринридера', () => {
    window.__heysLoadingProgress = { skippedForTest: true };
    loadScript('heys_loading_progress_v1.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(window.HEYS.WaitMark.render(React, { mode: 'screen', state: 'wait' }));
    });
    expect(host.querySelector('.heys-wait-mark').getAttribute('role')).toBe('status');
    expect(host.querySelector('.heys-wait-mark__sr').textContent).toBe('Загружаем');
  });
});

describe('ступени холодного старта', () => {
  function bootColdStart() {
    document.documentElement.setAttribute('data-heys-session', '1');
    document.body.innerHTML = bootMarkMarkup();
    loadScript('heys_loading_progress_v1.js');
    return document.querySelector('.heys-boot-mark');
  }

  it('до 15 с знак молчит, на 15 с — строка и кнопка «Повторить»', () => {
    const mark = bootColdStart();

    vi.advanceTimersByTime(14000);
    expect(mark.classList.contains('is-slow')).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(mark.classList.contains('is-slow')).toBe(true);
    expect(mark.querySelector('.heys-boot-mark__slow-text').textContent)
      .toBe('Медленная сеть, продолжаем загружать');

    // Кнопка ступени — тот же .heys-boot-mark__btn, что и на отказе.
    const retry = mark.querySelector('.heys-boot-mark__slow .heys-boot-mark__retry');
    expect(retry).not.toBeNull();
    expect(retry.className).toContain('heys-boot-mark__btn');
    expect(mark.querySelector('.heys-boot-mark__retry--ghost')).toBeNull();

    // Геометрия ступеней не меняется: круг остаётся на месте.
    expect(mark.querySelector('.heys-boot-mark__disc')).not.toBeNull();
  });

  it('повторный тап по «Повторить» в течение 350 мс не перезагружает дважды', () => {
    const mark = bootColdStart();
    vi.advanceTimersByTime(15000);
    const retry = mark.querySelector('.heys-boot-mark__retry');
    expect(retry).not.toBeNull();

    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // Второй тап внутри 350 мс — кнопка уже disabled, эффекта нет.
    act(() => { vi.advanceTimersByTime(100); });
    retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retry.disabled).toBe(true);

    // Спустя 350 мс от первого тапа замок снят — кнопка снова доступна.
    act(() => { vi.advanceTimersByTime(250); });
    expect(retry.disabled).toBe(false);
    retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('60 с без продвижения дают отказ со ссылкой куратора, второй отказ повышает её до кнопки', () => {
    const mark = bootColdStart();

    vi.advanceTimersByTime(59000);
    expect(mark.classList.contains('is-fail')).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(mark.classList.contains('is-fail')).toBe(true);
    expect(mark.classList.contains('is-fail-again')).toBe(false);
    expect(mark.querySelector('.heys-boot-mark__title').textContent)
      .toBe('Не удалось загрузить приложение');
    // Строка про куратора доступна уже на первой неудаче.
    expect(mark.querySelector('.heys-boot-mark__curator')).not.toBeNull();

    // Вторая неудача в той же сессии.
    window.__heysBootWait.showFail();
    document.body.innerHTML = bootMarkMarkup();
    delete window.__heysLoadingProgress;
    delete window.__heysBootWait;
    const second = document.querySelector('.heys-boot-mark');
    loadScript('heys_loading_progress_v1.js');
    vi.advanceTimersByTime(61000);
    expect(second.classList.contains('is-fail-again')).toBe(true);
    expect(second.querySelector('.heys-boot-mark__text').textContent)
      .toContain('напишите куратору');
  });

  it('под формой входа знака нет: без сессии ступени не запускаются', () => {
    document.documentElement.setAttribute('data-heys-session', '0');
    document.body.innerHTML = bootMarkMarkup();
    loadScript('heys_loading_progress_v1.js');
    vi.advanceTimersByTime(61000);
    const mark = document.querySelector('.heys-boot-mark');
    expect(mark.classList.contains('is-slow')).toBe(false);
    expect(mark.classList.contains('is-fail')).toBe(false);
  });
});

describe('поблочной загрузки нет', () => {
  it('строка тренировки пальцев не рисует скелетон, пока едет бандл', () => {
    loadScript('heys_fingers_boot_stub_v1.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(window.HEYS.Fingers.renderPreviewPill({ training: { fingersLog: { programId: 'base' } } }));
    });
    expect(host.textContent).toBe('');
    expect(host.querySelector('.fingers-fs-pill-skeleton')).toBeNull();
    // Ленивая загрузка при этом стартует — строка появится сразу готовой.
    expect(document.querySelector('script[src^="heys_fingers_bundle_v1.js"]')).not.toBeNull();
  });
});
