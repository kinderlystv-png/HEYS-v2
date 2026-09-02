// Оболочка шаговых модалок — общая для 34 точек входа StepModal.show.
//
// До 2 сентября на v4 был переведён только чек-ин: `.mc-modal--daily` брал
// кремовую поверхность и подложку из токена, а базовые `.mc-modal` и
// `.mc-backdrop` держали доv4 заливку — холодный градиент `#ffffff → #f8fafc`
// и чёрные 60 %. Расхождение с макетом видно было на карточке продукта, но
// принадлежало не ей: то же самое рисовали приём, регистрация, замеры и
// остальные 28 мастеров.
//
// Тест сторожит саму оболочку, а не экран: экранные тесты этого не ловят —
// каждый из них смотрит на свою зону и не знает, чем залит лист под ней.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const SHELL = fs.readFileSync(
  path.join(WEB, 'styles/modules/500-pwa-and-offline.css'),
  'utf8',
);
const STEPS = fs.readFileSync(path.join(WEB, 'styles/modules/600-steps-and-aps.css'), 'utf8');

function rule(css, selector) {
  const index = css.indexOf(`\n${selector} {`);
  if (index < 0) return null;
  return css.slice(index, css.indexOf('}', index));
}

describe('оболочка шаговых модалок', () => {
  it('лист стоит на кремовой поверхности палитры, а не на белом градиенте', () => {
    const modal = rule(SHELL, '.mc-modal');
    expect(modal, 'правило .mc-modal найдено').toBeTruthy();
    expect(modal).toContain('background: var(--v4-sand-surface-soft');
    // Доv4 заливка: белый с холодным сине-серым концом. Роль объявлена во всех
    // четырёх наборах, поэтому тёмная тема следует за ней сама.
    // Проверяем правило, а не файл: тот же градиент ещё держит `.wn-modal` —
    // другой компонент, и его перевод сюда не входит.
    expect(modal).not.toContain('linear-gradient');
  });

  it('подложка — инвариант продуктовых модалок: 2,5 px размытия и dim из токена', () => {
    const backdrop = rule(SHELL, '.mc-backdrop');
    expect(backdrop).toContain('background: var(--v4-modal-backdrop-dim');
    expect(backdrop).toContain('blur(var(--v4-modal-backdrop-blur');
    // Чёрные 60 % — прежнее значение; оно и было нарушением инварианта.
    expect(backdrop).not.toMatch(/background:\s*rgba\(0, 0, 0, 0\.6\)/);
    expect(rule(SHELL, '[data-theme$="dark"] .mc-backdrop'))
      .toContain('var(--v4-modal-backdrop-dim-dark');
  });

  it('чек-ин не держит своей копии поверхности — она общая', () => {
    const daily = rule(SHELL, '.mc-modal--daily');
    expect(daily, 'правило .mc-modal--daily найдено').toBeTruthy();
    // Своими у него остаются размер, скругление и шрифт, но не тон и не тень:
    // дубль означал бы, что общее правило можно сломать незаметно для чек-ина.
    expect(daily).not.toContain('background:');
    expect(daily).not.toContain('box-shadow:');
    expect(daily).toContain('border-radius: 28px');
  });

  it('вид полосы прогресса один на всех: компактной вилки больше нет', () => {
    expect(STEPS).not.toContain(':not(.mc-progress-dots--pills)');
    const active = rule(SHELL, '.mc-progress-dots--pills .mc-progress-dot.active');
    expect(active).toContain('width: 18px');
    expect(active).toContain('var(--v4-sand-act');
    // Синяя точка прежней системы: базовое правило 600-го модуля ещё живо для
    // мастеров вне шапки, но в шапке его больше никто не получает.
    expect(rule(STEPS, '.mc-progress-dot.active')).toContain('var(--color-blue-500)');
  });
});
