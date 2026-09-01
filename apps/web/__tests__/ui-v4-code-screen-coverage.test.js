import { describe, expect, it } from 'vitest';

import { parseCanvasHtml, readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import {
  buildCodeScreenCoverageReport,
  extractScreenRoots,
  readProductScreenRoots,
  readScreenCoverageRegistry,
} from '../../../scripts/lib/ui-v4-screen-roots.mjs';

describe('UI v4 code→canvas screen coverage', () => {
  it('extracts only root-like literal classes and folds state modifiers', () => {
    const roots = extractScreenRoots(`
      h('div', { className: 'paywall-overlay paywall-overlay--v4' });
      h('div', { className: 'paywall-modal paywall-modal__body' });
      h('div', { className: 'ordinary-card h-screen' });
      h('div', { className: dynamicClass });
    `, { file: 'synthetic.js' });

    expect(roots.map((item) => item.identity)).toEqual([
      'paywall-overlay',
      'paywall-modal',
      'h-screen',
    ]);
  });

  it('requires an exact existing frame for covered roots and keeps gaps red', () => {
    const parsed = parseCanvasHtml(
      '<div data-demo="stop" data-screen-label="Экран оплаты"></div>',
      { file: 'login.v4.dc.html' },
    );
    const canvases = [{ zoneId: 'login', ...parsed }];
    const roots = [
      { identity: 'covered-modal', locations: [] },
      { identity: 'missing-modal', locations: [] },
    ];
    const report = buildCodeScreenCoverageReport(roots, canvases, {
      reviewed: {
        'covered-modal': {
          status: 'covered',
          frames: [{ zone: 'login', frame: 'Экран оплаты' }],
        },
        'missing-modal': { status: 'gap', reason: 'кадра нет' },
      },
      unreviewed: [],
    });

    expect(report.totals).toMatchObject({ codeRoots: 2, covered: 1, gaps: 1 });
    expect(report.gaps.map((item) => item.identity)).toEqual(['missing-modal']);
    expect(report.ok).toBe(false);
  });

  it('freezes every current source root as exactly covered, excluded or a confirmed gap', () => {
    const roots = readProductScreenRoots();
    const registry = readScreenCoverageRegistry();
    const report = buildCodeScreenCoverageReport(roots, readCanvasPackage(), registry);

    expect(roots).toHaveLength(127);
    expect(report.totals).toMatchObject({
      codeRoots: 127,
      covered: 28,
      excluded: 21,
      gaps: 78,
      pending: 0,
      missing: 0,
      stale: 0,
      invalid: 0,
    });
    expect(report.ok).toBe(false);
  }, 15_000);
});
