// Смоук тумблера «Звук советов» (решение владельца 24.08.2026: тумблер вернуть).
// Проверяется не наличие строки в исходнике, а поведение: без локального гейта
// тумблер был бы декоративным — HEYS.audio про советы ничего не знает и гасит
// либо всё, либо ничего. Поэтому сценарии идут через настоящий хук useAdviceState.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const SRC = path.resolve(__dirname, '..', 'day/_advice.js');
const AUDIO_SRC = path.resolve(__dirname, '..', 'heys_audio_v1.js');

const SETTINGS_KEY = 'heys_advice_settings';

const advice = {
  id: 'a1',
  type: 'tip',
  text: 'После тренировки нужен белок',
  category: 'training',
  icon: '💡',
};

// Заглушка HEYS.audio по контракту настоящего модуля: play() молчит, пока
// masterEnabled === false. Что настоящий модуль ведёт себя именно так,
// проверяется отдельным assert'ом по исходнику ниже — jsdom не даёт Web Audio.
function makeAudio(state) {
  return {
    play: (event) => {
      if (!state.masterEnabled) return;
      state.played.push(event);
    },
    isEnabled: () => state.masterEnabled,
  };
}

const U = {
  lsGet: (key, fallback) => {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  },
  lsSet: (key, value) => { localStorage.setItem(key, JSON.stringify(value)); },
};

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  const code = fs.readFileSync(SRC, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
});

beforeEach(() => {
  localStorage.clear();
});

// Монтирует хук и держит свежий возвращаемый объект в holder.current.
function mountAdviceState() {
  const holder = { current: null };
  function Probe() {
    holder.current = window.HEYS.dayAdviceState.useAdviceState({
      React,
      day: {},
      date: '2026-08-24',
      prof: {},
      pIndex: {},
      prodSig: '',
      dayTot: {},
      normAbs: {},
      optimum: 2000,
      waterGoal: 2000,
      uiState: {},
      haptic: () => {},
      U,
      lsGet: U.lsGet,
      currentStreak: 0,
      currentMinute: 0,
      setShowConfetti: () => {},
      HEYS: window.HEYS,
    });
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(React.createElement(Probe)); });
  return holder;
}

function withAudio(masterEnabled = true) {
  const state = { masterEnabled, played: [] };
  window.HEYS.audio = makeAudio(state);
  return state;
}

describe('тумблер «Звук советов»: локальный гейт перед проигрыванием', () => {
  it('при включённом тумблере отметка совета звучит', () => {
    const audio = withAudio(true);
    const api = mountAdviceState();
    expect(api.current.adviceSoundEnabled).toBe(true);

    act(() => { api.current.markAdviceDetailRead(advice); });
    expect(audio.played).toEqual(['adviceAppear']);
  });

  it('при выключенном тумблере не звучит ни отметка, ни «скрыть»', () => {
    const audio = withAudio(true);
    const api = mountAdviceState();

    act(() => { api.current.toggleAdviceSoundEnabled(); });
    expect(api.current.adviceSoundEnabled).toBe(false);

    act(() => { api.current.markAdviceDetailRead(advice); });
    act(() => { api.current.hideAdviceDetailUntilTomorrow({ id: 'a2', category: 'training' }); });
    expect(audio.played).toEqual([]);
  });

  it('«скрыть до завтра» звучит своим звуком, пока тумблер включён', () => {
    const audio = withAudio(true);
    const api = mountAdviceState();

    act(() => { api.current.hideAdviceDetailUntilTomorrow(advice); });
    expect(audio.played).toEqual(['adviceDismiss']);
  });

  it('общий выключатель глушит советы даже при включённом частном тумблере', () => {
    const audio = withAudio(false);
    const api = mountAdviceState();
    expect(api.current.adviceSoundEnabled).toBe(true);

    act(() => { api.current.markAdviceDetailRead(advice); });
    act(() => { api.current.hideAdviceDetailUntilTomorrow({ id: 'a2', category: 'training' }); });
    expect(audio.played).toEqual([]);
  });

  it('настоящий HEYS.audio.play действительно выходит по masterEnabled', () => {
    const audioSource = fs.readFileSync(AUDIO_SRC, 'utf8');
    expect(audioSource).toMatch(/function play\([\s\S]{0,200}?if \(!s\.masterEnabled\) return;/);
  });
});

describe('тумблер «Звук советов»: значение переживает перезагрузку и облако', () => {
  it('переключение пишет оба имени поля', () => {
    withAudio(true);
    const api = mountAdviceState();

    act(() => { api.current.toggleAdviceSoundEnabled(); });

    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    expect(saved.adviceSoundEnabled).toBe(false);
    expect(saved.soundEnabled).toBe(false);
  });

  it('сохранённое значение поднимается при следующем монтировании', () => {
    withAudio(true);
    const first = mountAdviceState();
    act(() => { first.current.toggleAdviceSoundEnabled(); });

    const audio = withAudio(true);
    const second = mountAdviceState();
    expect(second.current.adviceSoundEnabled).toBe(false);

    act(() => { second.current.markAdviceDetailRead(advice); });
    expect(audio.played).toEqual([]);
  });

  it('чтение терпит запасное имя поля soundEnabled без adviceSoundEnabled', () => {
    // Так значение лежит у людей, которые трогали только галочку «Звук»
    // в профиле → «Настройки советов»: она пишет одно поле soundEnabled.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled: false }));
    const audio = withAudio(true);
    const api = mountAdviceState();

    expect(api.current.adviceSoundEnabled).toBe(false);
    act(() => { api.current.markAdviceDetailRead(advice); });
    expect(audio.played).toEqual([]);
  });

  it('adviceSoundEnabled старше запасного имени', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ adviceSoundEnabled: true, soundEnabled: false })
    );
    withAudio(true);
    const api = mountAdviceState();
    expect(api.current.adviceSoundEnabled).toBe(true);
  });

  it('значение из облака доезжает по heysSyncCompleted', () => {
    const audio = withAudio(true);
    const api = mountAdviceState();
    expect(api.current.adviceSoundEnabled).toBe(true);

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ adviceSoundEnabled: false }));
    act(() => { window.dispatchEvent(new Event('heysSyncCompleted')); });

    expect(api.current.adviceSoundEnabled).toBe(false);
    act(() => { api.current.markAdviceDetailRead(advice); });
    expect(audio.played).toEqual([]);
  });

  it('галочка «Звук» из профиля доезжает по heysAdviceSettingsChanged', () => {
    // advice/_core.js setAdviceSettings шлёт именно это событие.
    const audio = withAudio(true);
    const api = mountAdviceState();

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled: false }));
    act(() => {
      window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', {
        detail: { soundEnabled: false },
      }));
    });

    expect(api.current.adviceSoundEnabled).toBe(false);
    act(() => { api.current.markAdviceDetailRead(advice); });
    expect(audio.played).toEqual([]);
  });
});

describe('тумблер «Звук советов»: ряд в настройках советов', () => {
  function renderSettings(props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(window.HEYS.dayAdviceListUI.renderAdviceSharedOverlays({
        React,
        adviceTrigger: null,
        toastVisible: false,
        medicalDisclaimerSessionDismissed: true,
        medicalDisclaimerNeverShow: true,
        onMedicalDisclaimerNeverShowChange: () => {},
        onMedicalDisclaimerContinue: () => {},
        adviceSettingsOpen: true,
        closeAdviceSettings: () => {},
        toastsEnabled: true,
        toggleToastsEnabled: () => {},
        adviceCategorySettings: {},
        toggleAdviceCategoryGroup: () => {},
        ...props,
      }));
    });
    return host;
  }

  function soundRow(host) {
    return Array.from(host.querySelectorAll('.advice-v4-settings__row')).find(
      (row) => row.querySelector('.advice-v4-settings__row-title')?.textContent === 'Звук'
    );
  }

  it('ряд стоит в настройках советов с подсказкой про остальные звуки', () => {
    const host = renderSettings({ adviceSoundEnabled: true, toggleAdviceSoundEnabled: () => {} });
    const row = soundRow(host);
    expect(row).toBeTruthy();
    expect(row.querySelector('.advice-v4-settings__row-hint').textContent)
      .toBe('Только у советов. Остальные звуки приложения не затрагивает.');
  });

  it('тумблер отражает состояние и зовёт обработчик', () => {
    let clicks = 0;
    const on = soundRow(renderSettings({
      adviceSoundEnabled: true,
      toggleAdviceSoundEnabled: () => { clicks += 1; },
    })).querySelector('.advice-v4-settings__toggle');
    expect(on.className).toContain('is-on');
    expect(on.getAttribute('aria-pressed')).toBe('true');

    act(() => { on.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(clicks).toBe(1);

    const off = soundRow(renderSettings({
      adviceSoundEnabled: false,
      toggleAdviceSoundEnabled: () => {},
    })).querySelector('.advice-v4-settings__toggle');
    expect(off.className).not.toContain('is-on');
    expect(off.getAttribute('aria-pressed')).toBe('false');
  });

  it('шторка советов пропсы звука доносит из состояния дня', () => {
    // Плечо между хуком и экраном: heys_day_page_shell.js уже передаёт оба
    // пропса, поэтому возврат в _advice.js замыкает цепочку без правок в шелле.
    const shellSource = fs.readFileSync(
      path.resolve(__dirname, '..', 'heys_day_page_shell.js'),
      'utf8'
    );
    expect(shellSource).toContain('adviceSoundEnabled');
    expect(shellSource).toContain('toggleAdviceSoundEnabled');
  });
});
