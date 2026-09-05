/**
 * Task 89 · messenger thread padding 6/14/0, gap 8 per messenger.v4.dc.html contract.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSENGER_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
  'utf8',
);

let injectedStyle;

function injectMessengerCss() {
  injectedStyle = document.createElement('style');
  injectedStyle.textContent = MESSENGER_CSS;
  document.head.appendChild(injectedStyle);
}

function threadRule() {
  const block = MESSENGER_CSS.match(/\.messenger-thread\s*\{([^}]*)\}/)?.[1] || '';
  const padding = block.match(/padding:\s*([^;]+)/)?.[1]?.trim();
  const gap = block.match(/gap:\s*([^;]+)/)?.[1]?.trim();
  return { padding, gap };
}

function mountThread() {
  const host = document.createElement('div');
  host.innerHTML = '<div class="messenger-thread"><div class="msg-row">a</div></div>';
  document.body.appendChild(host);
  return host.querySelector('.messenger-thread');
}

describe('messenger thread padding contract', () => {
  let thread;

  afterEach(() => {
    thread?.parentElement?.remove();
    injectedStyle?.remove();
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-palette');
  });

  it('source rule is 6px 14px 0 padding and 8px gap', () => {
    expect(threadRule()).toEqual({ padding: '6px 14px 0', gap: '8px' });
  });

  for (const themeId of ['sand', 'blue']) {
    it(`${themeId}: computed thread padding and gap match canvas`, () => {
      injectMessengerCss();
      document.documentElement.setAttribute('data-theme-id', themeId);
      document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
      thread = mountThread();
      const style = getComputedStyle(thread);
      expect(style.paddingTop).toBe('6px');
      expect(style.paddingRight).toBe('14px');
      expect(style.paddingBottom).toBe('0px');
      expect(style.paddingLeft).toBe('14px');
      expect(style.gap).toBe('8px');
    });
  }
});
