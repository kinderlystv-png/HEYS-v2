import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');

describe('client card modal layering', () => {
  it('renders client action modals above the curator panel overlay', () => {
    const zMatch = source.match(/const CLIENT_ACTION_MODAL_Z = (\d+);/);
    expect(zMatch).not.toBeNull();
    expect(Number(zMatch[1])).toBeGreaterThan(10001);

    const actionModalUses = source.match(/zIndex: CLIENT_ACTION_MODAL_Z/g) || [];
    expect(actionModalUses.length).toBe(3);
    expect(source).not.toMatch(/zIndex: 9999/);
    expect(source).not.toMatch(/zIndex: 10000/);
  });

  it('exposes current Telegram link recovery in the subscription modal', () => {
    expect(source).toContain('handleGetClientAccessLink');
    expect(source).toContain('getClientAccessLink');
    expect(source).toContain('Ссылка для клиента');
    expect(source).toContain('Скопировать ссылку');
    expect(source).toContain('Перевыпустите PIN и ссылку');
    expect(source).toContain('link_available === false');
  });
});
