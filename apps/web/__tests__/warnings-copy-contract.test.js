// Правила копии предупреждений из контракта зоны «Отчёты и Инсайты».
// Тест закрепляет правила, а не конкретные пятнадцать строк: строки перепишут,
// а правила должны пережить переписывание. Проверяется исходник, потому что
// тексты живут шаблонами внутри функций проверок и собираются только на живых
// данных.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../insights/pi_early_warning.js'),
  'utf8'
);

// Строки, которые видит человек: главная фраза и подстрока карточки.
function userFacingLines() {
  const out = [];
  const re = /^\s*(humanMessage|detail):\s*(`[^`]*`|'[^']*')/gm;
  let m;
  while ((m = re.exec(SRC))) out.push({ slot: m[1], text: m[2] });
  return out;
}

// Код снятого сигнала недостижим: до него стоит ранний возврат. Такие строки
// вернутся вместе со своим текстом, когда появится источник.
const RETIRED = [
  'checkTrainingWithoutRecovery',
  'checkFatQualityDecline',
  'checkSugarDependency',
  'checkMicronutrientGap',
  'checkElectrolyteImbalance'
];

function bodyOf(fnName) {
  const start = SRC.indexOf('function ' + fnName + '(');
  if (start < 0) return '';
  const next = RETIRED.concat(['detectEarlyWarningSignals'])
    .map((n) => SRC.indexOf('function ' + n + '(', start + 1))
    .filter((i) => i > start);
  return SRC.slice(start, next.length ? Math.min(...next) : SRC.length);
}

function liveLines() {
  const retiredBodies = RETIRED.map(bodyOf);
  return userFacingLines().filter(
    ({ text }) => !retiredBodies.some((b) => b.includes(text))
  );
}

describe('копия предупреждений · правила контракта', () => {
  it('пять молчащих сигналов сняты, а не переписаны', () => {
    RETIRED.forEach((fn) => {
      const body = bodyOf(fn);
      expect(body, fn).toContain('Снят до появления источника');
      // Ранний возврат стоит до всякой работы: первый return в теле.
      expect(body.slice(0, body.indexOf('return null;')), fn)
        .not.toContain('warnings.push');
    });
  });

  it('у циркадного осталась только ветка поздних приёмов', () => {
    const body = SRC.slice(SRC.indexOf('function checkCircadianDisruption('));
    const head = body.slice(0, body.indexOf('function ', 10));
    // Разброс сна читал day.sleep.time, а поле называется sleepStart.
    expect(head).not.toContain('day.sleep?.time');
    expect(head).not.toContain('sleepVariance');
  });

  it('в живых текстах нет латиницы и жаргона', () => {
    const BANNED = [
      'Trend Score', 'Status Score', 'Omega Balancer', 'Added Sugar',
      'Electrolyte Homeostasis', 'binge eating', 'circadian clocks',
      'NEAT', 'overtraining', 'cravings', 'mood ', 'wellbeing '
    ];
    const bad = [];
    liveLines().forEach(({ text }) => {
      BANNED.forEach((w) => { if (text.includes(w)) bad.push(w + ' → ' + text); });
    });
    expect(bad).toEqual([]);
  });

  it('числа склоняются формой, а не подстановкой', () => {
    // «${n} дней» и «${n} тренировок» дают «3 дней» и «4 тренировок».
    const bad = liveLines().filter(({ text }) =>
      /\$\{[^}]+\}\s*(дней|дня|тренировок|баллов)\b/.test(text));
    expect(bad.map((b) => b.text)).toEqual([]);
    // Склонятор существует и используется.
    expect(SRC).toContain('function pluralDaysRu');
  });

  it('копия не обещает непрерывности там, где код её не проверяет', () => {
    // Клетчатка, натрий, жиры и сахар набирают дни вразбивку за 30-дневное
    // окно — слово «подряд» у них было ложью.
    ['Клетчатки меньше нормы', 'Соли выше нормы'].forEach((start) => {
      const line = liveLines().find(({ text }) => text.includes(start));
      expect(line, start).toBeTruthy();
      expect(line.text, start).not.toContain('подряд');
      expect(line.text, start).toContain('за месяц');
    });
  });

  it('подстрока не повторяет главную фразу', () => {
    // У низкого балла паттерна обе строки были одной и той же фразой.
    const dup = SRC.match(/humanMessage: humanMsg\.message,\s*\n\s*detail: humanMsg\.message,/g);
    expect(dup).toBeNull();
    // И у каждой из трёх веток свой порог, а не общий.
    expect(SRC).toContain('порог ${PATTERN_LOW_SCORE_THRESHOLDS.critical}');
    expect(SRC).toContain('порог 50');
    expect(SRC).toContain('порог ${PATTERN_LOW_SCORE_THRESHOLDS.important}');
  });

  it('слово зрелости считается по природе сигнала, а не зашито', () => {
    expect(SRC).toContain('function resolveMaturityWord');
    // Модельные выводы — «прогноз».
    ['HEALTH_SCORE_DECLINE', 'CRITICAL_PATTERN_DEGRADATION', 'STATUS_SCORE_DECLINE']
      .forEach((t) => expect(SRC).toContain(`'${t}'`));
    // Лестница присваивается всем предупреждениям перед выдачей.
    expect(SRC).toMatch(/warnings\.forEach\(\(w\) => \{\s*\n\s*if \(!w\.maturity\)/);
  });

  it('сигнал, у которого не было главной фразы, её получил', () => {
    // Раньше карточка падала на технический заголовок с падежной ошибкой:
    // «Связь сна и веса ухудшился на 27%».
    const i = SRC.indexOf("type: 'CRITICAL_PATTERN_DEGRADATION'");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 1400)).toContain('humanMessage:');
  });
});
