export const CURRENT_VERSIONS = Object.freeze({
  user_agreement: '1.11',
  personal_data: '1.0',
});

const APP_ORIGIN = 'https://app.example.test';
const LANDING_ORIGIN = 'https://landing.example.test';
const BOOT_FILE = 'boot-core.bundle.aaaaaaaaaaaa.js';

function page(version) {
  return `<html><body><article><p>Версия: ${version} · Дата вступления в силу</p></article></body></html>`;
}

function healthWithdrawalPage() {
  return '<html><body><p>Документ изъят из обязательного набора. Снимок версии 1.5 в архиве.</p></body></html>';
}

export function createLegalDriftFixture({
  bundleVersions = CURRENT_VERSIONS,
  registryVersions = CURRENT_VERSIONS,
  unavailablePath = null,
} = {}) {
  const routes = new Map([
    [`${APP_ORIGIN}/build-meta.json`, JSON.stringify({ version: 'test.aaaaaaaa', hash: 'aaaaaaaa' })],
    [`${APP_ORIGIN}/`, `<script src="${BOOT_FILE}"></script>`],
    [
      `${APP_ORIGIN}/${BOOT_FILE}`,
      `const versions={user_agreement:"${bundleVersions.user_agreement}",personal_data:"${bundleVersions.personal_data}"};`,
    ],
    [`${LANDING_ORIGIN}/legal/user-agreement/`, page(registryVersions.user_agreement)],
    [`${LANDING_ORIGIN}/legal/personal-data-consent/`, page(registryVersions.personal_data)],
    [`${LANDING_ORIGIN}/legal/health-data-consent/`, healthWithdrawalPage()],
  ]);

  return {
    appBaseUrl: APP_ORIGIN,
    landingBaseUrl: LANDING_ORIGIN,
    registryProvider: async () => ({ ...registryVersions }),
    migrationCheck: async () => {},
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      const key = `${url.origin}${url.pathname}`;
      if (unavailablePath && url.pathname === unavailablePath) {
        return new Response('', { status: 503 });
      }
      if (!routes.has(key)) return new Response('', { status: 404 });
      return new Response(routes.get(key), { status: 200 });
    },
  };
}
