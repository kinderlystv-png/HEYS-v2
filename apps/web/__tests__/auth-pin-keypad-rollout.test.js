import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '..');
const keypadSource = fs.readFileSync(path.join(webRoot, 'heys_auth_pin_keypad_v1.js'), 'utf8');
const consentsSource = fs.readFileSync(path.join(webRoot, 'heys_consents_v1.js'), 'utf8');
const userTabSource = fs.readFileSync(path.join(webRoot, 'heys_user_tab_impl_v1.js'), 'utf8');
const gateFlowSource = fs.readFileSync(path.join(webRoot, 'heys_app_gate_flow_v1.js'), 'utf8');
const loginSource = fs.readFileSync(path.join(webRoot, 'heys_login_screen_v1.js'), 'utf8');
const accessSetupSource = fs.readFileSync(path.join(webRoot, 'heys_client_access_code_setup_v1.js'), 'utf8');
const bundleConfig = fs.readFileSync(path.resolve(webRoot, '../../scripts/legacy-bundle-config.mjs'), 'utf8');

describe('auth pin keypad rollout', () => {
  it('exports shared keypad kit before login bundle consumers', () => {
    expect(keypadSource).toContain('HEYS.AuthPinKeypad');
    expect(keypadSource).toContain('heys-auth-pin-box');
    expect(keypadSource).toContain('heys-auth-keypad');
    expect(keypadSource).toContain('usesTouchKeypad');
    expect(keypadSource).toContain('readOnly: touchKeypad');

    const loginIdx = bundleConfig.indexOf('heys_login_screen_v1.js');
    const keypadIdx = bundleConfig.indexOf('heys_auth_pin_keypad_v1.js');
    expect(keypadIdx).toBeGreaterThan(-1);
    expect(loginIdx).toBeGreaterThan(keypadIdx);
  });

  it('wires consent access-code sign step to shared keypad UI', () => {
    expect(consentsSource).toContain('renderPinKeypadSection');
    expect(consentsSource).toContain("idPrefix: 'consent-access-code'");
    expect(consentsSource).not.toMatch(/accessSignCode,\s*setAccessSignCode/);
  });

  it('wires curator profile PIN change to shared keypad UI', () => {
    expect(userTabSource).toContain('renderPinKeypadSection');
    expect(userTabSource).toContain("idPrefix: 'curator-new-pin'");
    expect(userTabSource).toContain("idPrefix: 'curator-confirm-pin'");
    expect(userTabSource).not.toContain('pinForm.pin');
  });

  it('wires curator create/edit client modals to shared keypad UI', () => {
    expect(gateFlowSource).toContain("idPrefix: 'create-client-pin'");
    expect(gateFlowSource).toContain("idPrefix: 'edit-client-pin'");
    expect(gateFlowSource).toContain('renderPinKeypadSection');
  });

  it('keeps reference login and first-access setup implementations intact', () => {
    expect(loginSource).toContain('heys-auth-keypad');
    expect(loginSource).toContain('heys-auth-pin-box');
    expect(accessSetupSource).toContain('heys-auth-keypad');
    expect(accessSetupSource).toContain('readOnly: touchKeypad');
  });
});
