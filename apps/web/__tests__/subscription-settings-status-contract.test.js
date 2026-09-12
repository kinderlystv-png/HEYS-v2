import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const sources = [
  'heys_user_tab_impl_v1.js',
  'heys_user_v12.js',
].map((name) => ({
  name,
  source: fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8'),
}));

// Решение владельца 12 сентября: строка «Подписка» открывает свой экран, а её
// подпись считает лист настроек в heys_app_shell_v1.js. В профиле осталась
// только формат-функция даты окончания — её и сверяем на дубли.
function normalizedEndHeadline(source) {
  const start = source.indexOf('function formatSubscriptionEndHeadline');
  const subtitle = source.indexOf('function getSubscriptionSettingsSubtitle', start);
  const end = subtitle > start
    ? subtitle
    : source.indexOf('// === SubscriptionStatusSection', start);
  if (start < 0 || end < 0) return '';
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function loadEndHeadline(source) {
  const start = source.indexOf('function formatSubscriptionEndHeadline');
  const end = source.indexOf('// === SubscriptionStatusSection', start);
  const helperSource = source.slice(start, end);
  return Function(`${helperSource}; return formatSubscriptionEndHeadline;`)();
}

// Подпись строки в листе настроек осталась в запасной реализации профиля:
// heys_user_v12.js рисует вкладку, когда HEYS.UserTabImpl не загрузился.
function loadSettingsSubtitle(source) {
  const start = source.indexOf('function getSubscriptionSettingsSubtitle');
  const end = source.indexOf('// === SubscriptionStatusSection', start);
  const helperSource = source.slice(start, end);
  return Function(`${helperSource}; return getSubscriptionSettingsSubtitle;`)();
}

describe('subscription settings status contract', () => {
  it('keeps the duplicated end-date formatting in sync', () => {
    expect(normalizedEndHeadline(sources[0].source)).toBe(normalizedEndHeadline(sources[1].source));
  });

  it('the settings row meta is computed by the settings sheet and follows the status', () => {
    const shell = fs.readFileSync(path.resolve(__dirname, '..', 'heys_app_shell_v1.js'), 'utf8');
    expect(shell).toContain('window.HEYS?.Subscriptions?.getSettingsRowMeta?.(details)');
    // Подпись молчала, когда статус приезжал позже отрисовки: держим её
    // состоянием и пересчитываем по тому же событию, что и остальные.
    expect(shell).toContain("window.addEventListener('heys:subscription-changed', sync)");
  });

  it('the fallback profile still labels the row by the end date', () => {
    const getSubscriptionSettingsSubtitle = loadSettingsSubtitle(sources[1].source);
    const subscription = {
      getCachedDetails: () => ({ status: 'trial', trial_ends_at: '2026-09-10' }),
      getStatusMeta: () => ({ label: 'Пробный период', shortLabel: 'Триал' }),
    };
    const getSettingsRowMeta = (details) => {
      const d = new Date(details.trial_ends_at);
      const short = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
      return `Триал · до ${short}`;
    };
    const prev = globalThis.HEYS;
    globalThis.HEYS = { Subscriptions: { getSettingsRowMeta } };
    expect(getSubscriptionSettingsSubtitle(subscription)).toBe('Триал · до 10 сент');
    globalThis.HEYS = prev;
  });

  it.each(sources)('$name reads the status from the subscription module', ({ source }) => {
    expect(source).toContain('window.HEYS.Subscription.getStatusDetails(true)');
  });

  it.each(sources)('$name shows the end date, not a countdown', ({ source }) => {
    const formatSubscriptionEndHeadline = loadEndHeadline(source);
    expect(source).toContain("(status === 'read_only' || status === 'none')");
    expect(formatSubscriptionEndHeadline({ status: 'trial', trial_ends_at: '2026-09-10' })).toBe('до 10 сент');
    expect(formatSubscriptionEndHeadline({ status: 'active', subscription_ends_at: '2026-12-31' })).toMatch(/^до /);
    expect(source).not.toContain('дней осталось');
  });
});

// Канвас subscription, строка «точки входа»: строка «Подписка» в настройках
// ведёт на ЭКРАН подписки (.sub-screen), а не на легаси-карточку профиля.
// Смоук гоняет обе ветки выбора без живой сессии.
describe('subscription settings entry mounts the v4 screen', () => {
  const IMPL = sources[0].source;

  function loadScreenSection() {
    const start = IMPL.indexOf('function SubscriptionScreenSection()');
    const end = IMPL.indexOf('function profileSvg(', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const factory = Function(
      'React',
      'window',
      'SubscriptionStatusSection',
      `${IMPL.slice(start, end)}; return SubscriptionScreenSection;`,
    );
    const React = { createElement: (type, props) => ({ type, props }) };
    return { factory, React };
  }

  it('renders HEYS.Subscriptions.SubscriptionSection with the current client id', () => {
    const { factory, React } = loadScreenSection();
    const SubscriptionSection = function SubscriptionSection() {};
    const legacy = function SubscriptionStatusSection() {};
    const win = { HEYS: { Subscriptions: { SubscriptionSection }, currentClientId: 'client-42' } };
    const element = factory(React, win, legacy)();
    expect(element.type).toBe(SubscriptionSection);
    expect(element.props).toEqual({ clientId: 'client-42' });
  });

  it('falls back to the legacy card when the subscriptions module is absent', () => {
    const { factory, React } = loadScreenSection();
    const legacy = function SubscriptionStatusSection() {};
    const element = factory(React, { HEYS: {} }, legacy)();
    expect(element.type).toBe(legacy);
  });

  it('the subscription screen renders the wrapper, not the legacy card directly', () => {
    const body = IMPL.slice(IMPL.indexOf('function SettingsSectionScreenBody'));
    const branch = body.slice(body.indexOf("if (id === 'subscription')"), body.indexOf("if (id === 'system')"));
    expect(branch).toContain('React.createElement(SubscriptionScreenSection)');
    expect(branch).not.toContain('React.createElement(SubscriptionStatusSection)');
  });
});
