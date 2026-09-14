/**
 * Поиск правила CSS по селектору — от начала селектора, а не подстрокой.
 *
 * Полтора десятка гейтов доставали блок правила поиском подстроки и брали
 * первое совпадение. Короткий селектор целиком лежит внутри длинного: у
 * `.date-picker--v4 .date-picker-trigger` раньше в файле стоит
 * `.hdr-sticky-strip.is-pinned .date-picker--v4 .date-picker-trigger` — и гейт
 * мерил чужое правило с одной лишь тенью. Падал он при этом на пустой строке,
 * то есть указывал не на тот файл и не на ту строку (починка одного такого
 * случая — f7ef3a7ea).
 *
 * Якорь — начало строки или запятая списка селекторов: комбинаторы ` `, `>`,
 * `~` мимо него не проходят, а `.a,\n.b { }` и `.a, .b { }` находятся оба.
 *
 * Ненайденное правило обязано ронять тест с именем селектора. Молчаливая
 * пустая строка читается как «не сошлось», а означает «не смотрели» — правило
 * проекта «Зелёная проверка обязана отличать „сошлось“ от „не смотрели“».
 */

const escapeSelector = (selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Гейты зовут помощника по-разному: кто селектором, кто строкой «селектор {»,
 * кто первым членом группы «селектор,». Хвост снимаем здесь, а не в каждом
 * файле: групповое правило помощник и так находит по любому своему члену.
 */
const normalize = (selector) => String(selector).trim().replace(/\s*[,{]\s*$/, '');

/** Закрывающая скобка блока, открытого на `open`; учитывает вложенность. */
function closingBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Все правила с этим селектором, по порядку в файле.
 *
 * @param {string} css исходник CSS
 * @param {string} selector селектор целиком, как он написан в файле
 * @yields {{start:number, open:number, close:number, selectorText:string, body:string, text:string}}
 */
export function* eachRule(css, selector) {
  const re = new RegExp(`(?:^|,)[ \\t]*(${escapeSelector(normalize(selector))})\\s*(?=[,{])`, 'gm');
  let m;
  while ((m = re.exec(css)) !== null) {
    // Смещение считается от начала совпадения до самого селектора: хвостовой
    // `\s*` в `m[0]` длиннее нуля, и вычитание длины селектора съедало точку.
    const start = m.index + m[0].indexOf(m[1]);
    const open = css.indexOf('{', m.index + m[0].length);
    if (open < 0) break;
    const close = closingBrace(css, open);
    if (close < 0) break;
    yield {
      start,
      open,
      close,
      selectorText: css.slice(css.lastIndexOf('\n', start) + 1, open).trim(),
      body: css.slice(open + 1, close),
      text: css.slice(start, close + 1),
    };
    re.lastIndex = close;
  }
}

/** Первое правило с этим селектором или `null`. */
export function findRule(css, selector) {
  for (const hit of eachRule(css, selector)) return hit;
  return null;
}

/**
 * Объявления всех правил этого селектора, склеенные.
 *
 * У селектора обычно не одно правило: `.mc-step-kicker` объявлен и в группе с
 * `.mc-hero-number`, и отдельно, и свойство бывает в любом из них. Вопрос «этот
 * элемент объявляет X» — про все его правила разом, а не про первое попавшееся:
 * первое даёт ложную красноту, а прежнее окно фиксированной длины дотягивалось
 * до соседнего правила и давало ложную зелень.
 *
 * Правила с предком (`.foo .mc-step-kicker`) сюда не попадают — якорь их не
 * пропускает, и это верно: они принадлежат другому адресу.
 */
export function allDeclarations(css, selector, where = '') {
  const bodies = [...eachRule(css, selector)].map((hit) => hit.body);
  if (!bodies.length) {
    throw new Error(
      `правило «${normalize(selector)}» не найдено${where ? ` (${where})` : ''}`
        + ' — селектор переименован, вынесен или лежит только внутри более длинного',
    );
  }
  return bodies.join('\n');
}

/**
 * Первое правило с этим селектором; ненайденное роняет тест с именем
 * селектора, а не возвращает пустую строку.
 */
export function requireRule(css, selector, where = '') {
  const hit = findRule(css, selector);
  if (!hit) {
    throw new Error(
      `правило «${normalize(selector)}» не найдено${where ? ` (${where})` : ''}`
        + ' — селектор переименован, вынесен или лежит только внутри более длинного',
    );
  }
  return hit;
}
