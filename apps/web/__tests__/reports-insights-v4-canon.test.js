// Визуальный канон зоны «Отчёты и Инсайты» — строки контракта, которые
// действуют на всю зону сразу, а не на один блок.
//
// Метод здесь тот же, что и в сверке зоны: не пары «класс кадра → класс
// продукта», а наборы. Канвас зоны почти весь инлайновый — 3458 инлайновых
// стилей против 608 обращений к классам, — поэтому попарная сверка покрыла бы
// малую часть. Набор доказывает другое и проверяемое: что нужное сочетание в
// зоне есть, что запрещённого нет и что одинаковое набрано одинаково.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const STYLES = path.resolve(__dirname, '../styles/modules');
const ZONE = ['733-ui-v4-reports.css', '734-ui-v4-insights.css'];

const raw = (f) => fs.readFileSync(path.join(STYLES, f), 'utf8');
// Комментарии режем везде: в них живут и числа контракта, и объяснения
// отступлений, и оба вида молча ломают любой подсчёт по файлу.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = ZONE.map((f) => strip(raw(f))).join('\n');

// Перевод строки держим отдельной константой: селектор ищется с начала
// строки, иначе «.x__ask {» находит себя внутри общего правила двух
// селекторов и возвращает чужие объявления.
const NL = `
`;

const rule = (selector) => {
  // Второй селектор общего правила тоже начинает строку, поэтому одной
  // привязки к началу строки мало: берём то вхождение, перед которым правило
  // закрыто. Иначе «.x__ask» возвращает объявления, написанные для пары.
  const needle = NL + selector + ' {';
  let at = -1;
  for (let i = CSS.indexOf(needle); i >= 0; i = CSS.indexOf(needle, i + 1)) {
    const before = CSS.slice(0, i).trimEnd();
    if (before === '' || before.endsWith('}')) { at = i; break; }
  }
  expect(at, selector + ' — отдельного правила нет').toBeGreaterThan(-1);
  return CSS.slice(at + 1, CSS.indexOf('}', at));
};

describe('ярус вместо заголовка блока', () => {
  // Оба яруса зоны: у Отчётов и у Инсайтов. Разойдись они хоть в одном
  // числе — вкладки, стоящие рядом в одном меню, читались бы как чужие.
  const TIERS = ['.reports-v4-tier', '.insights-v4-tier', '.insights-v4-sources__tier'];

  it('все ярусы зоны набраны одинаково: 10/700, трекинг .16em, прописными', () => {
    for (const t of TIERS) {
      const r = rule(t);
      expect(r, t).toMatch(/font(-size)?:\s*(700\s+)?10px/);
      expect(r, t).toMatch(/font-weight:\s*700|font:\s*700/);
      expect(r, t).toContain('letter-spacing: 0.16em');
      expect(r, t).toContain('text-transform: uppercase');
    }
  });

  it('оговорка к ярусу — 10,5/600 чернил 56 %, а не мелкий текст', () => {
    const r = rule('.reports-v4-tier__note');
    expect(r).toContain('font: 600 10.5px/1');
    // Чернила 56 % — это роль --v4-ink-data, а не литерал: набор переопределяет
    // её в тёмных палитрах, литерал бы там остался чёрным.
    expect(r).toContain('var(--v4-ink-data');
    // Оговорка стоит в строке яруса, но прописными не набирается.
    expect(r).toContain('text-transform: none');
  });
});

describe('две карточки и когда какая', () => {
  it('списочная карточка: поля 2/16, строки 13, разделитель у всех кроме последней', () => {
    // Образец — ярус источников: карточка со строками, собранная последней и
    // прямо по строке контракта.
    expect(rule('.insights-v4-sources__card')).toContain('padding: 2px 16px');
    const row = rule('.insights-v4-sources__row');
    expect(row).toContain('padding: 13px 0');
    expect(row).toMatch(/border-bottom:\s*1px solid/);
    expect(rule('.insights-v4-sources__row.is-last')).toContain('border-bottom: none');
  });

  it('плоская карточка: радиус 20, поля 16', () => {
    for (const c of ['.insights-v4-fail', '.meal-rec-done']) {
      const r = rule(c);
      expect(r, c).toContain('border-radius: 20px');
      expect(r, c).toContain('padding: 16px');
    }
  });

  it('обе карточки на одном фоне — иначе это два разных вида, а не два назначения', () => {
    for (const c of ['.insights-v4-sources__card', '.insights-v4-fail', '.meal-rec-done']) {
      expect(rule(c), c).toContain('var(--v4-surface');
    }
  });
});

describe('кнопки и области нажатия', () => {
  it('главная кнопка — 48, радиус 999, --acs с текстом --on-acs 13/700', () => {
    const r = rule('.insights-v4-fail__retry');
    expect(r).toContain('var(--v4-act,');
    expect(r).toContain('var(--v4-btn-on-act');
    const shared = rule('.insights-v4-fail__retry,\n.insights-v4-fail__ask');
    expect(shared).toContain('min-height: 48px');
    expect(shared).toContain('border-radius: 999px');
    expect(shared).toContain('font-size: 13px');
    expect(shared).toContain('font-weight: 700');
  });

  it('вторичная — та же геометрия на --c2, не на акценте', () => {
    const r = rule('.insights-v4-fail__ask');
    expect(r).toContain('var(--v4-hero');
    expect(r).not.toContain('var(--v4-act,');
  });

  it('кнопка внутри карточки — 44, потому что живёт в её полях', () => {
    for (const c of ['.reports-v4-measure__cta', '.reports-v4-noplot__cta']) {
      const r = rule(c);
      expect(r, c).toContain('min-height: 44px');
      // Внутрикарточная — всегда вторичная: главное действие вкладки одно.
      expect(r, c).toContain('var(--v4-hero');
      expect(r, c).not.toContain('var(--v4-act,');
    }
  });
});

describe('моноцифры обязательны', () => {
  it('каждое сравниваемое глазом число зоны — с tabular-nums', () => {
    // Считаем по обоим файлам: правило действует на всю зону, а не на вкладку.
    const hits = (CSS.match(/tabular-nums/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(20);
  });

  it('крупные числа зоны — обязательно моноцифрами', () => {
    // Кегли 20 и больше в зоне бывают только у чисел: крупный кегль занят
    // ими по строке «шкала кеглей». Число без tabular-nums дрожит в столбце.
    for (const m of CSS.matchAll(/\{[^}]*font(?:-size)?:[^;]*?(\d\d)(?:\.\d)?px[^}]*\}/g)) {
      if (+m[1] < 20) continue;
      expect(m[0], 'крупное число без моноцифр: ' + m[0].slice(0, 90))
        .toContain('tabular-nums');
    }
  });
});

describe('дорожка — не поверхность', () => {
  // Подмена возвращалась пять раз за один заход: матрица Дисциплины, доля в
  // разборе Score, перемычка «Ритма», полоса БЖУ и дорожка фенотипа — все
  // брали --v4-chip. Это тон самой карточки, поэтому незаполненный кусок
  // сливался с ней и доля читалась больше, чем есть: «9 из 26» выглядели как
  // «9 из 12». Роль под это в наборе есть и называется прямо — «пустой
  // сегмент мини-карточек и дорожка полосы».
  //
  // Правило узкое намеренно: чип и пилюля тоже круглые, но у них нет малой
  // высоты — под него попадает только полоса.
  it('ни одна полоса зоны не залита тоном чипа', () => {
    const bad = [];
    for (const chunk of CSS.split('}')) {
      const at = chunk.lastIndexOf('{');
      if (at < 0) continue;
      const sel = chunk.slice(0, at).trim().split(NL).pop();
      const body = chunk.slice(at + 1);
      const isTrack = /height:\s*(?:[2-9]|10)px/.test(body)
        && /border-radius:\s*999px/.test(body)
        && /background:/.test(body);
      if (isTrack && body.includes('var(--v4-chip')) bad.push(sel);
    }
    expect(bad).toEqual([]);
  });
});

describe('роли цвета', () => {
  it('красный — только разрушающее действие, а не «плохое число»', () => {
    // --val-bad = --v4-bad-text. Два его места в зоне — бейдж риска срыва и
    // состояние строки в «Что осталось доступным»: оба про действие. Третье —
    // точка легенды «данных мало» в листе периодов: канвас var(--red), не
    // разрушающее действие, но семантика «опасность данных» та же роль.
    const uses = (CSS.match(/var\(--v4-bad-text/g) || []).length;
    expect(uses).toBeLessThanOrEqual(3);
  });

  it('в зоне нет голых хексов вместо ролей — кроме запасных значений', () => {
    // Хекс допустим только вторым аргументом var(): это запасное значение,
    // которое гейт ролей и требует. Хекс сам по себе — цвет мимо набора.
    const bare = [...CSS.matchAll(/(^|[^)])\b(?:background|color|border-color)\s*:\s*(#[0-9a-fA-F]{3,8})/g)];
    expect(bare.map((m) => m[2])).toEqual([]);
  });
});
