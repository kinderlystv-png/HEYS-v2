// Карточка сверки нормы в понедельничной шторке. Проверяется исходник:
// компонент живёт внутри шага StepModal, и поднять его целиком дороже, чем
// закрепить порядок, запись решения и уход из шторки.
//
// Логика кадров и тексты проверяются отдельно (norm-correction.test.js) — она
// живёт в модели и от вёрстки не зависит. Здесь только стык.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_weekly_reports_v2.js'),
  'utf8'
);
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/heys-components.css'),
  'utf8'
);

describe('поправка на факт · карточка сверки в шторке недели', () => {
  it('сверка стоит выше фактов недели', () => {
    // Она меняет число, на которое человек будет есть; факты только описывают
    // прошедшее. Ниже она читалась бы как ещё один итог.
    const card = SRC.indexOf('h(NormCorrectionCard,');
    const facts = SRC.indexOf("report && report.daysWithData >= minDaysForView");
    expect(card).toBeGreaterThan(-1);
    expect(facts).toBeGreaterThan(card);
  });

  it('шторка не решает и не округляет — числа и тексты приходят из модели', () => {
    expect(SRC).toContain('HEYS.NormCorrection.gather');
    expect(SRC).toContain('HEYS.NormCorrection.formatKcal');
    // Ни одного собственного расчёта нормы в компоненте карточки.
    const start = SRC.indexOf('function NormCorrectionCard');
    const body = SRC.slice(start, SRC.indexOf('function WeeklyWrapStep'));
    expect(body).not.toMatch(/Math\.round|toFixed|\* *0\.9|1 *\+ *deficit/);
  });

  it('применение пишет оба скаляра профиля вместе', () => {
    // Профиль сливается перекрытием по родительской метке времени: скаляры
    // едут атомарно, вложенный объект мог бы склеиться половинами.
    const start = SRC.indexOf('const applyFactor = (factor, fromTomorrow)');
    const body = SRC.slice(start, start + 500);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('normCorrectionFactor: factor');
    expect(body).toContain('normCorrectionAppliedAt');
  });

  it('снижение вступает в силу со следующего дня, возврат — сразу', () => {
    // Так написано на кнопке «Применить с завтра», и так норма не
    // переписывается задним числом. Возврат отменяет, а не назначает.
    expect(SRC).toContain('applyFactor(correction.result.nextFactor, true)');
    expect(SRC).toContain('applyFactor(back, false)');
    const fn = SRC.slice(
      SRC.indexOf('const applyFactor = (factor, fromTomorrow)'),
      SRC.indexOf('const applyFactor = (factor, fromTomorrow)') + 400
    );
    expect(fn).toContain('at.setDate(at.getDate() + 1)');
  });

  it('каждое решение попадает в историю — иначе счётчик отказов не сойдётся', () => {
    for (const what of ['applied', 'declined', 'postponed']) {
      expect(SRC).toContain("what: '" + what + "'");
    }
  });

  it('уход из шторки закрывает её раньше, чем открывает следующее', () => {
    // Шторка сама живёт в StepModal: открыть замеры поверх неё нельзя.
    const start = SRC.indexOf("action === 'ask_curator' || action === 'measure_waist'");
    const body = SRC.slice(start, start + 700);
    expect(body.indexOf('StepModal?.hide')).toBeGreaterThan(-1);
    expect(body.indexOf('StepModal?.hide')).toBeLessThan(body.indexOf('open-messenger'));
  });

  it('сборка сверки не роняет итоги недели', () => {
    // Модуль поправки грузится своим бандлом, а шторку зовёт вкладка дня.
    const start = SRC.indexOf('const correction = React.useMemo');
    const body = SRC.slice(start, start + 700);
    expect(body).toContain('catch');
    expect(body).toContain('return null');
  });

  it('отсутствие довода перестройки карточка говорит вслух', () => {
    // Контракт «заморозка до косвенного довода»: молчание здесь и есть дефект.
    expect(SRC).toContain('copy.evidenceNote');
    expect(SRC).toContain('weekly-wrap-correction__evidence-note');
    expect(CSS).toContain('.weekly-wrap-correction__evidence-note');
  });

  it('праздничная заливка есть только у роста и подтверждённой перестройки', () => {
    expect(SRC).toContain('weekly-wrap-correction--good');
    expect(CSS).toMatch(/\.weekly-wrap-correction--good\s*\{[^}]*--v4-ok-bg/);
  });

  it('график перестройки рисуется шторкой, но считается движком', () => {
    // Масштаб — это утверждение о данных: выбрать его рисующему нельзя, иначе
    // «вес стоит» и «талия уходит» разъедутся между кабинетом и шторкой.
    expect(SRC).toContain('function NormCorrectionChart');
    expect(SRC).toContain('card.chart');
    const start = SRC.indexOf('function NormCorrectionChart');
    const body = SRC.slice(start, SRC.indexOf('function NormCorrectionCard'));
    // Ни нормировки, ни поиска размаха — только растяжка готовых точек.
    expect(body).not.toMatch(/Math\.min|Math\.max|\/ *range|reduce/);
    // Сетка кадра и две линии своими ролями.
    expect(body).toContain('const W = 262');
    // Кадр рисует 262×76; строка контракта говорила 56 — спор решён в пользу
    // кадра.
    expect(body).toContain('const H = 76');
    // Вес тоном чернил, талия заливкой акцента — пара кадра.
    expect(CSS).toMatch(/__line\.is-weight[\s\S]{0,120}--v4-ink/);
    expect(CSS).toMatch(/__line\.is-waist[\s\S]{0,120}--v4-act/);
    // Легенда плашками 10×3 — без чисел: они уже сказаны прозой над графиком.
    expect(CSS).toMatch(/__swatch \{[^}]*width: 10px;[^}]*height: 3px/);
    // В самой легенде чисел нет — только слова и плашки; числа остаются в
    // подписи для чтения с экрана, где прозы над графиком не слышно.
    expect(body).toContain("legend('weight', 'вес')");
    expect(body).toContain("legend('waist', 'талия')");
    expect(body).toContain("'aria-label'");
  });

  it('предохранители на Pro не исчезают, а уходят во второй слой', () => {
    // Строка «вид · разница тарифов»: на Self они в первом слое, на Pro —
    // строкой «Предохранители · развернуть». Совсем прятать нельзя: границы
    // механизма человек вправе прочитать и там, где решает куратор.
    expect(SRC).toContain("card.safeguardsLayer === 'second'");
    expect(SRC).toContain('Предохранители · развернуть');
    expect(CSS).toContain('.weekly-wrap-correction__safeguards-more');
  });

  it('кнопки карточки — пилюли 48, как во всей зоне', () => {
    // Строка «кнопки»: пилюля 48 радиусом 999. Прямоугольник с рамкой делал
    // вторичные кнопки похожими на поля ввода.
    const btn = CSS.slice(CSS.indexOf('.weekly-wrap-correction__btn {'),
      CSS.indexOf('.weekly-wrap-correction__btn:focus-visible'));
    expect(btn).toMatch(/min-height: 48px/);
    expect(btn).toMatch(/border-radius: 999px/);
    expect(btn).not.toMatch(/border: 1px/);
  });

  it('карточка одета по контракту: радиус 20, заголовок 16/700, число 30/800', () => {
    const block = CSS.slice(
      CSS.indexOf('.weekly-wrap-correction {'),
      CSS.indexOf('.weekly-wrap-correction__footnote') + 200
    );
    expect(block).toMatch(/\.weekly-wrap-correction \{[^}]*border-radius: 20px/);
    expect(block).toMatch(/__title \{[^}]*font-size: 16px;[^}]*font-weight: 700/);
    expect(block).toMatch(/__hero-value \{[^}]*font-size: 30px;[^}]*font-weight: 800/);
    // Рост и снижение разными ролями — иначе направление читается только словом.
    // Рост тоном --gr контракта: --v4-good это вторая, светлая зелень набора, и
    // на подписи она читается слабее самого числа.
    expect(block).toMatch(/is-up \{[^}]*--v4-ok-text/);
    expect(block).toMatch(/is-down \{[^}]*--v4-bad-text/);
  });
});

describe('поправка · основания решения у клиента', () => {
  it('карточка рисует два числа расхождения, а не только результат', () => {
    // Без них карточка сообщала результат и просила согласия, не показав
    // основания. Сами числа проверяются в norm-correction.test.js.
    expect(SRC).toContain('card.evidenceRows');
    expect(SRC).toContain("className: 'weekly-wrap-correction__facts'");
    // Стоят выше кнопок: основание читается до решения, а не после.
    expect(SRC.indexOf('card.evidenceRows'))
      .toBeLessThan(SRC.indexOf("weekly-wrap-correction__actions"));
    expect(CSS).toContain('.weekly-wrap-correction__facts');
  });
});
