// fingers-voice-lifecycle.test.js — voice audio cache lifecycle.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

class FakeAudio {
  static instances = [];

  constructor() {
    this.preload = '';
    this.src = '';
    this.currentTime = 0;
    this.volume = 1;
    this.playbackRate = 1;
    this.pause = vi.fn();
    this.load = vi.fn();
    this.removeAttribute = vi.fn((name) => {
      if (name === 'src') this.src = '';
    });
    this.listeners = {};
    FakeAudio.instances.push(this);
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(fn);
  }

  removeEventListener(type, fn) {
    if (this.listeners[type]) this.listeners[type].delete(fn);
  }

  emit(type) {
    Array.from(this.listeners[type] || []).forEach((fn) => fn());
  }

  play() {
    setTimeout(() => this.emit('ended'), 0);
    return Promise.resolve();
  }
}

function setupVoice() {
  FakeAudio.instances = [];
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {};
  globalThis.Audio = FakeAudio;
  globalThis.speechSynthesis = undefined;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_voice_v1.js'), 'utf8'));
  return globalThis.HEYS.Fingers.voice;
}

describe('Fingers voice audio lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('bounds HTMLAudioElement cache with LRU eviction', async () => {
    const voice = setupVoice();
    const ids = voice.PHRASE_BANK.slice(0, 14).map((p) => p.id);

    for (const id of ids) {
      await voice.say(id);
    }

    expect(voice.getAudioCacheSize()).toBe(12);
    expect(FakeAudio.instances.length).toBe(14);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(FakeAudio.instances[1].pause).toHaveBeenCalled();
  });

  it('clearAudioCache stops cached audio handles', async () => {
    const voice = setupVoice();
    await voice.say('cue.start_session');
    await voice.say('cue.countdown_5');

    expect(voice.getAudioCacheSize()).toBe(2);
    voice.clearAudioCache();

    expect(voice.getAudioCacheSize()).toBe(0);
    expect(FakeAudio.instances.every((a) => a.pause.mock.calls.length > 0)).toBe(true);
    expect(FakeAudio.instances.every((a) => a.removeAttribute.mock.calls.length > 0)).toBe(true);
  });
});
