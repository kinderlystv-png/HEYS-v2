import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function css(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function zIndexFor(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = source.match(new RegExp(escaped + '[^{]*\\{[^}]*z-index:\\s*([0-9]+)', 'm'));
  return m ? Number(m[1]) : null;
}

describe('training fullscreen modal layering', () => {
  it('global ConfirmModal stays above training fullscreen overlays', () => {
    const baseCss = css('styles/modules/000-base-and-gamification.css');
    const fingersCss = css('styles/modules/fingers.css');
    const confirmZ = zIndexFor(baseCss, '.confirm-modal-backdrop');
    const fingersZ = zIndexFor(fingersCss, '.fingers-fs');

    expect(confirmZ).toBeGreaterThan(fingersZ);
  });
});
