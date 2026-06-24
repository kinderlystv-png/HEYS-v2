// mobility-entry.test.js — public API, lazy stub and bundle-order contract.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const MOB_DIR = path.join(WEB_DIR, 'mobility');

const MODULES = [
  'heys_mobility_axis_catalog_v1.js',
  'heys_mobility_load_v1.js',
  'heys_mobility_bibliography_v1.js',
  'heys_mobility_atom_catalog_v1.js',
  'heys_mobility_validators_v1.js',
  'heys_mobility_assessment_v1.js',
  'heys_mobility_onboarding_v1.js',
  'heys_mobility_readiness_v1.js',
  'heys_mobility_records_store_v1.js',
  'heys_mobility_progression_v1.js',
  'heys_mobility_mode_engine_v1.js',
  'heys_mobility_protocols_catalog_v1.js',
  'heys_mobility_calendar_v1.js',
  'heys_mobility_routine_builder_v1.js',
  'heys_mobility_breath_runner_v1.js',
  'heys_mobility_routine_runner_v1.js',
  'heys_mobility_ui_v1.js',
  'heys_mobility_entry_v1.js'
];

function ev(file, dir = MOB_DIR) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function setupFull() {
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  globalThis.ReactDOM = globalThis.window.ReactDOM = {
    createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() }))
  };
  // общее ядро грузится раньше доменных модулей (как в bundler'е)
  ev('heys_kernel_bibliography_v1.js', path.join(WEB_DIR, '_kernel'));
  ev('heys_kernel_bibliography_ui_v1.js', path.join(WEB_DIR, '_kernel'));
  MODULES.forEach((f) => ev(f));
  return globalThis.HEYS.Mobility;
}

const profile = {
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster'],
  acceptedDisclaimer: true
};

describe('Mobility public entry', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('exports ready public API after source modules load in bundle order', () => {
    const M = setupFull();
    expect(M.isReady()).toBe(true);
    expect(typeof M.buildSession).toBe('function');
    expect(typeof M.buildRunPlan).toBe('function');
    expect(typeof M.renderPreviewPill).toBe('function');
  });

  it('buildSession and buildRunPlan delegate to domain engines', () => {
    const M = setupFull();
    const built = M.buildSession('evening_relax', profile, {});
    const plan = M.buildRunPlan(built);
    expect(built.ok).toBe(true);
    expect(built.session.mode).toBe('evening_relax');
    expect(plan.totalSteps).toBeGreaterThan(0);
  });

  it('renderPreviewPill returns a clickable React element', () => {
    const M = setupFull();
    const onClick = vi.fn();
    const el = M.renderPreviewPill({
      training: {
        type: 'mobility',
        time: '20:30',
        mobilityLog: { mode: 'evening_relax', totalDurationMinutes: 12, ok: true }
      },
      onClick
    });
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('mobility-pill');
    el.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('openFullscreen mounts UI overlay and close removes it', () => {
    const M = setupFull();
    const style = document.head.querySelector('#heys-mobility-ui-style');
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('.mobility-overlay-root');
    M.openFullscreen({ modeId: 'anti_sedentary', profile });
    expect(globalThis.ReactDOM.createRoot).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.mobility-overlay-root')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    M.close();
    expect(document.body.querySelector('.mobility-overlay-root')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Mobility boot stub', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    globalThis.window = globalThis;
    globalThis.HEYS = globalThis.window.HEYS = {};
    globalThis.React = globalThis.window.React = React;
  });

  it('registers lazy API and appends the mobility bundle script on open', () => {
    ev('heys_mobility_boot_stub_v1.js', WEB_DIR);
    const M = globalThis.HEYS.Mobility;
    expect(M.isReady()).toBe(false);
    expect(typeof M.__lazyLoad).toBe('function');
    M.openFullscreen({ modeId: 'morning_tonify' });
    const script = document.head.querySelector('script');
    expect(script).not.toBeNull();
    expect(script.getAttribute('src')).toContain('heys_mobility_bundle_v1.js');
  });
});
