/**
 * Ряд фильтров каталога упражнений — одна строка с прокруткой.
 *
 * Строка контракта «ряд фильтров каталога» (strength-builder.v4, решение
 * 13 сентября по находке кодера): «ОДНА СТРОКА С ГОРИЗОНТАЛЬНОЙ ПРОКРУТКОЙ, не
 * перенос… Причина не в эстетике: четыре строки чипов отжимают список
 * упражнений вниз на 140 px, а фильтр — не содержимое экрана, а способ его
 * сузить».
 *
 * Кадр рисовал шесть чипов в строку с переносом, а групп мышц в продукте
 * четырнадцать. Соседняя строка «вид · каталог упражнений» всё ещё говорит «с
 * зазором 6 и переносом» — верна эта: она новее и названа отдельным решением.
 * Проверка читает обе, чтобы спор не потерялся молча.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/750-strength-builder.css'), 'utf8');
const CANVAS = fs.readFileSync(
  path.resolve(
    WEB,
    '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html',
  ),
  'utf8',
);

/** Тело правила CSS по селектору от начала строки. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`нет правила «${selector}»`);
  return match[1];
}

/** Значение строки контракта по её заголовку. */
function contract(label) {
  const head = `<b>${label}</b><span data-v="`;
  const at = CANVAS.indexOf(head);
  if (at < 0) throw new Error(`нет строки «${label}»`);
  const from = at + head.length;
  return CANVAS.slice(from, CANVAS.indexOf('"', from));
}

describe('ряд фильтров каталога', () => {
  it('контракт по-прежнему требует одну строку с прокруткой', () => {
    // Тест не закрепляет своё мнение: он читает решение и падает, если
    // дизайнер его отменит, — а не молча охраняет прежнее правило.
    const row = contract('ряд фильтров каталога');
    expect(row).toContain('ОДНА СТРОКА С ГОРИЗОНТАЛЬНОЙ ПРОКРУТКОЙ');
    expect(row).toContain('flex-wrap:nowrap');
  });

  it('ряд не переносится и прокручивается вбок', () => {
    const body = rule('.sb-chips');
    expect(body).toMatch(/flex-wrap:\s*nowrap/);
    expect(body).toMatch(/overflow-x:\s*auto/);
  });

  it('полосы прокрутки не видно ни в одном движке', () => {
    expect(rule('.sb-chips')).toMatch(/scrollbar-width:\s*none/);
    expect(CSS).toContain('.sb-chips::-webkit-scrollbar');
  });

  it('чипы не сжимаются — иначе длинные названия групп схлопнутся', () => {
    expect(rule('.sb-chip')).toMatch(/flex:\s*none/);
  });

  it('цель касания 44 у чипа осталась на месте', () => {
    expect(rule('.sb-chip')).toMatch(/min-height:\s*44px/);
  });
});
