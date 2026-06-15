// kernel-sports.test.js — SPORT_CONFIG registry contract.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

function ev(dir, file) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, dir, file), 'utf8'));
}

describe('TrainingKernel.sports', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    globalThis.window = globalThis;
    globalThis.HEYS = globalThis.window.HEYS = {};
    ev('_kernel', 'heys_kernel_sports_v1.js');
  });

  it('rejects configs without required identity/axes', () => {
    const sports = globalThis.HEYS.TrainingKernel.sports;
    const res = sports.register({ sportId: 'bad' });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === 'SPORT_CONFIG.qualityAxes_missing')).toBe(true);
    expect(sports.get('bad')).toBeNull();
  });

  it('registers and lists valid configs by sportId', () => {
    const sports = globalThis.HEYS.TrainingKernel.sports;
    const res = sports.register({
      sportId: 'demo',
      qualityAxes: [{ id: 'strength' }],
      modalities: ['bodyweight'],
      positionAxes: [{ id: 'joint' }],
      recoveryWindows: { low: 0 },
      tissueRiskModel: { riskTissue: 'generic' }
    });
    expect(res.ok).toBe(true);
    expect(sports.get('demo')).toMatchObject({ sportId: 'demo' });
    expect(sports.list().map((cfg) => cfg.sportId)).toEqual(['demo']);
  });

  it('accepts a future sport config without engine copies', () => {
    const sports = globalThis.HEYS.TrainingKernel.sports;
    const res = sports.register({
      sportId: 'future-swim',
      label: 'Swim',
      qualityAxes: [{ id: 'technique' }, { id: 'endurance' }],
      modalities: ['pool', 'dryland'],
      positionAxes: [{ id: 'stroke' }, { id: 'paceZone' }],
      recoveryWindows: { low: 0, moderate: 24, high: 48 },
      tissueRiskModel: { riskTissue: 'shoulder/hip generic load' },
      modes: [{ id: 'easy_technique' }]
    });
    expect(res.ok).toBe(true);
    expect(sports.get('future-swim')).toMatchObject({
      sportId: 'future-swim',
      qualityAxes: [{ id: 'technique' }, { id: 'endurance' }]
    });
  });

  it('kernel runtime files stay free of domain literals', () => {
    const kernelDir = path.join(WEB, '_kernel');
    const forbidden = /\b(grip|edge|A2|jointRegion|ROM|finger_strength|halfcrimp|openhand|mobility|fingers|climbing)\b/i;
    const offenders = fs.readdirSync(kernelDir)
      .filter((file) => file.endsWith('.js'))
      .flatMap((file) => {
        const text = fs.readFileSync(path.join(kernelDir, file), 'utf8');
        return text.split('\n').flatMap((line, idx) => forbidden.test(line)
          ? [`${file}:${idx + 1}:${line.trim()}`]
          : []);
      });
    expect(offenders).toEqual([]);
  });
});
