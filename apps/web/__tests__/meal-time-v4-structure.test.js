import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const mealStepSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_meal_step_v1.js'),
  'utf8',
);
// Файл разрезан по зонам 31 августа: оболочка осталась в 600, экраны уехали
// в 610–613. Тест смотрит на поток добавления целиком, поэтому читает всю
// группу — иначе он проверял бы половину правил и молчал о второй.
const cssSource = [
  '600-steps-and-aps.css',
  '610-aps-meal-flow.css',
  '611-aps-product-card.css',
  '612-training-step.css',
  '613-cycle-ui.css',
]
  .map((file) => fs.readFileSync(path.resolve(__dirname, '../styles/modules/' + file), 'utf8'))
  .join('\n');
const mealCreateCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/heys-components.css'),
  'utf8',
);

describe('meal time step v4 structure', () => {
  it('uses canvas title and six type chips', () => {
    expect(mealStepSource).toContain("title: 'Новый приём'");
    expect(mealStepSource).toContain('MEAL_TYPE_CHIPS');
    // Подсказка живёт только в листе правки: кадр первого шага её не содержит,
    // а строка «вид · лист времени и типа» цитирует её дословно.
    expect(mealStepSource).toContain('Тип предложен по времени — можно оставить как есть.');
    expect(mealStepSource).toContain("variant: isEditMode ? 'sheet' : 'step'");
    expect(mealStepSource).toContain('Всё равно продолжить');
    expect(mealStepSource).toContain('function typeForChip');
    expect(mealStepSource).not.toContain('Выберите время и тип');
    expect(mealStepSource).not.toContain('Расчётный постпрандиальный период');
  });

  it('шапка шага не рисует иконку — ни своей, ни подставленной', () => {
    // Прежде проверка сторожила, что шаг, погасивший `icon: ''`, не получит
    // умолчание 📋. С 2 сентября шапка не рисует иконку вовсе: эмодзи сняты во
    // всём пакете дизайна, и подставлять стало нечего. Сам вид шапки сторожит
    // step-modal-shell-v4; здесь достаточно, что склейки нет.
    const stepModal = fs.readFileSync(
      path.resolve(__dirname, '../heys_step_modal_v1.js'),
      'utf8',
    );
    expect(stepModal).not.toContain('[currentConfig.icon, currentConfig.title]');
    expect(stepModal).not.toContain("'📋'");
  });

  it('keeps snack slot by time instead of a single snack1 key', () => {
    expect(mealStepSource).toMatch(/if \(hour < 12\) return 'snack1'/);
    expect(mealStepSource).toMatch(/if \(hour < 18\) return 'snack2'/);
    expect(mealStepSource).toContain("return 'snack3'");
  });

  it('paints time hero and chips with v4 roles', () => {
    expect(cssSource).toContain('.meal-time-hero');
    expect(cssSource).toContain('.meal-type-chips');
    expect(cssSource).toContain('var(--v4-sand-hero');
    expect(cssSource).toContain('var(--v4-sand-surface');
    expect(cssSource).toContain('grid-template-columns: 1fr 1fr');
    expect(cssSource).toMatch(/\.meal-type-chip \{[\s\S]*?var\(--v4-sand-surface/);
    expect(cssSource).toMatch(/\.meal-time-step \.meal-type-label \{[\s\S]*?background: none;/);
    expect(cssSource).toContain('.meal-time-hero .mc-wheel-value--current');
    // Строка «вид · колесо времени»: три ряда по 64 при общей высоте 192,
    // выбранное значение 40 px, соседние 24. Стояли 132 / 54 / 16.
    expect(cssSource).toMatch(
      /\.meal-time-hero \.mc-wheel-value--current \{[^}]*font-size: 40px;/s);
    expect(cssSource).toMatch(
      /\.meal-time-hero \.mc-wheel-picker--compact \.mc-wheel-values \{[^}]*height: 192px;/s);
  });

  it('шаг самочувствия называет источник чисел и края шкал', () => {
    // Кадр «Добавление · самочувствие»: строка «Как в прошлый раз, 11:20 —
    // поправьте, если изменилось» и подписи краёв у каждой шкалы. Числа
    // подставлялись от прошлого приёма молча, а «3» и «8» без краёв — просто
    // числа: непонятно, куда тянуть ползунок.
    expect(mealStepSource).toContain('prefillFrom');
    expect(mealStepSource).toContain('Как в прошлый раз');
    expect(mealStepSource).toContain('поправьте, если изменилось');
    expect(mealStepSource).toContain("mood: ['подавленно', 'подъём']");
    expect(mealStepSource).toContain("stress: ['спокойствие', 'на пределе']");
    expect(mealStepSource).toContain("'Своё'");
    // Дорожка 34, бегунок 24, цель чипа 44 — кадр и правило области нажатия.
    expect(cssSource).toMatch(/\.meal-mood-scale__slider \{[^}]*height: 34px;/s);
    expect(cssSource).toMatch(
      /\.meal-mood-scale__slider::-webkit-slider-thumb \{[^}]*width: 24px;/s);
    expect(cssSource).toMatch(/\.meal-mood-chip \{[^}]*min-height: 44px;/s);
    // Три полосы, а не две: строка «тон заполнения и слова» даёт 1–3, 4–6, 7–10.
    expect(cssSource).toMatch(
      /\.meal-mood-scale__value--bad \{[^}]*var\(--v4-bad-text/s);
    expect(cssSource).toContain('.meal-mood-scale__value--mid');
    expect(mealStepSource).toContain("value <= 3 ? 'low' : value <= 6 ? 'mid' : 'high'");
    // Слова совпадают со строкой контракта по своей стороне шкалы.
    expect(mealStepSource).toContain("v <= 6 ? 'так себе' : 'хорошо'");
    expect(mealStepSource).toContain("v <= 6 ? 'напряжён' : 'на пределе'");
  });

  it('сведённые блоки шага не заперты на песочных ролях', () => {
    // Правило «пара читает правило, а не итог каскада»: роль с именем набора
    // держит одно значение во всех наборах, и гейт этого не видит — видно
    // только замером. Замер 31 августа: карточки шкал и чипы типа приёма
    // рисовались песочными и в синем наборе.
    for (const sel of ['.meal-mood-chip', '.meal-mood-scale', '.meal-type-chip']) {
      const at = cssSource.indexOf(sel + ' {');
      expect(at, sel + ' — правила нет').toBeGreaterThan(-1);
      const block = cssSource.slice(at, cssSource.indexOf('}', at));
      expect(block.includes('var(--v4-sand-'), sel + ' держит роль с именем набора').toBe(false);
    }
    // Заливка главной кнопки намеренно осталась на --v4-sand-act: роль текста
    // на заливке (--v4-btn-on-act) в синем наборе не объявлена, и перевод
    // одной заливки дал бы коричневую надпись на синем. Запись в findings.
    // .meal-time-cta объявлен и в 600 (только цвет внутри модалки), поэтому
    // ищем именно объявление заливки в 610 — первый indexOf берёт чужое.
    const cta = cssSource.lastIndexOf('.meal-time-cta {');
    expect(cssSource.slice(cta, cssSource.indexOf('}', cta))).toContain('var(--v4-sand-act,');
  });

  it('centers meal-create header like the canvas top bar', () => {
    expect(mealCreateCss).toContain('grid-template-columns: 44px 1fr 44px');
    expect(mealCreateCss).toContain('padding: 16px 18px 0');
    expect(mealCreateCss).toContain('width: 16px');
    // Активная точка прогресса — акцент набора. Сторожим роль, а не литерал:
    // --v4-tint-warm объявлена во всех четырёх наборах и в каждом равна
    // акценту (#c67139 песочный, #cf8144 песочно-тёмный, #2e7cc0 оба синих),
    // поэтому прежний голый #c67139 держал песочный цвет в синих наборах.
    expect(mealCreateCss).toMatch(/background: var\(--v4-tint-warm[,)]/);
    expect(mealCreateCss).toContain('.mc-header-btn--close::before');
  });

  it('даёт быстрые сдвиги назад и чип «сейчас»', () => {
    // Кадр «Добавление · время и тип»: под колесом три сдвига, справа от минут
    // чип «сейчас». Еду вспоминают задним числом, а докручивать колесо ради
    // каждого приёма — лишняя работа.
    expect(mealStepSource).toContain("{ label: '−15 мин', minutes: 15 }");
    expect(mealStepSource).toContain("{ label: '−1 ч', minutes: 60 }");
    expect(mealStepSource).toContain('shiftTimeBack');
    expect(mealStepSource).toContain('isNowSelected');
    expect(cssSource).toMatch(/\.meal-time-shift \{[^}]*min-height: 38px;/s);
    expect(cssSource).toMatch(/\.meal-time-hero__now \{[^}]*text-transform: uppercase;/s);
    // Подписи «Время» на карточке нет — её не содержат ни строка, ни кадр.
    expect(mealStepSource).not.toContain('meal-time-hero__label');
  });

  it('keeps wheels as the large time, always visible', () => {
    expect(mealStepSource).not.toContain('timeOpen');
    expect(mealStepSource).not.toContain('meal-time-hero__value');
    expect(mealStepSource).toContain('compact: true');
    expect(mealStepSource).toContain("display: null");
    expect(mealStepSource).toContain("className: 'meal-time-hero'");
  });

  it('styles night intake hint as sand grp block below time hero', () => {
    expect(mealStepSource).toContain("className: 'meal-night-hint'");
    expect(mealStepSource).toContain('Ночной приём — запишется в ');
    expect(mealStepSource).toMatch(
      /React\.createElement\(NightHint[\s\S]*?\)[\s\S]*?React\.createElement\(MealTypeGrid/,
    );
    expect(cssSource).toContain('.meal-night-hint');
    expect(cssSource).toContain('border-radius: 20px');
    expect(cssSource).toContain('.meal-night-icon');
    expect(cssSource).toMatch(/\.meal-night-hint \{[\s\S]*?var\(--v4-sand-accent-bg/);
    expect(cssSource).toMatch(/\.meal-time-step--v4 \.meal-night-hint[\s\S]*?margin-top: 16px/);
  });
});
