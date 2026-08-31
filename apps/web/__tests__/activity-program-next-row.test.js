// activity-program-next-row.test.js — строка «Следующая тренировка» на «Активе».
//
// Кадр «Актив · день отдыха» даёт строку списка: имя, под ним — что за
// тренировка, справа ссылка «программа ›». До сведения строка приходила из
// общего модуля программы со своей синеватой рамкой радиусом 12 и говорила
// только «когда»: подписи «Грудь и руки · по программе» не было вовсе, а это
// ровно то, ради чего строку открывают.
//
// Блок программы рисуется единственным вызовом renderTrainingsBlock с
// trainingFilterMode: 'program' и живёт только на «Активе», поэтому правка
// разметки других экранов не задевает — это проверяется здесь же.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const read = (name) => fs.readFileSync(path.join(WEB_DIR, name), 'utf8');
const TRAININGS_SRC = read('heys_day_trainings_v1.js');
const TAB_SRC = read('heys_day_tab_impl_v1.js');
const CSS = read('styles/modules/731-ui-v4-activity.css');

function nextLineBody() {
  const start = TRAININGS_SRC.indexOf('function ProgramNextLine(');
  expect(start).toBeGreaterThan(-1);
  const end = TRAININGS_SRC.indexOf('function renderTrainingsBlock(', start);
  return TRAININGS_SRC.slice(start, end > start ? end : start + 3000);
}

function rule(selector) {
  const at = CSS.indexOf(selector + ' {');
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('Строка «Следующая тренировка» говорит и когда, и что', () => {
  it('под именем стоит состав тренировки, а не только дата', () => {
    const body = nextLineBody();
    expect(body).toContain("' · по программе'");
    expect(body).toContain("className: 'program-next-sub'");
  });

  it('состав берётся из дня программы, а не выдумывается', () => {
    // dayLabel уже приходит из useProgramState — он просто не показывался.
    expect(nextLineBody()).toContain('next.dayLabel');
    expect(TRAININGS_SRC).toContain('dayLabel: d.dayLabel || null,');
  });

  it('без метки дня подписи нет — пустой строки не появляется', () => {
    const body = nextLineBody();
    expect(body).toContain('nextLabel &&');
  });

  it('имя и подпись стоят одним столбцом, как в кадре', () => {
    expect(nextLineBody()).toContain("className: 'program-next-key'");
  });

  it('ссылка названа словом кадра', () => {
    expect(nextLineBody()).toContain("'программа ›'");
  });
});

describe('Строка приведена к списку .cd только на «Активе»', () => {
  it('геометрия задана внутри блока программы, а не в общем классе', () => {
    // Иначе поехали бы и другие экраны, где .program-next-line своя.
    const scoped = rule('.activity-v4-program .program-next-line');
    expect(scoped).toContain('border-radius: 20px');
    expect(scoped).toContain('padding: 13px 16px');
    expect(scoped).toContain('border: none');
    expect(scoped).toContain('var(--v4-c1');
  });

  it('общий класс остался прежним — чужие экраны не задеты', () => {
    const base = fs.readFileSync(
      path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8',
    );
    const at = base.indexOf('.program-next-line {');
    expect(at).toBeGreaterThan(-1);
    const body = base.slice(at, base.indexOf('}', at));
    expect(body).toContain('border-radius: 12px');
  });

  it('дата не выделена весом: вся строка одного кегля', () => {
    expect(rule('.activity-v4-program .program-next-text b')).toContain('font-weight: 600');
  });

  it('подпись и ссылка — числа кадра', () => {
    expect(rule('.activity-v4-program .program-next-sub'))
      .toContain('font: 500 11px/1.3 Figtree');
    expect(rule('.activity-v4-program .program-next-link'))
      .toContain('font: 700 11.5px/1 Figtree');
  });

  it('блок программы стоит выше яруса и отбит на 12', () => {
    expect(rule('.activity-v4-program')).toContain('margin-top: 12px');
  });

  it('режим «program» вызывается ровно из одного места', () => {
    const uses = TAB_SRC.match(/trainingFilterMode: 'program'/g) || [];
    expect(uses).toHaveLength(1);
  });
});
