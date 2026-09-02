// ui-v4-dom-measure.mjs — недостающее звено между разбором контракта и судьёй.
//
// Цепочка сверки экрана с макетом состоит из трёх частей:
//
//   parseContractAssertions  →  [ЭТОТ МОДУЛЬ]  →  evaluateDomEvidence
//   строка канваса в набор       снять с живого     сказать «сошлось»
//   проверяемых утверждений      экрана факты       или «разошлось»
//
// Крайние две были написаны раньше и покрыты тестами, средней не было вовсе:
// судью звал только его собственный тест, потому что данные для него никто не
// производил. Этот модуль их производит.
//
// ПОЧЕМУ ПОИСК ПО ПОДПИСИ, А НЕ АДРЕСАЦИЯ ЭЛЕМЕНТА
//
// Строка контракта названа «<Кадр> · NN», и номер выглядит как адрес, но им не
// является. Слепок контракта обходит разметку кадра сверху вниз и **сворачивает
// одинаковые элементы в одну строку**: под «Вход в анкету · 16» стоят все десять
// клавиш цифровой клавиатуры, под «· 13» — три элемента, под «· 05» — два.
// Обратной ссылки «строка → узел» в канвасах нет вовсе: у нумерованных
// элементов нет ни id, ни класса, ни data-атрибута, только инлайновый style.
//
// То есть строка описывает не элемент, а ПОДПИСЬ: «высота 42px, радиус 14px,
// фон #f7efe2, шрифт 600 19px/1 Figtree». Поэтому и вопрос к экрану ставится
// так: есть ли под корнем экрана элемент с этой подписью. Несколько совпадений
// — норма, ровно их канвас и схлопнул; ноль совпадений — расхождение, и тогда
// показывается ближайший кандидат с перечнем разошедшихся свойств.
//
// ПОЧЕМУ ЗАМЕР, А НЕ ЧТЕНИЕ CSS-ПРАВИЛА
//
// Правило говорит, что оно объявляет, но не знает, что его перебивает ниже по
// каскаду: палитровое переопределение, дубль селектора, `!important` из
// соседнего модуля. Сверка «правило против строки контракта» при этом остаётся
// зелёной, а экран выглядит иначе. Поэтому факты снимаются с вычисленных
// значений.
//
// Модуль разделён намеренно: браузер исполняет только READ_SCREEN_SOURCE, и его
// код обязан быть сериализуемым. Остальное — обычные функции Node, проверяемые
// тестом без браузера.

/** Свойства computed-стиля, которыми меряется каждое `property` утверждения. */
const STYLE_PROPERTY = {
  // dimensions
  width: 'width',
  height: 'height',
  gap: 'gap',
  'border-radius': 'borderRadius',
  padding: 'padding',
  'margin-top': 'marginTop',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  'margin-right': 'marginRight',
  // layout
  'align-items': 'alignItems',
  'justify-content': 'justifyContent',
  flex: 'flex',
  // color
  color: 'color',
  background: 'backgroundColor',
  fill: 'fill',
  stroke: 'stroke',
  opacity: 'opacity',
  'ink-opacity': 'opacity',
};

/** Четыре поля, которые судья требует у типографики целиком. */
const FONT_FIELDS = ['fontWeight', 'fontSize', 'lineHeight', 'fontFamily'];

/** Цветовые свойства: факт снимается парой «объявлено / вычислено». */
const COLOR_PROPERTY = new Set(['color', 'background', 'fill', 'stroke']);

const TOKEN_RE = /var\(\s*(--[a-z0-9-]+)/i;

/** Роль палитры из ожидания вида `var(--v4-ink)`; иначе null. */
export function expectedToken(assertion) {
  const css = assertion?.expected?.css;
  if (typeof css !== 'string') return null;
  const m = TOKEN_RE.exec(css);
  return m ? m[1] : null;
}

/**
 * Что нужно снять с элементов экрана, чтобы судить весь набор строк разом.
 *
 * План строится один раз на экран, а не на строку: страница обходится
 * единственный раз, и снятые значения переиспользуются всеми строками.
 */
export function describeReads(parsedList) {
  const styleProps = new Set();
  const tokens = new Set();
  let needText = false;
  let needRole = false;
  let needScroll = false;

  for (const parsed of parsedList) {
    for (const assertion of parsed?.assertions || []) {
      const { kind, property } = assertion;
      if (kind === 'text') {
        needText = true;
        continue;
      }
      if (kind === 'semantic') {
        if (property === 'role') needRole = true;
        if (property === 'scroll-container') needScroll = true;
        continue;
      }
      if (kind === 'typography') {
        for (const f of FONT_FIELDS) styleProps.add(f);
        continue;
      }
      const name = STYLE_PROPERTY[property];
      if (name) styleProps.add(name);
      if (COLOR_PROPERTY.has(property)) {
        const token = expectedToken(assertion);
        if (token) tokens.add(token);
      }
    }
  }

  return {
    styleProps: [...styleProps].sort(),
    tokens: [...tokens].sort(),
    needText,
    needRole,
    needScroll,
  };
}

/**
 * Исходник функции, которую исполняет страница. Строкой, а не ссылкой на
 * функцию модуля: page.evaluate сериализует тело, и замыкания модуля внутри
 * недоступны.
 *
 * Снимает по одному снимку с каждого элемента под корнем экрана. Скрытые
 * элементы пропускаются: контракт описывает то, что видно, а нулевой прямоугольник
 * даёт ложные совпадения по нулевым размерам.
 */
export const READ_SCREEN_SOURCE = `(plan) => {
  const root = document.querySelector(plan.rootSelector);
  if (!root) return { missing: true, elements: [] };
  const out = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (let i = 0; i < all.length && out.length < plan.limit; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = {};
    for (const prop of plan.styleProps) style[prop] = cs[prop];
    const tokens = {};
    for (const name of plan.tokens) tokens[name] = cs.getPropertyValue(name).trim();
    const item = {
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      rect: { w: Math.round(rect.width * 100) / 100, h: Math.round(rect.height * 100) / 100 },
      style: style,
      tokens: tokens,
    };
    if (plan.needText) item.text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
    if (plan.needRole) item.role = el.getAttribute('role');
    if (plan.needScroll) {
      const oy = cs.overflowY;
      item.scrollContainer = oy === 'auto' || oy === 'scroll';
    }
    out.push(item);
  }
  return { missing: false, elements: out };
}`;

/** Короткий человекочитаемый адрес элемента: тег и первые классы. */
export function describeElement(el, index) {
  const cls = (el.cls || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const base = cls ? `${el.tag}.${cls}` : el.tag;
  return `${base} [#${index}, ${el.rect?.w}×${el.rect?.h}]`;
}

function actualForAssertion(assertion, el) {
  const { kind, property } = assertion;
  const style = el.style || {};

  if (kind === 'text') return { text: el.text ?? '' };

  if (kind === 'semantic') {
    if (property === 'role') return { semantic: { role: el.role ?? null } };
    // Судья требует именно boolean, строка 'true' его не устроит.
    if (property === 'scroll-container') {
      return { semantic: { 'scroll-container': el.scrollContainer === true } };
    }
    return { semantic: {} };
  }

  if (kind === 'typography') {
    return {
      computedStyle: {
        fontWeight: style.fontWeight,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontFamily: style.fontFamily,
      },
    };
  }

  if (kind === 'color') {
    if (property === 'opacity') return { computedStyle: { opacity: style.opacity } };
    if (property === 'ink-opacity') return { computedStyle: { inkOpacity: Number(style.opacity) } };
    // `declared` и `resolved` намеренно одинаковые: объявленное значение с
    // живого элемента не достать, а судья сначала пробует текстовое равенство,
    // затем сравнение по RGBA. Токен закрывается через expectedResolved,
    // литерал — через resolved.
    const value = style[STYLE_PROPERTY[property]];
    return { declared: value, resolved: value };
  }

  const name = STYLE_PROPERTY[property];
  return { computedStyle: { [property]: name ? style[name] : undefined } };
}

/**
 * Собрать доказательства для одного элемента-кандидата.
 *
 * `selector` попадает в каждую запись: судья требует его непустым, а человек,
 * читающий расхождение, по нему находит элемент на экране.
 */
export function buildEvidence({ parsed, selector, element }) {
  const evidence = [];
  for (const assertion of parsed?.assertions || []) {
    const item = {
      assertionId: assertion.id,
      sourceHash: parsed.sourceHash,
      selector,
      source: 'runtime',
      property: assertion.property,
      actual: actualForAssertion(assertion, element),
    };
    if (assertion.kind === 'color') {
      const token = expectedToken(assertion);
      // Без этого токен несравним с цветом вовсе: судья вернёт «неубедительно».
      if (token && element?.tokens?.[token]) item.expectedResolved = element.tokens[token];
    }
    evidence.push(item);
  }
  return evidence;
}

/**
 * Сопоставить строку контракта с экраном.
 *
 * Возвращает:
 *   status  'matched'      — нашлись элементы, у которых сошлись ВСЕ утверждения
 *           'mismatched'   — таких нет, но есть кандидат, где часть сошлась
 *           'inconclusive' — судить нечем: нечего сравнивать или экран пуст
 *   hits    сколько элементов подошли целиком (несколько — норма: канвас
 *           схлопнул одинаковые элементы в одну строку)
 *   best    ближайший кандидат и перечень разошедшихся свойств
 *
 * Сила доказательства — это число утверждений в строке. Строка с одним слабым
 * утверждением («отступ сверху 14px») совпадёт с десятком элементов случайно,
 * поэтому `strength` выносится наружу: вердикт по строке силой 1 ставить нельзя.
 */
export function matchRowAgainstScreen({ parsed, elements, evaluate }) {
  const strength = parsed?.assertions?.length || 0;
  if (!strength) return { status: 'inconclusive', reason: 'нет разобранных утверждений', strength };
  if (!elements?.length) return { status: 'inconclusive', reason: 'экран не отдал элементов', strength };

  let hits = 0;
  const hitAddresses = [];
  let best = null;

  for (const [index, element] of elements.entries()) {
    const selector = describeElement(element, index);
    const result = evaluate({ parsed, evidence: buildEvidence({ parsed, selector, element }) });
    const rows = result.evidence || [];
    const matched = rows.filter((r) => r.status === 'matched').length;
    const mismatched = rows.filter((r) => r.status === 'mismatched');
    const inconclusive = rows.filter((r) => r.status === 'inconclusive');

    if (matched === strength) {
      hits += 1;
      if (hitAddresses.length < 3) hitAddresses.push(selector);
      continue;
    }
    // Лучший кандидат: больше сошлось, при равенстве — меньше разошлось.
    const score = matched * 1000 - mismatched.length;
    if (!best || score > best.score) {
      best = {
        score,
        selector,
        matched,
        diffs: mismatched.map((r) => ({
          property: r.property,
          expected: r.expected,
          actual: r.actual,
        })),
        unknown: inconclusive.map((r) => ({ property: r.property, reason: r.reason })),
      };
    }
  }

  if (hits > 0) return { status: 'matched', hits, strength, where: hitAddresses };
  if (best && best.diffs.length) return { status: 'mismatched', strength, hits: 0, best };
  return {
    status: 'inconclusive',
    strength,
    hits: 0,
    reason: 'ни одно свойство не удалось сравнить',
    best,
  };
}
