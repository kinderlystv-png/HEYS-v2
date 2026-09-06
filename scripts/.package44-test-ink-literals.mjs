// Правит запись тона в ожиданиях тестов ТОЛЬКО там, где итоговая строка
// дословно есть в контракте канваса. Прежний проход переводил по таблице и
// задел фоны с разделителями: дизайнер мигрировал цвет ТЕКСТА, а долю в
// `background` и `border` канвас законно держит прежней.
import fs from 'node:fs';
import path from 'node:path';

const TESTS = 'C:/Users/User/HEYS-v2/apps/web/__tests__';
const PACK =
  'C:/Users/User/HEYS-v2/docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4';

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const canvasBlob = [];
for (const f of fs.readdirSync(PACK).filter((x) => x.endsWith('.v4.dc.html'))) {
  const html = fs.readFileSync(path.join(PACK, f), 'utf8');
  for (const m of html.matchAll(/data-v="([^"]*)"/g)) canvasBlob.push(decode(m[1]));
}
const HAY = canvasBlob.join('\u0000');
const inCanvas = (s) => s.length > 0 && HAY.includes(s);

const FRACTIONS = {
  '--tx': ['.85'],
  '--ink-2': ['.56', '.55', '.58', '.62', '.6', '.5', '.72', '.65', '.63'],
  '--ink-3': ['.45', '.42'],
  '--ink-4': ['.38', '.35', '.4'],
  '--ink-30': ['.3', '.32', '.28', '.26', '.24', '.22', '.18', '.16', '.14', '.12', '.08'],
};

// Строковый литерал: одинарные, двойные и обратные кавычки, с экранированием.
const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;

let kept = 0;
let reverted = 0;
let files = 0;
for (const f of fs.readdirSync(TESTS).filter((x) => x.endsWith('.js'))) {
  const p = path.join(TESTS, f);
  const src = fs.readFileSync(p, 'utf8');
  if (!/var\(--(?:ink-\d+|tx)\)/.test(src)) continue;
  let changed = false;
  const out = src.replace(STRING_LITERAL, (whole, q, body) => {
    if (!/var\(--(?:ink-\d+|tx)\)/.test(body)) return whole;
    if (inCanvas(body)) {
      kept += 1;
      return whole;
    }
    for (const [role, fracs] of Object.entries(FRACTIONS)) {
      if (!body.includes(`var(${role})`)) continue;
      for (const fr of fracs) {
        const cand = body.split(`var(${role})`).join(`rgba(var(--ink),${fr})`);
        if (inCanvas(cand)) {
          reverted += 1;
          changed = true;
          return q + cand + q;
        }
      }
    }
    return whole;
  });
  if (changed) {
    fs.writeFileSync(p, out, 'utf8');
    files += 1;
  }
}
console.log(
  `подтверждено канвасом: ${kept}; возвращено к доле: ${reverted}; файлов правлено: ${files}`,
);
