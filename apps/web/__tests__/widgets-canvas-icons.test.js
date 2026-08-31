// Рисунки продукта против раздела канваса «Разбор графики · SVG в кадрах».
//
// Сплошная сверка контуров с канвасом здесь была и снята 31 августа: строка
// контракта «контуры иконок совпадения не требуют» говорит, что пути SVG в
// разборе — приближение канваса, а не спецификация; иконки берутся из общего
// набора (Lucide, обводка 2,75), и обязательны только размер, толщина, тон и
// место. Соседняя строка «что в разборе графики обязательно» проводит границу:
// поля рисунка, точки ломаных и куполов, пунктиры, маркеры последней точки,
// толщины и тона воспроизводить обязательно — «график рисует число, иконка
// называет тему».
//
// Пока сверка стояла, она нашла две подменённые иконки: у «Голода и энергии»
// стояли часы вместо молнии, у «Активности» — ломаная отчёта вместо пульса.
// Этот результат сохранён отдельной проверкой ниже — уже как решение продукта,
// а не как требование канваса.
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

  // Строка контракта «контуры иконок совпадения не требуют»: пути SVG в
  // разборе — приближение канваса, а не спецификация. Иконки берутся из общего
  // набора (Lucide, обводка 2,75), и сплошная сверка контуров с канвасом снята
  // 31 августа. Остаётся то, что контракт называет обязательным для графиков
  // («поля рисунка … обязательны к воспроизведению»), и одна продуктовая
  // проверка ниже — она держит смысл иконки, а не её точки.
  it('иконка каждого быстрого действия названа своим смыслом', () => {
    // Молния у энергии и пульс у активности — не украшение: прежние часы и
    // ломаная говорили «время» и «отчёт», а карточка про действие сейчас.
    // Это решение продукта, а не требование канваса: контуры взяты из Lucide
    // и здесь заморожены, чтобы иконку не подменили молча.
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

});
