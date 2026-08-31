// aps-css-zones.test.js — класс живёт в файле своей зоны.
//
// 31 августа `600-steps-and-aps.css` (10 947 строк) разрезан по экранам: в одном
// файле жили пять зон, а `git commit -- <путь>` берёт файл целиком — за один день
// 1239 незакоммиченных строк одной сессии уехали в коммит другой. Тот же класс
// проблемы, что был у общего снимка вердиктов, и лечится так же.
//
// Разрез без гейта разошёлся бы обратно за неделю: достаточно завести `mpr-*` в
// файле карточки продукта, и файлы снова станут общими. Тест держит раскладку,
// а не намерение.
//
// Список общих приставок закрытый и может только уменьшаться: каждая запись в
// нём — это класс, который носят несколько экранов, и переезд такого класса в
// зону сломал бы соседей.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MODULES = path.resolve(__dirname, '../styles/modules');

/** Приставка → файл, в котором ей положено жить. */
const ZONES = [
  ['611-aps-product-card.css', ['aps-v4-create', 'aps-v4-harm', 'aps-barcode', 'aps-product', 'harm-select', 'desktop-add-product']],
  ['613-cycle-ui.css', ['cycle-', 'mc-cycle']],
  ['612-training-step.css', ['ts-']],
  ['610-aps-meal-flow.css', ['mpr-', 'mpc-', 'flow-', 'meal-', 'aps-open', 'aps-v4-grams', 'aps-grams', 'aps-v4-meal', 'aps-search', 'aps-v4-search']],
];

/**
 * Приставки, которые честно общие: оболочка модалки шага и кнопки потока.
 * Их носят и приём, и карточка продукта, и шаг тренировки — у них нет одной
 * зоны, поэтому им место в `600-steps-and-aps.css`.
 */
const SHELL_PREFIXES = ['mc-', 'aps-v4-btn', 'aps-v4-flow', 'aps-v4-card', 'aps-v4-exit', 'aps-categor', 'confirm-modal', 'photo-viewer'];

/** Порядок подключения: оболочка первой, дальше зоны по номеру. */
const FILES = ['600-steps-and-aps.css', '610-aps-meal-flow.css',
  '611-aps-product-card.css', '612-training-step.css', '613-cycle-ui.css'];

const read = (file) => fs.readFileSync(path.join(MODULES, file), 'utf8');

/**
 * Правила файла: каждое — список ведущих классов своих селекторов.
 *
 * Групповые правила, где селекторы разных зон делят одно объявление
 * (`.aps-v4-meal-summary__row-recipe, .aps-product-recipe, .meal-recipe-line`),
 * разрезать нельзя: пришлось бы держать три копии объявления в трёх файлах.
 * Такие правила гейт не считает нарушением — они лежат в файле первого
 * селектора, а их число проверяется отдельно, чтобы зоны не склеивались обратно
 * незаметно.
 */
function rules(css) {
  const out = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComments.matchAll(/(?:^|\n)\s*([^{}@\n][^{}]*?)\s*\{/g)) {
    const classes = [];
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().match(/\.([a-z][a-z0-9-]*)/);
      if (cls) classes.push(cls[1]);
    }
    if (classes.length) out.push(classes);
  }
  return out;
}

const zoneOf = (cls) => {
  // Зона проверяется раньше общих приставок: `mc-cycle-*` — это цикл, хотя
  // начинается с общей `mc-`. Обратный порядок отправлял бы его в оболочку.
  for (const [file, prefixes] of ZONES) {
    if (prefixes.some((p) => cls.startsWith(p))) return file;
  }
  if (SHELL_PREFIXES.some((p) => cls.startsWith(p))) return '600-steps-and-aps.css';
  return null;
};

describe('Классы потока добавления лежат по зонам', () => {
  it.each(FILES)('%s существует и не пуст', (file) => {
    expect(fs.existsSync(path.join(MODULES, file)), file).toBe(true);
    expect(read(file).length).toBeGreaterThan(500);
  });

  it.each(FILES)('в %s нет классов чужой зоны', (file) => {
    const foreign = new Set();
    for (const classes of rules(read(file))) {
      const owners = new Set(classes.map(zoneOf).filter(Boolean));
      // Групповое межзонное правило — не нарушение, см. комментарий у rules().
      if (owners.size > 1) continue;
      for (const cls of classes) {
        const owner = zoneOf(cls);
        if (owner && owner !== file) foreign.add(`${cls} → ${owner}`);
      }
    }
    expect([...foreign], file).toEqual([]);
  });

  it('межзонных групповых правил не больше, чем было при разрезе', () => {
    // Каждое такое правило — место, где зоны склеены. Их число может только
    // уменьшаться: новое склеивание должно быть решением, а не привычкой.
    let n = 0;
    for (const file of FILES) {
      for (const classes of rules(read(file))) {
        if (new Set(classes.map(zoneOf).filter(Boolean)).size > 1) n += 1;
      }
    }
    expect(n).toBeLessThanOrEqual(6);
  });

  it('все пять файлов подключены, и порядок сохраняет каскад', () => {
    // Оболочка идёт первой: зонные файлы переопределяют её, а не наоборот.
    const main = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    const positions = FILES.map((f) => main.indexOf(f));
    expect(positions.every((p) => p > -1), 'все файлы в main.css').toBe(true);
    const imports = FILES.map((f) => main.indexOf(`@import url('./modules/${f}')`));
    expect(imports.every((p) => p > -1), 'все файлы импортированы').toBe(true);
    expect([...imports].sort((a, b) => a - b)).toEqual(imports);
  });

  // Обратная проверка (наблюдение heys-v2-62): приставка говорит о
  // происхождении класса, а не о владении им. `aps-create-*` и `aps-v4-outcome-*`
  // по приставке читались как оболочка, а пользуется ими один экран — шаг
  // создания продукта. Такие семейства ловятся не именем, а списком: где класс
  // реально употребляется.
  const SINGLE_OWNER = [
    ['aps-create', '611-aps-product-card.css'],
    ['aps-v4-outcome', '611-aps-product-card.css'],
    ['aps-v4-portions', '611-aps-product-card.css'],
    ['aps-portions', '611-aps-product-card.css'],
  ];

  it.each(SINGLE_OWNER)('семейство %s лежит в файле своего единственного экрана', (prefix, file) => {
    const shell = read('600-steps-and-aps.css');
    const stray = [];
    for (const classes of rules(shell)) {
      // Смешанный селектор (`.mc-modal:has(.aps-create-step)`) — правило
      // оболочки про своего гостя, оно остаётся здесь по праву.
      if (classes.length && classes.every((c) => c.startsWith(prefix))) {
        stray.push(classes[0]);
      }
    }
    expect([...new Set(stray)], `${prefix} → ${file}`).toEqual([]);
  });

  it('список общих приставок закрыт — он может только уменьшаться', () => {
    // Каждая запись здесь означает «класс носят несколько экранов». Новая
    // приставка в этом списке — это отказ от разреза, а не его продолжение.
    expect(SHELL_PREFIXES).toHaveLength(8);
  });

  // Вторая половина правила (наблюдение heys-v2-e5 и heys-v2-fc): класс живёт не
  // только в своём файле, но и в одном экземпляре. Разрез сделал видимым то, что
  // лежало в `600` годами: 1138 строк раздела наборов были продублированы
  // дословно подряд, а в карточке продукта плашка «Найден по штрихкоду», уже
  // сведённая с кадром, перебивалась ниже своей же старой копией из прежней
  // системы — фиолетовым градиентом, который из набора убрали. Правка была на
  // месте и не действовала.
  //
  // Проверка ищет не «объявлен дважды», а «первое объявление перекрыто
  // последующими целиком»: `.aps-product-card--disabled` объявлен базой и затем
  // группой состояний — это обычный приём, а не долг. Мёртв тот, у кого не
  // осталось ни одного своего свойства.
  function shadowed(css) {
    const top = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@[a-z-]+[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    const seen = new Map();
    const dead = [];
    for (const m of top.matchAll(/(?:^|\n)\s*([^{}@\n][^{}]*?)\s*\{([^{}]*)\}/g)) {
      const props = new Set([...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]));
      const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
      for (const sel of selectors) {
        const prev = seen.get(sel);
        // Перекрытие засчитывается только от одиночного правила — от копии.
        // Групповое (`.card--disabled, .card--disabled:hover, …`) базу не
        // хоронит: это обычный каскад, где база — отправная точка состояний.
        if (prev && selectors.length > 1) continue;
        if (prev) {
          for (const p of props) prev.props.delete(p);
          if (prev.props.size === 0 && !prev.reported) {
            prev.reported = true;
            dead.push(sel);
          }
        } else if (props.size) {
          seen.set(sel, { props: new Set(props), reported: false });
        }
      }
    }
    return dead;
  }

  // Оставшийся долг оболочки — десять объявлений, перекрытых копией слово в
  // слово: значения совпадают, поэтому на экране сегодня ничего не видно, но
  // следующая правка уйдёт в мёртвую половину. Здесь копии переплетены со
  // вставками (блок «Готовые наборы» повторён с чужими правилами между
  // половинами), и распутывать их — отдельная работа, а не хвост разреза.
  // Потолок может только уменьшаться.
  const SHADOW_DEBT = { '600-steps-and-aps.css': 10 };

  it.each(FILES)('в %s нет объявления, перекрытого следующим целиком', (file) => {
    const dead = shadowed(read(file));
    expect(dead.length, `${file}: ${dead.join(', ')}`)
      .toBeLessThanOrEqual(SHADOW_DEBT[file] ?? 0);
  });

  it('общий файл не разросся обратно', () => {
    // До разреза в нём было 10 947 строк на пять зон. Если он снова станет
    // самым большим, разрез отменили молча.
    const sizes = FILES.map((f) => [f, read(f).split('\n').length]);
    const shell = sizes.find(([f]) => f === '600-steps-and-aps.css')[1];
    const biggest = Math.max(...sizes.map(([, n]) => n));
    expect(shell, `оболочка ${shell} строк, самый большой файл ${biggest}`).toBeLessThan(biggest);
  });
});
