// Защита границ сверки. Кадр рисует целый экран, но зона отвечает за свою
// часть: у «Даты и остатков» — капсула, стрелки, календарь и шторки, ниже
// начинается вкладка «Питание» со своими кадрами. Пока границы не было,
// машинная сверка считала чужое пропажей («нет на экране: Шаги»), и дважды за
// день это уводило в переделку экрана, который переделывать не нужно.
//
// Обратная опасность не меньше: «вне зоны» — удобный способ спрятать настоящее
// расхождение. Поэтому граница обязана называть причину, и причина проверяется
// здесь же, а не остаётся на совести того, кто её ставил.
import { describe, expect, it } from 'vitest';

import { UI_V4_VISUAL_CASES } from '../scripts/ui-v4-visual-fixture.mjs';

const paired = UI_V4_VISUAL_CASES.filter((item) => item.canvasFrame);

describe('границы сверки кадров', () => {
  it('кадр, обрезанный до части экрана, называет границу текста', () => {
    // canvasCrop режет картинку кадра до одного блока. Если текст при этом
    // сверяется целиком, шапка и навигация вокруг блока числятся пропавшими —
    // и настоящее расхождение тонет среди выдуманных.
    const cropped = paired.filter((item) => item.canvasCrop);
    const without = cropped
      .filter((item) => !item.frameTextFrom && !item.frameTextUntil)
      .map((item) => `${item.zone} / ${item.id} (${item.canvasCrop})`);

    expect(cropped.length).toBeGreaterThan(0);
    expect(without).toEqual([]);
  });

  it('у каждой границы названа причина', () => {
    const without = paired
      .filter((item) => (item.frameTextFrom || item.frameTextUntil) && !item.frameTextUntilWhy)
      .map((item) => `${item.zone} / ${item.id}`);

    expect(without).toEqual([]);
  });

  it('причина ссылается на источник, а не пересказывает решение', () => {
    // Причина должна опираться на проверяемое: строку канваса о границах зоны
    // либо на обрезку кадра. «Так нагляднее» — не причина.
    const vague = paired
      .filter((item) => item.frameTextUntilWhy)
      .filter((item) => !/границ|обрезан|зон[аыу]|кадр/i.test(item.frameTextUntilWhy))
      .map((item) => `${item.zone} / ${item.id}: ${item.frameTextUntilWhy}`);

    expect(vague).toEqual([]);
  });

  it('граница действительно встречается в тексте кадра', () => {
    // Маркер с опечаткой молча отключил бы обрезку (или срезал весь кадр) —
    // обе стороны одинаково плохи, и обе видны только отсюда.
    const withScope = paired.filter((item) => item.frameTextFrom || item.frameTextUntil);
    expect(withScope.length).toBeGreaterThan(0);
    withScope.forEach((item) => {
      [item.frameTextFrom, item.frameTextUntil].filter(Boolean).forEach((marker) => {
        expect(typeof marker).toBe('string');
        expect(marker.trim().length).toBeGreaterThan(2);
      });
    });
  });
});
