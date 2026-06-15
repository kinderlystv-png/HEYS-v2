#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

const FILES = {
  monthlyAudit: 'docs/legal/operator/heys-pdn-monthly-audit.md',
  dataRegister: 'docs/legal/operator/heys-data-register.md',
  rknHeys: 'docs/legal/operator/rkn-notification-heys.md',
  governance: 'маркетинг/32_ПДн_governance_релизный_контур.md',
  plan22: 'маркетинг/22_План_реализации_маркетинга.md',
  decisionLog15: 'маркетинг/15_Ревизия_и_лог_решений.md',
  landingLegalVersions: 'apps/landing/src/config/legal-versions.ts',
  webConsents: 'apps/web/heys_consents_v1.js',
  webLegalVersions: 'apps/web/heys_legal_versions_v1.js',
  landingLayout: 'apps/landing/src/app/layout.tsx',
  privacyPolicy: 'apps/web/public/docs/privacy-policy.md',
  healthConsent: 'apps/web/public/docs/health-data-consent.md',
  userAgreement: 'apps/web/public/docs/user-agreement.md',
  userAgreementV16: 'apps/web/public/docs/v1.6/user-agreement.md',
  privacyV15: 'apps/web/public/docs/v1.5/privacy-policy.md',
  healthV13: 'apps/web/public/docs/v1.3/health-data-consent.md',
  marketingPrivacyGuard: 'scripts/lint-marketing-privacy-metadata.mjs',
  paymentsGatewayGuard: 'scripts/prepare-payments-gateway.mjs',
  packageJson: 'package.json',
};

const checks = [];
const pending = [];

function abs(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function ok(label, detail = '') {
  checks.push({ status: 'OK', label, detail });
}

function fail(label, detail = '') {
  checks.push({ status: 'FAIL', label, detail });
}

function notePending(label, detail = '') {
  pending.push({ label, detail });
}

function requireFile(key) {
  const rel = FILES[key];
  if (exists(rel)) {
    ok(`file exists: ${rel}`);
    return true;
  }
  fail(`missing file: ${rel}`);
  return false;
}

function requireIncludes(rel, needles, label) {
  const text = read(rel);
  for (const needle of needles) {
    if (!text.includes(needle)) {
      fail(label, `missing "${needle}" in ${rel}`);
      return;
    }
  }
  ok(label);
}

function extractObjectVersion(source, objectName, key) {
  const objectStart = source.indexOf(objectName);
  if (objectStart === -1) throw new Error(`missing object ${objectName}`);
  const keyRe = new RegExp(`${key}\\s*:\\s*\\{[\\s\\S]*?version\\s*:\\s*'([^']+)'`);
  const match = keyRe.exec(source.slice(objectStart));
  if (!match) throw new Error(`missing ${objectName}.${key}.version`);
  return match[1];
}

function extractPlainVersion(source, key) {
  const re = new RegExp(`${key}\\s*:\\s*'([^']+)'`);
  const match = re.exec(source);
  if (!match) throw new Error(`missing ${key}`);
  return match[1];
}

function checkFiles() {
  for (const key of Object.keys(FILES)) requireFile(key);
}

function checkMonthlyChecklist() {
  requireIncludes(
    FILES.monthlyAudit,
    ['Код/БД', 'Логи', 'Лендинг', 'Согласия', 'РКН', 'Кураторы', 'Интеграции', 'Gaps'],
    'monthly audit checklist covers required layers',
  );
  requireIncludes(
    FILES.governance,
    ['Продукт', 'БД/логи', 'Лендинг', 'Документы', 'РКН', 'Кураторы/операции'],
    'governance doc defines monthly audit layers',
  );
}

function checkDataRegister() {
  requireIncludes(
    FILES.dataRegister,
    [
      'client_id',
      'leads',
      'funnel_events',
      'ym_client_id',
      'heys_profile',
      'heys_dayv2_*',
      'heys_hr_zones',
      'consents',
      'payments',
      'health_data',
    ],
    'data register covers current code/database anchors',
  );
}

function checkRknDraft() {
  requireIncludes(
    FILES.rknHeys,
    ['26-22-005319', 'updateform', 'данные о состоянии здоровья', 'Yandex Cloud', 'Трансграничная передача персональных данных не осуществляется'],
    'RKN draft matches HEYS data model anchors',
  );
  notePending(
    'RKN submitted-record comparison',
    'requires фактическая подача/номер/ключ/PDF вне репо; preflight does not mark 1.9.6 complete',
  );
}

function checkLegalVersions() {
  const landing = read(FILES.landingLegalVersions);
  const consents = read(FILES.webConsents);
  const webLegal = read(FILES.webLegalVersions);

  const expected = {
    user_agreement: extractObjectVersion(landing, 'LEGAL_DOCS', 'userAgreement'),
    personal_data: extractObjectVersion(landing, 'LEGAL_DOCS', 'privacyPolicy'),
    health_data: extractObjectVersion(landing, 'LEGAL_DOCS', 'healthDataConsent'),
  };

  const actualConsents = {
    user_agreement: extractPlainVersion(consents, 'user_agreement'),
    personal_data: extractPlainVersion(consents, 'personal_data'),
    health_data: extractPlainVersion(consents, 'health_data'),
    payment_oferta: extractPlainVersion(consents, 'payment_oferta'),
  };
  const actualWebLegal = {
    user_agreement: extractPlainVersion(webLegal, 'user_agreement'),
    personal_data: extractPlainVersion(webLegal, 'personal_data'),
    health_data: extractPlainVersion(webLegal, 'health_data'),
    payment_oferta: extractPlainVersion(webLegal, 'payment_oferta'),
  };

  for (const [key, version] of Object.entries(expected)) {
    if (actualConsents[key] !== version || actualWebLegal[key] !== version) {
      fail(
        `legal version sync: ${key}`,
        `landing=${version}, consents=${actualConsents[key]}, webLegal=${actualWebLegal[key]}`,
      );
    } else {
      ok(`legal version sync: ${key}`, version);
    }
  }

  if (actualConsents.payment_oferta !== actualWebLegal.payment_oferta) {
    fail(
      'legal version sync: payment_oferta',
      `consents=${actualConsents.payment_oferta}, webLegal=${actualWebLegal.payment_oferta}`,
    );
  } else {
    ok('legal version sync: payment_oferta', actualConsents.payment_oferta);
  }
}

function checkMarketingPrivacyGuards() {
  const pkg = JSON.parse(read(FILES.packageJson));
  if (pkg.scripts?.['privacy:marketing'] === 'node scripts/lint-marketing-privacy-metadata.mjs') {
    ok('package script privacy:marketing is wired');
  } else {
    fail('package script privacy:marketing is wired');
  }
  if (pkg.scripts?.['payments:gateway'] === 'node scripts/prepare-payments-gateway.mjs') {
    ok('package script payments:gateway is wired');
  } else {
    fail('package script payments:gateway is wired');
  }
}

function checkAnalyticsBoundary() {
  const layout = read(FILES.landingLayout);
  if (/gtag\s*\(|fbq\s*\(/.test(layout)) {
    fail('landing analytics boundary', 'GA4/Meta runtime call found in layout');
  } else {
    ok('landing analytics boundary', 'no gtag/fbq runtime call in landing layout');
  }
  requireIncludes(
    FILES.landingLayout,
    ['GA4 / Meta Pixel НЕ загружаются', 'NEXT_PUBLIC_YM_ID'],
    'landing analytics comments/Yandex Metrica gate are explicit',
  );
}

function checkPlanAndDecisionLog() {
  requireIncludes(
    FILES.plan22,
    ['1.9.6', 'heys-pdn-monthly-audit.md', 'РКН-подачи'],
    'marketing plan keeps 1.9.6 external blocker visible',
  );
  requireIncludes(
    FILES.decisionLog15,
    ['ПДн/RKN governance', 'ежемесячная сверка'],
    'decision log has Pdn/RKN governance entry',
  );
}

function printResult() {
  for (const item of checks) {
    const suffix = item.detail ? ` — ${item.detail}` : '';
    const icon = item.status === 'OK' ? 'OK' : 'FAIL';
    console.log(`${icon}: ${item.label}${suffix}`);
  }
  for (const item of pending) {
    console.log(`PENDING: ${item.label} — ${item.detail}`);
  }

  const failures = checks.filter((item) => item.status === 'FAIL');
  if (failures.length > 0) {
    console.error(`pdn monthly audit preflight failed: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`pdn monthly audit preflight OK (${checks.length} checks, ${pending.length} pending external item)`);
}

try {
  checkFiles();
  checkMonthlyChecklist();
  checkDataRegister();
  checkRknDraft();
  checkLegalVersions();
  checkMarketingPrivacyGuards();
  checkAnalyticsBoundary();
  checkPlanAndDecisionLog();
  printResult();
} catch (err) {
  console.error(`pdn monthly audit preflight failed: ${err.message}`);
  process.exit(1);
}
