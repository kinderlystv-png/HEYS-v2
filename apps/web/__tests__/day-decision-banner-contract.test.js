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
    expect(BANNER).toContain("background: 'var(--v4-tint, #f6e6dd)'");
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
});
