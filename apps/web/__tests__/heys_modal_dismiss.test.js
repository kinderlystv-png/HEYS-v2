/** @jest-environment jsdom */

describe('heys_modal_dismiss_v1', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.__heysModalDismissGuardInstalled;
    document.body.innerHTML = '';
  });

  function loadModule() {
    require('../heys_modal_dismiss_v1.js');
    return window.HEYS.ModalDismiss;
  }

  it('exports dismiss helpers on HEYS.ModalDismiss', () => {
    const MD = loadModule();
    expect(MD).toBeTruthy();
    expect(typeof MD.dismissFromBackdrop).toBe('function');
    expect(typeof MD.installGhostClickSwallow).toBe('function');
    expect(typeof MD.reactBackdropDismiss).toBe('function');
    expect(MD.GHOST_MS).toBe(500);
  });

  it('recognizes backdrop-like elements', () => {
    const MD = loadModule();
    const el = document.createElement('div');
    el.className = 'ca-modal-backdrop ca-modal-backdrop--visible';
    expect(MD.isBackdropLike(el)).toBe(true);
    expect(MD.isBackdropLike(document.createElement('span'))).toBe(false);
  });

  it('swallows the next click after dismissFromBackdrop', () => {
    const MD = loadModule();
    const underneath = document.createElement('button');
    underneath.type = 'button';
    underneath.textContent = 'under';
    document.body.appendChild(underneath);

    const clickSpy = jest.fn();
    underneath.addEventListener('click', clickSpy);

    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    MD.dismissFromBackdrop(event, () => {});

    underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('installs global guard once', () => {
    loadModule();
    expect(window.__heysModalDismissGuardInstalled).toBe(true);
    loadModule();
    expect(window.__heysModalDismissGuardInstalled).toBe(true);
  });
});
