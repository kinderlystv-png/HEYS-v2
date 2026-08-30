// Аудит «роль по назначению»: сверка цвета во всех четырёх наборах, а не только
// в песочном.
//
// Сверка кадров разрешает роли по песочным значениям — и роли, совпавшие в
// песочной, она считает одинаковыми. В наборе 94 пары ролей, у которых песочное
// значение общее, а дальше расходится: `--v4-warn-3` и `--v4-warn-text` — обе
// #a1471c в песочной и три разных цвета в остальных наборах. Взяв не ту из пары,
// код проходит и сверку кадра, и оба гейта ролей, а в тёмной теме показывает
// чужой тон.
//
// Здесь только измерение: модуль ничего не роняет, а копит находки в файл,
// путь к которому даёт HEYS_ROLE_PURPOSE_AUDIT. Без переменной он выключен и
// стоит ровно ничего.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PALETTE = path.resolve(HERE, '../styles/modules/002-ui-v4-palette-roles.css');
const CANVAS = path.resolve(
  HERE,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/v4-canvas.css',
);

const НАБОРЫ = ['sand', 'sand-dark', 'blue', 'blue-dark'];
// Наборы канваса живут классами, а не атрибутом: :root песочный, .pal.dk и далее.
const КЛАСС = { sand: ':root', 'sand-dark': '.pal.dk', blue: '.pal.bl', 'blue-dark': '.pal.bldk' };

function блоки(css, якоря) {
  const out = {};
  const points = якоря.map((a) => [a.id, css.indexOf(a.at)]).filter(([, i]) => i >= 0);
  points.sort((a, b) => a[1] - b[1]);
  points.forEach(([id, start], n) => {
    const end = n + 1 < points.length ? points[n + 1][1] : css.length;
    out[id] = Object.fromEntries(
      [...css.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)[;}]/g)].map((m) => [
        m[1],
        m[2].trim().toLowerCase(),
      ]),
    );
  });
  return out;
}

let ПРОДУКТ = null;
let КАНВАС = null;
function палитры() {
  if (ПРОДУКТ) return { ПРОДУКТ, КАНВАС };
  ПРОДУКТ = блоки(
    fs.readFileSync(PALETTE, 'utf8'),
    НАБОРЫ.map((id) => ({ id, at: `[data-theme-id="${id}"]` })),
  );
  КАНВАС = блоки(
    fs.readFileSync(CANVAS, 'utf8'),
    НАБОРЫ.map((id) => ({ id, at: КЛАСС[id] })),
  );
  return { ПРОДУКТ, КАНВАС };
}

const hex6 = (v) =>
  /^#[0-9a-f]{3}$/.test(v)
    ? `#${v
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')}`
    : v;

/**
 * Развернуть выражение цвета в конкретный цвет ВНУТРИ одного набора.
 * Возвращает null, если развернуть до конца не удалось: тогда пара в аудит не
 * идёт — молчаливое «похоже, сходится» тут хуже отсутствия ответа.
 */
function развернуть(expr, id, localVars) {
  const { ПРОДУКТ: prod, КАНВАС: canv } = палитры();
  if (expr == null) return null;
  let s = String(expr).trim().toLowerCase().replace(/\s+/g, '');
  for (let шаг = 0; шаг < 8; шаг += 1) {
    const было = s;
    // Чернила набора: канвас пишет их тройкой в --ink.
    s = s.replace(/rgba\(var\(--ink\),([^)]*)\)/g, (_, a) => `rgba(${canv[id]['--ink']},${a})`);
    // Роль продукта с запасным значением: роли может не быть в этом наборе —
    // тогда рисуется запасное, и это законный ответ, а не пропуск.
    s = s.replace(/var\((--v4-[a-z0-9-]+),([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_, role, fb) =>
      prod[id][role] ? prod[id][role] : fb.trim(),
    );
    // Голая роль — продукта, канваса или своя переменная файла.
    s = s.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name) => {
      if (prod[id][name]) return prod[id][name];
      if (canv[id][name]) return canv[id][name];
      if (localVars && localVars.get(name)) return localVars.get(name);
      return whole;
    });
    if (s === было) break;
  }
  if (s.includes('var(')) return null;
  s = hex6(s);
  // Чернила канваса и продукта — один цвет в трёх написаниях.
  s = s.replace(/rgba\(32,30,29,/g, 'rgba(0,0,0,').replace(/rgba\(0,0,0,\./g, 'rgba(0,0,0,0.');
  return s;
}

const находки = [];
// Сколько пар аудит реально осмотрел. Без этого числа «находок нет» неотличимо
// от «проверка не сработала» — а это разные ответы.
const счёт = { осмотрено: 0, развернулось: 0 };

/**
 * Пара сошлась в песочной — проверить, сходится ли она в остальных трёх.
 * Молча пропускаем всё, что не разворачивается в цвет: аудит меряет, а не гадает.
 */
/**
 * Есть ли у этого селектора темозависимое переопределение того же свойства.
 * Литерал в базовом правиле — не находка, если рядом лежит
 * `[data-theme$="dark"] <тот же селектор> { <то же свойство> }`: тогда цвет
 * набору всё-таки следует, просто вторым правилом, а не ролью.
 */
function естьТемныйОверрайд(rules, selector, cssProp) {
  if (!rules || !selector) return false;
  for (const [key, decls] of rules) {
    if (typeof key !== 'string' || !decls || decls[cssProp] === undefined) continue;
    if (!/\[data-theme/.test(key)) continue;
    if (key.includes(selector)) return true;
    // Оверрайд часто пишут короче базового: `[data-theme$='dark'] .advice-list-text`
    // против `.advice-list-container--v4 .advice-list-text`.
    const хвост = selector.split(/\s+/).pop();
    if (хвост && key.trim().endsWith(хвост)) return true;
  }
  return false;
}

export function auditColour({
  frame,
  index,
  selector,
  kind,
  frameValue,
  codeValue,
  localVars,
  rules,
  cssProp,
}) {
  if (!process.env.HEYS_ROLE_PURPOSE_AUDIT) return;
  if (frameValue == null || codeValue == null) return;
  счёт.осмотрено += 1;
  подписаться();
  const песочный = [
    развернуть(frameValue, 'sand', localVars),
    развернуть(codeValue, 'sand', localVars),
  ];
  if (!песочный[0] || !песочный[1]) return;
  счёт.развернулось += 1;
  if (песочный[0] !== песочный[1]) return;
  const разошлись = [];
  for (const id of НАБОРЫ.slice(1)) {
    const кадр = развернуть(frameValue, id, localVars);
    const код = развернуть(codeValue, id, localVars);
    if (!кадр || !код) continue;
    if (кадр !== код) разошлись.push(`${id}: кадр ${кадр} · код ${код}`);
  }
  if (!разошлись.length) return;
  // Литерал вместо роли — находка только там, где набору он не следует ничем:
  // ни ролью, ни вторым темозависимым правилом.
  const литерал = !/var\(/.test(String(codeValue));
  if (литерал && естьТемныйОверрайд(rules, selector, cssProp)) return;
  находки.push({
    вид: литерал ? 'литерал вместо роли' : 'не та роль',
    frame,
    index,
    selector,
    kind,
    frameValue: String(frameValue),
    codeValue: String(codeValue),
    sand: песочный[0],
    diverge: разошлись,
  });
}

// Каждый файл тестов — свой процесс воркера, поэтому находки дописываются в
// общий файл на выходе, а не собираются в памяти прогона.
let подписан = false;
function подписаться() {
  if (подписан || !process.env.HEYS_ROLE_PURPOSE_AUDIT) return;
  подписан = true;
  process.on('exit', flush);
}

export function flush() {
  const out = process.env.HEYS_ROLE_PURPOSE_AUDIT;
  if (!out || (!находки.length && !счёт.осмотрено)) return;
  // Перевод строки через код символа.
  const NL = String.fromCharCode(10);
  const строки = [JSON.stringify({ счёт: { ...счёт } }), ...находки.map((f) => JSON.stringify(f))];
  fs.appendFileSync(out, строки.join(NL) + NL, 'utf8');
  находки.length = 0;
  счёт.осмотрено = 0;
  счёт.развернулось = 0;
}
