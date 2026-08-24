/**
 * Звук капли воды (канвас water-add, строки «чем сделан», «характер», «тон»,
 * «огибающая», «громкость»).
 *
 * Почему смоуком, а не ухом. Числа контракта — частоты, миллисекунды и гейн —
 * на слух не проверяются: разницу между спадом 140 и 230 мс или между
 * восходящим глайдом и нисходящим человек назовёт «вроде так же». А прежний
 * звук расходился с контрактом по всем пяти строкам сразу, и никто этого не
 * слышал год.
 *
 * Тест ведёт поддельный AudioContext и записывает, что именно построил
 * синтезатор: узлы, частоты, точки автоматизации. Это не проверка звучания —
 * это проверка чисел, которые звучание задают.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_audio_v1.js'), 'utf8');

/** Поддельный WebAudio: узлы записывают всё, что с ними делают. */
function makeCtx() {
  const log = { nodes: [], ramps: [], values: [], connected: [] };

  const param = (owner, name) => ({
    setValueAtTime: (v, t) => log.values.push({ owner, name, v, t }),
    exponentialRampToValueAtTime: (v, t) => log.ramps.push({ owner, name, v, t }),
    linearRampToValueAtTime: (v, t) => log.ramps.push({ owner, name, v, t }),
  });

  const node = (kind) => {
    const n = {
      kind,
      connect: (dst) => log.connected.push([kind, dst && dst.kind ? dst.kind : 'destination']),
      start: () => {},
      stop: () => {},
    };
    n.gain = param(kind, 'gain');
    n.frequency = param(kind, 'frequency');
    n.detune = param(kind, 'detune');
    n.delayTime = param(kind, 'delayTime');
    n.Q = param(kind, 'Q');
    log.nodes.push(kind);
    return n;
  };

  return {
    log,
    currentTime: 0,
    sampleRate: 48000,
    destination: { kind: 'destination' },
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createDelay: () => node('delay'),
    createBufferSource: () => node('bufferSource'),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
}

/** Оживить synthWater из исходника — модуль тянет за собой DOM и localStorage. */
function loadSynthWater() {
  const at = SRC.indexOf('  function synthWater(ctx, vol, detuneCents = 0) {');
  let depth = 0;
  let end = -1;
  for (let i = SRC.indexOf('{', at); i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    if (SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`${SRC.slice(at, end)}; return synthWater;`)();
}

describe('звук капли: числа контракта', () => {
  let ctx;
  let synthWater;

  beforeEach(() => {
    ctx = makeCtx();
    synthWater = loadSynthWater();
    synthWater(ctx, 1);
  });

  it('«характер»: без реверберации — узлов задержки и обратной связи нет', () => {
    expect(ctx.log.nodes).not.toContain('delay');
    expect(SRC).not.toContain('rvFb');
  });

  it('«тон»: основной глайд восходящий, 400 → 540 Гц', () => {
    const starts = ctx.log.values.filter((v) => v.name === 'frequency').map((v) => v.v);
    const ends = ctx.log.ramps.filter((v) => v.name === 'frequency').map((v) => v.v);
    expect(starts).toContain(400);
    expect(ends).toContain(540);
    // Прежний нисходящий 760 → 330 не должен вернуться.
    expect(starts).not.toContain(760);
    expect(ends).not.toContain(330);
  });

  it('«тон»: обертон ровно вдвое выше основного', () => {
    const starts = ctx.log.values.filter((v) => v.name === 'frequency').map((v) => v.v);
    expect(starts).toContain(800);
    const ends = ctx.log.ramps.filter((v) => v.name === 'frequency').map((v) => v.v);
    expect(ends).toContain(1080);
  });

  it('«огибающая»: атака 4 мс, спад 140 мс, всего не больше 200', () => {
    const gains = ctx.log.ramps.filter((r) => r.name === 'gain');
    expect(gains.some((r) => Math.abs(r.t - 0.004) < 1e-9)).toBe(true);
    expect(gains.some((r) => Math.abs(r.t - 0.144) < 1e-9)).toBe(true);
    const last = Math.max(...gains.map((r) => r.t));
    expect(last).toBeLessThanOrEqual(0.2);
  });

  it('«громкость»: гейн 0,22 от общего уровня', () => {
    const peak = Math.max(...ctx.log.ramps.filter((r) => r.name === 'gain').map((r) => r.v));
    expect(peak).toBeCloseTo(0.22, 5);
  });

  it('обертон тише основного на 12 дБ', () => {
    const peaks = ctx.log.ramps
      .filter((r) => r.name === 'gain')
      .map((r) => r.v)
      .sort((a, b) => b - a);
    // 10^(−12/20) ≈ 0,251 от основного.
    expect(peaks[1] / peaks[0]).toBeCloseTo(0.251, 2);
  });

  it('«чем сделан»: синтез, а не семпл — файлов звука не подгружает', () => {
    expect(SRC).not.toMatch(/\.wav|\.mp3|decodeAudioData/);
  });
});
