/*
  Слепок канваса в контракт — генератор трёх машинных разделов.

  ЗАЧЕМ. Первые разделы контракта пишет человек: решения, поведение, границы, система вида.
  Три последних — слепок: строка на каждый нарисованный элемент, на каждый рисунок и вся копия
  дословно. Слепок выводится из разметки скриптом, а не пересказывается по памяти — так строки
  не могут разойтись с кадрами, и не бывает «описал 14 строк и сказал, что покрыто всё».

  КОГДА ЗАПУСКАТЬ. Всякий раз, когда изменилась разметка кадров: добавлен экран, переделан блок,
  переставлены элементы, поправлена копия. Команда владельца — «пересними слепки».
  Слепок живёт только вместе с кадром: правка кадра без переснимка делает контракт лгущим.

  КАК ЗАПУСКАТЬ. Скрипт исполняется через run_script (в sandbox, не в браузере канваса).
  Кириллица в путях run_script недоступна — канвас сначала копируется под ASCII-имя в tmp/,
  обрабатывается, копируется назад и в пакет.

    1. copy_files: «Имя канваса v4.dc.html» → tmp/<slug>.html
    2. run_script: код ниже, files = ['<slug>', ...]
    3. copy_files: tmp/<slug>.html → «Имя канваса v4.dc.html» и design_handoff_heys_v4/<slug>.v4.dc.html
    4. пересобрать ACCEPTANCE-<slug>.md, обновить счётчики INDEX.md и README.md

  ЧТО ДЕЛАЕТ. Находит песочные кадры — ЛЮБОЙ <div> с data-screen-label без суффикса палитры: и экраны .ph,
  и одиночные плитки .w в рядах состояний («нет данных», «пустой день», «три состояния»). Вложенные
  метки внутри уже снятого кадра пропускаются — иначе один элемент получал бы две строки. Для каждого:
    • «Разбор кадров · элемент за элементом» — по строке на элемент со style/class: текст,
      роль по классу, все заданные свойства словами. Повторы одного вида внутри кадра свёрнуты.
    • «Разбор графики · SVG в кадрах» — поля рисунков с viewBox, точки ломаных, пунктиры,
      маркеры с радиусами, тона и толщины.
    • «Текст кадров дословно» — вся копия кадра в порядке сверху вниз, строки через ›,
      куски по 900 символов.
  Прежние разделы с теми же именами вырезаются перед вставкой — переснимок идемпотентен.

  ИНВАРИАНТЫ. Скрипт падает и ничего не пишет, если: баланс тегов файла изменился, вставляемый
  блок не сбалансирован, появились одинаковые ключи. Поэтому неровный баланс в файле после
  переснимка — всегда чужой долг, а не последствие слепка.
*/

const CLS = { sc:'область прокрутки', top:'шапка', ttl:'имя экрана', k:'ключ', tier:'ярус',
  grp:'карточка .grp', cd:'список .cd', row:'строка списка', btn:'главная кнопка',
  btn2c:'вторичная кнопка', btn2:'вторичная кнопка', badge:'пилюля', p:'проза', sm:'сноска',
  h1:'заголовок', big:'главное число', n:'моноцифры', pchip:'метка', nt:'заметка',
  tabs:'ряд вкладок', tab:'вкладка', av:'аватар', cl:'строка клиента', cln:'имя',
  cls:'состояние', dot:'точка', sheet:'лист снизу', w:'плитка', g:'сетка плиток',
  fab:'плавающая кнопка', foot:'подвал', btns:'ряд кнопок', key:'клавиша', wheel:'колесо',
  opt:'вариант', an:'колонка аннотаций', ab:'аннотация' };

const MAP = { font:'шрифт', background:'фон', 'background-color':'фон', color:'цвет',
  'border-radius':'радиус', padding:'поля', height:'высота', 'min-height':'высота от',
  width:'ширина', 'min-width':'ширина от', 'box-shadow':'рамка', gap:'зазор',
  'border-bottom':'разделитель', 'border-top':'разделитель сверху', 'letter-spacing':'трекинг',
  'text-transform':'регистр', 'margin-top':'отступ сверху', 'margin-bottom':'отступ снизу',
  flex:'флекс', opacity:'прозрачность', 'text-align':'выключка', 'align-items':'выравнивание',
  'justify-content':'распределение', 'flex-direction':'направление',
  'grid-template-columns':'колонки', 'grid-area':'место в сетке', overflow:'обрез',
  position:'позиция', inset:'вписан', border:'рамка', margin:'отступы', transform:'сдвиг',
  'backdrop-filter':'размытие', 'line-height':'интерлиньяж', 'white-space':'перенос',
  'flex-wrap':'перенос строк' };

const bal = x => (x.match(/<div\b/g) || []).length - (x.match(/<\/div>/g) || []).length;
const esc = t => t.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const at = (a, n) => { const m = a.match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : null; };

function words(st) {
  if (!st) return '';
  return st.split(';').map(x => x.trim()).filter(Boolean).map(p => {
    const i = p.indexOf(':'); if (i < 0) return null;
    const prop = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    if (!MAP[prop]) return null;
    return MAP[prop] + ' ' + v.replace(/Figtree,\s*sans-serif/, 'Figtree')
      .replace(/ui-monospace,\s*Menlo,\s*monospace/, 'моно').replace(/system-ui,\s*/, '');
  }).filter(Boolean).join(', ');
}

function gfx(tag, a) {
  const w = [], stroke = at(a,'stroke'), sw = at(a,'stroke-width'), fill = at(a,'fill'),
    dash = at(a,'stroke-dasharray'), op = at(a,'opacity');
  if (tag === 'svg') w.push('поле рисунка ' + (at(a,'width')||'?') + '×' + (at(a,'height')||'?') +
    (at(a,'viewBox') ? ' (viewBox ' + at(a,'viewBox') + ')' : ''));
  else if (tag === 'polyline' || tag === 'path') {
    const p = at(a,'points') || at(a,'d');
    w.push(tag === 'polyline' ? 'ломаная' : 'кривая');
    // Точки кривой — не пересказ, а сами данные: обрыв на середине токена делает
    // строку непроверяемой, и достроить форму значит выдумать её. Предела длины нет.
    if (p) w.push('точки ' + p);
    if (stroke) w.push('линия ' + stroke);
    if (sw) w.push('толщина ' + sw);
    if (dash) w.push('пунктир ' + dash);
    if (fill && fill !== 'none') w.push('заливка ' + fill);
  } else if (tag === 'circle') {
    w.push('точка r ' + (at(a,'r')||'?') + ' в (' + (at(a,'cx')||'?') + ',' + (at(a,'cy')||'?') + ')');
    if (fill) w.push('заливка ' + fill);
    if (stroke) w.push('обводка ' + stroke);
  } else if (tag === 'line') {
    w.push('линия (' + at(a,'x1') + ',' + at(a,'y1') + ')→(' + at(a,'x2') + ',' + at(a,'y2') + ')');
    if (stroke) w.push('тон ' + stroke);
    if (sw) w.push('толщина ' + sw);
    if (dash) w.push('пунктир ' + dash);
  } else if (tag === 'rect') {
    w.push('прямоугольник ' + (at(a,'width')||'?') + '×' + (at(a,'height')||'?'));
    if (at(a,'rx')) w.push('радиус ' + at(a,'rx'));
    if (fill) w.push('заливка ' + fill);
  }
  if (op) w.push('прозрачность ' + op);
  return w.join(', ');
}

function framesOf(s) {
  const out = [], re = /<div\b([^>]*)data-screen-label="([^"]*)"([^>]*)>/g;
  let m, guard = -1;                                  // конец последнего снятого кадра
  while ((m = re.exec(s))) {
    const lab = m[2];
    if (/тёмная|синяя|сине/.test(lab)) continue;      // зеркала палитр — копии песочного ряда
    if (m.index < guard) continue;                    // метка внутри уже снятого кадра
    let d = 0, end = -1;
    const r2 = /<div\b|<\/div>/g; r2.lastIndex = m.index;
    let k;
    while ((k = r2.exec(s))) { d += k[0] === '</div>' ? -1 : 1; if (d === 0) { end = k.index; break; } }
    guard = end;
    out.push({ lab, html: s.slice(m.index, end) });
  }
  return out;
}

function contractClose(src) {                          // индекс закрывающего </div> блока контракта
  const ci = src.indexOf('data-contract');
  if (ci < 0) return -1;
  const open = src.lastIndexOf('<div', ci);
  let d = 0; const r = /<div\b|<\/div>/g; r.lastIndex = open;
  let k;
  while ((k = r.exec(src))) { d += k[0] === '</div>' ? -1 : 1; if (d === 0) return k.index; }
  return -1;
}

function cutSection(src, head) {                       // вырезать прежний слепок целиком
  const h = '<div class="ctrH">' + head + '</div>';
  const i = src.indexOf(h);
  if (i < 0) return src;
  const nextH = src.indexOf('<div class="ctrH">', i + h.length);
  const close = contractClose(src);
  const end = (nextH > 0 && nextH < close) ? nextH : close;
  return src.slice(0, i) + src.slice(end);
}

const HEADS = {
  el: ['Разбор кадров · элемент за элементом',
    'каждый нарисованный элемент каждого кадра с его собственными числами, выведенными из разметки канваса. Ключ — метка кадра и номер элемента сверху вниз. Повторы одного вида внутри кадра свёрнуты'],
  gr: ['Разбор графики · SVG в кадрах',
    'поля рисунков с viewBox, ломаные с точками, пунктиры, точки-маркеры и их радиусы, тона и толщины. Точки приведены как есть: они задают форму, и приблизительная форма это другой рисунок'],
  tx: ['Текст кадров дословно',
    'вся копия каждого кадра в порядке сверху вниз, строки разделены знаком ›. Ровно эти слова, числа, единицы и знаки должны стоять на экране. Расходится копия в коде — верна строка; расходится строка с кадром — верен кадр, и строка перегенерируется'],
};

// ── главная функция: вернуть новый исходник канваса со свежим слепком ──────────
function resnap(src) {
  const before = bal(src);
  [HEADS.tx[0], HEADS.gr[0], HEADS.el[0]].forEach(h => { src = cutSection(src, h); });

  const used = new Set();
  const uniq = k => { let key = k, i = 2; while (used.has(key)) { key = k + ' (' + i + ')'; i++; } used.add(key); return key; };
  let A = '', B = '', C = '', nA = 0, nB = 0, nC = 0;

  framesOf(src).forEach(f => {
    const seen = new Set(); let ix = 0;
    [...f.html.matchAll(/<(div|span|b|i)\b([^>]*)>([^<]{0,50})/g)].forEach(e => {
      const attrs = e[2], txt = (e[3] || '').trim().replace(/\s+/g, ' ');
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      const st = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
      const w = words(st);
      const role = cls.split(/\s+/).map(c => CLS[c]).filter(Boolean).join(' + ');
      if (!w && !role) return;
      const sig = role + '|' + w; if (seen.has(sig)) return; seen.add(sig);
      ix++; nA++;
      A += '    <div class="spec"><b>' + esc(uniq(f.lab + ' · ' + String(ix).padStart(2, '0'))) +
        '</b><span data-v="' + esc((txt ? '«' + txt + '» — ' : '') + (role ? role + (w ? ': ' : '') : '') + w) + '"></span></div>\n';
    });

    const gseen = new Set(); let gx = 0;
    [...f.html.matchAll(/<(svg|polyline|path|circle|line|rect)\b([^>]*)>/g)].forEach(e => {
      const d = gfx(e[1].toLowerCase(), e[2]);
      if (!d || gseen.has(d)) return; gseen.add(d); gx++; nB++;
      B += '    <div class="spec"><b>' + esc(uniq(f.lab + ' · рисунок ' + String(gx).padStart(2, '0'))) +
        '</b><span data-v="' + esc(d) + '"></span></div>\n';
    });

    const txt = [...f.html.matchAll(/>([^<]+)</g)]
      .map(x => x[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 1);
    if (txt.length) {
      const chunks = []; let cur = '';
      txt.forEach(t => { const add = (cur ? ' › ' : '') + t; if ((cur + add).length > 900) { chunks.push(cur); cur = t; } else cur += add; });
      if (cur) chunks.push(cur);
      chunks.forEach((c, ci) => { nC++;
        C += '    <div class="spec"><b>' + esc(uniq(f.lab + ' · текст' + (chunks.length > 1 ? ' ' + (ci + 1) + '/' + chunks.length : ''))) +
          '</b><span data-v="' + esc(c) + '"></span></div>\n'; });
    }
  });

  const sect = (h, body) => '    <div class="ctrH">' + h[0] + '</div>\n' +
    '    <div class="spec"><b>как читать' + (h === HEADS.el ? ' разбор' : h === HEADS.gr ? ' графику' : ' текст') +
    '</b><span data-v="' + esc(h[1]) + '"></span></div>\n' + body;

  let out = '';
  if (nA) out += sect(HEADS.el, A);
  if (nB) out += sect(HEADS.gr, B);
  if (nC) out += sect(HEADS.tx, C);
  if (bal(out) !== 0) throw new Error('слепок не сбалансирован: ' + bal(out));

  const close = contractClose(src);
  if (close < 0) throw new Error('у канваса нет блока [data-contract] — слепок вставлять некуда');
  src = src.slice(0, close) + out + src.slice(close);
  if (bal(src) !== before) throw new Error('баланс файла изменился: ' + bal(src) + ' было ' + before);

  const keys = [...src.matchAll(/<div class="spec"[^>]*><b>([^<]*)<\/b>/g)].map(m => m[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) throw new Error('одинаковые ключи: ' + JSON.stringify([...new Set(dup)].slice(0, 3)));

  return { src, stats: { el: nA, gfx: nB, txt: nC, rows: keys.length } };
}

// ── прогон по списку файлов в tmp/ ────────────────────────────────────────────
// const files = ['reports-insights', 'home-widgets'];
// for (const f of files) {
//   const path = 'tmp/' + f + '.html';
//   const { src, stats } = resnap(await readFile(path));
//   await saveFile(path, src);
//   log(f, JSON.stringify(stats));
// }

// ── проверка покрытия: сколько текстовых узлов кадров нет ни в одной строке ───
function coverage(src) {
  const hay = (src.match(/data-v="[^"]*"/g) || []).join(' ~ ');
  let total = 0, miss = 0;
  framesOf(src).forEach(f => {
    [...f.html.matchAll(/>([^<]+)</g)].forEach(x => {
      const t = x[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length < 2) return;
      total++;
      const probe = t.length > 26 ? t.slice(0, 26) : t;
      if (!hay.includes(probe)) miss++;
    });
  });
  return { total, miss };
}
