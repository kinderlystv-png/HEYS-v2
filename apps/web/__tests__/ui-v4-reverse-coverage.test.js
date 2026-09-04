import { describe, expect, it } from 'vitest';

import {
  buildReverseCoverageReport,
  compareCanvasToVerdict,
  parseCanvasHtml,
  readCanvasPackage,
  resolveCanvasFrame,
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

  it('exposes exact source identity, inherited palette, and duplicate-safe locator metadata', () => {
    const canvas = parseCanvasHtml(`
      <div class="pal dk">
        <div id="first-frame" data-demo="stop" data-screen-label="Same label" data-oid="A 1"></div>
      </div>
      <div data-demo="stop" data-screen-label="Same label"></div>
      <div data-demo="stop" data-screen-label="Same label"></div>
    `, { file: 'synthetic.v4.dc.html' });

    expect(canvas.frames[0]).toMatchObject({
      identity: 'Same label',
      label: 'Same label',
      oid: 'A 1',
      sourceOrdinal: 0,
      sourceDomId: 'first-frame',
      sourceIdentity: 'first-frame',
      palette: 'sand-dark',
      paletteSource: 'class:dk',
      paletteInherited: true,
      canonicalLocator: {
        selector: '[data-screen-label="Same label"][data-oid="A 1"]',
        matchOrdinal: 0,
        sourceOrdinal: 0,
      },
    });
    expect(canvas.frames[1].canonicalLocator).toMatchObject({
      selector: '[data-screen-label="Same label"]',
      matchOrdinal: 0,
      sourceOrdinal: 1,
    });
    expect(canvas.frames[2].canonicalLocator).toMatchObject({
      selector: '[data-screen-label="Same label"]',
      matchOrdinal: 1,
      sourceOrdinal: 2,
    });
    expect(canvas.frames.map((frame) => frame.canonicalLocator.key)).toHaveLength(
      new Set(canvas.frames.map((frame) => frame.canonicalLocator.key)).size,
    );
  });

  // Строгость здесь стоит на метке, а не на атрибуте.
  //
  // До fc9aa5ff2 кадр без data-oid ронял сверку. Но oid проставляет пакет
  // дизайна, и он приезжает своими коммитами: привязка к атрибуту ломалась на
  // каждом обновлении пакета. Теперь кадр берётся по метке, когда она в канвасе
  // ровно одна, а fail-closed переехал на неоднозначность: две одинаковые
  // метки, или один oid с одной меткой у двух кадров, роняют сверку. Один oid
  // у нескольких кадров с разными метками разрешается парой oid + label.
  it('берёт кадр по уникальной метке и падает на любой неоднозначности', () => {
    const canvas = parseCanvasHtml(`
      <div data-demo="stop" data-screen-label="Unique" data-oid="A1"></div>
      <div data-demo="stop" data-screen-label="Missing oid"></div>
      <div data-demo="stop" data-screen-label="Duplicate one" data-oid="D1"></div>
      <div data-demo="stop" data-screen-label="Duplicate two" data-oid="D1"></div>
      <div data-demo="stop" data-screen-label="Twin"></div>
      <div data-demo="stop" data-screen-label="Twin"></div>
      <div data-demo="stop" data-screen-label="Same oid label" data-oid="E1"></div>
      <div data-demo="stop" data-screen-label="Same oid label" data-oid="E1"></div>
    `);

    expect(resolveCanvasFrame(canvas, { label: 'Unique', oid: 'A1' })).toBe(canvas.frames[0]);
    // Метка одна на канвас — oid не нужен ни с какой стороны.
    expect(resolveCanvasFrame(canvas, { label: 'Unique' })).toBe(canvas.frames[0]);
    expect(resolveCanvasFrame(canvas, { label: 'Missing oid' })).toBe(canvas.frames[1]);
    // Один oid, разные метки — разрешается парой oid + label.
    expect(resolveCanvasFrame(canvas, { label: 'Duplicate one', oid: 'D1' })).toBe(canvas.frames[2]);
    expect(resolveCanvasFrame(canvas, { label: 'Duplicate two', oid: 'D1' })).toBe(canvas.frames[3]);
    // Две одинаковые метки — выбора нет, и молча взять первый хуже падения.
    expect(() => resolveCanvasFrame(canvas, { label: 'Twin' }))
      .toThrow(/is ambiguous \(2 frames/);
    expect(() => resolveCanvasFrame(canvas, { label: 'Same oid label', oid: 'E1' }))
      .toThrow(/data-oid «E1» and label «Same oid label» is ambiguous/);
    // oid есть с обеих сторон — разъехавшаяся пара по-прежнему ловится.
    expect(() => resolveCanvasFrame(canvas, { label: 'Wrong label', oid: 'A1' }))
      .toThrow(/belongs to «Unique»/);
    expect(() => resolveCanvasFrame(canvas, { label: 'Wrong label', oid: 'D1' }))
      .toThrow(/has no frame with label «Wrong label»/);
    expect(() => resolveCanvasFrame(canvas, { label: 'Nothing like this' }))
      .toThrow(/was not found/);
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
    // Числа пересняты после поставки пакета 4 сентября (900b2f27d). Разница
    // разобрана поимённо, а не подогнана: 17216 → 17311 это +101 строка и −6,
    // и обе половины названы.
    //
    // Добавлено (+101): food-meal 46 — новый кадр «Действие · копировать ·
    // чего не знаем»; home-widgets 37 — четыре кадра каталога значков в
    // четырёх наборах; checkin-morning 8 — перерисованные листы рутины;
    // strength-builder 6 — элементы 18…23 кадра «план назначен»;
    // reports-insights 4 — строка замера и карточка перестройки.
    //
    // Убрано (−6). Две в strength-builder — слияние: «мишени 44 и 36» ушла
    // дословно внутрь «мишени и запись чисел», а «отношение к канону называет
    // сам кадр» исчезла вместе с правилом (см. ниже, это находка, а не шум).
    // Четыре в checkin-morning — следствие перенумерации, а не потеря
    // содержания: «К списку дней» и «По ощущениям» стоят на своих экранах под
    // меньшими номерами, а исчезли хвостовые личности трёх кадров, которые
    // укоротились на 1, 1 и 2 элемента.
    //
    // duplicateFrameIdentities: 10 — та же самая десятка, что и была: пять
    // кадров зоны tips в светлой и тёмной копии. Ни один новый кадр слепым не
    // стал, проверено сравнением множеств, а не только числа.
    expect(report.totals).toMatchObject({
      canvases: 25,
      contractRows: 17311,
      productFrames: 771,
      duplicateContractIdentities: 0,
      duplicateFrameIdentities: 10,
      frameScope: { stop: 694, none: 77, protocol: 39, loop: 23 },
    });

    for (const canvas of canvases) {
      expect(canvas.frames.every((frame) => Object.hasOwn(frame, 'oid')), canvas.zoneId).toBe(true);
      expect(canvas.frames.every((frame) => Object.hasOwn(frame, 'palette')), canvas.zoneId).toBe(true);
      expect(canvas.frames.map((frame) => frame.sourceOrdinal), canvas.zoneId).toEqual(
        canvas.frames.map((_frame, index) => index),
      );
      expect(
        new Set(canvas.frames.map((frame) => frame.canonicalLocator.key)).size,
        canvas.zoneId,
      ).toBe(canvas.frames.length);
    }

    const strength = canvases.find((canvas) => canvas.zoneId === 'strength-builder');
    expect(resolveCanvasFrame(strength, { label: 'План в ленте дня', oid: 'И3' }))
      .toMatchObject({ identity: 'План в ленте дня', oid: 'И3' });
  }, 15_000);
});
