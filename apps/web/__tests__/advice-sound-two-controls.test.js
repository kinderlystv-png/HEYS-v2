// Три видимых переключателя звука советов — тумблер листа «Советы», строка
// «Звук совета» в настройках и галочка профиля — пишут в одну запись под двумя
// именами. Читатель предпочитает
// `adviceSoundEnabled`, поэтому контрол, пишущий только `soundEnabled`, после
// первого же нажатия соседа переставал влиять на звук и продолжал показывать
// своё состояние: человек видел «выключено», а совет звучал.
//
// Смоук держит инвариант со всех трёх сторон: сломать его можно в любом из
// трёх файлов, и одиночная проверка каждого контрола прошла бы зелёной — дефект
// был именно в последовательности нажатий.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const AUDIO = path.resolve(__dirname, '../heys_audio_v1.js');

function loadAudio() {
  delete window.HEYS;
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(AUDIO, 'utf8'));
  return window.HEYS.audio;
}

// Что пишет тумблер листа «Советы» (day/_advice.js, toggleAdviceSoundEnabled).
function writeFromSheet(value) {
  const raw = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
  raw.adviceSoundEnabled = value;
  raw.soundEnabled = value;
  localStorage.setItem('heys_advice_settings', JSON.stringify(raw));
}

// Что пишет строка «Звук совета» в настройках (heys_app_shell_v1.js,
// toggleAdviceSound).
function writeFromSettings(value) {
  const raw = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
  const next = { ...raw };
  next.adviceSoundEnabled = value;
  next.soundEnabled = value;
  localStorage.setItem('heys_advice_settings', JSON.stringify(next));
}

// Что пишет галочка профиля (heys_user_tab_impl_v1.js, updateSetting).
// Вторая строка — та самая, которой не было до 31 августа.
function writeFromProfile(value) {
  const raw = JSON.parse(localStorage.getItem('heys_advice_settings') || '{}');
  const next = { ...raw, soundEnabled: value };
  next.adviceSoundEnabled = value;
  localStorage.setItem('heys_advice_settings', JSON.stringify(next));
}

describe('звук советов · три переключателя', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Порядок чтения — причина, по которой два имени вообще опасны. Держим его
  // по самому движку: перепишут порядок — тест скажет, и инвариант ниже станет
  // не нужен либо станет нужен наоборот.
  it('каноническое имя названо у читателя', () => {
    const src = fs.readFileSync(AUDIO, 'utf8');
    expect(
      src.includes('Каноническое имя — `adviceSoundEnabled`'),
      'из движка пропало правило «писать оба имени» — следующий вход сделают с одним',
    ).toBe(true);
  });

  it('движок читает adviceSoundEnabled раньше soundEnabled', () => {
    loadAudio();
    const src = fs.readFileSync(AUDIO, 'utf8');
    const fn = src.slice(src.indexOf('function adviceSoundEnabled'));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body.indexOf('adviceSoundEnabled')).toBeLessThan(body.indexOf("hasOwn(settings, 'soundEnabled')"));
  });

  it('галочка профиля выключает звук после того, как тумблер листа его включил', () => {
    writeFromSheet(true);
    writeFromProfile(false);
    const raw = JSON.parse(localStorage.getItem('heys_advice_settings'));
    // Оба имени должны стать false: иначе читатель возьмёт старое true.
    expect(raw.soundEnabled).toBe(false);
    expect(raw.adviceSoundEnabled, 'галочка профиля не переписала имя, которое читает движок').toBe(
      false,
    );
  });

  it('тумблер листа выключает звук после того, как галочка профиля его включила', () => {
    writeFromProfile(true);
    writeFromSheet(false);
    const raw = JSON.parse(localStorage.getItem('heys_advice_settings'));
    expect(raw.soundEnabled).toBe(false);
    expect(raw.adviceSoundEnabled).toBe(false);
  });

  it('все контролы показывают одно и то же после любой последовательности', () => {
    const steps = [
      () => writeFromSheet(false),
      () => writeFromProfile(true),
      () => writeFromSettings(false),
      () => writeFromSheet(true),
      () => writeFromProfile(false),
      () => writeFromSettings(true),
      () => writeFromProfile(true),
    ];
    for (const step of steps) {
      step();
      const raw = JSON.parse(localStorage.getItem('heys_advice_settings'));
      // Галочка профиля рисуется по soundEnabled, тумблер листа и строка
      // настроек — по adviceSoundEnabled. Разойдись они, на трёх экранах стояли
      // бы разные положения одного переключателя.
      expect(raw.soundEnabled, 'состояния контролов разошлись').toBe(raw.adviceSoundEnabled);
    }
  });

  it('галочка профиля в коде пишет оба имени', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_user_tab_impl_v1.js'), 'utf8');
    expect(
      src.includes("if (key === 'soundEnabled') newSettings.adviceSoundEnabled = value;"),
      'updateSetting снова пишет только soundEnabled — галочка профиля перестанет влиять на звук',
    ).toBe(true);
  });

  it('строка «Звук совета» в настройках в коде пишет оба имени', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../heys_app_shell_v1.js'), 'utf8');
    const body = src.slice(src.indexOf('const toggleAdviceSound ='));
    // Внутри тела есть свой try/catch, поэтому границей берём следующий за
    // функцией useEffect, а не первую закрывающую скобку.
    const scope = body.slice(0, body.indexOf('React.useEffect'));
    expect(scope).toContain('nextStored.adviceSoundEnabled = next;');
    expect(scope).toContain('nextStored.soundEnabled = next;');
  });

  it('тумблер листа в коде пишет оба имени', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../day/_advice.js'), 'utf8');
    const body = src.slice(src.indexOf('const toggleAdviceSoundEnabled'));
    const scope = body.slice(0, body.indexOf('}, [HEYSRef.store'));
    expect(scope).toContain('settings.adviceSoundEnabled = newVal;');
    expect(scope).toContain('settings.soundEnabled = newVal;');
  });
});
