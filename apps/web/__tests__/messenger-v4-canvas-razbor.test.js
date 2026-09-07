// Кадры «Ждём и подсказка» и «запись голосового» против разбора messenger.v4.dc.html
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/messenger.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/1000-messenger.css');
const MESSENGER_JS = path.resolve(__dirname, '../heys_messenger_v1.js');

const WAIT = 'Мессенджер · Ждём и подсказка';
const VOICE = 'Мессенджер · запись голосового';

const EXCEPTIONS = new Map([
  // Столбики waveform в отправленном пузыре — высота из данных вложения, не CSS.
  [`${VOICE}|11|background`, 'demo-only: opacity столбиков из inline-style'],
  [`${VOICE}|11|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|12|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|13|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|14|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|15|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|16|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|17|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|18|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|19|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  [`${VOICE}|20|height`, 'demo-only: высота столбика из inline-style AudioAttachment'],
  // Кнопка play: 44 px видимым размером против 30 px кадра — решение о тач-целях.
  [`${VOICE}|9|width`, 'accessibility: .msg-audio-play 44px видимым размером'],
  [`${VOICE}|9|height`, 'accessibility: .msg-audio-play 44px видимым размером'],
  [`${VOICE}|9|radius`, 'accessibility: .msg-audio-play 44px видимым размером'],
]);

function siftMessenger(drift) {
  return drift.filter((line) => {
    for (const [key, note] of EXCEPTIONS) {
      const [frame, index, kind] = key.split('|');
      if (line.startsWith(`${frame} · ${Number(index)} · ${kind}`)) return false;
      if (line.includes(`${frame} · ${index}`) && line.includes(kind) && note.startsWith('demo-only')) return false;
    }
    return true;
  });
}

const WAIT_FOOD = [
  [5, '.messenger-food-hint', ['align', 'gap']],
  [6, '.messenger-food-hint__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [7, '.messenger-food-hint__hide', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'flex']],
  [8, '.messenger-food-hint__actions', ['gap', 'marginTop']],
  [9, '.messenger-input', ['color']],
];

const VOICE_INTENT_AUDIO = [
  [4, '.msg-bubble:has(.msg-intent)', ['padding']],
  [5, '.msg-intent', ['radius', 'background', 'padding']],
  [6, '.msg-intent__row--single .msg-intent__value', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [7, '.msg-intent__details', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, '.msg-audio', ['align', 'gap']],
  [10, '.msg-audio-wave', ['align', 'gap', 'height']],
  [11, '.msg-bubble-theirs .msg-audio-wave span', ['flex', 'radius', 'background']],
  [21, '.msg-audio-meta', ['fontWeight', 'fontSize', 'color']],
  [22, '.msg-audio-transcript', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

describe('messenger · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));
  const messengerSource = fs.readFileSync(MESSENGER_JS, 'utf8');

  it('«Ждём и подсказка» — плашка и поле ввода', () => {
    expect(siftMessenger(compare({ razbor, rules, frame: WAIT, pairs: WAIT_FOOD }))).toEqual([]);
  });

  it('«запись голосового» — интент и аудио в ленте', () => {
    expect(siftMessenger(compare({ razbor, rules, frame: VOICE, pairs: VOICE_INTENT_AUDIO }))).toEqual([]);
  });

  it('шапка — аватар, стек заголовка, точка статуса', () => {
    expect(rules.get('.messenger-avatar')?.width).toBe('38px');
    expect(rules.get('.messenger-title-stack')?.flex).toBe('1');
    expect(rules.get('.messenger-subtitle__dot')?.width).toBe('6px');
    expect(rules.get('.messenger-row-theirs .msg-meta-row')?.['justify-content']
      || rules.get('.msg-row-theirs .msg-meta-row')?.['justify-content']).toBe('flex-start');
  });

  it('иконки шапки и композера — ICON_DEFS vs контракт рисунок', () => {
    expect(messengerSource).toMatch(/more:\s*\{[\s\S]*?cx: 5, cy: 12, r: 1\.4/);
    expect(messengerSource).toMatch(/close: \{ paths: \['M18 6L6 18M6 6l12 12'\] \}/);
    expect(messengerSource).toMatch(/name: 'more', size: 19, strokeWidth: 2\.75/);
    expect(messengerSource).toMatch(/name: 'camera', size: 19/);
    expect(messengerSource).toMatch(/name: 'mic', size: 19/);
    expect(messengerSource).toMatch(/name: 'send', size: 20/);
    expect(messengerSource).toMatch(/name: 'clock', size: 16/);
    expect(messengerSource).toMatch(/check: \{ paths: \['M20 6L9 17l-5-5'\] \}/);
  });

  it('гейт называет охват разбора', () => {
    const report = coverage({
      razbor,
      calls: [
        { frame: WAIT, pairs: WAIT_FOOD },
        { frame: VOICE, pairs: VOICE_INTENT_AUDIO },
      ],
    });
    expect(report.covered).toBeGreaterThanOrEqual(14);
  });
});
