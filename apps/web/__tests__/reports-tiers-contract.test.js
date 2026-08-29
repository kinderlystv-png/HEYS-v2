// Два яруса Отчётов, расходившихся с контрактом.
//
// «Что с этим делать» — единственное место вкладки, где есть призыв, и он про
// данные, а не про поведение. Прежний блок предлагал обсудить норму с
// куратором: советы о еде, тренировках и норме — территория Инсайтов, и строка
// это прямо запрещает.
//
// «Сон и самочувствие» — две кривые, а не три средних числа. Средние за период
// уже стоят в итоге; повторять их графиком незачем, а связь сна с весом живёт
// в Инсайтах паттернами.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-reports.css'),
  'utf8'
);

describe('Отчёты · ярус «Что с этим делать»', () => {
  it('призыв про данные, а не про норму', () => {
    expect(SRC).toContain("'Что с этим делать'");
    expect(SRC).toContain("'Записать замер'");
    // Совет про норму убран целиком вместе с компонентом.
    expect(SRC).not.toContain('Обсудить норму с куратором');
    expect(SRC).not.toContain('ReportsV4ZeroActions');
    expect(SRC).not.toContain('Норму можно поменять в настройках профиля');
  });

  it('замер сделан сегодня — яруса нет вовсе', () => {
    // Контракт: «пусто — ярус не рисуется, а не показывает „всё в порядке“».
    expect(SRC).toContain('periodMeta.lastMeasureDaysAgo !== 0');
  });

  it('кнопка ведёт в замеры, а не «куда-то в дневник»', () => {
    const start = SRC.indexOf("'Записать замер'");
    const body = SRC.slice(Math.max(0, start - 900), start);
    expect(body).toContain("steps: ['measurements']");
  });

  it('ярус стоит последним — без замеров отчёт верен, просто беднее', () => {
    const measure = SRC.indexOf("'Что с этим делать'");
    const days = SRC.indexOf("'Дни'");
    expect(measure).toBeGreaterThan(days);
  });
});

describe('Отчёты · ярус «Сон и самочувствие»', () => {
  it('две кривые, а не средние числа', () => {
    expect(SRC).toContain('function ReportsV4Wellbeing');
    expect(SRC).toContain('wellbeingSeries');
    // Прежние три плитки со средними ушли.
    expect(SRC).not.toContain("reports-v4-wellbeing__grid'");
  });

  it('ряд собирается по всем дням периода, а не только по дням с едой', () => {
    // Сон записывают и в день без единого приёма.
    const start = SRC.indexOf('const wellbeingSeries = points.map');
    expect(start).toBeGreaterThan(-1);
  });

  it('день без записи рвёт линию, а не соединяет соседей', () => {
    const start = SRC.indexOf('const buildPath = (key)');
    const body = SRC.slice(start, start + 1200);
    expect(body).toContain('segments');
    expect(body).toContain('if (d[key] == null)');
  });

  it('у каждой кривой своя шкала — часы и баллы несравнимы', () => {
    const start = SRC.indexOf('const buildPath = (key)');
    const body = SRC.slice(start, start + 900);
    expect(body).toContain('Math.min(...vals)');
    expect(body).toContain('Math.max(...vals)');
  });

  it('подпись стоит у последней точки каждой кривой', () => {
    expect(SRC).toContain('reports-v4-wellbeing__mark');
    const start = SRC.indexOf('const dot = (path, cls, unit)');
    const body = SRC.slice(start, start + 700);
    expect(body).toContain('path.last');
  });

  it('выводов о связи в ярусе нет — они в Инсайтах', () => {
    const start = SRC.indexOf('function ReportsV4Wellbeing');
    const body = SRC.slice(start, SRC.indexOf('function pluralDaysReports'));
    for (const word of ['мало', 'много', 'хорошо', 'плохо', 'связ']) {
      expect(body.replace(/\/\/[^\n]*/g, ''), word).not.toContain(word);
    }
  });

  it('кривые различаются ролями, а не только формой', () => {
    expect(CSS).toMatch(/__line--sleep[\s\S]{0,200}--v4-water/);
    expect(CSS).toMatch(/__line--mood[\s\S]{0,200}--v4-sand-act/);
  });
});
