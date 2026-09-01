// Смоук сведения зоны registration с контрактом канваса v4.
// Проверяет строки контракта, доведённые в коде: «цель касания», «клавиатура»,
// «вид шага профиля», «вид карточки итогов», «вид финального экрана»,
// «сохранение», «активность».
import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');

const CLIENT_ID = 'client-sweep';
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

function loadProfileSteps(storage, heysOverrides = {}) {
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
    ...heysOverrides,
  };
  // eslint-disable-next-line no-eval
  (0, eval)(PROFILE_SRC);
  return { steps, ProfileSteps: window.HEYS.ProfileSteps };
}

// Плоский обход дерева в порядке отрисовки — нужен, чтобы проверять «что выше».
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

function styles(node) {
  return flatten(node).map((item) => item.props?.style).filter(Boolean);
}

afterEach(() => {
  window.HEYS = originalHEYS;
  window.React = originalReact;
  vi.restoreAllMocks();
});

describe('registration · сведение с контрактом v4', () => {
  it('«активность» — ответ шага 3 двигает прогноз недель до цели', () => {
    const { ProfileSteps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
    const { calcTimeToGoal } = ProfileSteps;
    const weeks = (activity) => Number(String(calcTimeToGoal(74, 64, -15, activity)).replace(/\D+/g, ''));

    expect(weeks('light')).toBeGreaterThan(0);
    // Сидячая — расход ниже, срок длиннее; высокая — короче.
    expect(weeks('sedentary')).toBeGreaterThan(weeks('light'));
    expect(weeks('active')).toBeLessThan(weeks('light'));
    // Неизвестное значение не ломает прогноз и считается как «лёгкая».
    expect(weeks(undefined)).toBe(weeks('light'));
  });

  it('«персональные данные» — возраст 24/700 --ac стоит ПОД компактным колесом', () => {
    const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
    const tree = steps['profile-personal'].component({
      data: { firstName: 'Александра', lastName: '', gender: 'Женский', birthDay: 1, birthMonth: 1, birthYear: 2001 },
      onChange: vi.fn(),
    });
    const nodes = flatten(tree);
    const ageIndex = nodes.findIndex((n) => String(n.props?.style?.font || '').startsWith('700 24px'));
    const capsuleIndex = nodes.findIndex((n) => n.props?.style?.borderRadius === 18
      && n.props?.style?.padding === '12px 10px 13px');
    const compactWheels = nodes.filter((n) => n.type === window.HEYS.StepModal.WheelPicker
      && n.props?.compact === true);

    expect(capsuleIndex).toBeGreaterThan(-1);
    expect(ageIndex).toBeGreaterThan(capsuleIndex);
    expect(nodes[capsuleIndex].props.style).toMatchObject({
      background: '#f7efe2',
      borderRadius: 18,
      padding: '12px 10px 13px',
      marginTop: 8,
    });
    expect(nodes[ageIndex].props.style).toMatchObject({
      textAlign: 'center',
      font: '700 24px/1 Figtree, system-ui, sans-serif',
      color: '#8a4a20',
      marginTop: 14,
    });
    expect(nodes[ageIndex].props.style.color).toBe('#8a4a20');
    expect(nodes[ageIndex].children).toContain('25 лет');
    expect(compactWheels).toHaveLength(3);
  });

  // Строка «герой» (12-я сборка): «герой есть только на первом шаге профиля —
  // там значение одно и очевидно. На шагах 2–4 героя нет: на втором два равных
  // числа, на третьем и четвёртом чисел нет вовсе, и выносить нечего».
  // Прежняя редакция требовала героя на каждом шаге и не называла, какое число
  // выносить на 2–4; расхождение снято самим контрактом.
  it('«герой» — крупное значение только на шаге 1, на шагах 2–4 его нет', () => {
    const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
    const render = (id, data) => steps[id].component({ data, onChange: vi.fn() });

    // Кегль узла: и раскладка `font:`, и отдельный fontSize.
    const sizes = (tree) => flatten(tree).map((n) => {
      const style = n.props?.style || {};
      if (typeof style.fontSize === 'number') return style.fontSize;
      const shorthand = String(style.font || '').match(/^\d+\s+([\d.]+)px/);
      return shorthand ? Number(shorthand[1]) : 0;
    }).filter((size) => size > 0);

    const step1 = render('profile-personal', {
      firstName: 'Александра', lastName: '', gender: 'Женский',
      birthDay: 1, birthMonth: 1, birthYear: 2001,
    });
    const step2 = render('profile-body', { height: 170, weight: 74, weightGoal: 64 });
    const step3 = render('profile-goals', { goalDirection: 'lose', deficitPctTarget: -15, activityLevel: 'light' });
    const step4 = render('profile-metabolism', { sleepHours: 8, insulinWaveHours: 3 });

    // Шаг 1: возраст остаётся единственным акцентным числом, но следует кадру
    // 24/700 под колесом, а не устаревшей строке 44/600 над ним.
    expect(sizes(step1).filter((size) => size === 24).length).toBe(1);
    expect(Math.max(...sizes(step1))).toBe(24);

    // Шаги 2–4: выше заголовка 20 px ничего не поднимается. Пустой список
    // кеглей засчитался бы как «прошло», поэтому он проверяется отдельно —
    // иначе тест сторожил бы собственную слепоту.
    for (const tree of [step2, step3, step4]) {
      expect(sizes(tree).length).toBeGreaterThan(0);
      expect(Math.max(...sizes(tree))).toBeLessThanOrEqual(20);
    }

    // На втором — ровно два равных числа (ИМТ сейчас и «До цели»), а не герой.
    const twins = flatten(step2).filter((n) => n.props?.style?.fontSize === 18
      && n.props?.style?.fontWeight === 700);
    expect(twins.length).toBe(2);

    // На третьем и четвёртом крупных чисел нет вовсе: выносить нечего.
    for (const tree of [step3, step4]) {
      expect(sizes(tree).filter((size) => size > 20).length).toBe(0);
    }
  });

  it('«цель касания» — чипы темпа, активности и сна держат 44 pt', () => {
    const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
    const goals = styles(steps['profile-goals'].component({
      data: { goalDirection: 'lose', deficitPctTarget: -15, activityLevel: 'light' },
      onChange: vi.fn(),
    }));
    const chips = goals.filter((s) => s.borderRadius === undefined && s.minHeight === 44);
    // Три темпа + три активности.
    expect(chips.length).toBe(6);

    const sleep = styles(steps['profile-metabolism'].component({
      data: { sleepHours: 7.5, insulinWaveHours: 3 },
      onChange: vi.fn(),
    }));
    expect(sleep.filter((s) => s.minHeight === 44 && s.minWidth === 52).length).toBe(2);
    expect(sleep.some((s) => s.minHeight === 44 && s.minWidth === 84)).toBe(true);
  });

  it('«клавиатура» — enterKeyHint в полях и visualViewport в мастере', () => {
    expect(PROFILE_SRC).toContain("enterKeyHint: 'next'");
    expect(STEP_MODAL_SRC).toContain('window.visualViewport');
    expect(STEP_MODAL_SRC).toContain('setKeyboardViewportHeight');
    expect(STEP_MODAL_SRC).toContain('keyboardViewportHeight > 0');
  });

  it('«сохранение» — растущий интервал повтора и видимый номер попытки', () => {
    expect(STEP_MODAL_SRC).toContain('const PROFILE_RETRY_DELAYS_SEC = [4, 8, 16, 30, 60];');
    expect(STEP_MODAL_SRC).toContain('setProfileRetryAttempt((attempt) => attempt + 1)');
    expect(STEP_MODAL_SRC).toContain('следующая через ${profileRetryCountdown}');
    expect(STEP_MODAL_SRC).toContain('handleNextRef.current = handleNext;');
    // Копия обещает автоматический повтор — он должен запускаться сам.
    expect(STEP_MODAL_SRC).toContain('const retry = handleNextRef.current;');
  });

  describe('итоговые экраны', () => {
    const profileSeed = JSON.stringify({
      firstName: 'Александра',
      curatorName: 'Антон',
      curatorId: 'cur-1',
      weight: 74,
      height: 168,
      weightGoal: 64,
      deficitPctTarget: -15,
      gender: 'Женский',
      birthDate: '2001-01-01',
      profileCompleted: true,
    });

    function endingTree(subscription) {
      const storage = createMockStorage({ heys_profile: profileSeed });
      storage.setItem('heys_client_current', JSON.stringify(CLIENT_ID));
      const { steps } = loadProfileSteps(storage, {
        dateUtils: { todayISO: () => '2026-08-24' },
        Subscription: subscription,
      });
      return steps.welcome.component({
        stepData: {},
        context: { onStartDailyCheckin: vi.fn(), onRefreshAccess: vi.fn() },
      });
    }

    const openSub = {
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
      getCachedStatus: () => 'trial',
      getLocalStatus: () => 'trial',
      getCachedDetails: () => ({ status: 'trial' }),
    };
    const waitingSub = {
      canWriteStatus: () => false,
      getCachedStatus: () => 'none',
      getLocalStatus: () => 'none',
      getCachedDetails: () => ({ status: 'none' }),
    };
    const datedSub = {
      canWriteStatus: () => false,
      getCachedStatus: () => 'trial_pending',
      getLocalStatus: () => 'trial_pending',
      getCachedDetails: () => ({ status: 'trial_pending', trial_started_at: '2026-09-21' }),
    };

    it('«вид финального экрана» — отступ 34, круги трёх концов и пояснение 12,5', () => {
      const open = endingTree(openSub);
      expect(open.props.style.paddingTop).toBe(34);
      expect(open.props.style.padding).toBeUndefined();
      const openStyles = styles(open);
      // Доступ открыт — шалфейный круг --gr-bg.
      expect(openStyles.some((s) => s.width === 60 && s.background === '#eaefe0')).toBe(true);
      expect(flatten(open).some((n) => n.type === 'svg' && n.props.stroke === '#5c6a45'
        && n.props.width === 28 && n.props.strokeWidth === 3)).toBe(true);
      expect(openStyles.some((s) => s.fontSize === 12.5 && s.color === 'rgba(0,0,0,.55)')).toBe(true);

      for (const subscription of [waitingSub, datedSub]) {
        const tree = endingTree(subscription);
        expect(tree.props.style.paddingTop).toBe(34);
        // Ожидание и «неделя позже» — один и тот же тинт с тоном --ac.
        expect(styles(tree).some((s) => s.width === 60 && s.background === '#f6e6dd')).toBe(true);
        expect(flatten(tree).some((n) => n.type === 'svg' && n.props.stroke === '#8a4a20')).toBe(true);
      }
    });

    it('«вид карточки итогов» — --c2, поля 14/16, строки 12/600 шагом 11 табличными цифрами', () => {
      const open = endingTree(openSub);
      const card = styles(open).find((s) => s.background === '#efe3cf' && s.borderRadius === 20);
      expect(card).toBeTruthy();
      expect(card.padding).toBe('14px 16px');
      expect(card.maxWidth).toBeUndefined();

      const rows = styles(open).filter((s) => s.fontSize === 12 && s.fontWeight === 600 && s.marginTop === 11);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(styles(open).filter((s) => s.fontVariantNumeric === 'tabular-nums').length)
        .toBeGreaterThanOrEqual(3);
    });
  });
});
