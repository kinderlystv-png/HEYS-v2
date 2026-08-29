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

  it('праздничная заливка есть только у роста и подтверждённой перестройки', () => {
    expect(SRC).toContain('weekly-wrap-correction--good');
    expect(CSS).toMatch(/\.weekly-wrap-correction--good\s*\{[^}]*--v4-ok-bg/);
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
    expect(block).toMatch(/is-up \{[^}]*--v4-good/);
    expect(block).toMatch(/is-down \{[^}]*--v4-bad-text/);
  });
});
