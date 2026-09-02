// Сборка панели куратора: серверное окно и профили → поправка по каждому
// клиенту.
//
// Главное здесь — панель не заводит второй расчёт. Она кормит теми же данными
// тот же движок, что и клиент: разойдись они, оба числа выглядели бы
// правдоподобно, и расхождение всплыло бы только жалобой человека.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);

let NC;
let tdeeCalls;

// Движок расхода подменяем на счётный: проверяем не его арифметику (она своя и
// покрыта отдельно), а что панель зовёт именно его и с правильным сырьём.
const weightSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_widgets_weight_dynamics_v4.js'),
  'utf8'
);

function loadWith(calculate) {
  tdeeCalls = [];
  window.HEYS = {
    utils: { lsGet: () => null },
    TDEE: {
      calculate: (day, profile, opts) => {
        tdeeCalls.push({ day, profile, opts });
        return calculate(day, profile, opts);
      }
    }
  };
  // Тренд веса берём настоящий: панель обязана считать его тем же алгоритмом,
  // что и клиент, иначе числа разойдутся при одинаковых данных.
  // eslint-disable-next-line no-eval
  (0, eval)(weightSrc);
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  NC = window.HEYS.NormCorrection;
}

const FLAT = () => ({ baseExpenditure: 2400, bmr: 1520, deficitPct: -12, cycleMultiplier: 1, optimum: 2112 });

function windowRow(date, over = {}) {
  return Object.assign({
    client_id: 'c1',
    day_date: date,
    has_day: true,
    meals_count: 4,
    kcal: 2112,
    water_ml: 2000,
    steps: 8000,
    trainings_count: 0,
    training_min: 0,
    zone_min: null,
    household_min: 0,
    weight_morning: 90,
    weight_measured: true,
    waist: null,
    sleep_hours: 7,
    is_incomplete: false
  }, over);
}

function contextRow(over = {}) {
  return Object.assign({
    client_id: 'c1',
    weight: 90, height: 180, age: 35, birth_date: '1991-01-01',
    gender: 'Мужской', deficit_pct_target: -12, hr_zones: null,
    norm_correction_factor: null, norm_correction_applied_at: null,
    last_decision: null, last_decision_week: null
  }, over);
}

const days21 = (over = (i) => ({})) => Array.from({ length: 21 }, (_, i) =>
  windowRow('2026-08-' + String(i + 1).padStart(2, '0'), over(i)));

describe('панель куратора · сборка строк', () => {
  beforeEach(() => loadWith(FLAT));

  it('минуты по зонам едут в движок одной тренировкой, а не суммой', () => {
    // Расход линеен по минутам внутри зоны, поэтому сложенные зоны дают тот же
    // результат. А по одной общей сумме его не воспроизвести вовсе.
    const day = NC.dayFromWindowRow(windowRow('2026-08-01', {
      zone_min: [8, 31, 41, 0], training_min: 80, trainings_count: 1
    }));
    expect(day.trainings).toEqual([{ z: [8, 31, 41, 0] }]);
  });

  it('день без тренировки не получает пустую заготовку', () => {
    // Пустой слот движок посчитал бы тренировкой — этот дефект уже ловили в
    // посуточной сводке.
    const day = NC.dayFromWindowRow(windowRow('2026-08-01', { zone_min: [0, 0, 0, 0] }));
    expect(day.trainings).toEqual([]);
  });

  it('возраст едет и числом, и датой — движок выбирает сам', () => {
    // У живого клиента нашлось age 25 при дате рождения 1991 года.
    const prof = NC.profileFromContextRow(contextRow({ age: 25, birth_date: '1991-10-29' }));
    expect(prof.age).toBe(25);
    expect(prof.birthDate).toBe('1991-10-29');
  });

  it('свои METы зон уходят в движок, а не подменяются умолчанием', () => {
    const zones = [{ MET: 3 }, { MET: 7 }, { MET: 9 }, { MET: 11 }];
    NC.buildPanelRows({ windowRows: days21(), contextRows: [contextRow({ hr_zones: zones })] });
    expect(tdeeCalls.length).toBeGreaterThan(0);
    expect(tdeeCalls[0].opts.hrZones).toEqual(zones);
  });

  it('расход берётся до поправки — иначе она сходится сама на себя', () => {
    NC.buildPanelRows({ windowRows: days21(), contextRows: [contextRow({ norm_correction_factor: 0.94 })] });
    // В движок идёт профиль клиента; поправку накладывает норма дня, а не он.
    expect(tdeeCalls[0].opts.includeNDTE).toBe(false);
  });

  it('поправка считается той же compute — сквозной пример сходится', () => {
    // Ели 2112 при расходе 2400, вес почти стоит: расчёт завышен.
    const rows = NC.buildPanelRows({
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow()]
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].result.status).toBe('ready');
    expect(rows[0].result.direction).toBe('down');
  });

  it('расчётный вес в тренд не идёт', () => {
    const rows = NC.buildPanelRows({
      windowRows: days21((i) => ({ weight_measured: i % 2 === 0 })),
      contextRows: [contextRow()]
    });
    // Из 21 дня измеренных 11 — по ним и считается окно веса.
    expect(rows[0].result.weighIns).toBe(11);
  });

  it('тренд веса считает канонический алгоритм, а не разность двух точек', () => {
    // Одна выпавшая точка внутри окна не должна двигать число: у клиента она
    // интерполируется сглаживанием, и у куратора обязана тоже.
    const withHole = NC.buildPanelRows({
      windowRows: days21((i) => (
        i === 10 ? { weight_morning: null, weight_measured: false } : { weight_morning: 90 - i * 0.05 }
      )),
      contextRows: [contextRow()]
    })[0];
    const whole = NC.buildPanelRows({
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.05 })),
      contextRows: [contextRow()]
    })[0];
    expect(withHole.result.mismatchPct).toBe(whole.result.mismatchPct);
  });

  it('молчание считается подряд с конца окна', () => {
    const rows = NC.buildPanelRows({
      windowRows: days21((i) => (i >= 17 ? { has_day: false } : {})),
      contextRows: [contextRow()]
    });
    expect(rows[0].silentDays).toBe(4);
    expect(rows[0].isSilent).toBe(true);
  });

  it('«ждёт решения» — расчёт готов и ответа по нему нет', () => {
    const ready = NC.buildPanelRows({
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow()]
    })[0];
    expect(ready.awaitsDecision).toBe(true);

    const answered = NC.buildPanelRows({
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow({ last_decision: 'declined' })]
    })[0];
    expect(answered.awaitsDecision).toBe(false);
  });

  it('порядок — по старшинству состояний из контракта, а не по тревожности', () => {
    // Контракт: ждёт решения → расчёт разошёлся → молчит → копят данные →
    // всё ровно. Молчащий девять дней стоит НИЖЕ расхождения — это решение
    // владельца, а не интуиция кодера.
    const win = [
      ...days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      ...days21((i) => (i >= 12 ? { has_day: false } : {})).map((r) => ({ ...r, client_id: 'c2' })),
      ...days21().map((r) => ({ ...r, client_id: 'c3' }))
    ];
    const rows = NC.buildPanelRows({
      windowRows: win,
      contextRows: [contextRow(), contextRow({ client_id: 'c2' }), contextRow({ client_id: 'c3' })]
    });
    expect(rows.map((r) => r.state)).toEqual(
      [...rows].sort((a, b) => NC.PANEL_STATES.indexOf(a.state) - NC.PANEL_STATES.indexOf(b.state)).map((r) => r.state)
    );
    expect(rows[0].clientId).toBe('c1');
    expect(rows[0].state).toBe('awaits');
  });

  it('клиент стоит в одной группе, второе состояние — фразой', () => {
    // Две пилюли читались бы как две группы, и счёт групп перестал бы
    // складываться в число клиентов.
    const silentAndOff = NC.buildPanelRows({
      windowRows: days21((i) => (i >= 17 ? { has_day: false } : { weight_morning: 90 })),
      contextRows: [contextRow()]
    })[0];
    expect(NC.PANEL_STATES).toContain(silentAndOff.state);
    if (silentAndOff.state === 'silent' && silentAndOff.mismatchPct) {
      expect(silentAndOff.alsoNote).toBe('и расчёт разошёлся');
    }
  });

  it('решение держится до конца дня, а не исчезает сразу', () => {
    const today = new Date('2026-08-30T12:00:00');
    const justAnswered = NC.buildPanelRows({
      now: today,
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow({ last_decision: 'applied', last_decision_at: today.getTime() })]
    })[0];
    expect(justAnswered.state).toBe('decided_today');

    const yesterday = NC.buildPanelRows({
      now: today,
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow({ last_decision: 'applied', last_decision_at: new Date('2026-08-29T12:00:00').getTime() })]
    })[0];
    expect(yesterday.state).not.toBe('decided_today');
  });

  it('пилюля меряет длительность состояния, а не важность', () => {
    // У молчания — дни без записей; у расхождения — длина окна; у «ждут
    // решения» — дни с последнего пересчёта, то есть с понедельника.
    const monday = new Date('2026-08-31T10:00:00');
    const thursday = new Date('2026-09-03T10:00:00');
    expect(NC.daysSinceMonday(monday)).toBe(0);
    expect(NC.daysSinceMonday(thursday)).toBe(3);
    // Воскресенье — шестой день недели, а не нулевой.
    expect(NC.daysSinceMonday(new Date('2026-09-06T10:00:00'))).toBe(6);

    const silent = NC.buildPanelRows({
      windowRows: days21((i) => (i >= 17 ? { has_day: false } : {})),
      contextRows: [contextRow()]
    })[0];
    expect(silent.state).toBe('silent');
    expect(silent.ageDays).toBe(silent.silentDays);

    const awaits = NC.buildPanelRows({
      now: thursday,
      windowRows: days21((i) => ({ weight_morning: 90 - i * 0.0127 })),
      contextRows: [contextRow()]
    })[0];
    expect(awaits.state).toBe('awaits');
    // Не «дни с первого расчёта»: предложение не хранится, мерить нечем.
    expect(awaits.ageDays).toBe(3);
  });

  it('окно ещё не набралось — это «копят данные», а не ошибка', () => {
    const rows = NC.buildPanelRows({
      windowRows: days21((i) => (i > 5 ? { has_day: false } : {})),
      contextRows: [contextRow()]
    });
    expect(rows[0].collecting).toBe(true);
  });

  it('клиент без профиля не роняет панель целиком', () => {
    const rows = NC.buildPanelRows({
      windowRows: days21(),
      contextRows: [contextRow({ weight: null, height: null, age: null })]
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].result.status).toBeTruthy();
  });

  it('окно без единой записи не выдаёт себя за расчёт', () => {
    const rows = NC.buildPanelRows({
      windowRows: days21(() => ({ has_day: false })),
      contextRows: [contextRow()]
    });
    expect(rows[0].result.status).not.toBe('ready');
    expect(rows[0].silentDays).toBe(21);
  });

  it('фиксирует доступные куратору замеры в evidence решения без выдуманных обхватов', () => {
    const missing = NC.buildPanelRows({
      windowRows: days21(),
      contextRows: [contextRow()]
    })[0];
    expect(missing.evidence).toEqual({ kind: 'missing' });

    const waistOnly = NC.buildPanelRows({
      windowRows: days21((i) => ({ waist: [0, 7, 14].includes(i) ? 80 : null })),
      contextRows: [contextRow()]
    })[0];
    expect(waistOnly.evidence).toEqual({
      kind: 'waist_only',
      waistPoints: 3,
      spanDays: 14
    });
    expect(waistOnly.evidence.kind).not.toBe('stable_girths');
  });
});

describe('панель куратора · коридор', () => {
  it('расчёт в мёртвой зоне даёт своё состояние, а не «всё ровно»', () => {
    // Клиент остаётся на виду: в «всё ровно» группа свёрнута, и он пропал бы
    // с глаз вместе со своими числами.
    const NC = window.HEYS.NormCorrection;
    expect(NC.PANEL_STATES.indexOf('in_corridor'))
      .toBeGreaterThan(NC.PANEL_STATES.indexOf('mismatch'));
    expect(NC.PANEL_STATES.indexOf('in_corridor'))
      .toBeLessThan(NC.PANEL_STATES.indexOf('fine'));
  });
});
