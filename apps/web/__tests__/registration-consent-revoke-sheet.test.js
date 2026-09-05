// Смоук: отзыв supplements_tracking — bottom sheet с цифрами из данных, без window.confirm.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

function seedStore(data) {
  Object.entries(data).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  window.HEYS.utils = {
    lsGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    lsSet(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    toNum: (x) => Number(x) || 0,
    round1: (v) => Math.round(v * 10) / 10,
    getEmojiStyle: () => 'system',
    setEmojiStyle: () => {},
  };
  window.HEYS.LegalVersions = { labels: { supplements_tracking: 'Отметки о добавках' } };
  loadScript('heys_supplements_v1.js');
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
  localStorage.clear();
});

afterEach(() => {
  act(() => { roots.forEach(({ root }) => root.unmount()); });
  roots.forEach(({ host }) => host.remove());
  roots = [];
});

describe('registration · отзыв согласия на добавки', () => {
  const consentRow = {
    id: 'c1',
    type: 'supplements_tracking',
    version: '1.0',
    granted: true,
    created_at: '2026-08-01T10:00:00.000Z',
    signature_method: 'pin',
  };

  function mountConsentsCard(apiOverrides) {
    const revokeConsentBySession = vi.fn(async () => ({ success: true }));
    window.HEYS.Consents = {
      TEXTS: { checkboxes: { supplements_tracking: { label: 'Добавки' } } },
      api: {
        getMyConsents: vi.fn(async () => ({ success: true, consents: [consentRow] })),
        revokeConsentBySession,
        downloadConsentProofAsFile: vi.fn(async () => ({ success: true })),
        downloadMyDataAsFile: vi.fn(async () => ({ success: true })),
        requestRestriction: vi.fn(async () => ({ success: true })),
        revokeCuratorAccess: vi.fn(async () => ({ success: true })),
        ...(apiOverrides || {}),
      },
    };
    window.HEYS.healthFeatures = {
      purgeLocalDays: vi.fn(),
      purgeSupplementsFromProfile: (profile) => ({
        ...profile,
        supplementsTrackingEnabled: false,
        plannedSupplements: [],
        supplementHistory: {},
      }),
      FEATURE_TOGGLES: {
        supplementsTrackingEnabled: { purgeDay: vi.fn((day) => day) },
      },
    };
    const Card = window.HEYS.UserTabImpl.MyConsentsAndDataCard;
    return { host: renderNode(React.createElement(Card)), revokeConsentBySession };
  }

  it('getRevokeImpactStats: считает отметки и дни из heys_dayv2_*', () => {
    seedStore({
      heys_profile: {
        supplementHistory: {
          vitD: { startDate: '2026-07-15', days: 2, totalTaken: 3 },
        },
        plannedSupplements: ['vitD'],
      },
      'heys_dayv2_2026-08-01': { supplementsTaken: ['vitD', 'omega3'] },
      'heys_dayv2_2026-08-02': { supplementsTaken: ['vitD'] },
    });
    const stats = window.HEYS.Supplements.getRevokeImpactStats();
    expect(stats.marksCount).toBe(3);
    expect(stats.daysWithMarks).toBe(2);
    expect(stats.marksLine).toContain('3');
    expect(stats.marksLine).toContain('2');
    expect(stats.courseLine).toMatch(/Курс на \d+ месяц/);
    expect(stats.hasData).toBe(true);
  });

  it('подтверждение: лист с цифрами, revoke без window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    seedStore({
      heys_profile: {
        supplementHistory: { vitD: { startDate: '2026-07-01', days: 21, totalTaken: 64 } },
        plannedSupplements: ['vitD', 'omega3', 'magnesium'],
        supplementsTrackingEnabled: true,
      },
      'heys_dayv2_2026-08-01': { supplementsTaken: Array(32).fill('vitD') },
      'heys_dayv2_2026-08-02': { supplementsTaken: Array(32).fill('vitD') },
    });

    const { host, revokeConsentBySession } = mountConsentsCard();
    await flush();

    click(findButtonByText(host, 'Отозвать'));
    await flush();

    const sheet = host.querySelector('.heys-supp-revoke-sheet');
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('Отозвать согласие на добавки?');
    expect(sheet.textContent).toMatch(/отметк/);
    expect(sheet.textContent).toMatch(/день|дня|дней/);

    click(findButtonByText(host, 'Отозвать и удалить'));
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(revokeConsentBySession).toHaveBeenCalledWith('supplements_tracking');
    expect(host.textContent).toContain('Согласие на добавки отозвано');
    expect(host.querySelector('.heys-supp-revoke-sheet')).toBeFalsy();
  });

  it('отмена: закрывает лист, revoke не вызывается', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    seedStore({
      heys_profile: {
        supplementHistory: { vitD: { startDate: '2026-07-01', totalTaken: 5 } },
        plannedSupplements: ['vitD'],
        supplementsTrackingEnabled: true,
      },
      'heys_dayv2_2026-08-03': { supplementsTaken: ['vitD'] },
    });

    const { host, revokeConsentBySession } = mountConsentsCard();
    await flush();

    click(findButtonByText(host, 'Отозвать'));
    await flush();
    expect(host.querySelector('.heys-supp-revoke-sheet')).toBeTruthy();

    click(findButtonByText(host, 'Оставить как есть'));
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(revokeConsentBySession).not.toHaveBeenCalled();
    expect(host.querySelector('.heys-supp-revoke-sheet')).toBeFalsy();
    expect(host.textContent).not.toContain('Согласие на добавки отозвано');
    expect(window.HEYS.utils.lsGet('heys_profile', {}).plannedSupplements).toEqual(['vitD']);
  });
});
