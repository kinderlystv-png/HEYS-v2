import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const CONSENTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_consents_v1.js'), 'utf8');
const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const SYNC_MERGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_sync_merge_v1.js'), 'utf8');

const DATE_KEY = '2026-08-16';
const CLIENT_ID = 'client-canvas';
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

function readJson(storage, key, fallback = null) {
  const raw = storage._store[key];
  return raw ? JSON.parse(raw) : fallback;
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
        lsGet: (key, fallback) => readJson(storage, key, fallback),
        lsSet: (key, value) => storage.setItem(key, JSON.stringify(value)),
        getTodayKey: () => DATE_KEY,
      },
    },
    ...heysOverrides,
  };
  // eslint-disable-next-line no-eval
  (0, eval)(PROFILE_SRC);
  return { steps, ProfileSteps: window.HEYS.ProfileSteps };
}

function loadMorning(profile) {
  const values = new Map();
  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({
    _sourceClientId: CLIENT_ID,
    ...profile,
  }));
  window.HEYS = {
    currentClientId: CLIENT_ID,
    _consentsValid: true,
    store: {
      readSafe: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
      set: (key, value) => values.set(key, structuredClone(value)),
    },
    utils: { getCurrentClientId: () => CLIENT_ID },
    dayUtils: { todayISO: () => DATE_KEY },
    ProfileSteps: { isProfileIncomplete: () => true },
    Steps: { shouldShowCycleStep: () => false, shouldShowMeasurements: () => false },
    Refeed: { shouldShowRefeedStep: () => false },
    YesterdayVerifyReady: true,
    YesterdayVerify: { stepRegistered: true, shouldShow: () => false },
    Subscription: {
      getCachedStatus: () => 'trial',
      getLocalStatus: () => 'trial',
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
    },
  };
  if (!window.HEYS.models) {
    const modelsSrc = fs.readFileSync(path.resolve(__dirname, '../heys_models_v1.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(modelsSrc)();
  }
  // eslint-disable-next-line no-new-func
  new Function(SYNC_MERGE_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(MORNING_SRC)();
  return window.HEYS.MorningCheckinUtils;
}

afterEach(() => {
  window.HEYS = originalHEYS;
  window.React = originalReact;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('registration canvas parity', () => {
  describe('согласия — кадры списка и документа', () => {
    it('source copy matches light canvas, not the old legal list labels', () => {
      expect(CONSENTS_SRC).toContain("screenLabel: 'Пользовательское соглашение'");
      expect(CONSENTS_SRC).toContain("screenLabel: 'Обработка персональных данных'");
      expect(CONSENTS_SRC).toContain("screenLabel: 'Замеры тела'");
      expect(CONSENTS_SRC).toContain("screenLabel: 'Добавки и витамины'");
      expect(CONSENTS_SRC).toContain("screenLabel: 'Напоминания'");
      expect(CONSENTS_SRC).toContain("screenLabel: 'Новости и советы'");
      expect(CONSENTS_SRC).toContain('Оба документа открываются целиком: отметка появится, когда дочитаете до конца.');
      expect(CONSENTS_SRC).toContain('HEYS — учёт питания и сопровождение куратора, не медицинская услуга.');
      expect(CONSENTS_SRC).toContain('Можно включить, можно нет');
      expect(CONSENTS_SRC).toContain('allRequiredAccepted && React.createElement(React.Fragment');
      expect(CONSENTS_SRC).toContain("'Выйти без регистрации'");
      expect(CONSENTS_SRC).not.toContain('← Выйти без регистрации');
      expect(CONSENTS_SRC).toContain("inset 0 0 0 2px rgba(0,0,0,.18)");
      // Проверка сторожила высоту 40 из кадров «Регистрация · согласия»
      // («Читать полностью →» и «Выйти без регистрации»). Строка контракта
      // «цель касания» требует минимум 44, и контракт старше кадра — поэтому
      // ждём 44 и следим, что 40 в файл не вернулось.
      expect(CONSENTS_SRC).toContain('minHeight: 44');
      expect(CONSENTS_SRC).not.toContain('minHeight: 40');
      // Проверка сторожила заливку выключенной кнопки из кадра «Регистрация ·
      // согласия»: песочный фон --c1 и текст чернилами 30 %. Строка контракта
      // «неактивная кнопка» говорит другое — кнопка не перекрашивается, а
      // гаснет до 45 %; своей заливки у выключенного состояния нет. Контракт
      // старше кадра, поэтому ждём гашение и постоянную заливку.
      expect(CONSENTS_SRC).toContain('opacity: loading ? 0.6 : (allRequiredAccepted ? 1 : 0.45)');
      expect(CONSENTS_SRC).not.toContain("color: allRequiredAccepted && !loading ? '#2b1608'");
      // Причина над кнопкой — 11,5 px/500 тоном чернил 55 % (кадр рисует 600/50 %).
      expect(CONSENTS_SRC).toContain("font: '500 11.5px/1.45 Figtree, system-ui, sans-serif'");
      expect(CONSENTS_SRC).toContain("padding: '16px 18px 0'");
      expect(CONSENTS_SRC).toContain('!allRequiredAccepted && onCancel');
      expect(CONSENTS_SRC).toContain('Необязательное отмечается тапом');
      expect(CONSENTS_SRC).toContain('Подпишите документы');
      expect(CONSENTS_SRC).toContain('Введите код доступа — он заменяет собственноручную подпись.');
      expect(CONSENTS_SRC).toContain('Долистайте до конца, чтобы принять');
      expect(CONSENTS_SRC).toContain('consent-fulltext-backdrop');
      expect(CONSENTS_SRC).toContain('consent-fulltext__bridge');
      expect(CONSENTS_SRC).toContain('Документы подписаны');
      expect(CONSENTS_SRC).toContain('heys-consent-sign-frame');
      expect(CONSENTS_SRC).toContain('heys-consent-sign-sheet__done');
      expect(CONSENTS_SRC).toContain('consent-fulltext__badge--version');
      expect(CONSENTS_SRC).toContain('parseConsentDocument');
      expect(CONSENTS_SRC).toContain('Закрыть без принятия');
      expect(CONSENTS_SRC).toContain('allRequiredAccepted ? \'Подписать\' : \'Подписать оба\'');
      expect(CONSENTS_SRC).toContain('Обязательные');
      expect(CONSENTS_SRC).toContain('const screenLabel = CONSENT_TEXTS.checkboxes[type]?.screenLabel');
      expect(CONSENTS_SRC).not.toContain('👇 Прокрутите до конца');
      expect(CONSENTS_SRC).not.toContain('📋 Согласия и условия');
      expect(STEP_MODAL_SRC).not.toContain('Написать куратору');
      expect(PROFILE_SRC).toContain("background: '#f7efe2'");
      expect(PROFILE_SRC).toContain("borderRadius: 999");
    });
  });

  describe('шаг 1 · персональные данные', () => {
    it('validate: пустое имя, цифра, пол, младше 18', () => {
      const { steps, ProfileSteps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      expect(ProfileSteps.isValidGivenName('Александра')).toBe(true);
      expect(ProfileSteps.isValidGivenName('1')).toBe(false);
      expect(ProfileSteps.isValidGivenName('А')).toBe(false);
      expect(steps['profile-personal'].validate({ firstName: '1', gender: 'Женский', birthDay: 1, birthMonth: 1, birthYear: 2001 }))
        .toBe('Имя — минимум две буквы, без цифр');
      expect(steps['profile-personal'].getValidationMessage({ firstName: 'Александра' }))
        .toBe('Остался пол');
      expect(steps['profile-personal'].getValidationMessage({ firstName: '' }))
        .toBe('');
      expect(steps['profile-personal'].getValidationMessage({ firstName: '', gender: 'Женский' }))
        .toBe('Осталось имя');
      expect(steps['profile-personal'].getValidationMessage({ firstName: '1', gender: 'Женский', birthDay: 1, birthMonth: 1, birthYear: 2001 }))
        .toBe('');
      expect(steps['profile-personal'].validate({
        firstName: 'Александра', gender: 'Женский', birthDay: 20, birthMonth: 12, birthYear: 2008,
      })).toBe('Приложением можно пользоваться с 18 лет');
      expect(steps['profile-personal'].getValidationMessage({
        firstName: 'Александра', gender: 'Женский', birthDay: 20, birthMonth: 12, birthYear: 2008,
      })).toBe('');
      expect(ProfileSteps.minAdultBirthYear(new Date('2026-08-16T12:00:00Z'))).toBe(2008);
      expect(steps['profile-personal'].nextLabel).toBe('Дальше');
    });

    it('getInitialData не ставит пол Мужской по умолчанию', () => {
      const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      expect(steps['profile-personal'].getInitialData().gender).toBe('');
    });

    it('кадр рендерит заголовок канваса, фамилию необязательно и подсказку про обмен', () => {
      const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      const tree = steps['profile-personal'].component({
        data: { firstName: '', lastName: '', gender: '', birthDay: 1, birthMonth: 1, birthYear: 2001 },
        onChange: vi.fn(),
      });
      const text = collectText(tree).join(' ');
      expect(text).toContain('Расскажите о себе');
      expect(text).toContain('необязательно');
      expect(text).toContain('Формула основного обмена у мужчин и женщин разная.');
      expect(text).not.toContain('👤');
    });
  });

  describe('шаг 2 · рост и вес', () => {
    it('предупреждает о ИМТ цели ниже нормы и не блокирует шаг', () => {
      const { steps, ProfileSteps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      expect(steps['profile-body'].validate({ weight: 74, height: 168, weightGoal: 48 })).toBe(true);
      expect(ProfileSteps.minNormalWeightKg(168)).toBe(52);
      const tree = steps['profile-body'].component({
        data: { weight: 74, height: 168, weightGoal: 48 },
        onChange: vi.fn(),
      });
      const text = collectText(tree).join(' ');
      expect(text).toContain('Рост и вес');
      expect(text).toContain('Целых чисел достаточно');
      expect(text).toContain('Желаемый вес, кг');
      expect(text).toContain('ИМТ цели');
      expect(text).toContain('ниже нормы');
      expect(text).toContain('прогноз по срокам для неё мы не строим');
      expect(text).not.toContain('⚠️');
    });

    it('на обычной цели показывает ИМТ сейчас и до цели без эмодзи', () => {
      const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      const tree = steps['profile-body'].component({
        data: { weight: 74, height: 168, weightGoal: 64 },
        onChange: vi.fn(),
      });
      const text = collectText(tree).join(' ');
      expect(text).toContain('ИМТ сейчас');
      expect(text).toContain('избыток');
      expect(text).toContain('До цели');
      expect(text).not.toContain('Избыточный вес');
    });
  });

  describe('шаг 3–4 и итог', () => {
    it('цель × темп × активность, сон ±0.5, кнопка Готово', () => {
      const { steps } = loadProfileSteps(createMockStorage({ heys_profile: '{}' }));
      const goals = collectText(steps['profile-goals'].component({
        data: { goalDirection: 'lose', deficitPctTarget: -15, activityLevel: 'light' },
        onChange: vi.fn(),
      })).join(' ');
      expect(goals).toContain('Цель и активность');
      expect(goals).toContain('Снизить вес');
      expect(goals).toContain('Удержать текущий вес');
      expect(goals).toContain('Набрать вес и мышцы');
      expect(goals).toContain('Умеренно — минус 15 % от расхода');
      expect(goals).toContain('пока нет факта шагов');
      expect(goals).not.toContain('Белки · углеводы · жиры');
      expect(goals).not.toContain('Темпа «быстро» нет');

      const sleep = collectText(steps['profile-metabolism'].component({
        data: { sleepHours: 7.5, insulinWaveHours: 3 },
        onChange: vi.fn(),
      })).join(' ');
      expect(sleep).toContain('Сон и инсулиновая волна');
      expect(sleep).toContain('7,5 ч');
      expect(sleep).toContain('быстрый обмен');
      expect(sleep).toContain('по умолчанию');
      expect(sleep).toContain('подсказки о перекусах');
      expect(steps['profile-metabolism'].nextLabel).toBe('Готово');
      expect(steps.welcome.hideDailyFooter).toBe(true);
    });

    it('три конца welcome как в канвасе', () => {
      const storage = createMockStorage();
      storage.setItem('heys_client_current', JSON.stringify(CLIENT_ID));
      storage.setItem('heys_profile', JSON.stringify({
        firstName: 'Александра',
        weight: 74,
        height: 168,
        weightGoal: 64,
        deficitPctTarget: -15,
        gender: 'Женский',
        birthDate: '2001-01-01',
        profileCompleted: true,
      }));
      const { steps } = loadProfileSteps(storage, {
        dateUtils: { todayISO: () => DATE_KEY },
        Subscription: {
          canWriteStatus: (status) => ['trial', 'active'].includes(status),
          getCachedStatus: () => 'trial',
          getLocalStatus: () => 'trial',
          getCachedDetails: () => ({ status: 'trial' }),
        },
      });
      const openText = collectText(steps.welcome.component({
        stepData: {
          'profile-personal': { firstName: 'Александра', gender: 'Женский', birthYear: 2001, birthMonth: 1, birthDay: 1 },
          'profile-body': { weight: 74, height: 168, weightGoal: 64 },
          'profile-goals': { deficitPctTarget: -15 },
        },
        context: { onStartDailyCheckin: vi.fn(), onRefreshAccess: vi.fn() },
      })).join(' ');
      expect(openText).toContain('Профиль готов, Александра');
      expect(openText).toContain('Дальше — утренний чек-ин: полминуты, и день начнёт считаться.');
      expect(openText).toContain('Начать утренний чек-ин');
      expect(openText).toContain('около');
      expect(openText).not.toContain('🎉');
    });

    it('ожидание и дата старта — копи канваса, без кнопки чек-ина', () => {
      const waitingStorage = createMockStorage();
      waitingStorage.setItem('heys_profile', JSON.stringify({
        firstName: 'Александра',
        curatorName: 'Антон',
        curatorId: 'cur-1',
        profileCompleted: true,
      }));
      const waiting = loadProfileSteps(waitingStorage, {
        dateUtils: { todayISO: () => DATE_KEY },
        Subscription: {
          canWriteStatus: () => false,
          getCachedStatus: () => 'none',
          getLocalStatus: () => 'none',
          getCachedDetails: () => ({ status: 'none' }),
        },
      }).steps;
      const waitingText = collectText(waiting.welcome.component({
        stepData: { 'profile-personal': { firstName: 'Александра' } },
        context: { onStartDailyCheckin: vi.fn(), onRefreshAccess: vi.fn() },
      })).join(' ');
      expect(waitingText).toContain('Профиль сохранён');
      expect(waitingText).toContain('Куратор назначит дату начала недели и откроет дневник.');
      expect(waitingText).toContain('Проверить доступ');
      expect(waitingText).toContain('Написать куратору');
      expect(waitingText).not.toContain('Начать утренний чек-ин');

      const datedStorage = createMockStorage();
      datedStorage.setItem('heys_profile', JSON.stringify({
        firstName: 'Александра',
        curatorName: 'Антон',
        curatorId: 'cur-1',
        profileCompleted: true,
      }));
      const dated = loadProfileSteps(datedStorage, {
        dateUtils: { todayISO: () => DATE_KEY },
        Subscription: {
          canWriteStatus: () => false,
          getCachedStatus: () => 'trial_pending',
          getLocalStatus: () => 'trial_pending',
          getCachedDetails: () => ({ status: 'trial_pending', trial_started_at: '2026-08-21' }),
        },
      }).steps;
      const datedText = collectText(dated.welcome.component({
        stepData: { 'profile-personal': { firstName: 'Александра' } },
        context: { onStartDailyCheckin: vi.fn(), onRefreshAccess: vi.fn() },
      })).join(' ');
      expect(datedText).toContain('Неделя начнётся');
      expect(datedText).toContain('21 августа');
      expect(datedText).toContain('можно не открывать');
      expect(datedText).toContain('Проверить доступ');
      expect(datedText).not.toContain('Начать утренний чек-ин');
    });
  });

  describe('возврат, сохранение, хром', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-16T12:00:00Z'));
    });

    it('частичный профиль открывает экран Продолжим и затем незакрытые шаги', () => {
      const utils = loadMorning({
        firstName: 'Александра',
        birthDate: '2001-01-01',
        gender: 'Женский',
        weight: 74,
        height: 168,
        weightGoal: 64,
        deficitPctTarget: -15,
        activityLevel: 'light',
        profileBodyCapturedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        profileCompleted: false,
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
      expect(plan.steps[0]).toBe('profile-resume');
      expect(plan.steps).toContain('profile-body');
      expect(plan.steps).not.toContain('profile-personal');
    });

    it('resume-компонент говорит «заново» про вес старше 3 дней', () => {
      const capturedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const { steps } = loadProfileSteps(createMockStorage({
        heys_profile: JSON.stringify({
          firstName: 'Александра',
          gender: 'Женский',
          birthDate: '2001-01-01',
          weight: 74,
          height: 168,
          profileBodyCapturedAt: capturedAt,
        }),
      }));
      const initial = steps['profile-resume'].getInitialData();
      expect(initial.continueLabel).toBe('Продолжить с шага 2');
      const text = collectText(steps['profile-resume'].component({ data: initial })).join(' ');
      expect(text).toContain('Продолжим, Александра');
      expect(text).toContain('Рост и вес — заново');
      expect(text).toContain('вес спросим заново');
    });

    it('хром регистрации — daily: Дальше в футере, сохранение и ошибка как в канвасе', () => {
      expect(MORNING_SRC).toContain("layout: 'daily'");
      expect(MORNING_SRC).not.toContain("layout: plan.mode === 'registration' ? 'default'");
      expect(STEP_MODAL_SRC).toContain('Профиль не сохранился');
      expect(STEP_MODAL_SRC).toContain('Повторить сейчас');
      expect(STEP_MODAL_SRC).toContain('Пара секунд.');
      expect(STEP_MODAL_SRC).toContain('mc-daily-footer-reason');
      expect(PROFILE_SRC).toContain("nextLabel: 'Дальше'");
      expect(PROFILE_SRC).toContain("nextLabel: 'Готово'");
    });
  });
});
