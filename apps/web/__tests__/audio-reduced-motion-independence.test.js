/**
 * Звук не зависит от системной настройки движения.
 *
 * Почему тест нужен. Завязка жила в `canPlay()` и `play()` с первой версии
 * модуля (79fc18a5) и молча выключала весь звук приложения тому, кто убрал
 * анимации: «уменьшить движение» — про движение, а настройки «меньше звука» в
 * ОС нет. Связь нигде не была объявлена — ни комментарием, ни коммитом, ни в
 * `docs/implementation/MOTION_POLICY.md`, — поэтому и прожила незамеченной.
 *
 * Отдельно это была парная дыра с водой: контракт канваса `water-add` просит при
 * уменьшенном движении не рисовать каплю и круг. Пока капля оставлена, тишина
 * была не видна; сняли бы каплю — у тапа по воде не осталось бы никакой
 * обратной связи, кроме перескочившего числа.
 *
 * Проверяется поведение, а не строка исходника: модуль оживает в happy-dom с
 * поддельными matchMedia и AudioContext, и тест смотрит, построил ли синтезатор
 * узлы. Остальные причины молчания (общий выключатель, тихие часы, фоновая
 * вкладка, защита от частых повторов) проверяются здесь же — чтобы разрыв связи
 * не снял заодно их.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_audio_v1.js'), 'utf8');
const SETTINGS_KEY = 'heys_audio_settings';

/** Поддельный WebAudio: важно лишь, построил ли синтезатор хоть один узел. */
function installFakeAudioContext() {
  const log = { contexts: 0, nodes: [] };
  const param = () => ({
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
    cancelScheduledValues: () => {},
  });
  const node = (kind) => {
    log.nodes.push(kind);
    return {
      kind,
      connect: () => {},
      start: () => {},
      stop: () => {},
      gain: param(),
      frequency: param(),
      detune: param(),
      delayTime: param(),
      Q: param(),
    };
  };
  class FakeAudioContext {
    constructor() {
      log.contexts += 1;
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = { kind: 'destination' };
    }
    createGain() {
      return node('gain');
    }
    createOscillator() {
      return node('osc');
    }
    createBiquadFilter() {
      return node('filter');
    }
    createDelay() {
      return node('delay');
    }
    createBufferSource() {
      return node('bufferSource');
    }
    createBuffer(_ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    }
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  return log;
}

function setReducedMotion(on) {
  window.matchMedia = (query) => ({
    media: query,
    matches: on && String(query).includes('prefers-reduced-motion'),
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * Загрузить модуль заново: у него есть внутреннее состояние (кэш настроек,
 * времена последних звуков, флаг жеста), и тесты не должны его наследовать.
 */
function loadAudio(settings) {
  delete window.HEYS;
  localStorage.clear();
  // `_qhOff: 1` — иначе одноразовая миграция модуля принудительно выключит
  // тихие часы, и сценарий тихих часов проверял бы не то.
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(
      Object.assign(
        {
          masterEnabled: true,
          volume: 0.12,
          hapticEnabled: true,
          quietHoursEnabled: false,
          quietStart: 23,
          quietEnd: 7,
          _qhOff: 1,
        },
        settings,
      ),
    ),
  );
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  // Web Audio просыпается только после жеста — модуль ждёт первого клика.
  document.dispatchEvent(new window.Event('click'));
  return window.HEYS.audio;
}

/** Окно тихих часов, гарантированно накрывающее текущий час. */
function quietWindowAroundNow() {
  const hour = new Date().getHours();
  return { quietHoursEnabled: true, quietStart: hour, quietEnd: (hour + 1) % 24 };
}

describe('звук и системная настройка движения', () => {
  let log;

  beforeEach(() => {
    log = installFakeAudioContext();
    setReducedMotion(false);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  afterEach(() => {
    delete window.HEYS;
    localStorage.clear();
  });

  it('при уменьшенном движении звук играет', () => {
    setReducedMotion(true);
    const audio = loadAudio();
    audio.play('waterAdded');
    expect(log.nodes.length).toBeGreaterThan(0);
  });

  it('при уменьшенном движении играют и остальные категории, и превью настроек', () => {
    setReducedMotion(true);
    const audio = loadAudio();
    audio.play('buttonTap');
    expect(log.nodes.length).toBeGreaterThan(0);

    const afterPlay = log.nodes.length;
    audio.preview('water');
    expect(log.nodes.length).toBeGreaterThan(afterPlay);
  });

  it('canPlay() не отвечает «нельзя» из-за уменьшенного движения', () => {
    setReducedMotion(true);
    const audio = loadAudio();
    expect(audio.canPlay('waterAdded')).toBe(true);
  });

  it('уменьшенное движение ничего не меняет: с ним и без него звук одинаков', () => {
    setReducedMotion(false);
    loadAudio().play('waterAdded');
    const withMotion = log.nodes.length;
    expect(withMotion).toBeGreaterThan(0);

    log.nodes.length = 0;
    setReducedMotion(true);
    loadAudio().play('waterAdded');
    expect(log.nodes.length).toBe(withMotion);
  });

  it('общий выключатель по-прежнему глушит', () => {
    const audio = loadAudio({ masterEnabled: false });
    audio.play('waterAdded');
    expect(log.nodes.length).toBe(0);
    expect(audio.canPlay('waterAdded')).toBe(false);
  });

  it('тихие часы по-прежнему глушат — и пропускают ignoreQuietHours', () => {
    const quiet = quietWindowAroundNow();
    const audio = loadAudio(quiet);
    audio.play('waterAdded');
    expect(log.nodes.length).toBe(0);
    expect(audio.canPlay('waterAdded')).toBe(false);

    // Второй вызов — на свежем экземпляре: иначе его съест не тихий час, а
    // пауза между повторами той же категории (её проверяет отдельный тест).
    loadAudio(quiet).play('waterAdded', { ignoreQuietHours: true });
    expect(log.nodes.length).toBeGreaterThan(0);
  });

  it('фоновая вкладка по-прежнему молчит', () => {
    const audio = loadAudio();
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    audio.play('waterAdded');
    expect(log.nodes.length).toBe(0);
    expect(audio.canPlay('waterAdded')).toBe(false);
  });

  it('защита от частых повторов по-прежнему работает — и для воды тоже', () => {
    const audio = loadAudio();
    audio.play('waterAdded');
    const afterFirst = log.nodes.length;
    expect(afterFirst).toBeGreaterThan(0);
    // Частые тапы подряд молчат. Гасит их пауза между повторами категории:
    // `COOLDOWN.water = 0` не отключает её, потому что `COOLDOWN[cat] || 800`
    // читает ноль как «не задано» и подставляет 800 мс. Отдельный предел «не
    // больше 4 за 2 с» при такой паузе просто не достижим.
    for (let i = 0; i < 4; i += 1) audio.play('waterAdded');
    expect(log.nodes.length).toBe(afterFirst);
  });

  it('пауза между звуками одной категории по-прежнему работает', () => {
    const audio = loadAudio();
    audio.play('adviceAppear');
    const afterFirst = log.nodes.length;
    expect(afterFirst).toBeGreaterThan(0);
    audio.play('adviceAppear');
    expect(log.nodes.length).toBe(afterFirst);
  });

  it('вибрация остаётся под настройкой движения — это физическое движение', () => {
    setReducedMotion(true);
    const audio = loadAudio();
    const buzzes = [];
    navigator.vibrate = (pattern) => {
      buzzes.push(pattern);
      return true;
    };
    audio.haptic([20]);
    expect(buzzes).toEqual([]);

    setReducedMotion(false);
    audio.haptic([20]);
    expect(buzzes.length).toBe(1);
  });
});
