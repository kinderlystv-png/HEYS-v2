// Разбор кадра «Регистрация · персональные данные» против продуктового CSS/JS.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/registration.v4.dc.html',
);
const PWA_CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const USER_TAB_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_user_tab_impl_v1.js'), 'utf8');

const FRAME = 'Регистрация · персональные данные';
const COPY_STATIC = [
  'Расскажите о себе',
  'Имя',
  'Фамилия',
  'необязательно',
  'Пол',
  'Женский',
  'Мужской',
  'Формула основного обмена у мужчин и женщин разная.',
  'Дата рождения',
  '25 лет',
];

const PERSONAL = [
  [2, '.mc-modal--daily .mc-header-btn--back', ['width', 'height']],
  [3, '.mc-modal--daily .mc-header-spacer', ['width']],
  [8, '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-name input[type="text"]::placeholder', ['color']],
  [10, '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-family input[type="text"]::placeholder', ['color']],
  [16, '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-wheel-card', ['gap']],
  [18, '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-wheel-card .mc-wheel-value--prev', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [19, '.mc-modal[data-heys-step-id="profile-personal"] .profile-personal-wheel-card .mc-wheel-value--current', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [25, '.mc-modal[data-heys-step-id="profile-personal"] .mc-daily-footer-primary:disabled', ['background', 'color']],
];

const COVERAGE_FLOOR = 8;

const originalHEYS = window.HEYS;
const originalReact = window.React;

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function loadProfileSteps(storage) {
  const steps = {};
  window.React = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: () => undefined,
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  };
  window.HEYS = {
    store: { invalidate: vi.fn() },
    cloud: {},
    StepModal: {
      WheelPicker: function WheelPicker() {},
      registerStep: (id, config) => { steps[id] = config; },
      utils: {
        lsGet: (key, fallback) => {
          const raw = storage._store[key];
          return raw ? JSON.parse(raw) : fallback;
        },
        lsSet: (key, value) => storage.setItem(key, JSON.stringify(value)),
        getTodayKey: () => '2026-08-24',
      },
    },
  };
  // eslint-disable-next-line no-eval
  (0, eval)(PROFILE_SRC);
  return steps;
}

function flatten(node, out = []) {
  if (node == null || node === false || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => flatten(child, out));
    return out;
  }
  out.push(node);
  flatten(node.children, out);
  return out;
}

function collectText(node, output = []) {
  if (node == null || node === false) return output;
  if (typeof node === 'string' || typeof node === 'number') {
    output.push(String(node));
    return output;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, output));
    return output;
  }
  if (typeof node !== 'object') return output;
  collectText(node.children, output);
  return output;
}

afterEach(() => {
  window.HEYS = originalHEYS;
  window.React = originalReact;
  vi.restoreAllMocks();
});

describe('registration · разбор кадра «персональные данные»', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(PWA_CSS, 'utf8'));
  const pwaCss = fs.readFileSync(PWA_CSS, 'utf8');

  it('кадр «персональные данные» — CSS-сверка шапки, полей и колеса', () => {
    expect(compare({ razbor, rules, frame: FRAME, pairs: PERSONAL })).toEqual([]);
  });

  it('элемент 02 — отрицательные поля кнопки назад', () => {
    expect(pwaCss).toMatch(/\.mc-modal--daily \.mc-header-btn--back \{[^}]*margin: -8px 0/s);
  });

  it('элементы 05/07/11 — заголовок, звёздочка и пояснение пола в исходнике', () => {
    expect(PROFILE_SRC).toMatch(/fontSize: 20, fontWeight: 700, color: 'var\(--v4-ink, #201e1d\)', marginTop: 6, lineHeight: 1\.3/);
    expect(PROFILE_SRC).toContain("React.createElement('span', { style: { color: '#8a4a20' } }, '*')");
    expect(PROFILE_SRC).toMatch(/fontSize: 11, fontWeight: 500, lineHeight: 1\.5, marginTop: 6, color: INK_DATA/);
  });

  it('элементы 06/09 — зазоры между блоками через gap-4 и margin-top −4', () => {
    expect(pwaCss).toMatch(/\.mc-modal\[data-heys-step-id="profile-personal"\] \.profile-personal-name \{[^}]*margin-top: 0/s);
    expect(pwaCss).toMatch(/\.mc-modal\[data-heys-step-id="profile-personal"\] \.profile-personal-family \{[^}]*margin-top: -4px/s);
    expect(PROFILE_SRC).toContain("className: 'profile-personal-step flex flex-col gap-4'");
  });

  it('элементы 12–15/21–22 — капсула колеса и градиенты приглушения', () => {
    expect(PROFILE_SRC).toMatch(/background: '#f7efe2', borderRadius: 18, padding: '12px 10px 13px', marginTop: 8/);
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card::before[\s\S]*height: 14px/s);
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card::after[\s\S]*height: 14px/s);
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card \.mc-wheel-value--prev[\s\S]*font: 600 12\.5px\/2\.1/s);
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card \.mc-wheel-value--current[\s\S]*font: 700 26px\/1\.4/s);
  });

  it('элемент 04/24 — прокрутка и подвал общие для daily-оболочки', () => {
    expect(pwaCss).toMatch(/\.mc-modal--daily \.mc-step-content \{[^}]*overflow: auto/s);
    expect(pwaCss).toMatch(/\.mc-daily-footer \{[^}]*padding: 12px 18px/s);
  });

  it('рисунки 01–02 — шеврон назад 17×17 и путь M15 18l-6-6 6-6', () => {
    expect(STEP_MODAL_SRC).toContain("className: 'mc-header-back-icon'");
    expect(STEP_MODAL_SRC).toContain("d: 'M15 18l-6-6 6-6'");
    expect(pwaCss).toMatch(/\.mc-modal--daily \.mc-header-btn--back \{[^}]*width: 44px/s);
  });

  it('элементы 17/20 — доли колонок колеса flex 1 и 1.3', () => {
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card > \.mc-wheel-picker \{[^}]*flex: 1 1 0/s);
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card > \.mc-wheel-picker:nth-child\(2\) \{[^}]*flex-grow: 1\.3/s);
  });

  it('текст кадра — пословная копия шага profile-personal', () => {
    const steps = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
    const text = collectText(steps['profile-personal'].component({
      data: { firstName: '', lastName: '', gender: '', birthDay: 1, birthMonth: 1, birthYear: 2001 },
      onChange: vi.fn(),
    })).join(' ');
    for (const chunk of COPY_STATIC) {
      expect(text, chunk).toContain(chunk);
    }
    expect(steps['profile-personal'].nextLabel).toBe('Дальше');
  });

  it('строка «одно слово, два разных элемента» — «Цель» в регистрации и профиле', () => {
    expect(PROFILE_SRC).toMatch(/tier\('Цель', 24\)/);
    expect(USER_TAB_SRC).toMatch(/ProfileV4Subtier, \{ title: 'Цель' \}/);
    expect(PROFILE_SRC).not.toMatch(/className: 'profile-v4__subtier-title'/);
  });

  it('строка «вид колеса значений» — тройное колесо даты и одиночные колёса тела', () => {
    expect(pwaCss).toMatch(/\.profile-personal-wheel-card \.mc-wheel-value--current[\s\S]*color: var\(--v4-sand-act-text/);
    expect(PROFILE_SRC).toMatch(/padding: '13px 0 14px'/);
    expect(PROFILE_SRC).toMatch(/compact: true/);
  });

  it('гейт называет охват разбора', () => {
    const report = coverage({
      razbor,
      calls: [{ frame: FRAME, pairs: PERSONAL }],
    });
    expect(report.covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });
});
