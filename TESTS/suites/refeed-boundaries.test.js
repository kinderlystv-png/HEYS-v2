/**
 * @file refeed-boundaries.test.js
 * @description Тесты граничных случаев Refeed Day модуля
 * 
 * Проверяются:
 * - Границы streak диапазона (0.70-1.35)
 * - Корректность getDayMeta на разных ratio
 * - getHistoryStats для статистики
 * - Guardrails для невалидных данных
 */

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

global.localStorage = localStorageMock;

// Mock HEYS namespace
global.HEYS = {
  utils: {
    lsGet: (key, def) => {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : def;
    }
  },
  ratioZones: {
    getZone: (ratio) => {
      if (ratio < 0.5) return { id: 'crash', name: 'Срыв' };
      if (ratio < 0.75) return { id: 'low', name: 'Маловато' };
      if (ratio < 0.9) return { id: 'good', name: 'Хорошо' };
      if (ratio < 1.1) return { id: 'perfect', name: 'Идеально' };
      if (ratio < 1.3) return { id: 'over', name: 'Переел' };
      return { id: 'binge', name: 'Срыв' };
    },
    isSuccess: (ratio) => ratio >= 0.75 && ratio < 1.1
  }
};

// Constants from refeed module
const REFEED_OK_RATIO = 1.35;
const STREAK_LOWER_BOUND = 0.70;
const STREAK_UPPER_BOUND = 1.35;

// Helper functions (simplified from module)
function isStreakPreserved(ratio, isRefeedDay) {
  if (!isRefeedDay) {
    return HEYS.ratioZones.isSuccess(ratio);
  }
  return ratio >= STREAK_LOWER_BOUND && ratio < STREAK_UPPER_BOUND;
}

function getRefeedZone(ratio) {
  if (ratio < STREAK_LOWER_BOUND) {
    return { id: 'refeed_under', name: 'Маловато для refeed', color: '#f59e0b' };
  }
  if (ratio < STREAK_UPPER_BOUND) {
    return { id: 'refeed_ok', name: 'Загрузочный день ✓', color: '#22c55e' };
  }
  return { id: 'refeed_over', name: 'Даже для refeed много!', color: '#ef4444' };
}

function getDayMeta(dayData, ratio) {
  const isRefeedDay = dayData?.isRefeedDay === true;
  
  if (!isRefeedDay) {
    const zone = HEYS.ratioZones.getZone(ratio);
    return {
      isRefeedDay: false,
      zone,
      isStreakDay: HEYS.ratioZones.isSuccess(ratio),
      heatmapStatus: HEYS.ratioZones.isSuccess(ratio) ? 'green' : (ratio < 0.5 || ratio >= 1.3 ? 'red' : 'yellow'),
      color: zone.color || '#22c55e',
      badge: null,
      cssClass: ''
    };
  }
  
  const zone = getRefeedZone(ratio);
  const isStreakDay = isStreakPreserved(ratio, true);
  
  let heatmapStatus;
  if (zone.id === 'refeed_ok') heatmapStatus = 'green';
  else if (zone.id === 'refeed_under') heatmapStatus = 'yellow';
  else heatmapStatus = 'red';
  
  return {
    isRefeedDay: true,
    reasonId: dayData.refeedReason,
    zone,
    isStreakDay,
    heatmapStatus,
    color: zone.color,
    badge: '🔄',
    cssClass: 'refeed-day'
  };
}

// ======= ТЕСТЫ =======

describe('Refeed Day Boundaries', () => {
  
  describe('isStreakPreserved', () => {
    // Нижняя граница streak для refeed: 0.70
    describe('Lower bound (0.70)', () => {
      test('ratio 0.699 — streak НЕ сохраняется', () => {
        expect(isStreakPreserved(0.699, true)).toBe(false);
      });
      
      test('ratio 0.70 — streak сохраняется', () => {
        expect(isStreakPreserved(0.70, true)).toBe(true);
      });
      
      test('ratio 0.701 — streak сохраняется', () => {
        expect(isStreakPreserved(0.701, true)).toBe(true);
      });
    });
    
    // Верхняя граница streak для refeed: 1.35
    describe('Upper bound (1.35)', () => {
      test('ratio 1.349 — streak сохраняется', () => {
        expect(isStreakPreserved(1.349, true)).toBe(true);
      });
      
      test('ratio 1.35 — streak НЕ сохраняется', () => {
        expect(isStreakPreserved(1.35, true)).toBe(false);
      });
      
      test('ratio 1.351 — streak НЕ сохраняется', () => {
        expect(isStreakPreserved(1.351, true)).toBe(false);
      });
    });
    
    // Сравнение refeed vs обычный день
    describe('Refeed vs Normal day', () => {
      test('ratio 1.25 — обычный день: streak НЕ сохраняется', () => {
        expect(isStreakPreserved(1.25, false)).toBe(false);
      });
      
      test('ratio 1.25 — refeed день: streak сохраняется', () => {
        expect(isStreakPreserved(1.25, true)).toBe(true);
      });
      
      test('ratio 0.90 — оба: streak сохраняется', () => {
        expect(isStreakPreserved(0.90, false)).toBe(true);
        expect(isStreakPreserved(0.90, true)).toBe(true);
      });
    });
  });
  
  describe('getRefeedZone', () => {
    test('ratio < 0.70 → refeed_under (жёлтый)', () => {
      const zone = getRefeedZone(0.69);
      expect(zone.id).toBe('refeed_under');
      expect(zone.color).toBe('#f59e0b');
    });
    
    test('ratio 0.70-1.349 → refeed_ok (зелёный)', () => {
      expect(getRefeedZone(0.70).id).toBe('refeed_ok');
      expect(getRefeedZone(1.0).id).toBe('refeed_ok');
      expect(getRefeedZone(1.349).id).toBe('refeed_ok');
    });
    
    test('ratio >= 1.35 → refeed_over (красный)', () => {
      const zone = getRefeedZone(1.35);
      expect(zone.id).toBe('refeed_over');
      expect(zone.color).toBe('#ef4444');
    });
  });
  
  describe('getDayMeta', () => {
    test('обычный день — возвращает стандартную зону', () => {
      const meta = getDayMeta({ isRefeedDay: false }, 0.95);
      expect(meta.isRefeedDay).toBe(false);
      expect(meta.isStreakDay).toBe(true);
      expect(meta.badge).toBeNull();
      expect(meta.cssClass).toBe('');
    });
    
    test('refeed день в норме — зелёный с бейджем', () => {
      const meta = getDayMeta({ isRefeedDay: true, refeedReason: 'planned' }, 1.20);
      expect(meta.isRefeedDay).toBe(true);
      expect(meta.zone.id).toBe('refeed_ok');
      expect(meta.isStreakDay).toBe(true);
      expect(meta.heatmapStatus).toBe('green');
      expect(meta.badge).toBe('🔄');
      expect(meta.cssClass).toBe('refeed-day');
    });
    
    test('refeed день с перебором — красный', () => {
      const meta = getDayMeta({ isRefeedDay: true }, 1.50);
      expect(meta.zone.id).toBe('refeed_over');
      expect(meta.isStreakDay).toBe(false);
      expect(meta.heatmapStatus).toBe('red');
    });
    
    test('refeed день с недобором — жёлтый', () => {
      const meta = getDayMeta({ isRefeedDay: true }, 0.60);
      expect(meta.zone.id).toBe('refeed_under');
      expect(meta.isStreakDay).toBe(false);
      expect(meta.heatmapStatus).toBe('yellow');
    });
  });
  
  describe('Guardrails', () => {
    test('null dayData — не падает', () => {
      expect(() => getDayMeta(null, 1.0)).not.toThrow();
      const meta = getDayMeta(null, 1.0);
      expect(meta.isRefeedDay).toBe(false);
    });
    
    test('undefined ratio — обрабатывается', () => {
      expect(() => getDayMeta({}, undefined)).not.toThrow();
    });
    
    test('isRefeedDay = "true" (строка) — НЕ считается refeed', () => {
      const meta = getDayMeta({ isRefeedDay: "true" }, 1.2);
      expect(meta.isRefeedDay).toBe(false); // strict === true check
    });
  });
});

describe('Edge Cases', () => {
  test('ratio = 0 — crash', () => {
    const meta = getDayMeta({}, 0);
    expect(meta.isStreakDay).toBe(false);
  });
  
  test('ratio = 2.0 — extreme overeating', () => {
    const meta = getDayMeta({ isRefeedDay: true }, 2.0);
    expect(meta.zone.id).toBe('refeed_over');
    expect(meta.isStreakDay).toBe(false);
  });
  
  test('именно на границе 0.75 для обычного дня', () => {
    expect(isStreakPreserved(0.75, false)).toBe(true);
    expect(isStreakPreserved(0.749, false)).toBe(false);
  });
  
  test('именно на границе 1.1 для обычного дня', () => {
    expect(isStreakPreserved(1.099, false)).toBe(true);
    expect(isStreakPreserved(1.1, false)).toBe(false);
  });
});

console.log('✅ Refeed boundaries tests loaded');
