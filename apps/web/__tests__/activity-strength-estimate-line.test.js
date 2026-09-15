/**
 * Объяснение под числом расхода силовой.
 *
 * Строка контракта «расход силовой — как показан» (tab-activity.v4): «оценка,
 * выданная без объяснения, читается как измерение». Под числом стоит строка
 * 11 px/500 тоном var(--ink-3) — «оценка по 23 подходам · 4 200 кг тоннажа», —
 * и тап по ней раскрывает две строки того же кегля.
 *
 * Проценты и коэффициенты на экран не выходят: 0,12 ккал на килограмм-подъём
 * человек не проверит собой, а объяснение должно быть проверяемым. Подходы и
 * тоннаж он сверяет со своей тренировкой.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_activity_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8');

/** Тело правила CSS по селектору от начала строки. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`нет правила «${selector}»`);
  return match[1];
}

describe('объяснение расхода силовой', () => {
  it('строка называет подходы и тоннаж', () => {
    expect(SRC).toContain("'оценка по ' + estimate.approaches");
    expect(SRC).toContain("' кг тоннажа'");
  });

  it('склонение «подход» по числу, а не одна форма на всё', () => {
    expect(SRC).toContain('podhodDative');
    expect(SRC).toMatch(/'подходу'/);
    expect(SRC).toMatch(/'подходам'/);
  });

  it('раскрывашка даёт ровно две строки и обе про оценку, а не про формулу', () => {
    const block = SRC.slice(SRC.indexOf('STRENGTH_ESTIMATE_WHY'), SRC.indexOf('function formatVolumeShort'));
    expect(block).toContain('Точного расхода силовой не знает никто');
    expect(block).toContain('лучше недосчитать, чем съесть лишнее');
  });

  it('коэффициента и процентов на экране нет', () => {
    // Величина живёт в ядре; экран её не показывает — проверить её собой
    // нельзя, а объяснение обязано быть проверяемым.
    expect(SRC).not.toContain('0,12');
    expect(SRC).not.toContain('0.12');
  });

  it('состояние раскрывашки не запоминается — она открывается закрытой', () => {
    expect(SRC).toContain('const [estimateOpen, setEstimateOpen] = useState(false)');
    expect(SRC).not.toContain('heys_activity_estimate_open');
  });

  it('тон и кегль строки — как в контракте', () => {
    const body = rule('.activity-v4-estimate__line');
    expect(body).toMatch(/font:\s*500 11px\/1\.3/);
    expect(body).toContain('var(--v4-ink-3');
  });

  it('цель касания держится видимой высотой, а не припуском', () => {
    // Решение зоны: 44 у всего нажимаемого держится ВИДИМЫМ размером,
    // расширителя нет ни у одной цели — припуск невидим глазу и непроверяем
    // замером. Тише числа подпись делает тон и кегль, а не высота строки.
    const body = rule('.activity-v4-estimate__line');
    expect(body).toMatch(/min-height:\s*44px/);
    expect(CSS).not.toContain('.activity-v4-estimate__line::after');
  });
});
