import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalPerformance = global.performance;

function loadPerf() {
  global.HEYS = global.HEYS || {};
  const src = fs.readFileSync(path.resolve(__dirname, '../heys_perf_main_thread_v1.js'), 'utf8');
  eval(src);
}

describe('HEYS.perfMainThread', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.performance = originalPerformance;
    vi.restoreAllMocks();
  });

  it('measureSync runs fn and does not throw', () => {
    global.performance = { now: () => 0 };
    loadPerf();
    let ran = false;
    global.HEYS.perfMainThread.measureSync('t', () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
