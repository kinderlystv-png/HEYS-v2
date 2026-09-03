/* Сверка · общие проверки (1–10)
   Один файл на все канвасы: подключается строкой в шапке и печатает свою строку
   рядом со строкой канваса. Перенесены сюда и те четыре проверки, что жили
   в каждом канвасе своей копией — из-за копий «чисто» у разных файлов значило
   разный объём проверки: у Цикла были все четыре, у чек-ина две.

   1. нарисованный кадр без строки вида (протокол и зеркала палитр пропускаются;
      кадр может назвать свою строку атрибутом data-vid);
   2. кнопка мимо общего ряда — пилюля выше 48 px вне .btns / [data-btnrow] / .foot;
      проверка работает только на канвасах, где общий ряд вообще есть;
   3. число с единицей в прозе, которого нет ни в контракте, ни на кадрах;
   4. живой замер [data-fitnote] против чисел только своей строки (±1 px);
   5. раздел контракта без единой строки про вид (служебные разделы исключены);
   6. объявленный замер — «выше окна на N px», «не влезает», «прокручивается» —
      которого никто не мерит: нет [data-fitnote][data-owner] с этим ключом;
   7. кадр или подпись ссылается на другой канвас, а в контракте нет строки
      с этим файлом (правило «один кадр — один источник»);
   8. один ключ на двух строках с разными значениями — контракт спорит сам с собой;
   9. строка, которая сама себя называет незакрытой, при отсутствии раздела
      «Открыто до передачи» — незакрытое обязано быть собрано в одном месте;
  10. контракт ссылается на v4-canvas.css, а канвас его не подключает;
  11. литерал на волос (±2 на канал) от значения из v4-canvas.css — то есть копия палитры,
      разошедшаяся с источником; цвета, названные в контракте, пропускаются;
  12. кадры на канвасе есть, а видимых ни одного — разметка схлопнулась
      (чаще всего незакрытый div в контракте, и всё остальное ушло внутрь скрытого блока).

   Адресации: data-vid="<ключ>" — кадр называет свою строку вида; data-dim="<ключ>" — текст
   приглушён решением (соседние цифры колеса, ненаступившие дни), и названная строка это
   объявляет; data-owner на
   [data-fitnote] — замер сверяется только с числами названной строки;
   data-nofit="<ключ>" на .spec — число здесь обоснование, замер живёт в другой
   строке; data-noref на заметке — число в ней иллюстрация аргумента, а не
   спецификация, и в контракте его быть не должно.

   Строка отдельная намеренно: приписывать чужой текст — значит спорить с ним при
   каждой перерисовке. У каждой строки свой предмет, и обе обязаны быть чистыми. */
(function () {
  // разделы, которым вид не положен по существу
  // разделы, которым вид не положен по существу; последние три — машинный слепок:
  // он сам и есть перечисление вида, отдельной строки «вид» в нём быть не может
  var SERVICE = /^(что это|чьё|что это и чьё|границ|адресаци|палитр|демо|открыто|не реализов|снято|протокол|решени|дефект|чего в контракте нет|источник|начало контракта|разбор кадров|разбор графики|текст кадров)/i;

  function rows() {
    // часть канвасов держит строки вне обёртки [data-contract] — берём все .spec
    var list = document.querySelectorAll('[data-contract] .spec, .spec');
    return [].slice.call(list).map(function (r) {
      var b = r.querySelector('b'), v = r.querySelector('span[data-v]');
      return {
        key: b ? b.textContent.trim() : '',
        val: v ? (v.getAttribute('data-v') || '') : '',
        nofit: r.getAttribute('data-nofit') || ''
      };
    });
  }

  function sections() {
    var out = [];
    [].forEach.call(document.querySelectorAll('[data-contract]'), function (c) {
      var head = 'начало контракта', bag = null;
      [].forEach.call(c.children, function (el) {
        if (el.classList && el.classList.contains('ctrH')) {
          if (bag) out.push(bag);
          head = el.textContent.trim();
          bag = { head: head, rows: 0, view: false };
          return;
        }
        if (!el.classList || !el.classList.contains('spec')) return;
        if (!bag) bag = { head: head, rows: 0, view: false };
        bag.rows++;
        var b = el.querySelector('b'), v = el.querySelector('span[data-v]');
        var t = ((b ? b.textContent : '') + ' ' + (v ? v.getAttribute('data-v') || '' : '')).toLowerCase();
        // «про вид» — заливка, радиус, поля, кегль, тон, роль палитры или явный размер
        // \b в JS не работает на кириллице — окончания перечислены руками
        if (/вид(\s|·|,|:|а|е|ом|у|$)|заливк|радиус|поля|кегл|шрифт|начертан|интерлин|обводк|тон(\s|ом|а|е|$)|фон(\s|ом|а|е|$)|#[0-9a-f]{3,6}|var\(--|\d+\s?px|\d+\s?pt/.test(t)) bag.view = true;
      });
      if (bag) out.push(bag);
    });
    return out;
  }

  function findings() {
    var vals = rows();
    if (!vals.length) return 'nocontract';
    var out = [];

    // штатно скрытые зеркала палитр (.pal dk/bl/bldk при выключенном allPalettes) считать за
    // схлопывание нельзя; и мерить вообще только после раскладки: DC строит зеркала
    // в componentDidMount, а этот файл считает раньше — иначе проверка плавает
    // \u043c\u0435\u0440\u0438\u043c \u0442\u043e\u043b\u044c\u043a\u043e \u043a\u043e\u0433\u0434\u0430 \u0433\u0435\u043e\u043c\u0435\u0442\u0440\u0438\u044f \u0432\u043e\u043e\u0431\u0449\u0435 \u0438\u0437\u043c\u0435\u0440\u0438\u043c\u0430: \u0432 \u043d\u0443\u043b\u0435\u0432\u043e\u043c \u0432\u044c\u044e\u043f\u043e\u0440\u0442\u0435 (\u0444\u043e\u043d\u043e\u0432\u0430\u044f
    // \u0432\u043a\u043b\u0430\u0434\u043a\u0430, offscreen-\u0440\u0435\u043d\u0434\u0435\u0440, \u043f\u0435\u0447\u0430\u0442\u044c) \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e 0\u00d70 \u2014 \u0447\u0435\u0441\u0442\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442 \u00ab\u043d\u0435 \u0438\u0437\u043c\u0435\u0440\u044f\u043b\u0438\u00bb,
    // \u0430 \u043d\u0435 \u00ab\u0441\u0445\u043b\u043e\u043f\u043d\u0443\u043b\u043e\u0441\u044c\u00bb
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    if (document.readyState === 'complete' && vw > 0 && document.documentElement.scrollHeight > 0) {
      var own = [].filter.call(document.querySelectorAll('[data-screen-label]'), function (fr) {
        for (var p = fr.parentNode; p && p.nodeType === 1; p = p.parentNode) {
          if (p.classList && p.classList.contains('pal')) return false;
        }
        return true;
      });
      if (own.length) {
        var visible = 0;
        own.forEach(function (fr) {
          var b = fr.getBoundingClientRect();
          if (b.width > 4 && b.height > 4) visible++;
        });
        if (!visible) out.push('кадров ' + own.length + ', видимых 0 — разметка схлопнулась: чаще всего незакрытый div в контракте');
      }
    }

    var blind = sections()
      .filter(function (s) { return s.rows >= 3 && !s.view && !SERVICE.test(s.head); })
      .map(function (s) { return s.head; });
    if (blind.length) out.push('раздел без строки вида: ' + blind.join(' · '));

    var owners = {};
    [].forEach.call(document.querySelectorAll('[data-fitnote][data-owner]'), function (n) {
      owners[n.getAttribute('data-owner')] = true;
    });
    var unmeasured = vals.filter(function (v) {
      if (/^вид/i.test(v.key)) return false;                       // строка вида описывает, а не мерит
      if (v.nofit) return false;                                   // число — обоснование, замер назван в другой строке
      return /\d+\s?px/.test(v.val)
        && /(выше окна|не влезает|уходит под|прокручивается)/i.test(v.val)
        && !owners[v.key];
    }).map(function (v) { return v.key; });
    if (unmeasured.length) out.push('объявленный замер никто не мерит: ' + unmeasured.join(' · '));

    var lost = vals.filter(function (v) {
      return v.nofit && !vals.some(function (x) { return x.key === v.nofit; });
    }).map(function (v) { return v.key + ' → ' + v.nofit; });
    if (lost.length) out.push('ссылка на замер в никуда: ' + lost.join(' · '));

    var seen = {}, twins = {};
    vals.forEach(function (v) {
      if (!v.key) return;
      if (seen[v.key] !== undefined && seen[v.key] !== v.val) twins[v.key] = true;
      seen[v.key] = v.val;
    });
    var dup = Object.keys(twins);
    if (dup.length) out.push('один ключ — два значения: ' + dup.join(' · '));

    var open = vals.filter(function (v) {
      return /(экрана нет\s*[—,-]\s*нужен|нужен экран|надо добавить|не сказан|не решено|решить до передачи|уточнить у владельца)/i.test(v.val);
    }).map(function (v) { return v.key; });
    var hasOpenSection = false;
    [].forEach.call(document.querySelectorAll('[data-contract] .ctrH'), function (h) {
      if (/открыто/i.test(h.textContent)) hasOpenSection = true;
    });
    if (open.length && !hasOpenSection) {
      out.push('незакрытое не собрано в раздел «Открыто до передачи»: ' + open.slice(0, 6).join(' · ') + (open.length > 6 ? ' и ещё ' + (open.length - 6) : ''));
    }

    var contract = vals.map(function (v) { return v.key + ' ' + v.val; }).join(' ').toLowerCase();
    var refs = {};
    [].forEach.call(document.querySelectorAll('[data-screen-label], .nt, .ntl, .lab, .cap, .hint'), function (n) {
      if (n.closest('[data-contract]')) return;
      var m = (n.textContent || '').match(/[a-z0-9_-]+\.(?:v4\.)?dc\.html/gi);
      if (m) m.forEach(function (x) { refs[x.toLowerCase()] = true; });
    });
    var orphan = Object.keys(refs).filter(function (f) { return contract.indexOf(f) === -1; });
    if (orphan.length) out.push('ссылка на чужой канвас вне контракта: ' + orphan.join(' · '));

    var linked = false;
    [].forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
      if (/v4-canvas\.css/i.test(l.getAttribute('href') || '')) linked = true;
    });
    // освобождать проверку словами контракта нельзя: те же слова бывают ложью
    if (linked && /не подключа/i.test(contract)) {
      out.push('контракт утверждает, что канвас не подключает v4-canvas.css, а link стоит');
    } else if (!linked && /v4-canvas\.css/i.test(contract) && !/не подключа/i.test(contract)) {
      out.push('контракт ссылается на v4-canvas.css, а канвас его не подключает');
    }

    // ── проверки 1–4: прежде жили в каждом канвасе своей копией ──────────────
    var nrm = function (s) { return s.replace(/(\d)[\s\u00a0\u202f\u2009](?=\d{3}\b)/g, '$1'); };
    var low = contract;
    var vidText = vals.filter(function (v) { return /^вид/i.test(v.key); })
      .map(function (v) { return v.key + ' ' + v.val; }).join(' ').toLowerCase();

    var frames = [].slice.call(document.querySelectorAll('[data-screen-label]')).filter(function (f) {
      if (f.getAttribute('data-demo') === 'protocol' || f.closest('[data-demo="protocol"]')) return false;
      var l = f.getAttribute('data-screen-label') || '';
      if (/·\s*(т[её]мная|синяя|сине-т[её]мная|светлая|песочная)/i.test(l)) return false; // зеркала палитр
      if (/копия/i.test(l) && f.hasAttribute('data-copy')) return false;
      return true;
    });
    var noVid = frames.filter(function (f) {
      var ref = f.getAttribute('data-vid');
      if (ref) return !vals.some(function (v) { return v.key === ref; });
      var l = (f.getAttribute('data-screen-label') || '').toLowerCase();
      var tail = l.split(' · ').pop().trim();
      if (tail.length > 3 && (vidText.indexOf(tail) >= 0 || low.indexOf(tail) >= 0)) return false;
      var words = l.split(/[\s,·]+/).filter(function (s) { return s.length > 4; });
      return !words.some(function (w) {
        var st = w.slice(0, w.length - 2);
        return vidText.indexOf(st) >= 0 || low.indexOf(st) >= 0;
      });
    }).map(function (f) { return f.getAttribute('data-screen-label'); });
    if (noVid.length) out.push('кадр без строки вида: ' + uniq(noVid).slice(0, 8).join(' · '));

    // Отменено 26 августа: проверка «поверхность без своей строки вида» по меткам кадров.
    // Метка не различает поверхность и состояние: «Чек-ин · вчерашний день», «Питание · зона
    // красная» — состояния уже описанных экранов, а лексически они не отличаются от новой
    // поверхности. На семнадцати канвасах правило дало 128 срабатываний, настоящих — ни одного.
    // Точной она станет только по адресации: когда кадр-состояние назовёт свою строку
    // атрибутом data-vid. Это разметочная работа по зонам, а не порог в проверке.

    var rogue = [];
    var rowHost = document.querySelector('[data-btnrow], .btns');   // у канваса вообще есть понятие общего ряда?
    if (rowHost) frames.forEach(function (fr) {
      [].forEach.call(fr.querySelectorAll('div, span, button'), function (el) {
        var s = getComputedStyle(el);
        if (parseFloat(s.borderTopLeftRadius) < 100) return;                 // не пилюля
        var h = el.getBoundingClientRect().height;
        if (h < 48) return;                                                   // 44 — кнопки карточек, у них свои строки
        var t = (el.textContent || '').trim();
        if (!t || t.length > 28) return;
        if (el.closest('[data-btnrow], .btns, .foot')) return;                // общий ряд назван
        var par = el.parentElement;
        if (!par) return;
        var pills = [].slice.call(par.children).filter(function (c) {
          return parseFloat(getComputedStyle(c).borderTopLeftRadius) >= 100 && c.getBoundingClientRect().height >= 44;
        });
        if (pills.length > 1) return;                                          // сам ряд и есть ряд
        rogue.push(t + ' в «' + fr.getAttribute('data-screen-label') + '»');
      });
    });
    if (rogue.length) out.push('кнопка мимо общего ряда: ' + uniq(rogue).slice(0, 6).join(' · '));

    // 14. мишень меньше порога. Восьмая проверка смотрит только пилюли и высокие ряды,
    // а круглые контролы с глифом (✓ закрыть подход, ✕ свернуть, + добавить) в её сито
    // не попадают — ровно на них исходная сборка уже ловилась: 24 у крестика, 30 у клеток.
    var GLYPH = ['✓', '✕', '×', '+', '−', '–', '‹', '›', '▲', '▼', '⌃', '⌄'];
    var small = [];
    frames.forEach(function (fr) {
      [].forEach.call(fr.querySelectorAll('div, span, button'), function (el) {
        if (el.children.length) return;                                       // только лист с самим глифом
        if (el.closest('[data-nohit]')) return;                               // значок-индикатор: показывает, а не нажимается
        var t = (el.textContent || '').trim();
        if (GLYPH.indexOf(t) < 0) return;
        var st = getComputedStyle(el);
        var drawn = (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent') || (st.boxShadow && st.boxShadow !== 'none');
        if (!drawn) return;                                                   // голый значок — не мишень
        var r = el.getBoundingClientRect();
        var side = Math.min(r.width, r.height);
        if (!side) return;
        var head = !!el.closest('.top') || el.hasAttribute('data-svc');       // служебные кнопки шапки и помеченные
        var need = head ? 36 : 44;
        if (side >= need - 0.5) return;
        // Мишенью может быть ПРЕДОК: рисованая подложка 30 внутри обёртки 44 — легальный
        // приём (знак узкий, цель полная). Без подъёма проверка объявляла нарушением
        // то, что сама же требовала. Поднимаемся на два шага и только пока предок — обёртка
        // одного глифа (один ребёнок, центрованный флексом): иначе целью сошла бы любая
        // широкая строка, в которой глиф лежит среди других элементов, и проверка обнулилась бы.
        for (var p = el.parentNode, hop = 0; p && p.nodeType === 1 && hop < 2; p = p.parentNode, hop++) {
          if (p.children.length !== 1) break;
          var ps = getComputedStyle(p);
          if (ps.display.indexOf('flex') < 0 && ps.display.indexOf('grid') < 0) break;
          var pr = p.getBoundingClientRect();
          if (Math.min(pr.width, pr.height) >= need - 0.5) return;            // цель есть у предка
        }
        small.push(t + ' ' + Math.round(side) + ' при ' + need + ' в «' + fr.getAttribute('data-screen-label') + '»');
      });
    });
    if (small.length) out.push('мишень меньше порога: ' + uniq(small).slice(0, 6).join(' · '));

    // 16. контраст текста в кадрах. Контракт называет числа 4,6 и 5,2 как вылеченные,
    // но сам контраст не мерила ни одна проверка — и приглушённые числа сидели на 2,6.
    var lum = function (c) {
      var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    var parse = function (v) {
      var m = (v || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    var bgOf = function (el) {
      for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
        var b = parse(getComputedStyle(n).backgroundColor);
        if (b && b.a > 0.9) return b.c;
      }
      return [255, 255, 255];
    };
    // Порог проверяем на ДАННЫХ, и признак данных берём не из вида строки, а из разметки: класс .n
    // (моноцифры) стоит ровно на том, «что сравнивают глазом с соседним» — это собственное
    // правило проекта. По регекспу «есть цифра» проверка брала и подписи вроде «/ 10 000»
    // и «7 дней», которым по решению разрешены 42 %, — и давала сотни ложных на одном канвасе.
    var VALUE = /^[0-9][0-9.,×хx:%\s\u00a0\-–—→\/]*(кг|т|ккал|мл|м|с|повт\.?|раз|мин|%)?$/i;
    // Что меряем: любая короткая строка с цифрой — число или подпись с числом. Признак
    // «класс .n» был ошибкой: моноцифры стоят и на метах плиток («цель 10 000», «к 18:00»),
    // и проверка делила не данные от подписей, а разметку от разметки. Порог один и для
    // тех, и для других: на 9 px разница между 38 и 56 % — это читается или нет.
    var dim = [], blind = 0, dimGhost = [];
    frames.forEach(function (fr) {
      [].forEach.call(fr.querySelectorAll('span, div, b, i'), function (el) {
        if (el.children.length) return;
        if (el.closest('[data-nocontrast]')) return;          // фон не определяется по предкам
        // Приглушение бывает решением: соседние цифры колеса, ненаступившие дни ряда.
        // Гасится не отключением проверки, а адресом — кадр называет строку контракта,
        // где приглушение объявлено, и проверка убеждается, что такая строка есть.
        var dm = el.closest('[data-dim]');
        if (dm) {
          var dk = dm.getAttribute('data-dim');
          if (!vals.some(function (v) { return v.key === dk; })) dimGhost.push(dk || '(пусто)');
          return;
        }
        var t = (el.textContent || '').trim();
        var cls = ' ' + (el.className || '') + ' ';
        var isDash = (t === '—' || t === '–') && /\bdash\b|\bvl\b|\bfld\b/.test(cls);
        if (!isDash && !(t && t.length <= 28 && /\d/.test(t) && VALUE.test(t))) return;
        var st = getComputedStyle(el);
        var fg = parse(st.color); if (!fg) return;
        var bg = bgOf(el);
        if (!bg) { blind++; return; }                          // фон не найден — мерить нечего
        var mix = fg.c.map(function (v, k) { return v * fg.a + bg[k] * (1 - fg.a); });
        var l1 = lum(mix), l2 = lum(bg);
        var cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        // Ниже 1.2 текст был бы невидим — такое заметил бы человек за секунду.
        // Значит это не находка, а промах замера: под текстом лежит заливка,
        // которой нет среди предков (кольцо воды, залитая плитка, слой графика).
        if (cr < 1.2) { blind++; return; }
        var size = parseFloat(st.fontSize), w = parseInt(st.fontWeight, 10) || 400;
        var big = size >= 24 || (size >= 18.66 && w >= 700);
        var need = big ? 3 : 4.5;
        if (cr >= need - 0.05) return;
        dim.push(t.slice(0, 14) + ' ' + cr.toFixed(2) + ' в «' + fr.getAttribute('data-screen-label') + '»');
      });
    });
    if (dim.length) out.push('контраст ниже порога (' + dim.length + '): ' + uniq(dim).slice(0, 5).join(' · '));
    if (dimGhost.length) out.push('data-dim ссылается на строку, которой нет: ' + uniq(dimGhost).slice(0, 4).join(' · '));
    if (blind > 2) out.push('контраст не измерен у ' + blind + ' значений: фона нет среди предков — пометьте поверхность data-nocontrast или назовите её строкой');

    // 18. заливка на такой же заливке. Нарисованная поверхность (радиус или рамка),
    // чей фон совпадает с фоном окрашенного предка, в кадре просто не существует: ячейка
    // «Назначено» на --c1 внутри карточки --c1 читалась как «фона нет», и пара колонок не читалась парой.
    var flat = [];
    frames.forEach(function (fr) {
      [].forEach.call(fr.querySelectorAll('div, span'), function (el) {
        var st = getComputedStyle(el);
        var bg = parse(st.backgroundColor);
        if (!bg || bg.a < 0.9) return;
        // Порог радиуса 4, а не 8: при 8 проверка пропускала ячейки тренировок фазы (радиус 7) — восемь
        // совершенно невидимых поверхностей. Прогон с порогом 3 даёт те же восемь и ни одного
        // ложного: прежний порог был взят наугад, а не по ложным срабатываниям.
        var drawnAsSurface = parseFloat(st.borderTopLeftRadius) >= 4 || (st.boxShadow && st.boxShadow.indexOf('inset') >= 0);
        if (!drawnAsSurface) return;
        var r = el.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 16) return;                         // точки и маркеры не поверхности
        for (var p = el.parentNode; p && p.nodeType === 1 && p !== fr; p = p.parentNode) {
          var pcs = getComputedStyle(p);
          var pb = parse(pcs.backgroundColor);
          if (!pb || pb.a < 0.9) continue;
          // Строка списка — не поверхность внутри поверхности: она занимает всю контентную
          // ширину родителя. Без этого отсева проверка давала 147 находок при 15 настоящих
          // — то есть обнулялась шумом ровно так, как прежде проверка контраста.
          var pr = p.getBoundingClientRect();
          var inner = pr.width - (parseFloat(pcs.paddingLeft) || 0) - (parseFloat(pcs.paddingRight) || 0);
          if (r.width >= inner - 2) break;
          // Кольцо или рамка делают поверхность видимой даже при совпавшей заливке — это
          // законный приём, а не дефект: без отсева проверка осталась бы красной на правильных кадрах.
          var own = getComputedStyle(el);
          if (/inset/.test(own.boxShadow || '') || (parseFloat(own.borderTopWidth) || 0) >= 1) break;
          var d = Math.abs(pb.c[0] - bg.c[0]) + Math.abs(pb.c[1] - bg.c[1]) + Math.abs(pb.c[2] - bg.c[2]);
          if (d <= 3) {
            var t = (el.textContent || '').trim().slice(0, 18) || 'без текста';
            flat.push('«' + t + '» в «' + (fr.getAttribute('data-screen-label') || '?') + '»');
          }
          break;                                                              // только ближайший окрашенный предок
        }
      });
    });
    if (flat.length) out.push('заливка на такой же заливке (' + flat.length + '): ' + uniq(flat).slice(0, 4).join(' · ') + ' — поверхность не видна вовсе');

    // 19. один элемент — два вида. Шкала тяжести была нарисована двумя способами
    // и даже разным числом ступеней: кадры смотрят поодиночке, а расхождение видно
    // только при сравнении двух рядом. Ключ — текст ярлыка, отпечаток — геометрия соседа.
    var shapes = {};
    frames.forEach(function (fr) {
      if (fr.hasAttribute('data-nouni')) return;
      [].forEach.call(fr.querySelectorAll('span, div'), function (el) {
        var t = (el.textContent || '').trim();
        if (el.children.length || t.length < 4 || t.length > 22) return;
        var st = getComputedStyle(el);
        var isLabel = st.textTransform === 'uppercase' || /\bk\b/.test(el.className || '');
        if (!isLabel) return;
        // Подпись группы своей заливки не имеет. Без этого отсева в ключи попадали ЧИПЫ
        // («разм.», «дроп», «время») — у них тоже прописные, но они сами значение, а не ярлык.
        var own = parse(st.backgroundColor);
        if (own && own.a > 0.05) return;
        var sib = el.nextElementSibling;
        if (!sib) return;
        // Отпечаток снимается только с РЯДА однотипных детей (как шкала тяжести).
        // Одиночное значение рядом с подписью отпечатком быть не может: так проверка
        // сравнивала капсулу таблицы с прозой заметки и давала три ложные находки при нуле настоящих.
        if (sib.children.length < 3) return;
        var probe = sib.children[0];
        var ps = getComputedStyle(probe);
        var pr = probe.getBoundingClientRect();
        if (!pr.height) return;
        var sig = Math.round(pr.height) + '/' + Math.round(parseFloat(ps.borderTopLeftRadius) || 0) + '/' + Math.round(parseFloat(ps.fontSize) || 0);
        var key = t.toLowerCase();
        (shapes[key] = shapes[key] || {})[sig] = (shapes[key][sig] || 0) + 1;
      });
    });
    var split = Object.keys(shapes).filter(function (k) {
      var sigs = Object.keys(shapes[k]);
      if (sigs.length < 2) return false;
      var hs = sigs.map(function (x) { return +x.split('/')[0]; });
      return Math.max.apply(null, hs) - Math.min.apply(null, hs) > 4;   // пара пикселей — раскладка, не два вида
    });
    if (split.length) out.push('один элемент — два вида: ' + split.slice(0, 4).map(function (k) {
      return '«' + k + '» ' + Object.keys(shapes[k]).join(' и ');
    }).join(' · '));

    // 20. кадр со снимком канона не назвал своё отношение к нему. Девятнадцать
    // проверок про канон знали только счёт покрытия: что расхождение НАЗВАНО, не проверял
    // никто — именно так в Гб молча жили три фазы против четырёх канонных.
    // Адресация такая же, как у data-vid: кадр сам называет, что и где сказано.
    // ВНИМАНИЕ: пометка живёт в data-canonREF на кадре, а не в data-canon. Атрибут
    // data-canon принадлежит БЛОКУ СНИМКА, и твик showCanon прячет его целиком —
    // пока пометка стояла тем же именем, помеченные кадры пропадали вместе со
    // снимками, то есть проверка гасила ровно те экраны, которые проверяла.
    var canonPairs = [].slice.call(document.querySelectorAll('[data-canonpair]'));
    var mute = [];
    canonPairs.forEach(function (w) {
      var fr = w.querySelector('[data-screen-label]');
      if (!fr) return;
      var note = fr.getAttribute('data-canonref');
      var lbl = fr.getAttribute('data-screen-label');
      if (!note) { mute.push(lbl); return; }
      if (note.indexOf('иначе') !== 0) return;                  // «как в каноне» — утверждение, его проверяет глаз
      var key = note.replace(/^иначе\s*·?\s*/, '').toLowerCase();
      if (!key) { mute.push(lbl + ' (причина не названа)'); return; }
      if (!keysOf().some(function (k) { return k.indexOf(key) >= 0; })) mute.push(lbl + ' (строки «' + key + '» нет)');
    });
    if (mute.length) out.push('отношение к канону не названо у ' + mute.length + ' из ' + canonPairs.length + ' кадров со снимком: ' + mute.slice(0, 4).join(' · ') + ' — пометьте data-canonref="как в каноне" либо data-canonref="иначе · <ключ строки>"');

    // 21. голова строки спорит с хвостом. Решение, ДОПИСАННОЕ в конец data-v, оставляет
    // прежнее число в начале: в строке оказывается два ответа, а читают сверху — и первым
    // прочитывается отменённый. Правило «контракт старше кадра» предполагает ОДИН ответ
    // у строки; старшинство внутри строки не объявлено ничем, кроме порядка слов.
    var LATE = /(?:Правк[аи]|Решени[ея]|Решено|Уточнение|Дополнение|Приведено|Сведено|Снято|Изменено)[\s\S]{0,90}?(?:\d{1,2}\s+(?:августа|сентября)|по срезу|владельца)/;
    var late = [];
    [].forEach.call(document.querySelectorAll('[data-contract] .spec > span[data-v]'), function (sp) {
      var v = sp.getAttribute('data-v') || '';
      if (v.search(LATE) <= 40) return;
      var b = sp.parentNode.querySelector('b');
      late.push('«' + ((b && b.textContent) || '?').slice(0, 30) + '»');
    });
    if (late.length) out.push('решение дописано в конец у ' + late.length + ' строк: ' + late.slice(0, 4).join(' · ') + ' — решение ставится ПЕРВЫМ, прежнее после «Было до этого решения:»');


    // 17. заливочная роль красит текст. Решение 1 сентября: у заливки обязана быть
    // парная роль текста, и только она ставится в color. Роли без пары текстом не бывают:
    // именно так --gr2 давал 3,27 на числах, а --ovl — 2,10 на подписи.
    var FILL_ONLY = ['--gr2', '--ovl', '--tint', '--c1', '--c2', '--gr-bg', '--acs', '--fab', '--wat', '--kb', '--edge'];
    var painted = [];
    frames.forEach(function (fr) {
      [].forEach.call(fr.querySelectorAll('[style*="color:var("]'), function (el) {
        var s = el.getAttribute('style') || '';
        FILL_ONLY.forEach(function (r) {
          if (s.indexOf('color:var(' + r + ')') >= 0) {
            painted.push(r + ' в «' + (fr.getAttribute('data-screen-label') || '?') + '»');
          }
        });
      });
    });
    if (painted.length) out.push('заливочная роль красит текст (' + painted.length + '): ' + uniq(painted).slice(0, 4).join(' · ') + ' — у заливки берётся её парная роль текста');

    var shown = {};
    [].forEach.call(document.querySelectorAll('[data-screen-label]'), function (f) {
      (nrm(f.textContent || '').match(/\d+[,.]?\d*/g) || []).forEach(function (x) { shown[x] = true; });
    });
    var tokens = {};
    (nrm(contract).match(/\d+[,.]?\d*/g) || []).forEach(function (x) { tokens[x] = true; });
    var stray = {};
    [].forEach.call(document.querySelectorAll('.nt, .ntl, .hint, .cap, .lab, .fb, [data-lead]'), function (n) {
      if (n.closest('[data-contract]') || n.hasAttribute('data-fitnote') || n.hasAttribute('data-noref') || n.closest('[data-noref]')) return;
      (nrm(n.textContent || '').match(/\d+[,.]?\d*[\s\u00a0]?(?:%|px|pt|мл|ккал|г\b|кг|мин|дн|ч\b|с\b)/g) || []).forEach(function (m) {
        var num = (m.match(/\d+[,.]?\d*/) || [''])[0];
        if (num.length > 1 && !tokens[num] && !shown[num]) stray[m.trim()] = true;
      });
    });
    var strayList = Object.keys(stray);
    if (strayList.length) out.push('число в прозе вне контракта: ' + strayList.slice(0, 8).join(' · '));

    var off = [];
    [].forEach.call(document.querySelectorAll('[data-fitnote]'), function (n) {
      var m = (n.textContent || '').match(/(\d+)\s?px/);
      if (!m) return;
      var owner = n.getAttribute('data-owner');
      var row = vals.filter(function (v) { return v.key === owner; })[0];
      if (!row) { off.push('замер без владельца: ' + (owner || '—')); return; }
      var pool = (row.val.match(/\d+/g) || []).map(Number);
      var v = +m[1];
      var hit = pool.some(function (x) { return Math.abs(x - v) <= 1; });
      if (!hit) off.push(m[1] + ' px против «' + owner + '»');
    });
    if (off.length) out.push('замер не сходится со своей строкой: ' + off.join(' · '));

    return out;
  }

  function uniq(a) {
    var seen = {}, out = [];
    a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function line() {
    var el = document.querySelector('[data-auditbar2]');
    if (el) return el;
    var host = document.querySelector('[data-auditbar], [data-audit]');
    el = document.createElement('div');
    el.setAttribute('data-auditbar2', '');
    el.style.cssText = 'font:700 11px/1.6 ui-monospace,Menlo,monospace;margin:0 0 22px;text-wrap:pretty;max-width:1080px;';
    if (host && host.parentNode) {
      host.parentNode.insertBefore(el, host.nextSibling);
      return el;
    }
    // у канваса без контракта строки сверки нет вовсе — ставим свою в начало разметки,
    // иначе зона молчит и «не проверено» выглядит как «проверено и чисто»
    var root = document.querySelector('x-dc') || document.body;
    if (!root) return null;
    var h1 = root.querySelector('h1');
    var anchor = h1 && h1.parentNode ? h1 : null;
    if (anchor) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else root.insertBefore(el, root.firstChild);
    el.style.margin = '14px 0 22px';
    return el;
  }

  // 13. роль, которой нет в загруженных стилях. Неразрешённая var(--…) не ломает страницу:
  // свойство просто падает в наследуемое — чёрный глиф на тёмной заливке выглядит как решение.
  // Поэтому имена из разметки сверяются с тем, что действительно вычисляется на элементе.
  function checkVars() {
    // Пока внешняя таблица ролей не применена, getComputedStyle возвращает пустоту на ВСЕХ
    // кастомных свойствах, и проверка объявила бы нерешёнными сразу все роли канваса.
    // Контрольная роль отвечает на вопрос «стили уже подъехали?» — нет, значит проверять нечего.
    var probe = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
      || getComputedStyle(document.body || document.documentElement).getPropertyValue('--ink').trim();
    if (!probe) return [];
    var seen = Object.create(null);
    var nodes = document.querySelectorAll('[style*="var(--"]');
    for (var i = 0; i < nodes.length; i++) {
      var st = nodes[i].getAttribute('style') || '';
      var m = st.match(/var\(\s*(--[a-z0-9-]+)/gi);
      if (!m) continue;
      for (var j = 0; j < m.length; j++) {
        var nm = m[j].replace(/var\(\s*/i, '');
        if (!(nm in seen)) seen[nm] = nodes[i];
      }
    }
    var bad = Object.keys(seen).filter(function (nm) {
      return !getComputedStyle(seen[nm]).getPropertyValue(nm).trim();
    });
    return bad.length
      ? ['роль без значения: разметка красит var(' + bad.slice(0, 4).join('), var(') + ')' + (bad.length > 4 ? ' и ещё ' + (bad.length - 4) : '') + ' — в загруженных стилях таких свойств нет']
      : [];
  }

  // ключи авторских строк контракта (без машинного слепка — на нём совпало бы что угодно)
  function keysOf() {
    var box = document.querySelector('[data-contract]');
    if (!box) return [];
    var keys = [], stop = false;
    [].forEach.call(box.children, function (n) {
      if (stop) return;
      if (n.className === 'ctrH' && /Разбор кадров/.test(n.textContent || '')) { stop = true; return; }
      var b = n.querySelector && n.querySelector('b');
      if (b) keys.push((b.textContent || '').toLowerCase());
    });
    return keys;
  }

  window.__auditVersion = '21.0';
  function paint() {
    var f = findings();
    if (!f) return;
    // нет контракта — зона говорит это словами: «нечего проверять» не значит «чисто»
    if (f === 'nocontract') {
      var e0 = line();
      if (!e0) return;
      var t0 = '— сверка не проводилась: у канваса нет контракта, условие сборки пакета не выполнено';
      if (e0.textContent !== t0) { e0.textContent = t0; e0.style.color = '#8a4a20'; }
      return;
    }
    if (drift && drift.length) f = f.concat(drift);
    f = f.concat(checkVars());
    f = f.concat(coverageNow());    var el = line();
    if (!el) return;
    // локальная строка канваса теперя подмножество общей: если ей нечего сказать — прячем,
    // чтобы две зелёные строки не выглядели двумя разными сверками; нашла своё — показываем
    var own = document.querySelector('[data-auditbar], [data-audit]');
    var quiet = true;
    if (own) {
      quiet = /^\u2713/.test((own.textContent || '').trim());
      own.style.display = quiet ? 'none' : '';
    }
    // отрицательный отступ имеет смысл только когда над нами стоит локальная строка
    el.style.marginTop = quiet ? '0' : '-14px';
    // строка сверки живёт вместе с контрактами: контракты спрятаны твиком — прячется и она.
    // Перечень проверок ушёл в title: в строке он тянулся на всю ширину канваса
    // прячется только чистая строка: расхождение видно всегда, иначе провал сверки
    // стал бы невидимым по умолчанию и пустая шапка читалась бы как «чисто»
    var ctr = document.querySelector('[data-contract]');
    var ctrHidden = !!ctr && (ctr.offsetParent === null || getComputedStyle(ctr).display === 'none');
    el.style.display = (!f.length && ctrHidden) ? 'none' : '';
    el.title = f.length ? '' : 'Проверено: у каждого кадра есть строка вида, кнопки идут общим рядом, числа в прозе есть в контракте, живые замеры сходятся со своей строкой, у каждого содержательного раздела есть вид, объявленные замеры измеряются, чужие канвасы названы, ключи не спорят, незакрытое собрано, роли на месте, литералы совпадают с таблицей ролей, каждая var(--…) из разметки разрешается, круглые мишени не ниже порога, каждый атом источника назван контрактом, кадры видны';
    var txt = f.length
      ? '\u26a0 сверка: ' + f.join(' | ')
      : '\u2713 сверка чиста · 21 проверка' + (window.__coverage ? ' · источник покрыт ' + window.__coverage : '');
    if (el.textContent === txt) return;
    el.textContent = txt;
    el.style.color = f.length ? '#a8382b' : '#5c6a45';
  }

  var drift = null;   // результат проверки 11, приезжает асинхронно

  // 11. литерал канваса, которого нет в таблице ролей v4-canvas.css.
  // Канвасы, живущие на литералах, держат копию палитры. Копию мы не запрещаем,
  // но она обязана быть точной: цвет, которого нет в источнике, — уже дрейф.
  function checkDrift() {
    var css = document.querySelector('link[href*="v4-canvas.css"]');
    var href = css ? css.getAttribute('href') : './v4-canvas.css';
    Promise.all([
      fetch(href).then(function (r) { return r.text(); }).catch(function () { return ''; }),
      fetch(location.href).then(function (r) { return r.text(); }).catch(function () { return ''; })
    ]).then(function (t) {
      var roleSet = {};
      (t[0].match(/#[0-9a-f]{6}\b/gi) || []).forEach(function (h) { roleSet[h.toLowerCase()] = true; });
      if (!Object.keys(roleSet).length) { drift = []; paint(); return; }
      var mine = {};
      var declared = {};
      [].forEach.call(document.querySelectorAll('[data-contract]'), function (c) {
        ((c.textContent || '') + ' ' + [].slice.call(c.querySelectorAll('span[data-v]')).map(function (s) { return s.getAttribute('data-v'); }).join(' '))
          .replace(/#[0-9a-f]{6}\b/gi, function (h) { declared[h.toLowerCase()] = true; return h; });
      });
      (t[1].match(/#[0-9a-f]{6}\b/gi) || []).forEach(function (h) {
        h = h.toLowerCase();
        if (!roleSet[h] && !declared[h]) mine[h] = (mine[h] || 0) + 1;
      });
      var roles = Object.keys(roleSet);
      var rgb = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
      var near = function (h) {                 // ближайшая роль, если расхождение незаметное
        var a = rgb(h), best = null, bd = 1e9;
        roles.forEach(function (r) {
          var b = rgb(r);
          var d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
          if (d < bd) { bd = d; best = r; }
        });
        return bd <= 2 ? best : null;   // только описка: больший допуск начинает сводить разные роли
      };
      var list = Object.keys(mine).map(function (h) {
        var n = near(h);
        return n ? h + '\u2192' + n : null;
      }).filter(Boolean);
      window.__driftList = list;
      window.__driftAll = Object.keys(mine);
      drift = list.length
        ? ['почти-роль: литерал на волос от значения v4-canvas.css (' + list.length + '): ' + list.slice(0, 5).join(' · ') + (list.length > 5 ? ' и ещё ' + (list.length - 5) : '')]
        : [];
      paint();
    });
  }

  // 15. покрытие источника. Реестр атомов исходной сборки лежит рядом файлом:
  // решения, инварианты, спорные состояния, задачи на схему, открытые вопросы, экраны.
  // Проверка считает, сколько из них названо контрактом, — «готово» становится числом,
  // а не словом того, кто последним читал источник.
  var cover = null, atoms = null;  function coverageNow() {
    if (!atoms) return [];
    var box = document.querySelector('[data-contract][data-canon-atoms]');
    // Реестр атомов принадлежит ОДНОМУ канвасу — тому, кто назвал себя атрибутом.
    // Без этой границы проверка считала покрытие чужого источника на любом канвасе
    // и давала «2 из 87» там, где никто ничего не обещал.
    if (!box) { window.__coverage = null; return []; }
      // только авторская часть: машинный слепок ниже повторяет текст кадров дословно
      // и на нём совпало бы что угодно
      var keys = [], stop = false;
      [].forEach.call(box.children, function (n) {
        if (stop) return;
        if (n.className === 'ctrH' && /Разбор кадров/.test(n.textContent || '')) { stop = true; return; }
        var b = n.querySelector && n.querySelector('b');
        if (b) keys.push((b.textContent || '').toLowerCase());
      });
      var oids = {};
      [].forEach.call(document.querySelectorAll('[data-oid]'), function (n) { oids[n.getAttribute('data-oid')] = 1; });
      var miss = atoms.filter(function (a) {
        if (a.g === 'экраны') {
          var w = a.where || '';
          if (w === 'Актив') return false;                                    // отдано другому канвасу
          return !w.split(/[\s и–—]+/).some(function (x) { return oids[x]; });
        }
        if (!a.key) return true;
        var k = a.key.toLowerCase();
        return !keys.some(function (x) { return x.indexOf(k) >= 0; });
      });
      var total = atoms.length;
      window.__coverage = (total - miss.length) + '/' + total;
      return miss.length
        ? ['покрытие источника ' + (total - miss.length) + ' из ' + total + ', не названо: ' + miss.slice(0, 5).map(function (a) { return a.t; }).join(' · ')]
        : [];
  }
  function checkCoverage() {
    fetch('./canon-atoms.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.atoms) return;
      atoms = j.atoms;
      paint();
    }).catch(function () {});
  }

  // Один проход стоит дорого: он обходит все .spec против всех кадров и меряет геометрию.
  // Поэтому наружу выдаётся не paint, а планировщик — сколько бы поводов ни пришло
  // (наблюдатель, load, твик), выполняется один хвостовой проход в простое.
  var pending = null, running = false, dirty = false;
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 0; } }); }, 1); };
  function run() {
    running = true;
    try { paint(); } finally {
      running = false;
      // хвостовой проход: просьба, пришедшая во время прохода, раньше отбрасывалась целиком,
      // и вердикт залипал на устаревшем — в том числе мог залипнуть зелёный
      if (dirty) { dirty = false; schedule(60); }
    }
  }
  function schedule(delay) {
    if (running) { dirty = true; return; }
    clearTimeout(pending);
    pending = setTimeout(function () { idle(run); }, delay == null ? 120 : delay);
  }
  function force() {
    if (running) { dirty = true; return; }
    clearTimeout(pending);
    run();
  }

  function boot() {
    schedule(0);
    checkDrift();
    checkCoverage();
    if (document.body) new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var tg = recs[i].target;
        if (tg && tg.closest && tg.closest('[data-auditbar2]')) return;
      }
      schedule(250);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    // перемер после раскладки и после load: двенадцатая проверка без этого врёт
    window.addEventListener('load', function () { schedule(400); });
    window.__auditRepaint = force;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
