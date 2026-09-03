// Резервный вопрос после еды против кадра «Рутина · резервный вопрос после еды».
//
// Зона checkin-morning держит геометрию этого листа инлайном в кадре, а
// продукт — в классах, поэтому пары «класс кадра → класс продукта» тут нет:
// сверяем числа кадра с правилами продукта поимённо. Кадр читается из самого
// канваса, поэтому расхождение всплывёт при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const CANVAS = fs.readFileSync(
  path.join(
    ROOT,
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/checkin-morning.v4.dc.html',
  ),
  'utf8',
);
const STEPS = fs.readFileSync(path.join(ROOT, 'apps/web/heys_steps_v1.js'), 'utf8');
const CALENDAR = fs.readFileSync(
  path.join(ROOT, 'apps/web/heys_morning_activation_calendar_v1.js'),
  'utf8',
);
const CSS = fs.readFileSync(
  path.join(ROOT, 'apps/web/styles/modules/300-modals-and-day.css'),
  'utf8',
);

const FRAME = CANVAS.slice(
  CANVAS.indexOf('data-screen-label="Рутина · резервный вопрос после еды"'),
);

/** Тело самого листа: от кадрового комментария до регистрации шага. */
function followupStep() {
  const from = STEPS.indexOf('Кадр «Рутина · резервный вопрос после еды»');
  const to = STEPS.indexOf("registerStep('morning_activation_followup'");
  return from >= 0 && to > from ? STEPS.slice(from, to) : '';
}

function rule(selector) {
  const at = CSS.indexOf(`\n${selector} {`);
  return at < 0 ? null : CSS.slice(at, CSS.indexOf('}', at));
}

describe('резервный вопрос после еды', () => {
  it('заметка — карточка --gr-bg радиусом 16 полями 12/13', () => {
    expect(FRAME).toContain('border-radius:16px;background:var(--gr-bg);padding:12px 13px');
    const note = rule('.ma-followup-note');
    expect(note).toContain('border-radius: 16px');
    expect(note).toContain('padding: 12px 13px');
    expect(note).toContain('var(--v4-ok-bg)');
    expect(rule('.ma-followup-note-title')).toContain('font-size: 13px');
    expect(rule('.ma-followup-note-text')).toContain('font-size: 11.5px');
  });

  it('три ответа стоят в ряд пилюлями 44, а не стопкой на всю ширину', () => {
    // Кадр: три пилюли flex:1, min-height 44, радиус 999, зазор 6.
    expect(FRAME).toContain('display:flex;gap:6px;margin-top:12px;');
    expect(FRAME).toContain('flex:1;min-height:44px;border-radius:999px;background:var(--gr-bg)');
    const answers = rule('.ma-followup-answers');
    expect(answers).toContain('display: flex');
    expect(answers).toContain('gap: 6px');
    const pill = rule('.ma-followup-answer');
    expect(pill).toContain('min-height: 44px');
    expect(pill).toContain('border-radius: 999px');
    expect(pill).toContain('flex: 1');
    // Стопка на всю ширину — снятая ветка живого экрана (строка
    // «резервный вопрос · снято»). Сторожим её отсутствие в САМОМ листе:
    // класс `mc-rest-routine-actions` живёт дальше в шаге отдыха, и запрет по
    // всему файлу запретил бы чужое.
    expect(answers).not.toContain('flex-direction: column');
    expect(followupStep()).not.toContain('mc-rest-routine-actions');
  });

  it('«Сделал» отличается заливкой, остальные два — обводкой', () => {
    const done = rule('.ma-followup-answer--done');
    expect(done).toContain('var(--v4-ok-bg)');
    expect(rule('.ma-followup-answer')).toContain('inset 0 0 0 1.5px');
  });

  it('календарь вставляется тем же блоком, что в «Активе», без своего варианта', () => {
    // Строка «календарь в резервном вопросе» запрещает шторке свой вид.
    // Класс раскладки «Актива» стоит рядом со своим: вид блока держат его
    // правила, а `--sheet` отвечает только за два добавления шторки.
    expect(STEPS).toContain("layoutClass: 'ma-habit-cal--activity-v4 ma-habit-cal--sheet'");
    expect(STEPS).not.toContain("layoutClass: 'ma-habit-cal--modal'");
    // Вид больше не требует предка `.activity-v4`: блок вставляет и шторка.
    const activityCss = fs.readFileSync(
      path.join(ROOT, 'apps/web/styles/modules/731-ui-v4-activity.css'),
      'utf8',
    );
    expect(activityCss).not.toContain('.activity-v4 .ma-habit-cal--activity-v4');
    expect(CALENDAR).toContain("const isSheet = (layoutClass || '').includes('ma-habit-cal--sheet')");
    expect(CALENDAR).toContain('const isDotGrid = isActivityV4 || isSheet;');
    // Числа дней и шапка дней недели — снятая ветка: у точечной сетки их нет.
    expect(CALENDAR).toContain("!isDotGrid && React.createElement('div', { className: 'ma-habit-cal-weekdays' }");
  });

  it('у шторки два своих добавления: шапка и строка счёта', () => {
    expect(FRAME).toContain('Календарь привычки');
    expect(STEPS).toContain("headingTitle: 'Календарь привычки'");
    expect(CALENDAR).toContain('isSheet ? headingTitle : v4Heading');
    expect(FRAME).toContain('Сделано 18 · Тренировкой 2 · Пропущено 5');
    expect(CALENDAR).toMatch(/Сделано \$\{calendarData\.doneCount\} · Тренировкой/);
    expect(rule('.ma-habit-cal-tally')).toContain('font-size: 10.5px');
  });

  it('изумрудные литералы прежней системы из листа ушли', () => {
    const step = followupStep();
    expect(step).toBeTruthy();
    for (const literal of ['#065f46', '#334155', 'rgba(16,185,129', '#047857']) {
      expect(step, literal).not.toContain(literal);
    }
  });
  it('крест справа, оба текста шапки слева, как в кадре', () => {
    // Кадр креста не рисует вовсе — лист v4 закрывается ручкой или свайпом, —
    // но выход из шторки продуктовый инвариант, и слева он спорил с
    // заголовком. Текст при этом прижат влево, как нарисовано: прежняя
    // попытка ставила заголовок вплотную к краю, но это было поле, а не
    // выравнивание — шапка шла на общих 12/8 против 14 у листа кадра.
    const moved = CSS.indexOf('[data-heys-step-id="morning_activation_followup"] .mc-header-left');
    expect(moved, 'правило переноса креста найдено').toBeGreaterThan(-1);
    expect(CSS.slice(moved, CSS.indexOf('}', moved))).toContain('order: 3');
    const center = CSS.indexOf('[data-heys-step-id="morning_activation_followup"] .mc-header-center {');
    expect(center, 'правило выравнивания найдено').toBeGreaterThan(-1);
    expect(CSS.slice(center, CSS.indexOf('}', center))).toContain('text-align: left');
    // AutoFitText центрирует строку инлайном, и до неё выравнивание родителя
    // не доходит: подпись оставалась по центру при левом заголовке.
    expect(CSS).toContain('.mc-header-hint-container');
  });

});

// Лист «Почему сегодня без зарядки?» против кадра «Рутина · причина пропуска» и
// строки «вид · причина пропуска». До 3 сентября экран жил на прежней системе:
// инлайновые #fff и #0f172a, обводка rgba(148,163,184,.45), радиус 12, кегли
// 13/12/14 и обращение на «ты» — поэтому проверка сторожит и отсутствие этого.
describe('причина пропуска', () => {
  const SKIP_FRAME = CANVAS.slice(
    CANVAS.indexOf('data-screen-label="Рутина · причина пропуска"'),
  );

  it('заголовок и подпись взяты у кадра, а не у прежней системы', () => {
    expect(SKIP_FRAME).toContain('Почему сегодня без зарядки?');
    expect(SKIP_FRAME).toContain('Ответ видите только вы — он нужен для картины дня.');
    expect(STEPS).toContain("'Почему сегодня без зарядки?'");
    expect(STEPS).toContain("'Ответ видите только вы — он нужен для картины дня.'");
    // Прежняя подпись говорила человеку «ты», хотя лист обращается на «вы».
    expect(STEPS).not.toContain('это только для твоей картины дня');
    expect(rule('.ma-skip-reason-title')).toContain('font-size: 16px');
    expect(rule('.ma-skip-reason-title')).toContain('line-height: 1.3');
    expect(rule('.ma-skip-reason-sub')).toContain('font-size: 11.5px');
    expect(rule('.ma-skip-reason-sub')).toContain('margin-top: 4px');
  });

  it('пять строк-ответов через 12 зазором 7, заливкой --c1 и без обводки', () => {
    expect(SKIP_FRAME).toContain('gap:7px;margin-top:12px');
    const options = rule('.ma-skip-reason-options');
    expect(options).toContain('gap: 7px');
    expect(options).toContain('margin-top: 12px');
    const option = rule('.ma-skip-reason-option');
    expect(option).toContain('min-height: 44px');
    expect(option).toContain('border-radius: 14px');
    expect(option).toContain('padding: 12px 14px');
    expect(option).toContain('font-size: 12.5px');
    expect(option).toContain('font-weight: 600');
    // Строка контракта называет только заливку: «обводки нет».
    expect(option).toContain('border: none');
    expect(option).toMatch(/background: var\(--v4-c1\b/);
  });

  it('литералов прежней системы на этом листе не осталось', () => {
    const from = STEPS.indexOf('function MorningActivationSkipReasonStepComponent');
    const to = STEPS.indexOf("registerStep('morningRoutine'");
    const body = from >= 0 && to > from ? STEPS.slice(from, to) : '';
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/#0f172a|#64748b|148,163,184/);
    expect(body).not.toContain('borderRadius');
    // Наведение красилось синим прежней палитры, которой в наборах v4 нет.
    // Сторожим только своё правило: тот же литерал остался обводкой фокуса
    // в чужом месте этого файла и к листу причины отношения не имеет.
    const hover = CSS.slice(CSS.indexOf('.ma-skip-reason-option:hover'));
    expect(hover.slice(0, hover.indexOf('}'))).toMatch(/background: var\(--v4-chip[,)]/);
  });
});
