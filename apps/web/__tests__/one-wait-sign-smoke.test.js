// Смоук строки контракта spinners.v4.dc.html «форма»: знак ожидания в продукте
// один. Раньше их было три — круг 56 холодного старта, своё кольцо в оверлее
// смены клиента и своё кольцо-гейдж в жесте обновления.
//
// Руками эти два места не собрать: смена клиента бывает только у куратора и
// только в момент переключения, а стадии жеста (тяга → отпустили → синхронизация
// → исход) живут доли секунды и завязаны на touch-события.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

// Дуга общего знака: хвост под .22 и сама дуга, viewBox 24, обводка из CSS.
const ARC_TAIL = 'M21 12a9 9 0 11-9-9';
const ARC_HEAD = 'M12 3a9 9 0 019 9';
const CHECK = 'M5 13l4 4L19 7';
const WARN = 'M12 7v6M12 17h.01';

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = {};
  window.__heysLoadingProgress = { skippedForTest: true };
  document.body.innerHTML = '';
  loadScript('heys_loading_progress_v1.js');
});

afterEach(() => {
  delete window.__heysLoadingProgress;
  delete window.HEYS;
  delete window.React;
  try { window.localStorage.clear(); } catch (_) { /* noop */ }
});

describe('оверлей смены клиента несёт общий знак', () => {
  function mountOverlay() {
    window.localStorage.setItem('heys_clients', JSON.stringify([{ id: 'c-1', name: 'Клиент' }]));
    loadScript('heys_client_switch_overlay_v1.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(React.createElement(window.HEYS.ClientSwitchOverlay)); });
    act(() => {
      window.dispatchEvent(new CustomEvent('heys:client-switching', { detail: { clientId: 'c-1' } }));
    });
    return { host, stage: (name) => act(() => {
      window.dispatchEvent(new CustomEvent('heys:client-switch-stage', { detail: { clientId: 'c-1', stage: name } }));
    }) };
  }

  it('рисует дугу общего знака вместо своего кольца', () => {
    const { host } = mountOverlay();
    expect(host.querySelector('.cso-backdrop')).not.toBeNull();
    expect(host.querySelector('.cso-spinner')).toBeNull();
    expect(host.querySelector('.cso-check')).toBeNull();

    const sign = host.querySelector('.cso-stage .cso-sign');
    expect(sign.className).toContain('cso-sign--wait');
    expect(sign.querySelector('.heys-wait-mark--button')).not.toBeNull();
    const paths = [...sign.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    expect(paths).toContain(ARC_TAIL);
    expect(paths).toContain(ARC_HEAD);
    expect(sign.querySelector('path[opacity=".22"]')).not.toBeNull();
  });

  it('на успехе даёт галочку того же знака, на ошибке — его же знак ошибки', () => {
    const { host, stage } = mountOverlay();

    stage('loading');
    expect(host.querySelector('.cso-sign').className).toContain('cso-sign--wait');

    stage('error');
    const fail = host.querySelector('.cso-sign');
    expect(fail.className).toContain('cso-sign--fail');
    expect([...fail.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toContain(WARN);
    expect(fail.textContent).toBe('');
  });

  it('не заводит второй живой области внутри уже озвученной строки', () => {
    const { host } = mountOverlay();
    // .cso-backdrop уже role="status"; вложенный второй озвучил бы стадию дважды.
    expect(host.querySelectorAll('[role="status"]').length).toBe(1);
    expect(host.querySelector('.cso-sign').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('жест обновления несёт тот же знак', () => {
  const shell = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
  const css = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/100-metrics-and-graphs.css'), 'utf8',
  );

  it('использует дугу и глифы общего знака, а не свои фигуры', () => {
    expect(shell).toContain(ARC_TAIL);
    expect(shell).toContain(ARC_HEAD);
    expect(shell).toContain(CHECK);
    expect(shell).toContain(WARN);
    // Сняты своя галочка, крест ошибки, треугольник таймаута и кольцо-гейдж.
    expect(shell).not.toContain('M7 14l5 5 9-9');
    expect(shell).not.toContain('M8 8l12 12M20 8l-12 12');
    expect(shell).not.toContain('M14 7v8m0 4h.01');
    expect(shell).not.toContain("strokeDasharray: '45 20'");
    expect(shell).not.toContain('strokeDasharray: 63');
  });

  it('держит геометрию и оборот знака', () => {
    expect(css).toMatch(/\.pull-spinner-ring \{[\s\S]*?width: 26px;[\s\S]*?stroke-width: 2\.75;/);
    expect(css).toContain('animation: pull-spin 1.1s linear infinite');
    expect(css).not.toContain('pull-spin 0.8s');
  });

  it('таймаут показывается знаком ошибки, а разводит их строка под знаком', () => {
    expect(shell).toContain("refreshStatus === 'error' || refreshStatus === 'timeout'");
    expect(shell).toContain('Синхронизация заняла слишком долго');
    expect(shell).toContain('Ошибка синхронизации');
  });
});

describe('иконка запуска не рисует своё скругление', () => {
  it('заливает плитку до края — форму выбирает лончер', () => {
    const icon = fs.readFileSync(path.join(WEB_DIR, 'public/icon-v4.svg'), 'utf8');
    expect(icon).toContain('<rect width="100" height="100" fill="#fffaf1" />');
    expect(icon).not.toContain('rx="12.5"');
    // Тот же файл, что и у maskable-источника, — разной формы у них быть не должно.
    const apple = fs.readFileSync(path.join(WEB_DIR, 'public/icon-v4-apple.svg'), 'utf8');
    expect(apple).not.toContain('rx=');
  });
});
