import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const IMPL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  window.HEYS.utils = {
    lsGet: () => ({}),
    lsSet: () => {},
    toNum: (x) => Number(x) || 0,
    round1: (v) => Math.round(v * 10) / 10,
    getEmojiStyle: () => 'system',
    setEmojiStyle: () => {},
  };
  loadScript('heys_user_tab_impl_v1.js');
});

let roots = [];

function renderNode(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  roots.push({ root, host });
  return host;
}

function click(el) {
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function findButtonByText(host, text) {
  return Array.from(host.querySelectorAll('button')).find((el) => (el.textContent || '').includes(text));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  act(() => { roots.forEach(({ root }) => root.unmount()); });
  roots.forEach(({ host }) => host.remove());
  roots = [];
});

describe('отзыв health_data / personal_data — лист, не window.confirm', () => {
  it('исходник не вызывает window.confirm для health_data и personal_data', () => {
    expect(IMPL_SRC).toContain('ConsentRevokeSheet');
    expect(IMPL_SRC).toContain("consentType === 'health_data' || consentType === 'personal_data'");
    expect(IMPL_SRC).toContain("setPrivacyRevokeType('health_data')");
    expect(IMPL_SRC).toContain("setPrivacyRevokeType('personal_data')");
    expect(IMPL_SRC).not.toMatch(
      /consentType === 'health_data'[\s\S]{0,400}window\.confirm/
    );
    expect(IMPL_SRC).not.toMatch(
      /consentType === 'personal_data'[\s\S]{0,400}window\.confirm/
    );
    expect(IMPL_SRC).not.toMatch(/handleRevokeHealth[\s\S]{0,200}window\.confirm/);
    expect(IMPL_SRC).not.toMatch(/handleRevokePersonal[\s\S]{0,200}window\.confirm/);
  });

  it('MyConsentsAndDataCard: health_data открывает лист и отзывает без confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const revokeHealth = vi.fn(async () => ({ success: true, deleted_keys: 2 }));
    window.HEYS.Consents = {
      TEXTS: { checkboxes: { health_data: { label: 'Здоровье' } } },
      api: {
        getMyConsents: vi.fn(async () => ({
          success: true,
          consents: [{
            id: 'h1',
            type: 'health_data',
            version: '1.0',
            granted: true,
            created_at: '2026-08-01T10:00:00.000Z',
            signature_method: 'pin',
          }],
        })),
        revokeHealthDataAndPurge: revokeHealth,
        downloadConsentProofAsFile: vi.fn(async () => ({ success: true })),
        downloadMyDataAsFile: vi.fn(async () => ({ success: true })),
        requestRestriction: vi.fn(async () => ({ success: true })),
        revokeCuratorAccess: vi.fn(async () => ({ success: true })),
      },
    };
    const Card = window.HEYS.UserTabImpl.MyConsentsAndDataCard;
    const host = renderNode(React.createElement(Card));
    await flush();

    click(findButtonByText(host, 'Отозвать'));
    await flush();

    expect(host.querySelector('.heys-supp-revoke-sheet')).toBeTruthy();
    expect(host.textContent).toContain('данные о здоровье');
    expect(host.textContent).toContain('Дневник питания, переписка и фото удаляются отдельно');
    expect(host.textContent).not.toMatch(/дневник питания, вес, активность/i);
    click(findButtonByText(host, 'Отозвать согласие'));
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(revokeHealth).toHaveBeenCalled();
  });
});
