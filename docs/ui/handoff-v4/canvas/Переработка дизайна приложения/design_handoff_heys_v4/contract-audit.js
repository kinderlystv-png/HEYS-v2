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

   Адресации: data-vid="<ключ>" — кадр называет свою строку вида; data-owner на
   [data-fitnote] — замер сверяется только с числами названной строки;
   data-nofit="<ключ>" на .spec — число здесь обоснование, замер живёт в другой
   строке; data-noref на заметке — число в ней иллюстрация аргумента, а не
   спецификация, и в контракте его быть не должно.

   Строка отдельная намеренно: приписывать чужой текст — значит спорить с ним при
   каждой перерисовке. У каждой строки свой предмет, и обе обязаны быть чистыми. */
(function () {
  // разделы, которым вид не положен по существу
  var SERVICE = /^(что это|чьё|что это и чьё|границ|адресаци|палитр|демо|открыто|не реализов|снято|протокол|решени|дефект|чего в контракте нет|источник|начало контракта)/i;

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

    var allFrames = document.querySelectorAll('[data-screen-label]');
    if (allFrames.length) {
      var visible = 0;
      [].forEach.call(allFrames, function (fr) {
        var b = fr.getBoundingClientRect();
        if (b.width > 4 && b.height > 4) visible++;
      });
      if (!visible) out.push('кадров ' + allFrames.length + ', видимых 0 — разметка схлопнулась: чаще всего незакрытый div в контракте');
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
    var el = line();
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
    el.title = f.length ? '' : 'Проверено: у каждого кадра есть строка вида, кнопки идут общим рядом, числа в прозе есть в контракте, живые замеры сходятся со своей строкой, у каждого содержательного раздела есть вид, объявленные замеры измеряются, чужие канвасы названы, ключи не спорят, незакрытое собрано, роли на месте, литералы совпадают с таблицей ролей, кадры видны';
    var txt = f.length
      ? '\u26a0 сверка: ' + f.join(' | ')
      : '\u2713 сверка чиста · 12 проверок';
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

  function boot() {
    paint();
    checkDrift();
    var t = null;
    if (document.body) new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var tg = recs[i].target;
        if (tg && tg.closest && tg.closest('[data-auditbar2]')) return;
      }
      clearTimeout(t);
      t = setTimeout(paint, 80);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    setTimeout(paint, 500);
    setTimeout(paint, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
