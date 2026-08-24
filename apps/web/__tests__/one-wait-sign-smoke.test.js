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

describe('кнопка отправки в чате несёт тот же знак', () => {
  const messenger = fs.readFileSync(path.join(WEB_DIR, 'heys_messenger_v1.js'), 'utf8');
  const css = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/1000-messenger.css'), 'utf8');

  it('своё кольцо 16/2 снято, знак берётся у HEYS.WaitMark', () => {
    expect(messenger).not.toContain('messenger-send__spinner');
    expect(css).not.toMatch(/\.messenger-send__spinner\s*\{/);
    expect(css).not.toMatch(/^@keyframes messenger-send-spin/m);
    expect(css).not.toContain('animation: messenger-send-spin');
    expect(messenger).toContain("mode: 'button', state: 'wait', silent: true");
  });

  it('кнопка сохраняет заливку и гаснет до 60 %, а не сереет как «нечего отправить»', () => {
    expect(messenger).toContain("'messenger-send' + (sending ? ' messenger-send--busy' : '')");
    expect(css).toMatch(/\.messenger-send--busy:disabled \{[\s\S]*?background: #1d70b7;[\s\S]*?opacity: 0\.6;/);
    // Правило должно стоять ПОСЛЕ :disabled — специфичность равна, побеждает поздний.
    expect(css.indexOf('.messenger-send--busy:disabled')).toBeGreaterThan(css.indexOf('.messenger-send:disabled'));
  });

  it('знак в кнопке — дуга 18 обводкой 2,5 без второй живой области', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(window.HEYS.WaitMark.render(React, { mode: 'button', state: 'wait', silent: true }));
    });
    const svg = host.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('stroke-width')).toBe('2.5');
    expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual([ARC_TAIL, ARC_HEAD]);
    expect(host.querySelectorAll('[role="status"]').length).toBe(0);
  });
});

describe('кольцо загрузки фото сведено к тому же знаку', () => {
  const base = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8',
  );

  it('18 px, обводка 2,5, хвост .22, оборот 1,1 с', () => {
    const rule = /\.meal-photo-thumb\.uploading::after \{[^}]*\}/.exec(base)[0];
    expect(rule).toContain('width: 18px;');
    expect(rule).toContain('border: 2.5px solid rgba(255, 255, 255, 0.22);');
    expect(rule).toContain('border-radius: 999px;');
    expect(rule).toContain('animation: spin 1.1s linear infinite;');
    expect(rule).toContain('box-sizing: border-box;');
    // Было 24/3 с хвостом .3 и оборотом 0,8 с.
    expect(rule).not.toContain('width: 24px;');
    expect(rule).not.toContain('0.8s');
  });
});

describe('мёртвый второй pull-to-refresh снят', () => {
  it('модуля, стиля и записи в конфиге бандлов больше нет', () => {
    expect(fs.existsSync(path.join(WEB_DIR, 'heys_pull_refresh.js'))).toBe(false);
    const modals = fs.readFileSync(
      path.join(WEB_DIR, 'styles/modules/300-modals-and-day.css'), 'utf8',
    );
    expect(modals).not.toContain('.pull-refresh-indicator {');
    expect(modals).not.toContain('.pull-refresh-spinner.spinning');
    const bundles = fs.readFileSync(
      path.resolve(WEB_DIR, '../../scripts/legacy-bundle-config.mjs'), 'utf8',
    );
    expect(bundles).not.toContain('heys_pull_refresh.js');
  });

  it('живым остаётся один жест — HEYS.dayPullRefresh', () => {
    const impl = fs.readFileSync(path.join(WEB_DIR, 'heys_day_tab_impl_v1.js'), 'utf8');
    expect(impl).toContain('HEYS.dayPullRefresh?.usePullToRefresh?.(');
    expect(fs.existsSync(path.join(WEB_DIR, 'heys_day_pull_refresh_v1.js'))).toBe(true);
  });
});

describe('слой обновления PWA живёт по своей зоне и не сводится сюда', () => {
  // Правило 3: pwa-update.v4.dc.html даёт слою собственный знак — круг 60,
  // заливка акцента слоя под 14 %, глиф 24 обводкой 2,5 тоном #d98a4f, палитра
  // «вне четырёх тем продукта». Строка spinners «форма» просит один знак на всё.
  // Пока владелец не выбрал, слой остаётся как есть — тест это фиксирует, чтобы
  // никто не «свёл» его молча.
  it('иконка стадии остаётся по контракту своей зоны', () => {
    const components = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
    const platform = fs.readFileSync(path.join(WEB_DIR, 'heys_platform_apis_v1.js'), 'utf8');
    expect(components).toMatch(/\.heys-update-modal__icon \{[\s\S]*?width: 60px;/);
    expect(components).toContain('background: rgba(217, 138, 79, 0.14);');
    expect(components).toContain('animation: heys-update-spin 1.1s linear infinite;');
    expect(platform).toContain("updateIconSvg(s.done ? 'check' : s.icon, 24, 2.5)");
  });
});
