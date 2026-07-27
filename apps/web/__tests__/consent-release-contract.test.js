import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const hash = (relative) => crypto.createHash('sha256').update(read(relative)).digest('hex');

describe('27 July legal release contract', () => {
  it('verifies every canonical document against the version manifest', () => {
    const manifest = JSON.parse(read('docs/legal/legal-document-manifest.json'));
    for (const item of Object.values(manifest.documents)) {
      expect(read(item.canonicalPath)).toBe(read(item.snapshotPath));
      expect(hash(item.snapshotPath)).toBe(item.sha256);
      expect(read(item.snapshotPath)).toContain(`**Версия:** ${item.version}`);
    }
  });

  it('uses payment_oferta 1.7 consistently in frontend and backend', () => {
    const consentSource = read('apps/web/heys_consents_v1.js');
    const versionsSource = read('apps/web/heys_legal_versions_v1.js');
    const subscriptionsSource = read('apps/web/heys_subscriptions_v1.js');
    const paymentsSource = read('yandex-cloud-functions/heys-api-payments/index.js');

    expect(consentSource).toMatch(/payment_oferta:\s*'1\.7'/);
    expect(versionsSource).toMatch(/payment_oferta:\s*'1\.7'/);
    expect(subscriptionsSource).toContain('VERSIONS?.payment_oferta');
    expect(subscriptionsSource).not.toContain('VERSIONS?.user_agreement');
    expect(paymentsSource).toContain("PAYMENT_OFERTA_VERSION = '1.7'");
    expect(paymentsSource).toMatch(/document_version = \$2/);
    expect(paymentsSource).toMatch(/document_sha256 = \$3/);
    expect(paymentsSource).toContain('accepted_at IS NOT NULL');
  });

  it('keeps current legal markdown byte-identical to each immutable snapshot', () => {
    for (const [current, snapshot] of [
      ['apps/web/public/docs/user-agreement.md', 'apps/web/public/docs/v1.7/user-agreement.md'],
      ['apps/web/public/docs/privacy-policy.md', 'apps/web/public/docs/v1.7/privacy-policy.md'],
      ['apps/web/public/docs/refund.md', 'apps/web/public/docs/v1.1/refund.md'],
      ['apps/web/public/docs/cookie-policy.md', 'apps/web/public/docs/v1.1/cookie-policy.md'],
      [
        'apps/web/public/docs/speech-transcription-consent.md',
        'apps/web/public/docs/v1.1/speech-transcription-consent.md',
      ],
      ['apps/web/public/docs/marketing-consent.md', 'apps/web/public/docs/v1.3/marketing-consent.md'],
    ]) {
      expect(read(current)).toBe(read(snapshot));
    }
  });

  it('preserves hashes of previously published immutable snapshots', () => {
    expect(hash('apps/web/public/docs/v1.6/user-agreement.md')).toBe(
      'dfb02761287ff38f41cd11debae0dd71b861e820420e4512a421bc1f4486a7d9',
    );
    expect(hash('apps/web/public/docs/v1.6/privacy-policy.md')).toBe(
      'dbebecdbb9f89e612c49265f56d9aa99546d88b92305495f9ff9cd21757d271a',
    );
    expect(hash('apps/web/public/docs/v1.5/health-data-consent.md')).toBe(
      'a05365f23b7758deb1d6858d6816e7ee34fd5239c9d1fc84b2786c6027428256',
    );
  });

  it('gates Yandex Metrica behind a versioned explicit decision', () => {
    const layout = read('apps/landing/src/app/layout.tsx');
    const gate = read('apps/landing/src/components/AnalyticsConsentGate.tsx');
    const banner = read('apps/landing/src/components/CookieInfoBanner.tsx');

    expect(layout).not.toContain('next/script');
    expect(layout).not.toContain('<noscript>');
    expect(gate).toContain("consent !== 'granted'");
    expect(gate).toContain('https://mc.yandex.ru/metrika/tag.js');
    expect(gate).toContain('heys_analytics_consent_v1.1');
    expect(banner).toContain('ANALYTICS_CONSENT_KEY');
    expect(banner).toContain("decide('denied')");
    expect(banner).toContain("decide('granted')");
    expect(banner).not.toContain("getItem('heys_cookie_info_seen')");
  });
});
