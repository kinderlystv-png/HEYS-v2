import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Шаг 1 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md: справочник
// упражнений — фундамент тоннажа и вида карточки подхода. Тест держит три
// инварианта, которые молча ломают арифметику: разметка каталога валидна,
// коэффициент своего веса не протекает на штангу, а снимок для журнала
// отвязан от справочника.

const CATALOG_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_exercise_catalog_v1.js'), 'utf8');

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalLocalStorage = global.localStorage;

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    __store: store,
  };
}

/** @param {{ withUtils?: boolean }} [opts] */
function loadCatalog(opts = {}) {
  global.window = global;
  global.localStorage = fakeLocalStorage();
  const scoped = new Map();
  global.HEYS = opts.withUtils
    ? {
      utils: {
        // Упрощённый client-scope: важно, что модуль ходит через utils, а не
        // мимо них — иначе свои упражнения не уедут в облако.
        lsGet: (k, d) => (scoped.has('heys_CID_' + k) ? scoped.get('heys_CID_' + k) : d),
        lsSet: (k, v) => { scoped.set('heys_CID_' + k, v); },
      },
    }
    : {};
  // eslint-disable-next-line no-new-func
  new Function(CATALOG_SRC)();
  return { meta: global.HEYS.exerciseMeta, catalog: global.HEYS.exerciseCatalog, scoped };
}

afterEach(() => {
  global.HEYS = originalHEYS;
  global.window = originalWindow;
  global.localStorage = originalLocalStorage;
});

describe('справочник упражнений: разметка каталога', () => {
  let meta;
  let catalog;

  beforeEach(() => {
    const loaded = loadCatalog();
    meta = loaded.meta;
    catalog = loaded.catalog;
  });

  it('у каждого упражнения есть основная группа и единица измерения', () => {
    const broken = catalog.filter((c) => !meta.validate(c).ok);
    expect(broken.map((c) => c.name)).toEqual([]);
  });

  it('«Всё тело» не является группой мышц', () => {
    const labels = meta.groups.map((g) => g.label.toLowerCase());
    expect(labels).not.toContain('всё тело');
    expect(labels).not.toContain('все тело');
  });

  it('названия каталога не повторяются: резолв идёт по имени', () => {
    const norms = catalog.map((c) => c.name.trim().toLowerCase().replace(/ё/g, 'е'));
    expect(new Set(norms).size).toBe(norms.length);
  });

  it('коэффициент своего веса стоит только у упражнений со своим весом', () => {
    const leaked = catalog.filter((c) => c.bodyweightFactor !== null && c.unit !== 'bodyweight');
    expect(leaked.map((c) => c.name)).toEqual([]);
  });

  it('известные коэффициенты совпадают с опорными значениями макета', () => {
    expect(meta.get('Подтягивания').bodyweightFactor).toBe(1.0);
    expect(meta.get('Отжимания на брусьях').bodyweightFactor).toBe(0.95);
    expect(meta.get('Отжимания от пола').bodyweightFactor).toBe(0.64);
    expect(meta.get('Обратные отжимания от скамьи').bodyweightFactor).toBe(0.4);
  });

  it('неизвестный коэффициент остаётся null — дефолт не выдумываем', () => {
    expect(meta.get('Бурпи').bodyweightFactor).toBeNull();
  });

  it('время и метры в тоннаж не идут', () => {
    expect(meta.countsAsTonnage('time')).toBe(false);
    expect(meta.countsAsTonnage('distance')).toBe(false);
    expect(meta.countsAsTonnage('weight_reps')).toBe(true);
    expect(meta.countsAsTonnage('bodyweight')).toBe(true);
  });
});

describe('справочник упражнений: чтение и запись', () => {
  it('имя резолвится без учёта регистра и «ё»', () => {
    const { meta } = loadCatalog();
    const m = meta.get('  жим штанги лежа  ');
    expect(m).not.toBeNull();
    expect(m.primaryGroup).toBe('chest');
    expect(m.source).toBe('catalog');
  });

  it('неизвестное упражнение не получает выдуманных полей', () => {
    const { meta } = loadCatalog();
    expect(meta.get('Прогулка фермера с чайниками')).toBeNull();
  });

  it('своя запись клиента переопределяет каталожную', () => {
    const { meta } = loadCatalog({ withUtils: true });
    const saved = meta.save('Подтягивания', {
      primaryGroup: 'back',
      secondaryGroups: ['biceps'],
      unit: 'bodyweight',
      bodyweightFactor: 0.9,
    });
    expect(saved.ok).toBe(true);
    const m = meta.get('подтягивания');
    expect(m.source).toBe('custom');
    expect(m.bodyweightFactor).toBe(0.9);
    expect(meta.remove('Подтягивания')).toBe(true);
    expect(meta.get('Подтягивания').bodyweightFactor).toBe(1.0);
  });

  it('свои упражнения пишутся client-scoped, а не мимо utils', () => {
    const { meta, scoped } = loadCatalog({ withUtils: true });
    meta.save('Прогулка фермера', {
      primaryGroup: 'forearms',
      secondaryGroups: ['traps'],
      unit: 'distance',
    });
    expect([...scoped.keys()]).toEqual(['heys_CID_heys_exercise_meta_v1']);
  });

  it('неполная запись не сохраняется', () => {
    const { meta } = loadCatalog({ withUtils: true });
    const res = meta.save('Своё упражнение', { primaryGroup: '', unit: '' });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBe(2);
    expect(meta.get('Своё упражнение')).toBeNull();
  });

  it('неизвестная группа и единица отклоняются', () => {
    const { meta } = loadCatalog();
    const res = meta.validate({ primaryGroup: 'whole_body', secondaryGroups: ['ears'], unit: 'километры' });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBe(3);
  });

  it('коэффициент у не-bodyweight единицы обнуляется, а не удваивает тоннаж', () => {
    const { meta } = loadCatalog();
    const res = meta.validate({
      primaryGroup: 'chest',
      secondaryGroups: [],
      unit: 'weight_reps',
      bodyweightFactor: 1.0,
    });
    expect(res.ok).toBe(true);
    expect(res.meta.bodyweightFactor).toBeNull();
  });

  it('коэффициент вне диапазона 0…2 отклоняется', () => {
    const { meta } = loadCatalog();
    expect(meta.validate({ primaryGroup: 'back', unit: 'bodyweight', bodyweightFactor: 3 }).ok).toBe(false);
    expect(meta.validate({ primaryGroup: 'back', unit: 'bodyweight', bodyweightFactor: 0 }).ok).toBe(false);
  });

  it('основная группа не дублируется в дополнительных', () => {
    const { meta } = loadCatalog();
    const res = meta.validate({ primaryGroup: 'back', secondaryGroups: ['back', 'biceps', 'biceps'], unit: 'weight_reps' });
    expect(res.meta.secondaryGroups).toEqual(['biceps']);
  });
});

describe('справочник упражнений: коэффициент по аналогии', () => {
  it('опоры — только упражнения с известным коэффициентом, по убыванию', () => {
    const { meta } = loadCatalog();
    const refs = meta.bodyweightReferences();
    expect(refs.length).toBeGreaterThan(3);
    expect(refs.every((r) => r.bodyweightFactor > 0)).toBe(true);
    expect(refs[0].bodyweightFactor).toBe(1.0);
    expect(refs[refs.length - 1].bodyweightFactor).toBe(0.4);
    const factors = refs.map((r) => r.bodyweightFactor);
    expect(factors).toEqual([...factors].sort((a, b) => b - a));
  });

  it('канонический экран «на что похоже» — пять образцов и «Не знаю»', () => {
    const { meta } = loadCatalog();
    const opts = meta.bodyweightSimilarOptions();
    expect(opts).toHaveLength(5);
    expect(opts[0]).toMatchObject({ label: 'Как подтягивания', bodyweightFactor: 1.0 });
    expect(opts.find((o) => o.key === 'unknown')).toMatchObject({
      label: 'Не знаю',
      bodyweightFactor: null,
      isUnknown: true,
    });
  });

  it('превью объёма по группам делит тоннаж с долей синергиста', () => {
    const { meta } = loadCatalog();
    const rows = meta.muscleVolumePreviewRows(2980, 'chest', ['triceps', 'shoulders']);
    expect(rows.find((r) => r.groupId === 'chest')).toMatchObject({ kg: 2980, isPrimary: true });
    expect(rows.find((r) => r.groupId === 'triceps')).toMatchObject({ kg: 1490, isPrimary: false });
    expect(meta.formatVolumeKg(2980)).toBe('2\u202F980 кг');
    expect(meta.formatBodyweightFactor(1)).toBe('1,0');
  });
});

describe('справочник упражнений: снимок и объём по группам', () => {
  it('снимок не связан ссылкой со справочником', () => {
    const { meta } = loadCatalog();
    const snap = meta.snapshot('Жим штанги лёжа');
    snap.secondaryGroups.push('abs');
    expect(meta.get('Жим штанги лёжа').secondaryGroups).toEqual(['triceps', 'shoulders']);
  });

  it('синергисты берут долю, а не полный вес упражнения', () => {
    const { meta } = loadCatalog();
    const w = meta.groupWeights(meta.get('Жим штанги лёжа'));
    expect(w).toEqual({ chest: 1, triceps: 0.5, shoulders: 0.5 });
  });

  it('доля синергистов — параметр справочника, а не константа потребителя', () => {
    const { meta } = loadCatalog();
    expect(meta.synergistShare).toBe(0.5);
    const w = meta.groupWeights(meta.get('Жим штанги лёжа'), 0.3);
    expect(w.triceps).toBe(0.3);
  });
});
