import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

let models;
let mergeDayData;

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  // vitest держит isolate: false, а heys_models_v1.js регистрируется сайд-эффектом
  // IIFE — при повторном импорте он бы не выполнился. Читаем и исполняем явно.
  const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_models_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
  models = global.HEYS.models;

  const merge = await import(
    path.join(repoRoot, 'yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs')
  );
  mergeDayData = (merge.default || merge).mergeDayData;
});

describe('метка авторства куратора', () => {
  it('действует, пока значение то самое, что вписал куратор', () => {
    const day = { weightMorning: 71, _curatorEdits: { weightMorning: { at: 1000, value: 71 } } };
    expect(models.isCuratorAuthored(day, 'weightMorning')).toBe(true);
  });

  it('гаснет сама, когда клиент вводит другое значение', () => {
    const day = { weightMorning: 70.4, _curatorEdits: { weightMorning: { at: 1000, value: 71 } } };
    expect(models.isCuratorAuthored(day, 'weightMorning')).toBe(false);
  });

  it('гаснет и когда клиент ввёл ровно то же число — по шкале 1–10 это обычное дело', () => {
    const day = { sleepQuality: 7, _curatorEdits: { sleepQuality: { at: 1000, value: 7 } } };
    const cleared = models.clearCuratorMarks(day, 'sleepQuality', 2000);
    expect(models.isCuratorAuthored({ ...day, _curatorEdits: cleared }, 'sleepQuality')).toBe(false);
  });

  it('погашенная метка переживает merge, а не воскресает со второй стороны', () => {
    const local = {
      date: '2026-08-02', updatedAt: 3000, meals: [], sleepQuality: 7,
      _curatorEdits: { sleepQuality: { at: 3000, value: null } },
    };
    const remote = {
      date: '2026-08-02', updatedAt: 1000, meals: [], sleepQuality: 7,
      _curatorEdits: { sleepQuality: { at: 1000, value: 7 } },
    };
    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(models.isCuratorAuthored(merged, 'sleepQuality')).toBe(false);
  });

  it('свежая метка куратора переживает merge с базой из облака', () => {
    const local = {
      date: '2026-08-02', updatedAt: 2000, meals: [], weightMorning: 71,
      _curatorEdits: { weightMorning: { at: 2000, value: 71 } },
    };
    const remote = { date: '2026-08-02', updatedAt: 1000, meals: [], weightMorning: 70 };
    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged._curatorEdits.weightMorning).toEqual({ at: 2000, value: 71 });
  });

  it('дневник показывает пометку у веса, сна и утренних оценок', () => {
    const main = read('apps/web/heys_day_main_block_v1.js');
    const side = read('apps/web/heys_day_side_block_v1.js');
    expect(main).toContain("isCuratorAuthored?.(day, 'weightMorning')");
    expect(main).toContain('curator-authored-hint');
    expect(side).toContain("['sleepStart', 'sleepEnd', 'sleepQuality']");
    expect(side).toContain("['moodMorning', 'wellbeingMorning', 'stressMorning']");
    expect(side.match(/curator-authored-hint/g)).toHaveLength(2);
    expect(read('apps/web/styles/modules/200-dark-and-effects.css')).toContain('.curator-authored-hint');
  });

  it('дисциплина не растёт с чужой руки', () => {
    const cascade = read('apps/web/heys_cascade_card_v1.js');
    // Стрик и штраф за срыв считаются по одному предикату «вес ввёл клиент».
    expect(cascade).toContain('var hasClientWeight = function (d)');
    expect(cascade.match(/countConsecutive\(prevDays14, hasClientWeight\)/g)).toHaveLength(2);

    const checkin = read('apps/web/heys_morning_checkin_v1.js');
    // Мастер не открывается, если core уже в дне — в т.ч. от куратора (heys/4546fb).
    expect(checkin).not.toMatch(/!byCurator\(day,/);
    expect(checkin).toContain('hasPositiveCheckinNumber(day?.weightMorning)');

    const game = read('apps/web/heys_gamification_v1.js');
    expect(game).toContain("byClient('weightMorning')");
  });

  it('ввод клиента гасит метку во всех шагах чек-ина', () => {
    const steps = read('apps/web/heys_steps_v1.js');
    expect(steps.match(/clearCuratorMarks/g)).toHaveLength(5);
    expect(read('apps/web/heys_day_main_block_v1.js')).toContain('clearCuratorMarks');
  });

  it('ensureDay не выбрасывает метки — иначе они гибли бы на первом проходе', () => {
    const day = models.ensureDay(
      { date: '2026-08-02', weightMorning: 71, _curatorEdits: { weightMorning: { at: 1000, value: 71 } } },
      {}
    );
    expect(models.isCuratorAuthored(day, 'weightMorning')).toBe(true);
  });

  it('ensureDay сохраняет recipe_backfill_log', () => {
    const log = [{ at: 42, product_id: 'p1', name: 'Салат', items_count: 2, kcal_delta: 15 }];
    const day = models.ensureDay({ date: '2026-08-02', meals: [], recipe_backfill_log: log }, {});
    expect(day.recipe_backfill_log).toEqual(log);
  });

  it('mergeDayData не отбрасывает recipe_backfill_log', () => {
    const log = [{ at: 42, product_id: 'p1', name: 'Салат', items_count: 1, kcal_delta: 8 }];
    const local = { date: '2026-07-12', updatedAt: 20, meals: [], recipe_backfill_log: log };
    const remote = { date: '2026-07-12', updatedAt: 10, meals: [] };
    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged.recipe_backfill_log).toEqual(log);
  });

  it('считает ГИ рецепта по массе, а не по углеводам', () => {
    const oats = { id: 'oats', name: 'Овёс', protein100: 10, simple100: 0, complex100: 60, badFat100: 1, goodFat100: 5, trans100: 0, fiber100: 8, gi: 40, harm: 1 };
    const oil = { id: 'oil', name: 'Масло', protein100: 0, simple100: 0, complex100: 0, badFat100: 14, goodFat100: 86, trans100: 0, fiber100: 0, gi: 0, harm: 2 };
    const byId = { oats, oil };
    const result = models.computeRecipeNutrients({
      yield_grams: 150,
      items: [
        { product_id: 'oats', grams: 100 },
        { product_id: 'oil', grams: 50 },
      ],
    }, (spec) => byId[spec.product_id]);
    expect(result.nutrients.gi).toBe(26.7);
  });
});
