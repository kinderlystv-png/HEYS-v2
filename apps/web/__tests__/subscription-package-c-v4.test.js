/**
 * Polosa 2 · task 89 · package C smoke — queue copy + banner/toast legacy gaps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS = JSON.parse(
  fs.readFileSync(path.join(WEB_DIR, '../../docs/ui/verdicts/subscription.json'), 'utf8'),
).rows;
const PAYWALL = fs.readFileSync(path.join(WEB_DIR, 'heys_paywall_v1.js'), 'utf8');
const SUBS = fs.readFileSync(path.join(WEB_DIR, 'heys_subscriptions_v1.js'), 'utf8');

const PACKAGE_C_FRAMES = [
  'Подписка · приветствие',
  'Подписка · баннер сверху',
  'Подписка · тост на действии',
  'Подписка · контакт поддержки',
  'Подписка · очередь · заявка подана',
  'Подписка · очередь · место освободилось',
];

function isPackageCKey(key) {
  return PACKAGE_C_FRAMES.some((frame) => key === frame || key.startsWith(`${frame} ·`));
}

describe('subscription package C · verdicts closed', () => {
  it('has no «?» left in package C scope', () => {
    const open = Object.entries(VERDICTS).filter(([key, row]) => isPackageCKey(key) && row.v === '?');
    expect(open.map(([key]) => key)).toEqual([]);
  });

  it('excluded «очередь · отмена заявки» is not package C frame key', () => {
    expect(isPackageCKey('очередь · отмена заявки')).toBe(false);
  });
});

describe('subscription package C · code anchors', () => {
  it('queue queued state copy in TrialQueueSection', () => {
    expect(PAYWALL).toContain('Заявка подана · вы');
    expect(PAYWALL).toContain('Сообщим, когда место освободится');
    expect(PAYWALL).toContain('Отменить заявку');
  });

  it('queue offer state copy in TrialQueueSection', () => {
    expect(PAYWALL).toContain('Место освободилось');
    expect(PAYWALL).toContain('на подтверждение');
  });

  it('banner/toast surfaces still legacy vs canvas', () => {
    expect(PAYWALL).toContain('.readonly-toast');
    expect(PAYWALL).toContain('Пробный период закончился');
    expect(SUBS).toContain('WelcomeFirstLogin');
    expect(SUBS).toContain('ContactCuratorScreen');
  });
});
