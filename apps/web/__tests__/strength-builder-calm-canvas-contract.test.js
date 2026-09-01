// strength-builder-calm-canvas-contract.test.js — спокойный активный список А1б.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');

function lastRule(selector) {
  const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}', 'g');
  return Array.from(CSS.matchAll(pattern)).at(-1)?.[1] || '';
}

describe('strength builder: спокойные состояния активного списка', () => {
  it('оставляет зелёный сигнал галочке, а не карточке и полям', () => {
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).not.toContain('--sb-okbg');
    expect(lastRule('.sb-ex.is-complete')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ex.is-complete')).not.toContain('--sb-okbg');
    expect(lastRule('.sb-ap-check.is-done')).toContain('background: var(--v4-ok-text');
  });

  it('выделяет открытое упражнение спокойно, а ввод — рамкой полей', () => {
    expect(lastRule('.sb-ex.is-open')).toContain('box-shadow: inset 0 0 0 1px var(--sb-br)');
    expect(lastRule('.sb-ap.is-current .sb-ap-field')).toContain('box-shadow: inset 0 0 0 1px var(--sb-acc)');
    expect(lastRule('.sb-ap.is-current .sb-ap-num')).not.toContain('background: var(--sb-acc)');
  });

  it('держит преждевременное завершение вторичным действием', () => {
    expect(lastRule('.sb-finish')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-finish')).toContain('border: 1px solid var(--sb-br)');
    expect(lastRule('.sb-finish')).not.toContain('linear-gradient');
  });

  it('держит отдых доком над панелью, а не полноэкранной подложкой', () => {
    const rest = lastRule('.sb-rest');
    expect(rest).toContain('bottom: calc(82px + env(safe-area-inset-bottom, 0px))');
    expect(rest).not.toContain('inset: 0');
    expect(rest).not.toContain('background: var(--sb-bg)');
    expect(lastRule('.sb-rest-ring')).toContain('width: 168px');
  });
});
