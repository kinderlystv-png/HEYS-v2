/**
 * Одна политика отклика на весь продукт.
 *
 * Контракт `home-widgets.v4.dc.html`, строки «вибрация · правило продукта» и
 * «звук · правило продукта»:
 *   вибрация — два уровня (10 мс на успешную запись, двойной короткий на
 *              необратимое действие) и ничего на обычных нажатиях,
 *              переключении вкладок и открытии листов;
 *   звук     — два (капля воды и звук совета), у каждого свой переключатель,
 *              и «уменьшить движение» звук не отключает.
 *
 * До сведения в коде было семь уровней вибрации, десять образцов и десять
 * синтезаторов на пятнадцати событиях — плюс три отдельных синтезатора,
 * которые шли мимо модуля вовсе. Отклик руками не проверить, поэтому здесь
 * симуляция: модуль оживает с поддельными matchMedia / AudioContext /
 * navigator.vibrate, и тест смотрит, что именно он выдал.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_audio_v1.js'), 'utf8');
const SETTINGS_KEY = 'heys_audio_settings';

function installFakeAudioContext() {
  const log = { nodes: [] };
  const param = () => ({
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
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
      Q: param(),
    };
  };
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = { kind: 'destination' };
    }
    createGain() { return node('gain'); }
    createOscillator() { return node('osc'); }
    createBiquadFilter() { return node('filter'); }
    createBufferSource() { return node('bufferSource'); }
    createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
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

/** Загрузить модуль заново — у него есть кэш настроек и времена повторов. */
function loadFeedback(settings, adviceSettings) {
  delete window.HEYS;
  localStorage.clear();
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
  if (adviceSettings) {
    localStorage.setItem('heys_advice_settings', JSON.stringify(adviceSettings));
  }
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  document.dispatchEvent(new window.Event('click'));
  return window.HEYS;
}

function captureBuzzes() {
  const buzzes = [];
  navigator.vibrate = (pattern) => {
    buzzes.push(Array.isArray(pattern) ? pattern.slice() : [pattern]);
    return true;
  };
  return buzzes;
}

describe('политика отклика: уровни вибрации', () => {
  let log;

  beforeEach(() => {
    log = installFakeAudioContext();
    setReducedMotion(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    delete window.HEYS;
    localStorage.clear();
  });

  it('уровней ровно два — 10 мс и двойной короткий', () => {
    const HEYS = loadFeedback();
    expect(Object.keys(HEYS.feedback.LEVELS).sort()).toEqual(['double', 'tap']);
    expect(HEYS.feedback.LEVELS.tap).toEqual([10]);
    expect(HEYS.feedback.LEVELS.double.length).toBe(3);
    expect(HEYS.feedback.LEVELS.double[0]).toBe(10);
    expect(HEYS.feedback.LEVELS.double[2]).toBe(10);
  });

  it('успешная запись в данные даёт 10 мс', () => {
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    for (const event of [
      'water.sip', 'meal.added', 'supplement.taken', 'step.done',
      'checkin.step', 'form.submitted', 'document.signed', 'registration.done',
      'login.success', 'advice.hidden', 'undo', 'longpress',
    ]) {
      buzzes.length = 0;
      HEYS.feedback.emit(event);
      expect(buzzes, event).toEqual([[10]]);
    }
  });

  it('необратимое действие даёт двойной короткий', () => {
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    HEYS.feedback.emit('record.deleted');
    HEYS.feedback.emit('app.reload');
    expect(buzzes.length).toBe(2);
    expect(buzzes[0]).toEqual(HEYS.feedback.LEVELS.double);
    expect(buzzes[1]).toEqual(HEYS.feedback.LEVELS.double);
  });

  it('старый словарь уровней сведён: всё, кроме успеха и удаления, молчит', () => {
    const HEYS = loadFeedback();
    for (const legacy of [
      'light', 'medium', 'heavy', 'tick', 'selection',
      'warning', 'notification', 'caution', 'alert', 'error',
      'heartbeat', 'sos', 'countdown', 'levelUp', 'triumph',
      'reward', 'interaction', 'dismiss',
    ]) {
      expect(HEYS.feedback.levelFor(legacy), legacy).toBe(null);
    }
    expect(HEYS.feedback.levelFor('success')).toBe('tap');
    expect(HEYS.feedback.levelFor('delete')).toBe('double');
    expect(HEYS.feedback.levelFor('нет такого')).toBe(null);
  });

  it('вызов уровнем из старого словаря не вибрирует', () => {
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    HEYS.audio.haptic('light');
    HEYS.audio.haptic('medium');
    HEYS.audio.haptic('error');
    expect(buzzes).toEqual([]);
    HEYS.audio.haptic('success');
    expect(buzzes).toEqual([[10]]);
  });

  it('события вне политики отклика не дают', () => {
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    HEYS.feedback.emit('tab.switched');
    HEYS.feedback.emit('sheet.opened');
    HEYS.feedback.emit('button.tap');
    expect(buzzes).toEqual([]);
    expect(log.nodes.length).toBe(0);
  });
});

describe('политика отклика: два звука', () => {
  let log;

  beforeEach(() => {
    log = installFakeAudioContext();
    setReducedMotion(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    delete window.HEYS;
    localStorage.clear();
  });

  it('звуков в реестре ровно два — капля воды и звук совета', () => {
    const HEYS = loadFeedback();
    expect([...HEYS.audio.CATEGORIES].sort()).toEqual(['advice', 'water']);
  });

  it('снятые звуки не вернулись: запись еды, достижения, ошибка — молчат', () => {
    const HEYS = loadFeedback();
    const withSound = Object.entries(HEYS.feedback.RESPONSES)
      .filter(([, response]) => response.sound)
      .map(([event]) => event)
      .sort();
    // Только совет и одолженный им отклик сообщения куратора.
    expect(withSound).toEqual(['advice.shown', 'message.incoming', 'water.sip']);

    for (const event of ['meal.added', 'supplement.taken', 'record.deleted', 'step.done']) {
      log.nodes.length = 0;
      HEYS.feedback.emit(event);
      expect(log.nodes.length, event).toBe(0);
    }
  });

  it('переключатель один, у совета; капля идёт под общим выключателем', () => {
    // Строка «звук · правило продукта» шестнадцатой сборки: «свой переключатель
    // один, у звука совета… Капля звучит под общим выключателем звуков
    // приложения; своего тумблера у воды нет и не заводится».
    // Тумблер капли заводили 25 августа по пятнадцатой сборке и сняли в тот же
    // день, когда шестнадцатая ответила.
    let HEYS = loadFeedback(undefined, { adviceSoundEnabled: false });
    log.nodes.length = 0;
    HEYS.feedback.emit('advice.shown');
    expect(log.nodes.length).toBe(0);
    HEYS.feedback.emit('water.sip');
    expect(log.nodes.length).toBeGreaterThan(0);

    // Общий выключатель гасит оба.
    HEYS = loadFeedback({ masterEnabled: false });
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    HEYS.feedback.emit('advice.shown');
    expect(log.nodes.length).toBe(0);
  });

  it('своего тумблера у капли нет ни в настройках, ни в ярусе «Звуки»', () => {
    const audio = fs.readFileSync(path.join(WEB_DIR, 'heys_audio_v1.js'), 'utf8');
    const shell = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
    expect(audio).not.toMatch(/waterSoundEnabled\s*[:.]/);
    expect(shell).not.toContain('waterSoundEnabled');
    expect(shell).not.toContain("label: 'Капля воды'");
    // Ярус остаётся — контракт «где живёт раздел» называет его прямо, просто
    // тумблер в нём теперь один.
    expect(shell).toContain("}, 'Звуки')");
    expect(shell).toContain("label: 'Звук совета'");
  });

  it('исторический ключ soundEnabled тоже гасит совет', () => {
    const HEYS = loadFeedback(undefined, { soundEnabled: false });
    log.nodes.length = 0;
    HEYS.feedback.emit('advice.shown');
    expect(log.nodes.length).toBe(0);
  });

  it('превью настроек звучит даже при выключенном переключателе этого звука', () => {
    const HEYS = loadFeedback(undefined, { adviceSoundEnabled: false });
    log.nodes.length = 0;
    HEYS.audio.preview('water');
    expect(log.nodes.length).toBeGreaterThan(0);
    const afterWater = log.nodes.length;
    HEYS.audio.preview('advice');
    expect(log.nodes.length).toBeGreaterThan(afterWater);
  });
});

describe('политика отклика: уменьшенное движение и выключенный звук', () => {
  let log;

  beforeEach(() => {
    log = installFakeAudioContext();
    setReducedMotion(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    delete window.HEYS;
    localStorage.clear();
  });

  it('«уменьшить движение» гасит вибрацию, но не звук', () => {
    setReducedMotion(true);
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    // Строка контракта: «Правило „уменьшить движение“ звук не отключает — он не
    // движение». Вибрация — физическое движение устройства, её гасим.
    expect(buzzes).toEqual([]);
    expect(log.nodes.length).toBeGreaterThan(0);
  });

  it('общий выключатель гасит и звук, и вибрацию — так он и подписан', () => {
    const HEYS = loadFeedback({ masterEnabled: false });
    const buzzes = captureBuzzes();
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    HEYS.feedback.emit('record.deleted');
    expect(buzzes).toEqual([]);
    expect(log.nodes.length).toBe(0);
  });

  it('отдельный переключатель вибрации гасит вибрацию, но не звук', () => {
    const HEYS = loadFeedback({ hapticEnabled: false });
    const buzzes = captureBuzzes();
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    expect(buzzes).toEqual([]);
    expect(log.nodes.length).toBeGreaterThan(0);
  });

  it('тихие часы гасят звук, но не вибрацию записи', () => {
    const hour = new Date().getHours();
    const HEYS = loadFeedback({
      quietHoursEnabled: true,
      quietStart: hour,
      quietEnd: (hour + 1) % 24,
    });
    const buzzes = captureBuzzes();
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    expect(log.nodes.length).toBe(0);
    expect(buzzes).toEqual([[10]]);
  });

  it('фоновая вкладка молчит целиком', () => {
    const HEYS = loadFeedback();
    const buzzes = captureBuzzes();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    log.nodes.length = 0;
    HEYS.feedback.emit('water.sip');
    expect(buzzes).toEqual([]);
    expect(log.nodes.length).toBe(0);
  });

  it('kill switch оставляет политику живой и молчащей', () => {
    delete window.HEYS;
    localStorage.clear();
    localStorage.setItem('heys_audio_disabled', 'true');
    // eslint-disable-next-line no-new-func
    new Function(SRC)();
    const buzzes = captureBuzzes();
    expect(() => window.HEYS.feedback.emit('water.sip')).not.toThrow();
    expect(buzzes).toEqual([]);
  });
});

describe('политика отклика: единственный тумблер звука', () => {
  const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');

  it('ярус «Звуки» живёт в листе «Оформление»', () => {
    // Контракт «где живёт раздел»: «Палитра» → «Режим» → «Быстрые действия» →
    // «Звуки» (один тумблер — звук совета; у капли воды своего тумблера нет,
    // она идёт под общим выключателем звуков).
    const themePanel = shellSrc.slice(shellSrc.indexOf("label: 'Оформление'"));
    const tierAt = themePanel.indexOf("}, 'Звуки')");
    expect(tierAt).toBeGreaterThan(0);
    // Ярус идёт после «Быстрых действий», а не перед ними.
    expect(themePanel.indexOf("'Быстрые действия'")).toBeLessThan(tierAt);
  });

  it('в ярусе один тумблер — звук совета', () => {
    expect(shellSrc).toContain("label: 'Звук совета'");
    expect(shellSrc).toContain('toggleAdviceSound');
    // Тумблер капли заводили 25 августа по пятнадцатой сборке; шестнадцатая
    // ответила «своего тумблера у воды нет и не заводится» — снят в тот же день.
    expect(shellSrc).not.toContain("label: 'Капля воды'");
    expect(shellSrc).not.toContain('toggleWaterSound');
  });

  it('тумблер совета пишет оба имени поля — новое и историческое', () => {
    const fn = shellSrc.slice(shellSrc.indexOf('const toggleAdviceSound'));
    expect(fn.slice(0, 900)).toContain('nextStored.adviceSoundEnabled = next;');
    expect(fn.slice(0, 900)).toContain('nextStored.soundEnabled = next;');
  });
});

describe('политика отклика: вызовы не идут мимо неё', () => {
  /** Исходники продукта, кроме транспортов и модулей-таймеров. */
  const ALLOWED_RAW_VIBRATE = new Set([
    // Транспорт политики: она сама и её выход в платформенный API.
    'heys_audio_v1.js',
    'heys_platform_apis_v1.js',
    // Определение возможности устройства, не отклик.
    'heys_platform_features_v1.js',
    // Не трогали в этой задаче: зона параллельной сессии.
    'heys_widgets_core_v1.js',
  ]);

  function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'public' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Тренировочные и хобби-модули — таймерные сигналы, а не продуктовый
        // отклик: у них нет своего кадра в пакете дизайна (см. отчёт задачи).
        if (entry.name === 'fingers' || entry.name === 'hobby') continue;
        walk(full, out);
      } else if (entry.name.endsWith('.js') && !entry.name.includes('bundle')) {
        out.push(full);
      }
    }
    return out;
  }

  it('прямых navigator.vibrate в продукте не осталось', () => {
    const offenders = [];
    for (const file of walk(WEB_DIR)) {
      const name = path.basename(file);
      if (ALLOWED_RAW_VIBRATE.has(name)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/navigator\s*\.\s*vibrate\s*\??\.?\s*\(/.test(src)) {
        offenders.push(path.relative(WEB_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('снятые звуки не вернулись отдельными синтезаторами', () => {
    // Экраны настроения, колесо выбора и геймификация держали свои
    // AudioContext мимо HEYS.audio — их не видел ни один переключатель звука.
    const offenders = [];
    for (const file of walk(WEB_DIR)) {
      const name = path.basename(file);
      if (name === 'heys_audio_v1.js') continue;
      // Тренировочные таймеры остаются (см. отчёт): здесь только продуктовые экраны.
      if (name === 'heys_day_trainings_v1.js') continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/createOscillator\s*\(/.test(src)) offenders.push(path.relative(WEB_DIR, file));
    }
    expect(offenders).toEqual([]);
  });

  it('удаление в дневнике зовёт record.deleted, а не legacy haptic medium', () => {
    const src = fs.readFileSync(path.join(WEB_DIR, 'day/_meals.js'), 'utf8');
    const removeMealBlock = src.slice(src.indexOf('const removeMeal ='), src.indexOf('const ensureProductReadyForDayWrite ='));
    const removeItemBlock = src.slice(src.indexOf('const removeItem ='), src.indexOf('const repeatYesterdayMeal ='));
    const removePhotoBlock = src.slice(src.indexOf('const removePhoto ='), src.indexOf('const updateMealField ='));

    for (const [name, block] of [
      ['removeMeal', removeMealBlock],
      ['removeItem', removeItemBlock],
      ['removePhoto', removePhotoBlock],
    ]) {
      expect(block, name).toContain("HEYS.feedback?.emit?.('record.deleted')");
      expect(block, name).not.toMatch(/haptic\s*\(\s*['"]medium['"]\s*\)/);
    }
  });
});
