import { describe, expect, it } from 'vitest';

import {
  buildReverseCoverageReport,
  compareCanvasToVerdict,
  parseCanvasHtml,
  readCanvasPackage,
} from '../../../scripts/lib/ui-v4-canvas-index.mjs';

describe('UI v4 reverse coverage index', () => {
  it('parses exact contract rows and product frame scope from the nearest data-demo', () => {
    const canvas = parseCanvasHtml(`
      <div data-contract="synthetic">
        <div class="spec"><b>строка · одна</b><span data-v="точное значение"></span></div>
        <div class="spec"><b>строка · две</b><span data-v=""></span></div>
      </div>
      <div data-screen-label="без data-demo"></div>
      <div data-demo="stop"><div data-screen-label="унаследованный stop"></div></div>
      <div data-demo="protocol">
        <div data-screen-label="протокол"></div>
        <div data-demo="stop" data-screen-label="ближайший stop"></div>
      </div>
      <div data-demo="loop"><div data-screen-label="петля"></div></div>
    `);

    expect(canvas.contractRows.map(({ identity, value }) => ({ identity, value }))).toEqual([
      { identity: 'строка · одна', value: 'точное значение' },
      { identity: 'строка · две', value: '' },
    ]);
    expect(canvas.productFrames.map((frame) => [frame.identity, frame.demo])).toEqual([
      ['без data-demo', 'none'],
      ['унаследованный stop', 'stop'],
      ['ближайший stop', 'stop'],
    ]);
    expect(canvas.nonProductFrames.map((frame) => [frame.identity, frame.demo])).toEqual([
      ['протокол', 'protocol'],
      ['петля', 'loop'],
    ]);
  });

  it('reports duplicate exact identities instead of collapsing them', () => {
    const canvas = parseCanvasHtml(`
      <div data-contract="synthetic">
        <div class="spec"><b>дубль</b><span data-v="1"></span></div>
        <div class="spec"><b>дубль</b><span data-v="2"></span></div>
      </div>
      <div data-screen-label="один кадр"></div>
      <div data-demo="stop" data-screen-label="один кадр"></div>
    `);

    expect(canvas.duplicateContractRows).toEqual([{ identity: 'дубль', count: 2 }]);
    expect(canvas.duplicateProductFrames).toEqual([{ identity: 'один кадр', count: 2 }]);
  });

  it('does not infer frame evidence from similarly named row verdicts', () => {
    const parsed = parseCanvasHtml(`
      <div data-contract="synthetic">
        <div class="spec"><b>Экран · 01</b><span data-v="правило"></span></div>
      </div>
      <div data-demo="stop" data-screen-label="Экран"></div>
    `, { file: 'synthetic.v4.dc.html' });
    const canvas = { zoneId: 'synthetic', ...parsed };
    const verdict = {
      canvas: 'synthetic.v4.dc.html',
      rows: { 'Экран · 01': { v: '=', f: 'адрес кода' } },
    };

    const coverage = compareCanvasToVerdict(canvas, verdict);
    expect(coverage.contract).toMatchObject({ total: 1, covered: 1, missing: [], extra: [] });
    expect(coverage.frames).toMatchObject({
      total: 1,
      covered: 0,
      frameSchemaPresent: false,
      evidenceSchemaPresent: false,
      missing: ['Экран'],
    });
    expect(coverage.scaffold.frames).toEqual([{ identity: 'Экран', evidence: [] }]);
    expect(coverage.ok).toBe(false);
  });

  it('indexes only the 25 active root canvases with the current package counts', () => {
    const canvases = readCanvasPackage();
    const report = buildReverseCoverageReport(canvases, {});

    expect(canvases).toHaveLength(25);
    expect(canvases.some((canvas) => canvas.file.includes('history'))).toBe(false);
    expect(report.totals).toMatchObject({
      canvases: 25,
      contractRows: 15574,
      productFrames: 748,
      duplicateContractIdentities: 0,
      duplicateFrameIdentities: 10,
      frameScope: { stop: 672, none: 76, protocol: 39, loop: 23 },
    });
  });
});
