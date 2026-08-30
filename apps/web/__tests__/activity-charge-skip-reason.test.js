// activity-charge-skip-reason.test.js — «не сегодня» пишет статус пропуска
// и в тот же день спрашивает причину.
//
// Вторая новая механика контракта tab-activity.v4.dc.html (строка 21, решение
// владельца 31 августа). До неё вся ветка была недостижима: статус 'missed'
// не писал никто, поэтому список причин, шаг `morning_activation_skip_reason`
// и флаги skipReasonPending / skipReasonId существовали вхолостую
// (ACTIVITY_TAB_AS_IS.md §9 P).
//
// Проверяем источником и предикатами: поднять весь чек-ин с модалками ради
// одного статуса дороже, чем прочитать сам переход.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const STEPS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_steps_v1.js'), 'utf8');
const CHECKIN_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_morning_checkin_v1.js'), 'utf8');
const ACTIVITY_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_activity_v1.js'), 'utf8');

/** Тело ветки ответа «не сегодня». */
function skippedBranch() {
  const start = STEPS_SRC.indexOf("if (answer === 'skipped') {");
  expect(start).toBeGreaterThan(-1);
  return STEPS_SRC.slice(start, start + 1400);
}

describe('«Не сегодня» пишет статус пропуска', () => {
  it('статус стал тем, который узнаёт остальная механика', () => {
    const branch = skippedBranch();
    expect(branch).toContain("status: 'missed'");
    // Прежний 'skipped' в этой ветке больше не пишется.
    expect(branch).not.toContain("status: 'skipped'");
  });

  it('вопрос о причине помечается ожидающим', () => {
    expect(skippedBranch()).toContain('skipReasonPending: true');
  });

  it('день, о котором спрашиваем, назван явно', () => {
    const branch = skippedBranch();
    expect(branch).toContain("'heys:ma-skip-reason-check'");
    expect(branch).toContain('detail: { dateKey }');
  });

  it('«missed» признан ответом чек-ина наравне с остальными', () => {
    expect(STEPS_SRC).toContain(
      "const MORNING_ACTIVATION_CHECKIN_STATUSES = new Set(['done', 'planned', 'skipped', 'missed']);",
    );
  });

  it('прежний «skipped» не переписывается задним числом', () => {
    // Дни, записанные старой версией, продолжают читаться: статус остался
    // в списке отвеченных, а не выпал из него.
    expect(STEPS_SRC).toMatch(/CHECKIN_STATUSES = new Set\(\[[^\]]*'skipped'/);
  });
});

describe('Причина спрашивается в тот же день', () => {
  it('открытие отказывает для чужой даты', () => {
    const start = CHECKIN_SRC.indexOf('function maybeOpenMorningActivationSkipReason');
    expect(start).toBeGreaterThan(-1);
    const body = CHECKIN_SRC.slice(start, start + 2000);
    expect(body).toContain("if (dateKey !== getTodayKey())");
    expect(body).toContain("reason: 'not_today'");
    // Проверка стоит до чтения дня: спрашивать нечего, читать незачем.
    expect(body.indexOf("reason: 'not_today'"))
      .toBeLessThan(body.indexOf('readDayDataMergedForMaFollowup'));
  });

  it('отказ отвечать ничего не блокирует — день остаётся пропуском', () => {
    // Шаг причины пишет только сам ответ; статус пропуска уже стоит и от
    // отсутствия причины не меняется.
    const start = STEPS_SRC.indexOf('function MorningActivationSkipReasonStepComponent');
    expect(start).toBeGreaterThan(-1);
    const body = STEPS_SRC.slice(start, start + 1500);
    expect(body).toContain('skipReasonId: id');
    expect(body).not.toContain("status: 'done'");
    expect(body).not.toContain("status: 'planned'");
  });
});

describe('Вкладка знает про новый статус', () => {
  it('«не сегодня» считается решённым — зарядку не спрашивают снова', () => {
    const start = ACTIVITY_SRC.indexOf('function hasMorningActivationResolved');
    expect(start).toBeGreaterThan(-1);
    expect(ACTIVITY_SRC.slice(start, start + 400)).toContain("status === 'missed'");
  });
});
