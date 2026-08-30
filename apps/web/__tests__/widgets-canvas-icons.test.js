// Контуры иконок против раздела канваса «Разбор графики · SVG в кадрах».
// Раздел даёт точки каждой кривой дословно, и это единственная часть разбора,
// где сверка идёт не по числам правила, а по самому рисунку: иконка с другим
// контуром — это другая иконка, и никакой гейт по размерам её не поймает.
//
// Так нашлось, что у «Голода и энергии» в продукте стояли часы вместо молнии,
// а у «Активности» — ломаная отчёта вместо пульса.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  WEB,
  '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const SOURCES = [
  'heys_widgets_ui_v1.js',
  'heys_widgets_variants_v4.js',
  'heys_widgets_insulin_wave_v4.js',
  'heys_widgets_weight_dynamics_v4.js'
];

// Контуры, которых в коде виджетов нет и не должно быть. Список закрытый.
const NOT_OURS = new Map([
  // Шапка приложения и капсула даты: строка «границы» отдаёт их своим зонам,
  // в кадре Главной они нарисованы для контекста.
  ['M9 18h6M10 21h4M12 3a6 6 0 014 10.5V16H8v-2.5A6 6 0 0112 3z', 'колокол шапки'],
  ['M4 7h5M13 7h7M4 12h11M19 12h1M4 17h3M11 17h9', 'значок меню шапки'],
  ['M15 5l-7 7 7 7', 'стрелка капсулы даты влево'],
  ['M9 5l7 7-7 7', 'стрелка капсулы даты вправо'],
  ['M8 3v4M16 3v4M3 11h18', 'календарь капсулы даты'],
  // Та же фигура, записанная от другой точки: шеврон и галочка совпадают
  // формой, но кадр ведёт путь снизу вверх, а продукт сверху вниз.
  ['M9 18l6-6-6-6', 'шеврон строки: продукт ведёт путь от верхней точки'],
  ['M20 6L9 17l-5-5', 'галочка выбранного вида: продукт ведёт путь от левой точки']
]);

describe('контуры иконок против раздела «Разбор графики»', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const source = SOURCES.map((f) => fs.readFileSync(path.join(WEB, f), 'utf8')).join('\n');

  // Только кадры data-demo="stop": отвергнутые варианты и «живой прогон»
  // рисуют то, чего в продукте нет по решению.
  const stopFrames = new Set();
  {
    const re = /data-demo="(stop|loop|protocol)"[^>]*data-screen-label="([^"]+)"|data-screen-label="([^"]+)"[^>]*data-demo="(stop|loop|protocol)"/g;
    let m;
    while ((m = re.exec(canvas))) if ((m[1] || m[4]) === 'stop') stopFrames.add(m[2] || m[3]);
  }

  const drawings = new Map();
  {
    const re = /<div class="spec"[^>]*><b>([^<]+) · рисунок \d+<\/b><span data-v="([^"]*)"/g;
    let m;
    while ((m = re.exec(canvas))) {
      if (!stopFrames.has(m[1])) continue;
      if (!drawings.has(m[1])) drawings.set(m[1], []);
      drawings.get(m[1]).push(m[2]);
    }
  }

  it('раздел «Разбор графики» в канвасе есть', () => {
    expect(canvas).toContain('Разбор графики · SVG в кадрах');
    expect(drawings.size).toBeGreaterThan(20);
  });

  it('контуры иконок в продукте те же, что в кадрах', () => {
    const missing = [];
    for (const [frame, values] of drawings) {
      for (const value of values) {
        const curve = /^кривая, точки ([^,]+)$/.exec(value);
        if (!curve) continue;
        const d = curve[1].trim();
        if (NOT_OURS.has(d)) continue;
        // Продукт вправе разбить один контур кадра на несколько <path>.
        const parts = d.split(/(?=M)/).map((x) => x.trim()).filter(Boolean);
        if (parts.every((part) => source.includes(part))) continue;
        missing.push(`${frame}: ${d}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('иконка каждого быстрого действия названа своим смыслом', () => {
    // Молния у энергии и пульс у активности — не украшение: прежние часы и
    // ломаная говорили «время» и «отчёт», а карточка про действие сейчас.
    const at = source.indexOf('const QUICK_ACTION_ICONS');
    const table = source.slice(at, source.indexOf('};', at));
    expect(table).toContain('M13 2L3 14h9l-1 8 10-12h-9z');
    expect(table).toContain('M22 12h-4l-3 9L9 3l-3 9H2');
    expect(table).toContain('M12 3s6 6.5 6 10.5a6 6 0 01-12 0C6 9.5 12 3 12 3z');
    expect(table).toContain('M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z');
  });

  // Поле рисунка задаёт и масштаб линии: при preserveAspectRatio="none" оно
  // растягивается в контейнер, и разная ширина поля даёт разную толщину одной
  // и той же линии в соседних листах. У графика веса стояло 300 против 268 у
  // профиля воды и сплайна тренда.
  it('графики листов рисуются в поле одной ширины', () => {
    const variants = fs.readFileSync(path.join(WEB, 'heys_widgets_variants_v4.js'), 'utf8');
    const boxes = [...variants.matchAll(/viewBox: '0 0 (\d+) (\d+)'/g)]
      .map((m) => ({ w: Number(m[1]), h: Number(m[2]) }))
      .filter((b) => b.w > 200);
    expect(boxes.length).toBeGreaterThan(1);
    expect(new Set(boxes.map((b) => b.w))).toEqual(new Set([268]));
  });

  it('осознанные исключения не разрослись', () => {
    expect(NOT_OURS.size).toBe(7);
  });
});
