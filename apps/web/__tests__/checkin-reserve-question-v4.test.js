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

  it('зазоры между блоками — отступы блоков из кадра, без общего gap колонки', () => {
    // Кадр: заметка сверху 12, календарь 10, ответы 12, подпись 11. Общий gap
    // колонки складывался с ними, и лист выходил на 30 px выше кадра.
    expect(FRAME).toContain('padding:12px 13px;margin-top:12px;');
    expect(FRAME).toContain('padding:14px;margin-top:10px;');
    expect(rule('.ma-followup-step')).toContain('gap: 0');
    expect(rule('.ma-followup-note')).toContain('margin-top: 12px');
    expect(rule('.ma-followup-answers')).toContain('margin-top: 12px');
    expect(rule('.ma-followup-footnote')).toContain('margin-top: 11px');
    expect(rule('.ma-habit-cal-shell')).toContain('margin-top: 10px');
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
  it('крест тонкий и мелкий, как SVG кадра, тоном --ink-3', () => {
    // Кадр: SVG 15 px, viewBox 24, штрих 2,75, отрезки 6→18 со скруглением.
    // В пикселях черта ≈ 12,3 × 1,7 px. Прежние 19 × 2,75 были вдвое жирнее.
    expect(FRAME).toContain('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75"');
    expect(FRAME).toContain('M6 6l12 12M18 6L6 18');
    const at = CSS.indexOf('[data-heys-step-id="morning_activation_followup"] .mc-header-btn--close::before,');
    expect(at, 'правило черт креста найдено').toBeGreaterThan(-1);
    const bar = CSS.slice(at, CSS.indexOf('}', at));
    expect(bar).toContain('width: 12.3px');
    expect(bar).toContain('height: 1.72px');
    expect(bar).toContain('background: var(--v4-ink-3)');
  });

  it('крест справа стоит зеркально кадру: вынос 12 за поле', () => {
    const own = CSS.indexOf('[data-heys-step-id="morning_activation_followup"] .mc-header-btn--close {');
    expect(own, 'своё правило положения креста').toBeGreaterThan(-1);
    expect(CSS.slice(own, CSS.indexOf('}', own))).toContain('margin: -10px 0');
    // Вынос на обёртке: у неё min-width 44, и поле кнопки она поглощала.
    const wrap = CSS.indexOf('[data-heys-step-id="morning_activation_followup"] .mc-header-left {\n  margin-right');
    expect(wrap, 'вынос обёртки креста').toBeGreaterThan(-1);
    expect(CSS.slice(wrap, CSS.indexOf('}', wrap))).toContain('margin-right: -12px');
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

  // Решение владельца 3 сентября: слой остаётся диалогом по центру. Поэтому
  // заголовок и подпись листа живут в шапке шага, а не вторым заголовком под
  // ней: выход у диалога несёт крестик шапки, и убрать её нельзя.
  it('заголовок и подпись стоят один раз — в шапке шага', () => {
    expect(SKIP_FRAME).toContain('Почему сегодня без зарядки?');
    expect(SKIP_FRAME).toContain('Ответ видите только вы — он нужен для картины дня.');
    const step = STEPS.slice(
      STEPS.indexOf("registerStep('morning_activation_skip_reason'"),
      STEPS.indexOf('function scaleWord'),
    );
    expect(step).toContain("title: 'Почему сегодня без зарядки?'");
    expect(step).toContain("hint: 'Ответ видите только вы — он нужен для картины дня.'");
    // Прежняя подпись говорила человеку «ты», хотя лист обращается на «вы».
    expect(STEPS).not.toContain('это только для твоей картины дня');
    // Своего заголовка у тела больше нет — это и был второй заголовок.
    expect(STEPS).not.toContain('ma-skip-reason-title');
    expect(STEPS).not.toContain('ma-skip-reason-sub');
    expect(rule('.ma-skip-reason-title')).toBeNull();
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
  it('«сегодня» в календаре обведено акцентом, а не чернилами', () => {
    // Строка «вид · календарь зарядки», решение 31 августа: «Сегодня» рисуется
    // обводкой 1,5 px акцентом, «не вели» — чернила 30 %. Обводка стояла теми
    // же чернилами 30 %, и два состояния снова различались только контуром —
    // ровно тем, от чего форма и должна была увести.
    const activityCss = fs.readFileSync(
      path.join(ROOT, 'apps/web/styles/modules/731-ui-v4-activity.css'),
      'utf8',
    );
    const at = activityCss.indexOf('.ma-habit-cal-cell.is-today.is-neutral');
    expect(at, 'правило «сегодня» найдено').toBeGreaterThan(-1);
    const todayRule = activityCss.slice(at, activityCss.indexOf('}', at));
    expect(todayRule).toContain('inset 0 0 0 1.5px');
    expect(todayRule).toContain('var(--v4-sand-act');
    expect(todayRule).not.toContain('--v4-ink-30');
  });

  it('календарь в шторке — свой блок и своя шапка', () => {
    // Строка «вид · резервный вопрос после еды»: блок --c1 радиусом 20 полями
    // 14. Строка «календарь в резервном вопросе»: шапка «Календарь привычки»
    // 13 px/700 чернилами. Общее правило вида обнуляет оболочку ради «Актива»,
    // поэтому у шторки свои правила третьим классом — иначе выигрывает оно.
    const activityCss = fs.readFileSync(
      path.join(ROOT, 'apps/web/styles/modules/731-ui-v4-activity.css'),
      'utf8',
    );
    const card = activityCss.indexOf('.ma-habit-cal-shell.ma-habit-cal--activity-v4.ma-habit-cal--sheet');
    expect(card, 'правило блока найдено').toBeGreaterThan(-1);
    const cardRule = activityCss.slice(card, activityCss.indexOf('}', card));
    expect(cardRule).toContain('padding: 14px');
    expect(cardRule).toContain('border-radius: 20px');
    expect(cardRule).toContain('var(--v4-c1)');

    const head = activityCss.indexOf('.ma-habit-cal--activity-v4.ma-habit-cal--sheet .ma-habit-cal-heading');
    expect(head, 'правило шапки найдено').toBeGreaterThan(-1);
    const headRule = activityCss.slice(head, activityCss.indexOf('}', head));
    expect(headRule).toContain('font-size: 13px');
    expect(headRule).toContain('font-weight: 700');

    // Прежняя оболочка держит на чипе режима min-height 44: с полями 4/7 и
    // радиусом 999 пилюля превращалась в круг.
    const pill = activityCss.indexOf('.ma-habit-cal--activity-v4 .ma-habit-cal-mode-btn {');
    const pillRule = activityCss.slice(pill, activityCss.indexOf('}', pill));
    expect(pillRule).toContain('min-height: 0');
    // Снятие рамки прежней оболочки не должно снова требовать предка вкладки.
    expect(activityCss).not.toContain('.activity-v4 .ma-habit-cal-shell.ma-habit-cal--activity-v4');
  });

  it('сетка дней — во всю ширину блока и от левого края колонки', () => {
    // Замер на стенде: шаг 43,5 и первая точка на x=40 совпадают с кадром до
    // пикселя. До правки сетка была зажата в 252 px и центрирована прежней
    // оболочкой, а точки стояли по центру колонок — ряд уезжал вправо.
    const activityCss = fs.readFileSync(
      path.join(ROOT, 'apps/web/styles/modules/731-ui-v4-activity.css'),
      'utf8',
    );
    const matrix = activityCss.indexOf('.ma-habit-cal--activity-v4.ma-habit-cal--sheet .ma-habit-cal-matrix');
    expect(matrix, 'правило ширины сетки найдено').toBeGreaterThan(-1);
    expect(activityCss.slice(matrix, activityCss.indexOf('}', matrix))).toContain('width: 100%');

    const align = activityCss.indexOf('.ma-habit-cal--activity-v4.ma-habit-cal--sheet .ma-habit-cal-grid--dot');
    expect(align, 'правило выравнивания найдено').toBeGreaterThan(-1);
    expect(activityCss.slice(align, activityCss.indexOf('}', align))).toContain('justify-items: start');
  });

});
