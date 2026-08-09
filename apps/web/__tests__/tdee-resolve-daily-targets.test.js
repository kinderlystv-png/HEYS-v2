/**
 * Регресс 2026-08-02: `profile.optimum`, `profile.norm.kcal`, `profile.tdee`,
 * `profile.protTarget`, `HEYS.norms` — поля-призраки, которых в профиле нет
 * и не было никогда. ~13 мест в apps/web/insights/*.js и
 * apps/web/heys_relapse_risk_v1.js читали их и молча падали в жёсткие
 * дефолты (2000 ккал, 100 г белка) для любого клиента, независимо от его
 * реальной нормы. См. docs/implementation/DERIVED_FIELDS_AUDIT_2026-08-02.md.
 *
 * `resolveDailyTargets` — единая замена: калории из TDEE.optimum, белок —
 * 1.6 г/кг веса (тот же safety-net-паттерн, что уже жил копипастой в трёх
 * файлах до этой правки).
 */
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

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const src = read('apps/web/heys_tdee_v1.js');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
});

describe('HEYS.TDEE.resolveDailyTargets', () => {
  it('считает белок как 1.6 г/кг веса профиля', () => {
    const targets = global.HEYS.TDEE.resolveDailyTargets({ weight: 80 }, {});
    expect(targets.prot).toBe(128);
  });

  it('падает на baseWeight, если веса в профиле нет', () => {
    const targets = global.HEYS.TDEE.resolveDailyTargets({ baseWeight: 65 }, {});
    expect(targets.prot).toBe(104);
  });

  it('падает на 70 кг, если нет ни веса, ни baseWeight — как и раньше делал calculateTDEE', () => {
    const targets = global.HEYS.TDEE.resolveDailyTargets({}, {});
    expect(targets.prot).toBe(112);
  });

  it('калории всегда положительное число, не 0 и не NaN', () => {
    const targets = global.HEYS.TDEE.resolveDailyTargets({}, {});
    expect(targets.kcal).toBeGreaterThan(0);
    expect(Number.isNaN(targets.kcal)).toBe(false);
  });

  it('работает без day — не падает и не возвращает NaN', () => {
    const targets = global.HEYS.TDEE.resolveDailyTargets({ weight: 75 });
    expect(targets.kcal).toBeGreaterThan(0);
    expect(targets.prot).toBe(120);
  });

  it('работает без profile — не выбрасывает исключение', () => {
    expect(() => global.HEYS.TDEE.resolveDailyTargets(null, {})).not.toThrow();
    const targets = global.HEYS.TDEE.resolveDailyTargets(null, {});
    expect(targets.kcal).toBeGreaterThan(0);
  });

  it('учитывает day (шаги/тренировки повышают итоговый tdee/optimum)', () => {
    const restDay = global.HEYS.TDEE.resolveDailyTargets({ weight: 75 }, { steps: 0 });
    const activeDay = global.HEYS.TDEE.resolveDailyTargets({ weight: 75 }, { steps: 15000 });
    expect(activeDay.kcal).toBeGreaterThan(restDay.kcal);
  });
});

describe('места-призраки заменены на resolveDailyTargets (контрактная проверка)', () => {
  const sites = [
    ['apps/web/insights/pi_early_warning.js', 3],
    ['apps/web/heys_relapse_risk_v1.js', 4],
    ['apps/web/heys_metabolic_intelligence_v1.js', 2],
    ['apps/web/heys_refeed_v1.js', 1],
    // heys_widgets_data_v1.js удалён 2026-08-09: файл не входил ни в один
    // бандл и не был подключён, а присваивал HEYS.Widgets.data — то есть
    // затёр бы живой слой данных, попади он в сборку. Контрактная проверка
    // призраков в нём ничего не защищала.
    ['apps/web/heys_widgets_ui_v1.js', 1],
    ['apps/web/insights/pi_meal_recommender.js', 3],
    ['apps/web/insights/pi_meal_rec_patterns.js', 1],
    ['apps/web/heys_add_product_step_v1.js', 1],
    ['apps/web/insights/pi_analytics_api.js', 2],
    // 2026-08-09: второй призрак того же класса — HEYS.dayUtils.getOptimumForDay
    // не определён ни в одном исходнике. optimumData/optimumInfo были всегда
    // {}, «осталось ккал» в шторке добавления и CRS-прогрев для навигации
    // считались против жёсткого фолбэка 2000, а не реальной цели дня.
    ['apps/web/heys_day_add_product.js', 1],
    ['apps/web/heys_app_shell_v1.js', 1],
  ];

  it.each(sites)('%s содержит хотя бы %i вызов(ов) resolveDailyTargets/TDEE.calculate вместо призрака', (file, minCount) => {
    const src = read(file);
    const count = (src.match(/resolveDailyTargets|HEYS\.TDEE\?\.calculate/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(minCount);
  });
});

describe('HEYS.dayUtils.getOptimumForDay больше не вызывается напрямую как единственный путь', () => {
  it('heys_day_add_product.js и heys_app_shell_v1.js больше не зовут несуществующий метод', () => {
    for (const file of ['apps/web/heys_day_add_product.js', 'apps/web/heys_app_shell_v1.js']) {
      const src = read(file);
      // Пояснительные комментарии про призрак допустимы — недопустим сам вызов.
      expect(src, file).not.toMatch(/dayUtils\??\.getOptimumForDay\?\.\(/);
    }
  });
});
