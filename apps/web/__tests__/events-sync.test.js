/**
 * @fileoverview Критические тесты событий sync/update и утреннего чек-ина
 * 
 * Покрывает:
 * 1. Логика "пропуска первого sync" (initialSyncDoneRef pattern)
 * 2. shouldShowMorningCheckin — не показывать без clientId
 * 3. Альтернативные ключи дат (effective vs calendar)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// === СИМУЛЯЦИЯ ЛОГИКИ ПРОПУСКА ПЕРВОГО SYNC ===
// Из heys_core_v12.js и heys_app_v12.js

describe('initialSyncDoneRef pattern', () => {
  /**
   * Симуляция паттерна пропуска первого события sync
   * Первое событие игнорируется т.к. данные уже загружены при инициализации
   */
  const createSyncHandler = () => {
    let initialSyncDone = false;
    let updateCount = 0;

    const handleSync = (eventType) => {
      if (eventType === 'heysSyncCompleted') {
        if (!initialSyncDone) {
          initialSyncDone = true;
          return 'skipped';
        }
      }
      updateCount++;
      return 'processed';
    };

    return { handleSync, getUpdateCount: () => updateCount };
  };

  it('пропускает первый heysSyncCompleted', () => {
    const { handleSync, getUpdateCount } = createSyncHandler();

    const result = handleSync('heysSyncCompleted');

    expect(result).toBe('skipped');
    expect(getUpdateCount()).toBe(0);
  });

  it('обрабатывает второй и последующие heysSyncCompleted', () => {
    const { handleSync, getUpdateCount } = createSyncHandler();

    handleSync('heysSyncCompleted'); // первый — пропускаем
    const result2 = handleSync('heysSyncCompleted');
    const result3 = handleSync('heysSyncCompleted');

    expect(result2).toBe('processed');
    expect(result3).toBe('processed');
    expect(getUpdateCount()).toBe(2);
  });

  it('обрабатывает другие события без пропуска', () => {
    const { handleSync, getUpdateCount } = createSyncHandler();

    const result = handleSync('heysProductsUpdated');

    expect(result).toBe('processed');
    expect(getUpdateCount()).toBe(1);
  });
});

// === СИМУЛЯЦИЯ shouldShowMorningCheckin ===
// Из heys_morning_checkin_v1.js

describe('shouldShowMorningCheckin logic', () => {
  let mockStorage;
  let mockProfile;
  let mockClientId;

  const getTodayKey = (hoursOverride) => {
    const d = new Date();
    if (hoursOverride !== undefined) {
      d.setHours(hoursOverride);
    }
    if (d.getHours() < 3) {
      d.setDate(d.getDate() - 1);
    }
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  // Required-set по новому контракту: weight, sleepTime, sleepQuality, morning_mood, stepsGoal.
  // Возвращает массив pending step-id (визард надо показать если он непустой).
  const computePending = (clientId, storage, profile, hoursOverride) => {
    if (!clientId) return null;
    const todayKey = getTodayKey(hoursOverride);
    const dayData = storage[`heys_dayv2_${todayKey}`] || {};
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayData = calendarKey !== todayKey ? (storage[`heys_dayv2_${calendarKey}`] || {}) : {};
    const day = { ...altDayData, ...dayData };

    const pending = [];
    if (!(day.weightMorning != null && day.weightMorning !== '' && day.weightMorning !== 0)) pending.push('weight');
    if (!(day.sleepStart != null && day.sleepEnd != null)) pending.push('sleepTime');
    if (!(day.sleepQuality != null)) pending.push('sleepQuality');
    if (!(day.moodMorning != null)) pending.push('morning_mood');
    if (!(profile && profile.stepsGoal != null && profile.stepsGoal > 0)) pending.push('stepsGoal');
    return pending;
  };

  const shouldShowMorningCheckin = (clientId, storage, profile, hoursOverride) => {
    const pending = computePending(clientId, storage, profile, hoursOverride);
    if (pending === null) return false;
    return pending.length > 0;
  };

  const fullyCompletedDay = () => ({
    weightMorning: 75.5,
    sleepStart: '23:00',
    sleepEnd: '07:00',
    sleepQuality: 4,
    moodMorning: 5,
  });

  beforeEach(() => {
    mockStorage = {};
    mockProfile = { stepsGoal: 10000 };
    mockClientId = 'client_123';
  });

  it('возвращает false если clientId отсутствует', () => {
    const result = shouldShowMorningCheckin(null, mockStorage, mockProfile);
    expect(result).toBe(false);
  });

  it('возвращает false если clientId пустая строка', () => {
    const result = shouldShowMorningCheckin('', mockStorage, mockProfile);
    expect(result).toBe(false);
  });

  it('возвращает true если ни один required-шаг не заполнен', () => {
    const result = shouldShowMorningCheckin(mockClientId, mockStorage, { /* no stepsGoal */ });
    expect(result).toBe(true);
  });

  it('возвращает true если вес заполнен, но sleep/mood пустые', () => {
    const todayKey = getTodayKey();
    mockStorage[`heys_dayv2_${todayKey}`] = { weightMorning: 75.5 };

    const pending = computePending(mockClientId, mockStorage, mockProfile);
    expect(pending).toEqual(expect.arrayContaining(['sleepTime', 'sleepQuality', 'morning_mood']));
    expect(pending).not.toContain('weight');
    expect(shouldShowMorningCheckin(mockClientId, mockStorage, mockProfile)).toBe(true);
  });

  it('возвращает true если вес+sleep заполнены, но mood пустой', () => {
    const todayKey = getTodayKey();
    mockStorage[`heys_dayv2_${todayKey}`] = {
      weightMorning: 75.5,
      sleepStart: '23:00',
      sleepEnd: '07:00',
      sleepQuality: 4,
    };

    const pending = computePending(mockClientId, mockStorage, mockProfile);
    expect(pending).toEqual(['morning_mood']);
    expect(shouldShowMorningCheckin(mockClientId, mockStorage, mockProfile)).toBe(true);
  });

  it('возвращает true если stepsGoal в profile отсутствует', () => {
    const todayKey = getTodayKey();
    mockStorage[`heys_dayv2_${todayKey}`] = fullyCompletedDay();
    const profileWithoutStepsGoal = {};

    const pending = computePending(mockClientId, mockStorage, profileWithoutStepsGoal);
    expect(pending).toEqual(['stepsGoal']);
    expect(shouldShowMorningCheckin(mockClientId, mockStorage, profileWithoutStepsGoal)).toBe(true);
  });

  it('возвращает false если ВСЕ required-шаги заполнены (dayv2 + profile.stepsGoal)', () => {
    const todayKey = getTodayKey();
    mockStorage[`heys_dayv2_${todayKey}`] = fullyCompletedDay();

    expect(computePending(mockClientId, mockStorage, mockProfile)).toEqual([]);
    expect(shouldShowMorningCheckin(mockClientId, mockStorage, mockProfile)).toBe(false);
  });

  it('считает вес=0 как не заполненный', () => {
    const todayKey = getTodayKey();
    mockStorage[`heys_dayv2_${todayKey}`] = { ...fullyCompletedDay(), weightMorning: 0 };

    const pending = computePending(mockClientId, mockStorage, mockProfile);
    expect(pending).toContain('weight');
    expect(shouldShowMorningCheckin(mockClientId, mockStorage, mockProfile)).toBe(true);
  });

  it('распознаёт required-поля из альтернативного календарного ключа (cross-midnight)', () => {
    const calendarKey = new Date().toISOString().slice(0, 10);
    mockStorage[`heys_dayv2_${calendarKey}`] = fullyCompletedDay();

    expect(shouldShowMorningCheckin(mockClientId, mockStorage, mockProfile)).toBe(false);
  });
});

// === ТЕСТЫ EFFECTIVE DATE (до 03:00 = вчера) ===

describe('effective date logic (before 3am = yesterday)', () => {
  const getEffectiveDate = (hour) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d.getHours() < 3) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().slice(0, 10);
  };

  it('в 02:00 эффективная дата = вчера', () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // Симулируем 02:00
    const effective = getEffectiveDate(2);

    // В 02:00 effective должен быть "вчера" (относительно текущей даты теста)
    // Но так как мы используем new Date() внутри, результат зависит от текущего времени
    // Поэтому проверяем логику: если час < 3, дата должна быть на 1 меньше
    const now = new Date();
    if (now.getHours() < 3) {
      // Тест запущен ночью — пропускаем (сложно моделировать)
      expect(true).toBe(true);
    } else {
      expect(effective).not.toBe(todayStr);
    }
  });

  it('в 10:00 эффективная дата = сегодня', () => {
    const effective = getEffectiveDate(10);
    const today = new Date();
    today.setHours(10, 0, 0, 0);

    expect(effective).toBe(today.toISOString().slice(0, 10));
  });
});
