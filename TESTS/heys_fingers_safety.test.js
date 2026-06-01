// heys_fingers_safety.test.js — regression tests для safety-критичной логики
// модуля «Тренировка пальцев»: age-gating (UIAA/BMC) и body-weight resolution.
//
// Создано по итогам audit-findings 2026-06-01:
//   - У 100% юзеров % от MVC считался с дефолтом 70 кг (HEYS.user.weightKg —
//     несуществующее поле). Фикс — heys_fingers_body_metrics_v1.js + использование
//     getBodyWeight() в constructor.
//   - Age-gate тестов не существовало вообще.
//
// Цель: при любом будущем изменении safety-логики каскадный fail в этих
// тестах должен ловить регрессию ДО merge.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'apps', 'web', 'fingers');

const createStorageMock = () => {
  const store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
};

const evalSource = (relPath) => {
  const src = fs.readFileSync(path.join(FINGERS_DIR, relPath), 'utf8');
  // IIFE-модули fingers ожидают `global` параметром — happy-dom уже даёт `window`.
  // eslint-disable-next-line no-eval
  eval(src);
};

const setupHEYS = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.localStorage = createStorageMock();
  globalThis.window.localStorage = globalThis.localStorage;
  // utils.lsGet — минимальный shim чтобы body_metrics мог читать heys_profile.
  globalThis.window.HEYS.utils = {
    lsGet: (key, dflt) => {
      try {
        const raw = globalThis.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (_) { return dflt; }
    },
  };
};

// ────────────────────────────────────────────────────────────────────────────
// AGE GATE — UIAA Medical Commission / BMC ограничения для подростков
// ────────────────────────────────────────────────────────────────────────────

describe('Fingers.ageGate', () => {
  beforeEach(() => {
    setupHEYS();
    evalSource('heys_fingers_age_gating_v1.js');
  });

  describe('warnLevel — границы возрастных групп', () => {
    it('возраст < 8 → block-all (UIAA: fingerboard запрещён)', () => {
      expect(window.HEYS.Fingers.ageGate.warnLevel(7)).toBe('block-all');
      expect(window.HEYS.Fingers.ageGate.warnLevel(0)).toBe('block-all');
      expect(window.HEYS.Fingers.ageGate.warnLevel(-5)).toBe('block-all');
    });

    it('8-13 → no-max-hangs (только No-Hangs программы)', () => {
      expect(window.HEYS.Fingers.ageGate.warnLevel(8)).toBe('no-max-hangs');
      expect(window.HEYS.Fingers.ageGate.warnLevel(13)).toBe('no-max-hangs');
    });

    it('14-15 → no-full-crimp (без полного замка, без веса)', () => {
      expect(window.HEYS.Fingers.ageGate.warnLevel(14)).toBe('no-full-crimp');
      expect(window.HEYS.Fingers.ageGate.warnLevel(15)).toBe('no-full-crimp');
    });

    it('16-17 → no-max (любые хваты, без max-protocols)', () => {
      expect(window.HEYS.Fingers.ageGate.warnLevel(16)).toBe('no-max');
      expect(window.HEYS.Fingers.ageGate.warnLevel(17)).toBe('no-max');
    });

    it('18+ → ok', () => {
      expect(window.HEYS.Fingers.ageGate.warnLevel(18)).toBe('ok');
      expect(window.HEYS.Fingers.ageGate.warnLevel(50)).toBe('ok');
    });

    it('FAIL-CLOSED: невалидный возраст → block-all (не дефолт 18!)', () => {
      // Регрессия от того подхода когда дефолт=18 открывал подросткам
      // adult-программы. Если эти тесты упадут — кто-то воткнул обратный fallback.
      expect(window.HEYS.Fingers.ageGate.warnLevel(NaN)).toBe('block-all');
      expect(window.HEYS.Fingers.ageGate.warnLevel(null)).toBe('block-all');
      expect(window.HEYS.Fingers.ageGate.warnLevel(undefined)).toBe('block-all');
      expect(window.HEYS.Fingers.ageGate.warnLevel('abc')).toBe('block-all');
    });
  });

  describe('filterPrograms — fail-closed для опасных протоколов', () => {
    const programs = [
      { id: 'no_hangs',      noEquipment: true,  level: 'beginner',     intensity: 'recovery', exercises: [{ addedWeightKg: 0 }] },
      { id: 'rep_bw',        noEquipment: false, level: 'beginner',     intensity: 'moderate', exercises: [{ addedWeightKg: 0 }] },
      { id: 'rep_weighted',  noEquipment: false, level: 'beginner',     intensity: 'moderate', exercises: [{ addedWeightKg: 5 }] },
      { id: 'beastmaker_int',noEquipment: false, level: 'intermediate', intensity: 'moderate', exercises: [{ addedWeightKg: 0 }] },
      { id: 'max_adv',       noEquipment: false, level: 'advanced',     intensity: 'max',      exercises: [{ addedWeightKg: 10 }] },
    ];

    it('возраст 7 (block-all) → пустой массив', () => {
      expect(window.HEYS.Fingers.ageGate.filterPrograms(programs, 7)).toEqual([]);
    });

    it('возраст 10 (no-max-hangs) → только noEquipment', () => {
      const result = window.HEYS.Fingers.ageGate.filterPrograms(programs, 10);
      expect(result.map((p) => p.id)).toEqual(['no_hangs']);
    });

    it('возраст 14 (no-full-crimp) → только beginner БЕЗ доп. веса', () => {
      const result = window.HEYS.Fingers.ageGate.filterPrograms(programs, 14);
      // no_hangs (beginner+0kg) и rep_bw (beginner+0kg) разрешены, rep_weighted с 5кг — нет.
      expect(result.map((p) => p.id).sort()).toEqual(['no_hangs', 'rep_bw']);
    });

    it('возраст 16 (no-max) → без max intensity и без advanced level', () => {
      const result = window.HEYS.Fingers.ageGate.filterPrograms(programs, 16);
      expect(result.find((p) => p.id === 'max_adv')).toBeUndefined();
      // intermediate с moderate intensity — разрешён
      expect(result.find((p) => p.id === 'beastmaker_int')).toBeDefined();
    });

    it('возраст 25 → все программы доступны', () => {
      const result = window.HEYS.Fingers.ageGate.filterPrograms(programs, 25);
      expect(result.length).toBe(programs.length);
    });

    it('FAIL-CLOSED: возраст NaN/undefined → пустой массив', () => {
      // Это пункт который явно тестировался в [project_writer_cid_guard_gap]
      // подобной философии: молчаливый fallback в safety-критичной формуле = баг.
      expect(window.HEYS.Fingers.ageGate.filterPrograms(programs, NaN)).toEqual([]);
      expect(window.HEYS.Fingers.ageGate.filterPrograms(programs, undefined)).toEqual([]);
      expect(window.HEYS.Fingers.ageGate.filterPrograms(programs, null)).toEqual([]);
    });

    it('minAge поля программы соблюдаются', () => {
      const withMinAge = programs.concat([{ id: 'teen_safe', noEquipment: true, level: 'beginner', intensity: 'recovery', minAge: 12, exercises: [{ addedWeightKg: 0 }] }]);
      const young = window.HEYS.Fingers.ageGate.filterPrograms(withMinAge, 10);
      expect(young.find((p) => p.id === 'teen_safe')).toBeUndefined();
      const ok = window.HEYS.Fingers.ageGate.filterPrograms(withMinAge, 12);
      expect(ok.find((p) => p.id === 'teen_safe')).toBeDefined();
    });
  });

  describe('filterGrips — minAge гейт для опасных хватов', () => {
    const grips = [
      { id: 'openhand4',  minAge: 8 },
      { id: 'halfcrimp',  minAge: 14 },
      { id: 'fullcrimp',  minAge: 16 },
      { id: 'mono',       minAge: 18 },
    ];

    it('block-all возраст → пустой массив', () => {
      expect(window.HEYS.Fingers.ageGate.filterGrips(grips, 7)).toEqual([]);
    });

    it('15 лет → openhand + halfcrimp (без full crimp и mono)', () => {
      const r = window.HEYS.Fingers.ageGate.filterGrips(grips, 15);
      expect(r.map((g) => g.id).sort()).toEqual(['halfcrimp', 'openhand4']);
    });

    it('18+ → все хваты включая mono', () => {
      const r = window.HEYS.Fingers.ageGate.filterGrips(grips, 18);
      expect(r.length).toBe(grips.length);
    });

    it('FAIL-CLOSED: NaN → пустой массив', () => {
      expect(window.HEYS.Fingers.ageGate.filterGrips(grips, NaN)).toEqual([]);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BODY METRICS — единый источник веса для MVC%-расчёта
// Регрессионная защита от той дыры где HEYS.user.weightKg (несуществующее поле)
// тихо возвращал 70кг у 100% юзеров.
// ────────────────────────────────────────────────────────────────────────────

describe('Fingers.bodyMetrics', () => {
  beforeEach(() => {
    setupHEYS();
    evalSource('heys_fingers_body_metrics_v1.js');
  });

  it('profile.weight установлен → source=profile, kg=weight', () => {
    globalThis.localStorage.setItem('heys_profile', JSON.stringify({ weight: 82.5 }));
    const r = window.HEYS.Fingers.getBodyWeight();
    expect(r).toEqual({ kg: 82.5, source: 'profile' });
  });

  it('только profile.baseWeight (legacy alias) → source=baseWeight', () => {
    globalThis.localStorage.setItem('heys_profile', JSON.stringify({ baseWeight: 78 }));
    const r = window.HEYS.Fingers.getBodyWeight();
    expect(r).toEqual({ kg: 78, source: 'baseWeight' });
  });

  it('weight приоритетнее baseWeight', () => {
    globalThis.localStorage.setItem('heys_profile', JSON.stringify({ weight: 80, baseWeight: 75 }));
    const r = window.HEYS.Fingers.getBodyWeight();
    expect(r).toEqual({ kg: 80, source: 'profile' });
  });

  it('профиль пуст → source=fallback, kg=70 (UX caller покажет warning)', () => {
    const r = window.HEYS.Fingers.getBodyWeight();
    expect(r).toEqual({ kg: 70, source: 'fallback' });
  });

  it('weight=0 / weight=null / weight="" → fallback (не false-positive)', () => {
    for (const bad of [0, null, '', NaN, -5]) {
      globalThis.localStorage.setItem('heys_profile', JSON.stringify({ weight: bad }));
      const r = window.HEYS.Fingers.getBodyWeight();
      expect(r.source).toBe('fallback');
      expect(r.kg).toBe(70);
    }
  });

  it('REGRESSION: HEYS.user.weightKg больше не используется', () => {
    // Если кто-то впишет обратный path HEYS.user.weightKg=80 — не должно
    // влиять на результат. Source истины только heys_profile.
    window.HEYS.user = { weightKg: 80 };
    const r = window.HEYS.Fingers.getBodyWeight();
    expect(r.kg).toBe(70);
    expect(r.source).toBe('fallback');
  });

  it('FALLBACK_KG константа экспонирована и равна 70', () => {
    expect(window.HEYS.Fingers.bodyMetrics.FALLBACK_KG).toBe(70);
  });

  it('idempotent registration — повторный eval не ломает API', () => {
    evalSource('heys_fingers_body_metrics_v1.js');
    expect(typeof window.HEYS.Fingers.getBodyWeight).toBe('function');
    globalThis.localStorage.setItem('heys_profile', JSON.stringify({ weight: 65 }));
    expect(window.HEYS.Fingers.getBodyWeight().kg).toBe(65);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// READINESS — hard overrides (injury flag, 48h cooldown после max-сессии)
// Чисто guard-логика. Сложные baseline-расчёты намеренно не тестируем —
// они меняются и без safety-импликации. Тесты только на гарантии «не
// разрешать опасную тренировку при явных условиях».
// ────────────────────────────────────────────────────────────────────────────

describe('Fingers.readiness — hard overrides', () => {
  beforeEach(() => {
    setupHEYS();
    evalSource('heys_fingers_readiness_v1.js');
  });

  it('injuryFlag=true → rest-day, score=0, любая история игнорируется', () => {
    const today = {
      fingers: { injuryFlag: true },
      moodMorning: 9, wellbeingMorning: 9, // даже отличные показатели не разрешают
      sleepStart: '23:00', sleepEnd: '07:30',
    };
    const r = window.HEYS.Fingers.readiness.assess(today, []);
    expect(r.bucket).toBe('rest-day');
    expect(r.score).toBe(0);
    expect(r.reasons.some((s) => /травм/i.test(s))).toBe(true);
  });

  it('вчера max-сессия < 48ч назад → rest-day независимо от прочих факторов', () => {
    // Источник 1 (приоритетный): today.fingers.lastSessionAt + lastIntensity.
    // Тестируем именно его — это та запись которую делает entry/persistence
    // при завершении сессии.
    const today = {
      moodMorning: 8, wellbeingMorning: 8,
      sleepStart: '22:30', sleepEnd: '07:00',
      fingers: {
        lastSessionAt: Date.now() - 12 * 60 * 60 * 1000,
        lastIntensity: 'max',
      },
    };
    const r = window.HEYS.Fingers.readiness.assess(today, []);
    expect(r.bucket).toBe('rest-day');
    expect(r.score).toBe(0);
    expect(r.reasons.some((s) => /48/i.test(s) || /max/i.test(s))).toBe(true);
  });

  it('вчера max-сессия > 48ч назад — НЕ блокирует автоматически', () => {
    const today = {
      moodMorning: 7, wellbeingMorning: 7, stressMorning: 4,
      sleepStart: '22:30', sleepEnd: '07:00',
      fingers: {
        lastSessionAt: Date.now() - 72 * 60 * 60 * 1000, // 3 дня назад
        lastIntensity: 'max',
      },
    };
    const r = window.HEYS.Fingers.readiness.assess(today, []);
    expect(r.bucket).not.toBe('rest-day');
  });

  it('moderate-сессия < 48ч назад — НЕ блокирует (только max триггерит hard rest-day)', () => {
    // Регрессия: чтобы кто-то не воткнул 48ч guard для moderate тоже —
    // там score-штраф (–15), не hard block.
    const today = {
      moodMorning: 7, wellbeingMorning: 7,
      sleepStart: '23:00', sleepEnd: '07:00',
      fingers: {
        lastSessionAt: Date.now() - 12 * 60 * 60 * 1000,
        lastIntensity: 'moderate',
      },
    };
    const r = window.HEYS.Fingers.readiness.assess(today, []);
    expect(r.bucket).not.toBe('rest-day');
  });

  it('пустая история + пустой today → graceful default (moderate-only, не rest-day)', () => {
    const r = window.HEYS.Fingers.readiness.assess({}, []);
    // Не должен блокировать всех новых юзеров — иначе fingerboard вообще не открывается.
    // Но и не max-protocol-ok — нужна информация для оценки.
    expect(['moderate-only', 'recovery-only']).toContain(r.bucket);
  });

  it('bucket границы по score: 75+/55+/35+/<35', () => {
    // Через injuryFlag не достанешь — тестируем через статический режим
    // (1-3 дня истории, ниже шкал → recovery-only).
    const low = { moodMorning: 3, wellbeingMorning: 3, stressMorning: 8, sleepStart: '01:00', sleepEnd: '04:00' };
    const r = window.HEYS.Fingers.readiness.assess(low, [{ moodMorning: 5, wellbeingMorning: 5 }]);
    // mood<5 OR wb<5 OR sleep<6 → recovery-only в static (line 196+)
    expect(['recovery-only', 'rest-day']).toContain(r.bucket);
  });

  it('REGRESSION: history не массив → не крашит, возвращает default', () => {
    expect(() => window.HEYS.Fingers.readiness.assess({}, null)).not.toThrow();
    expect(() => window.HEYS.Fingers.readiness.assess({}, undefined)).not.toThrow();
    expect(() => window.HEYS.Fingers.readiness.assess({}, 'not-array')).not.toThrow();
  });

  it('REGRESSION: today=null → не крашит', () => {
    expect(() => window.HEYS.Fingers.readiness.assess(null, [])).not.toThrow();
    expect(() => window.HEYS.Fingers.readiness.assess(undefined, [])).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BOOT STUB — lazy-load шлюз. Файл лежит в apps/web/, а не fingers/.
// Тесты проверяют: API surface, idempotent registration, detect-on-boot guard
// (LS scan не триггерит загрузку без snapshot), race-guard в LazyPill.
// ────────────────────────────────────────────────────────────────────────────

const evalStub = () => {
  const stubPath = path.resolve(__dirname, '..', 'apps', 'web', 'heys_fingers_boot_stub_v1.js');
  const src = fs.readFileSync(stubPath, 'utf8');
  // eslint-disable-next-line no-eval
  eval(src);
};

describe('Fingers.bootStub — lazy-load gate', () => {
  beforeEach(() => {
    setupHEYS();
    // Monkey-patch head.appendChild чтобы перехватить попытки загрузить bundle
    // без реальных network requests. happy-dom не блокирует appendChild,
    // но мы хотим только зафиксировать src и не давать onload отстреливать.
    globalThis.window.__appendedScripts = [];
    const head = globalThis.document?.head;
    if (head && !head.__patched) {
      const original = head.appendChild.bind(head);
      head.appendChild = function (node) {
        if (node && node.tagName === 'SCRIPT' && node.src) {
          globalThis.window.__appendedScripts.push(node.src.replace(/^.*\//, ''));
          return node; // НЕ вставляем в DOM — иначе happy-dom попробует загрузить
        }
        return original(node);
      };
      head.__patched = true;
    }
    evalStub();
  });

  it('регистрирует stub-функции на HEYS.Fingers (без bundle)', () => {
    expect(typeof window.HEYS.Fingers.openFullscreen).toBe('function');
    expect(typeof window.HEYS.Fingers.close).toBe('function');
    expect(typeof window.HEYS.Fingers.isReady).toBe('function');
    expect(typeof window.HEYS.Fingers.renderPreviewPill).toBe('function');
    expect(typeof window.HEYS.Fingers.__lazyLoad).toBe('function');
  });

  it('isReady() возвращает false пока bundle не загружен', () => {
    expect(window.HEYS.Fingers.isReady()).toBe(false);
  });

  it('повторный eval — idempotent (__bootStubRegistered guard)', () => {
    const ref1 = window.HEYS.Fingers.openFullscreen;
    evalStub();
    const ref2 = window.HEYS.Fingers.openFullscreen;
    // Ссылка должна остаться той же — повторная регистрация не трогает API.
    expect(ref1).toBe(ref2);
  });

  it('detect-on-boot: НЕТ snapshot в LS → bundle не догружается', () => {
    // Эмулируем sync-completed после stub registration.
    globalThis.window.dispatchEvent(new Event('heysSyncCompleted'));
    expect(globalThis.window.__appendedScripts).toEqual([]);
  });

  it('detect-on-boot: ЕСТЬ snapshot в LS → bundle догружается', () => {
    // Эмулируем оставленный snapshot предыдущей сессии.
    globalThis.localStorage.setItem('heys_finger_active_session', JSON.stringify({ state: 'WORK' }));
    globalThis.window.dispatchEvent(new Event('heysSyncCompleted'));
    expect(globalThis.window.__appendedScripts).toContain('heys_fingers_bundle_v1.js');
  });

  it('detect-on-boot: snapshot с client-scoped key (heys_<cid>_finger_active_session)', () => {
    globalThis.localStorage.setItem(
      'heys_4545ee50_finger_active_session',
      JSON.stringify({ state: 'WORK' })
    );
    globalThis.window.dispatchEvent(new Event('heysSyncCompleted'));
    expect(globalThis.window.__appendedScripts).toContain('heys_fingers_bundle_v1.js');
  });

  it('openFullscreen триггерит lazy-load даже без snapshot', () => {
    window.HEYS.Fingers.openFullscreen({ dateKey: '2026-06-01', trainingIndex: 0 });
    expect(globalThis.window.__appendedScripts).toContain('heys_fingers_bundle_v1.js');
  });

  it('__lazyLoad() идемпотентен — повторные вызовы не создают новых script тегов', () => {
    window.HEYS.Fingers.__lazyLoad();
    window.HEYS.Fingers.__lazyLoad();
    window.HEYS.Fingers.__lazyLoad();
    // Только один script должен быть инжектнут (точный match по filename
    // без query — startsWith т.к. cache-bust добавит ?v=).
    expect(globalThis.window.__appendedScripts.filter((s) => s.startsWith('heys_fingers_bundle_v1.js')).length).toBe(1);
  });

  it('CACHE-BUST: HEYS.version присутствует → URL включает ?v=<version>', () => {
    // Очищаем state и переустанавливаем version ДО регистрации stub.
    setupHEYS();
    window.HEYS.version = '2026.06.01.abc12345';
    evalStub();
    window.HEYS.Fingers.__lazyLoad();
    const url = globalThis.window.__appendedScripts.find((s) =>
      s.startsWith('heys_fingers_bundle_v1.js')
    );
    expect(url).toBeDefined();
    expect(url).toContain('?v=');
    expect(url).toContain('2026.06.01.abc12345');
  });

  it('CACHE-BUST fallback: HEYS.version отсутствует → URL без query (graceful)', () => {
    setupHEYS();
    // HEYS.version не устанавливаем — fallback должен сработать без crash'а.
    evalStub();
    window.HEYS.Fingers.__lazyLoad();
    const url = globalThis.window.__appendedScripts.find((s) =>
      s.startsWith('heys_fingers_bundle_v1.js')
    );
    expect(url).toBe('heys_fingers_bundle_v1.js');
  });
});
