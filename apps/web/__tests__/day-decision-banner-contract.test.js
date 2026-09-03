// Баннер решения о дне и карточка подтверждения — два разных вопроса.
//
// Баннер живёт в дне и спрашивает «что это было»; карточка стоит под графиком
// динамики в Отчётах и спрашивает «верить ли этому дню». Общего у них только
// вид: тёплая карточка, вопрос словами, кнопки называют действие сами.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const BANNER = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_low_cal_banner_v1.js'),
  'utf8'
);
const STATS = fs.readFileSync(path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');

describe('баннер решения о дне', () => {
  it('карточка тёплая ролью, а не зашитой янтарной', () => {
    // Красный в системе значит разрушающее действие; вопрос о дне таковым
    // не является.
    expect(BANNER).toContain("background: 'var(--v4-tint");
    expect(BANNER).not.toContain('#fef3c7');
    expect(BANNER).not.toContain('#f59e0b');
  });

  it('заголовок без эмодзи и без слова «внимание»', () => {
    expect(BANNER).toContain("}, 'Этот день не учитывается в статистике')");
    expect(BANNER).not.toMatch(/⚠️ Этот день/);
    // Комментарии не считаем: слово в объяснении правила — не текст экрана.
    const code = BANNER.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/[Вв]нимание/);
  });

  it('три пути решения названы словами, без значков', () => {
    for (const label of ['Это было голодание', 'Дописать пропущенное', 'Не учитывать день']) {
      expect(BANNER, label).toContain("}, '" + label + "')");
    }
    expect(BANNER).not.toMatch(/🍽|✏️|🚫/);
  });

  it('после ответа остаётся одна строка, и пропуск приглушён', () => {
    expect(BANNER).toContain("'День отмечен как осознанное голодание', false");
    expect(BANNER).toContain("'День помечен как пропуск — не учитывается', true");
    // Решение видно всегда, а не исчезает вместе с баннером.
    expect(BANNER).toContain("}, 'Изменить')");
  });

  // Строка контракта «три пути решения»: «это сказано строкой под
  // кнопками». Строки не было вовсе, а два вердикта снимка стояли «=»
  // со ссылкой на этот гейт — он её не проверял.
  it('под кнопками сказано, что будет без ответа', () => {
    expect(BANNER).toContain('Пока ответа нет, день не идёт ни в средние, ни в долг калорий.');
    // Сноска стоит ПОСЛЕ кнопок, а не над ними.
    expect(BANNER.indexOf("'Не учитывать день'"))
      .toBeLessThan(BANNER.indexOf('Пока ответа нет'));
  });

  it('пустой день говорит про записи, а не про данные', () => {
    expect(BANNER).toContain('За этот день нет записей');
  });

  it('исторические пустые дни баннером не засоряются', () => {
    // Показываем только в окне проверки — том же, что у автошага чек-ина.
    expect(BANNER).toContain('isPendingEmptyDay(date)');
  });

  it('порог в тексте считается из константы', () => {
    expect(BANNER).toContain('${Math.round(THRESHOLD * 100)}%');
  });
});

describe('карточка подтверждения дня', () => {
  it('рекомендованное действие стоит первым, а не только красится', () => {
    // Читающий сверху вниз видел рекомендацию второй: порядок был жёстким,
    // менялось лишь оформление.
    const start = STATS.indexOf("className: 'kcal-realdata-card__actions'");
    const body = STATS.slice(start, start + 1400);
    expect(body).toContain('isClearPrimary ? [');
    expect(body).toContain("index === 0 ? '' : ' kcal-realdata-card__button--secondary'");
  });

  it('вторая кнопка остаётся доступной', () => {
    const start = STATS.indexOf("className: 'kcal-realdata-card__actions'");
    const body = STATS.slice(start, start + 1400);
    expect(body).not.toContain('disabled');
    expect(body).not.toContain('display: none');
  });

  it('рекомендация названа словами, а не только цветом', () => {
    expect(STATS).toContain('Рекомендуем очистить');
    expect(STATS).toContain('Рекомендуем подтвердить');
  });

  it('строка влияния на месте — ответ меняет не только этот день', () => {
    expect(STATS).toContain('kcal-realdata-card__impact');
  });

  it('значка тревоги в карточке нет — вопрос задают словами', () => {
    expect(STATS).not.toContain("kcal-realdata-card__icon' }, '⚠️'");
  });

  // Строка контракта «карточка · баннер решения о дне»: кнопки-варианты по 44
  // высотой и текст 12 px/600. Стояли 40 и 12,5 — ниже порога нажатия и на
  // полступени крупнее шкалы зоны. Проверяем по блоку стиля, а не по всему
  // файлу: те же числа встречаются и в соседних стилях.
  it('кнопки-варианты держат 44 и кегль 12', () => {
    const at = BANNER.indexOf('ACTION_BTN_STYLE');
    const head = BANNER.slice(at, BANNER.indexOf('};', at));
    expect(head).toContain('minWidth: 132');
    expect(head).toContain('minHeight: 44');
    expect(head).toContain('borderRadius: 14');
    expect(head).toContain('fontSize: 12,');
  });

  // Кнопка «Изменить» держалась на дореформенных литералах: белый фон на
  // песочной подложке и слейтовый текст не менялись ни в одном наборе.
  //
  // Проверка сторожит ПРАВИЛО, а не конкретные роли. Прежняя редакция
  // ждала именно --v4-bg и --v4-ink — и упала на переводе кнопки в
  // пилюлю контракта (--v4-chip / --v4-act-text), то есть на починке.
  it('кнопка «Изменить» красится ролями, а не литералами', () => {
    const at = BANNER.indexOf('CHANGE_BTN_STYLE');
    const head = BANNER.slice(at, BANNER.indexOf('};', at));
    // Запасные значения внутри var() — часть роли, а не литерал.
    const stripped = head.replace(/var\([^)]*\)/g, 'ROLE');
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(stripped).not.toMatch(/rgba?\(/);
    const colours = head.match(/(background|color|border)\s*:\s*'[^']*'/g) || [];
    expect(colours.length).toBeGreaterThan(0);
    for (const decl of colours) {
      expect(/var\(--v4-|'none'/.test(decl), decl).toBe(true);
    }
  });

  // Строка контракта «карточка · свёрнутое решение о дне» и элемент 14
  // кадра говорят одно: пилюля 32 высотой, а не кнопка формы.
  it('«Изменить» — пилюля 32 высотой, а не кнопка формы', () => {
    const at = BANNER.indexOf('CHANGE_BTN_STYLE');
    const head = BANNER.slice(at, BANNER.indexOf('};', at));
    expect(head).toContain('minHeight: 32');
    expect(head).toContain('borderRadius: 999');
    expect(head).toContain("padding: '0 12px'");
    expect(head).toContain("border: 'none'");
    expect(head).toMatch(/font:\s*'700 11px\/1/);
  });

  // Свёрнутая строка стоит на тоне карточки, а не баннера вопроса:
  // --tint продолжал просить внимания после того, как ответ уже дан.
  it('свёрнутая строка не носит тон баннера вопроса', () => {
    const at = BANNER.indexOf('COMPACT_BANNER_STYLE');
    const head = BANNER.slice(at, BANNER.indexOf('};', at));
    expect(head).not.toContain('--v4-tint');
    expect(head).toContain('var(--v4-card');
    expect(head).toContain('borderRadius: 16');
    expect(head).toContain("padding: '12px 14px'");
  });
});
