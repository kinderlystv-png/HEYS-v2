// Смоук строки «аппаратная кнопка назад · правило продукта»
// (home-widgets.v4.dc.html): «на Android аппаратная кнопка и жест назад
// закрывают верхний слой, а не выходят из приложения: сначала раскрытая
// карточка или лист, потом режим правки, потом модалка».
//
// Руками не проверить: на десктопе аппаратной кнопки нет, а на телефоне ошибка
// выглядит как «приложение свернулось» — её принимают за поведение системы, а
// не за дефект. Поэтому проверяем механизм: слой кладёт запись в историю и
// снимает её при закрытии другим путём.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function load(rel) {
  const code = fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'globalThis', code)(window, document, window);
}

describe('аппаратная кнопка назад · правило продукта', () => {
  beforeEach(() => {
    window.HEYS = {};
    load('heys_modal_dismiss_v1.js');
  });

  it('помощник слоя объявлен один на всех', () => {
    expect(typeof window.HEYS.ModalDismiss.pushHistoryLayer).toBe('function');
  });

  it('открытый слой кладёт свою запись в историю', () => {
    const push = vi.spyOn(window.history, 'pushState');
    window.HEYS.ModalDismiss.pushHistoryLayer('heysTestLayer', () => {});
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual({ heysTestLayer: true });
    push.mockRestore();
  });

  it('«назад» закрывает слой, а не выходит из приложения', () => {
    const onBack = vi.fn();
    window.HEYS.ModalDismiss.pushHistoryLayer('heysTestLayer', onBack);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('закрытие другим путём снимает запись — «назад» не глотает лишний шаг', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'state', {
      value: { heysTestLayer: true },
      configurable: true,
    });
    const release = window.HEYS.ModalDismiss.pushHistoryLayer('heysTestLayer', () => {});
    release();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('чужую запись не снимает', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'state', {
      value: { heysOtherLayer: true },
      configurable: true,
    });
    const release = window.HEYS.ModalDismiss.pushHistoryLayer('heysTestLayer', () => {});
    release();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('после снятия «назад» слой уже не закрывает', () => {
    const onBack = vi.fn();
    const release = window.HEYS.ModalDismiss.pushHistoryLayer('heysTestLayer', onBack);
    release();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onBack).not.toHaveBeenCalled();
  });

  it('три слоя Главной идут через общий помощник, а не своими копиями', () => {
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const variants = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
    // Быстрые действия, режим расстановки, лист смены вида.
    expect(ui).toMatch(/pushHistoryLayer\?\.\(\s*\n\s*'heysQuickActions'/);
    expect(ui).toMatch(/pushHistoryLayer\?\.\(\s*\n\s*'heysWidgetsEditMode'/);
    expect(variants).toMatch(/pushHistoryLayer\?\.\(\s*\n\s*'heysWidgetVariantSheet'/);
    // Своих addEventListener('popstate') у слоёв Главной больше нет: приём был
    // выписан вручную трижды и разъехался бы на четвёртом.
    expect(ui).not.toContain("addEventListener('popstate'");
    expect(variants).not.toContain("addEventListener('popstate'");
  });

  it('выход из режима расстановки по «назад» откатывает незавершённую перестановку', () => {
    const ui = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
    const at = ui.indexOf("'heysWidgetsEditMode'");
    expect(at).toBeGreaterThan(-1);
    expect(ui.slice(at, at + 200)).toContain('exitEditMode?.({ revert: true })');
  });
});
