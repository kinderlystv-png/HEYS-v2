// Лист копирования приёма против кадра «Действие · копировать · чего не знаем»
// и трёх строк контракта, приехавших 3 сентября: «ноль, пустое и дефект — три
// состояния, не одно», «сумма не имеет права занижать», «копирование не
// блокируется».
//
// Проверка читает сам канвас, поэтому расхождение всплывёт при правке любой из
// сторон. Разбор состояний идёт по исходнику, а не по DOM: модалка живёт в
// легаси-бандле и в jsdom без React-обвязки не поднимается.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = fs.readFileSync(
  path.join(ROOT, 'apps/web/heys_day_copy_meal_modal_v1.js'),
  'utf8',
);
const CSS = fs.readFileSync(
  path.join(ROOT, 'apps/web/styles/modules/610-aps-meal-flow.css'),
  'utf8',
);
const CANVAS = fs.readFileSync(
  path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/food-meal.v4.dc.html',
  ),
  'utf8',
);

function rule(selector) {
  const at = CSS.indexOf(`\n${selector} {`);
  return at < 0 ? null : CSS.slice(at, CSS.indexOf('}', at));
}

/** Тело классификатора состояний. */
function classifier() {
  const from = SRC.indexOf('const itemState = React.useCallback');
  const to = SRC.indexOf('const copyableIds');
  return from >= 0 && to > from ? SRC.slice(from, to) : '';
}

describe('лист копирования · чего не знаем', () => {
  it('три состояния различаются, а не сводятся к нулю', () => {
    const body = classifier();
    expect(body.length).toBeGreaterThan(0);
    // Дефект — не число: калорийности нет в карточке продукта.
    expect(body).toContain("if (!Number.isFinite(kcal100)) return 'defect'");
    // Пустое — граммы не введены. Настоящий ноль (взвешено 0 г) сюда не
    // попадает: проверяется наличие значения, а не его величина.
    expect(body).toContain("return hasGrams ? 'ok' : 'empty'");
    expect(body).toContain("raw !== null && raw !== undefined && raw !== ''");
    // Прежний склеиватель ушёл из строки списка и из суммы добавляемого. В
    // превью чужих приёмов «|| 0» остаётся намеренно: там нечего исключать, и
    // решение дизайнера про сумму описывает лист копирования, а не эти списки.
    const row = SRC.slice(SRC.indexOf('allItems.map((it) => {'), SRC.indexOf('// === Targets section'));
    expect(row).not.toContain('|| 0)');
    const added = SRC.slice(SRC.indexOf('const addedKcal'), SRC.indexOf('return { dstName'));
    expect(added).not.toContain('|| 0)');
  });

  it('прочерк и слова вместо подставленного нуля', () => {
    expect(CANVAS).toContain('— г · — ккал');
    expect(CANVAS).toContain('нет калорийности');
    expect(SRC).toContain("'— г · — ккал'");
    expect(SRC).toContain('нет калорийности');
    expect(SRC).toContain('Граммы ещё не введены — не копируется');
    expect(SRC).toContain('В карточке продукта нет калорийности — не копируется');
  });

  it('непосчитанное нельзя отметить — поэтому сумма не занижает', () => {
    // Начальный набор и «Выбрать всё» берут только копируемое.
    expect(SRC).toContain('React.useState(() => new Set(copyableIds))');
    expect(SRC).toContain('setSelectedIds(new Set(copyableIds))');
    // Галочка выключена, и повторное включение отбивается в обработчике.
    expect(SRC).toContain("disabled: state !== 'ok'");
    expect(SRC).toContain('if (!copyableIds.includes(id)) return;');
  });

  it('строка полноты появляется только при непосчитанном', () => {
    expect(SRC).toContain('uncountable > 0 && React.createElement');
    expect(SRC).toContain('не копируются — сумма считает только отмеченные');
    const completeness = rule('.meal-transfer-v4__completeness');
    expect(completeness).toContain('font-size: 10.5px');
    expect(completeness).toContain('font-weight: 500');
    expect(completeness).toContain('var(--v4-ink-3)');
    // Элемент 31 кадра: по центру и через 5 от последней карточки.
    expect(completeness).toContain('text-align: center');
    expect(completeness).toContain('margin-top: 5px');
  });

  it('кнопка не блокируется, а дефект уводит в карточку продукта', () => {
    // Решение владельца: блокировка отняла бы действие ради чужого дефекта.
    expect(SRC).toContain('`Копировать (${selectedIds.size})`');
    expect(SRC).not.toMatch(/disabled:[^\n]*hasDefect/);
    expect(SRC).toContain('api.showEditProduct(it)');
    const fix = rule('.meal-transfer-v4__product-fix');
    expect(fix).toContain('min-height: 32px');
    expect(fix).toContain('padding: 0 12px');
    expect(fix).toContain('inset 0 0 0 1.5px var(--v4-act)');
    expect(fix).toContain('font-size: 10.5px');
  });

  it('выключенная галочка — та же рамка чернилами 20 %, без двойного кольца', () => {
    const off = rule('.meal-transfer-v4__native-control:disabled + .meal-transfer-v4__check');
    expect(off).toContain('border-color: rgba(var(--v4-ink-rgb), 0.2)');
    expect(off).not.toContain('box-shadow');
  });

  it('дефектная карточка приглушена, пустая — нет', () => {
    expect(rule('.meal-transfer-v4__product--defect')).toContain('opacity: 0.62');
    expect(rule('.meal-transfer-v4__product--empty')).toBeNull();
    const reason = rule('.meal-transfer-v4__product-reason');
    expect(reason).toContain('margin-top: 9px');
    expect(reason).toContain('font-weight: 600');
  });
});
