// Формы чисел и дат в Отчётах — строки контракта «формат · …» и «состав · …».
//
// Форма проверяется вычислением, а не чтением разметки: «сб · 8 авг» и
// «сб · 8 авг.» отличаются одним знаком, который в браузере не бросается в
// глаза и приезжает из локали, а не из кода. Такое ловит только запуск.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const STATS = fs.readFileSync(path.join(WEB, 'heys_day_stats_v1.js'), 'utf8');
const CASCADE = fs.readFileSync(path.join(WEB, 'heys_cascade_card_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.join(WEB, 'styles/modules/733-ui-v4-reports.css'), 'utf8');

// Метка дня собирается функцией без зависимостей — вынимаем её тело и
// исполняем, чтобы проверить результат, а не намерение.
const formatReportsDayLabel = (() => {
  const at = STATS.indexOf('function formatReportsDayLabel');
  const body = STATS.slice(at, STATS.indexOf('\n  }', at) + 4);
  // eslint-disable-next-line no-new-func
  return new Function(body + '; return formatReportsDayLabel;')();
})();

describe('формат · дата и оценка в ленте дней', () => {
  it('«сб · 8 авг» — без точки сокращения и без года', () => {
    expect(formatReportsDayLabel('2026-08-08')).toBe('сб · 8 авг');
    expect(formatReportsDayLabel('2026-01-01')).toBe('чт · 1 янв');
    // Май в ru-RU короткой формы не имеет и точки не получает — проверяем,
    // что срез точки не откусил букву.
    expect(formatReportsDayLabel('2026-05-03')).toBe('вс · 3 мая');
  });

  it('день недели строчными, год не пишется ни в одном месяце', () => {
    for (let m = 1; m <= 12; m += 1) {
      const label = formatReportsDayLabel('2026-' + String(m).padStart(2, '0') + '-15');
      expect(label, label).toMatch(/^[а-я]{2} · 15 [а-я]+$/);
      expect(label, label).not.toContain('2026');
    }
  });

  it('оценка через дробь, а не «из»', () => {
    expect(STATS).toContain("' · ' + row.dayScore + '/10'");
    // Запрет узкий: он про строку дня, где «из» удлиняет строку и сбивает
    // столбец чисел. В плитке «Средняя оценка» форма «из 10» стоит по своей
    // строке контракта — там она в столбце не участвует.
    const at = STATS.indexOf("periodMeta.dayRows.slice(0, 4)");
    const rows = STATS.slice(at, STATS.indexOf('dayRows.length > 4', at));
    expect(rows).not.toContain(' из ');
  });
});

describe('формат · вес и его подпись', () => {
  it('в карточке три вещи: подпись окна, текущее значение, Δ', () => {
    expect(STATS).toContain("'Вес · 30 дней'");
    expect(STATS).toContain('reports-v4-dynamics-card__value');
    expect(STATS).toContain('reports-v4-dynamics-card__delta');
  });

  it('запятая как разделитель, «кг» после числа и только один раз', () => {
    const at = STATS.indexOf('reports-v4-dynamics-card__now');
    const block = STATS.slice(at - 900, at + 900);
    expect(block).toContain(".replace('.', ',')");
    expect(block).toContain("' кг'");
    // Δ без единицы: «91,1 кг · −0,9», а не «−0,9 кг» вторым разом.
    expect(block.split("' кг'").length - 1).toBe(1);
    // Минус типографский, тот же, что в строке дня.
    expect(block).toContain("'+' : '−'");
  });

  it('значение 21/800 моноцифрами, Δ тоном --gr', () => {
    const at = CSS.indexOf('.reports-v4-dynamics-card__value {');
    const v = CSS.slice(at, CSS.indexOf('}', at));
    expect(v).toContain('font: 800 21px/1');
    expect(v).toContain('tabular-nums');
    const dt = CSS.indexOf('.reports-v4-dynamics-card__delta {');
    const d = CSS.slice(dt, CSS.indexOf('}', dt));
    expect(d).toContain('var(--v4-ok-text');
    expect(d).toContain('tabular-nums');
  });

  it('прежний бейдж с эмодзи в v4 не рисуется', () => {
    // weightTrend.text склеен для старого вида: эмодзи-стрелка, точка как
    // разделитель и второе «кг». Рядом с v4-стрелкой выходило «↓ ⬇️ -0.9 кг».
    expect(STATS).toContain('!useReportsV4 && weightSparklineData.length >= 2 && weightTrend');
  });
});

describe('состав · факторы каскада Score', () => {
  it('ровно четыре и в этом порядке', () => {
    const at = CASCADE.indexOf('const CRS_SCORE_GROUPS');
    const block = CASCADE.slice(at, CASCADE.indexOf('];', at));
    const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual(['Питание', 'Сон', 'Активность', 'Ведение']);
  });

  it('порядок задан списком, а не сортировкой по значению', () => {
    // Сортировка сделала бы разбор несравнимым с прошлым разом.
    const at = CASCADE.indexOf('const CRS_SCORE_GROUPS');
    const after = CASCADE.slice(at, at + 4000);
    expect(after).not.toMatch(/CRS_SCORE_GROUPS[\s\S]{0,200}\.sort\(/);
  });
});
