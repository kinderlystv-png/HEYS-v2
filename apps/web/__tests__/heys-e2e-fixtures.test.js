import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const fixturesSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_e2e_fixtures_v1.js'),
  'utf8',
);

function loadFixtures() {
  // eslint-disable-next-line no-eval
  (0, eval)(fixturesSource);
  return window.HEYS.E2EFixtures;
}

describe('heys_e2e_fixtures_v1', () => {
  beforeEach(() => {
    window.HEYS = {};
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    delete window.HEYS;
  });

  it('recognizes canonical E2E client ids and E2E- name prefix', () => {
    const fx = loadFixtures();
    expect(fx.isE2EFixtureClient({ id: '11111111-1111-1111-1111-111111111111', name: 'E2E-TestAlex' })).toBe(true);
    expect(fx.isE2EFixtureClient({ id: '22222222-2222-2222-2222-222222222222', name: 'E2E-TestPopl' })).toBe(true);
    expect(fx.isE2EFixtureClient({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'E2E-Future' })).toBe(true);
    expect(fx.isE2EFixtureClient({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Real Client' })).toBe(false);
  });

  it('recognizes smoke dev fixture ids and name patterns', () => {
    const fx = loadFixtures();
    expect(fx.isDevFixtureClient({
      id: '7397a9db-03bb-45ce-a202-74b3aea2836e',
      name: 'HEYS production smoke 165216038',
    })).toBe(true);
    expect(fx.isDevFixtureClient({
      id: '5d067903-da72-407a-bc36-bfd57e3eb60f',
      name: 'Login Smoke Test',
    })).toBe(true);
    expect(fx.isDevFixtureClient({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'login-smoke-deploy',
    })).toBe(true);
    expect(fx.isDevFixtureClient({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Purge Warn Smoke Client',
    })).toBe(true);
    expect(fx.isDevFixtureClient({
      id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc',
      name: 'Александра',
    })).toBe(false);
  });

  it('filterCuratorPanelClients hides fixtures unless heys_show_e2e_clients=1', () => {
    const fx = loadFixtures();
    const clients = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'E2E-TestAlex' },
      { id: '7397a9db-03bb-45ce-a202-74b3aea2836e', name: 'HEYS production smoke 165216038' },
      { id: '5d067903-da72-407a-bc36-bfd57e3eb60f', name: 'Login Smoke Test' },
      { id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Александра' },
      { id: '33333333-3333-3333-3333-333333333333', name: 'Иван' },
    ];

    expect(fx.filterCuratorPanelClients(clients).map((c) => c.name)).toEqual(['Александра', 'Иван']);

    localStorage.setItem('heys_show_e2e_clients', '1');
    expect(fx.filterCuratorPanelClients(clients).map((c) => c.name)).toEqual([
      'E2E-TestAlex',
      'HEYS production smoke 165216038',
      'Login Smoke Test',
      'Александра',
      'Иван',
    ]);
  });
});
