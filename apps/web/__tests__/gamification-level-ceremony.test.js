/**
 * Новый уровень · «тихая минута».
 *
 * Канвас `docs/ui/handoff-v4/canvas/Переработка дизайна приложения/
 * design_handoff_heys_v4/gamification.v4.dc.html`, блок «Новый уровень · тихая
 * минута» и четыре кадра церемонии.
 *
 * Почему смоуком. Церемонию нельзя вызвать руками: чтобы её увидеть, надо
 * набрать уровень, а он закрывается раз в несколько недель. Всё, что строки
 * контракта обещают — порядок и длительности фаз, тишина вместо звука и
 * вибрации, поведение при уменьшенном движении и обрыв при уходе с экрана, —
 * проверяется здесь симуляцией: движок оживает в happy-dom, лист монтируется
 * настоящим React, время идёт поддельными таймерами.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { act, cleanup, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_gamification_v1.js'),
  'utf8',
);
const SCREENS_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_gamification_screens_v1.js'),
  'utf8',
);
const BAR_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_gamification_bar_v1.js'),
  'utf8',
);
const CSS_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'styles', 'modules', '000-base-and-gamification.css'),
  'utf8',
);

// ─── Движок ────────────────────────────────────────────────────────────────

function loadEngine() {
  globalThis.window.HEYS = globalThis.HEYS = {
    utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
    auth: { getSessionToken: () => null, isCuratorSession: () => false },
  };
  // eslint-disable-next-line no-eval
  eval(ENGINE_SRC);
  globalThis.HEYS.game.cancelAllPendingFlushes();
  return globalThis.HEYS.game;
}

/** Начислить XP через публичный путь и дождаться debounce движка. */
function grantXP(game, amount, reason) {
  game.addXP(amount, reason);
  vi.advanceTimersByTime(200);
}

// ─── Экран ─────────────────────────────────────────────────────────────────

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
 * rAF под поддельными таймерами: церемония ждёт двух кадров, чтобы первый кадр
 * экран простоял нетронутым — иначе он открылся бы уже погасшим.
 */
function installRafOnTimers() {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

const HERO_W = 343;
const HERO_H = 168;

function stubHeroLayout() {
  Element.prototype.getBoundingClientRect = function getRect() {
    if (this.classList && this.classList.contains('game-v4-sheet__hero')) {
      return { width: HERO_W, height: HERO_H, top: 0, left: 0, right: HERO_W, bottom: HERO_H };
    }
    return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  };
}

function stubGameForScreens({ level = 18, percent = 4 } = {}) {
  const titles = [
    { min: 1, max: 16, title: 'Практик', icon: '🌱', color: '#94a3b8' },
    { min: 17, max: 17, title: 'Наставник', icon: '🌿', color: '#94a3b8' },
    { min: 18, max: 25, title: 'Эксперт', icon: '🌳', color: '#94a3b8' },
  ];
  const titleFor = (lvl) => titles.find((t) => lvl >= t.min && lvl <= t.max) || titles[0];
  globalThis.window.HEYS = globalThis.HEYS = {
    utils: {
      safeGetStreak: () => 9,
      safeGetStreakDetails: () => ({ count: 9, yesterdayForgiven: false }),
    },
    game: {
      LEVEL_TITLES: titles,
      XP_ACTIONS: { day_completed: { xp: 50, label: 'День выполнен', maxPerDay: 1 } },
      getStats: () => ({
        level,
        totalXP: 27600,
        title: titleFor(level),
        progress: { current: 100, required: 5000, percent, isMax: false },
      }),
      getProgress: () => ({ current: 100, required: 5000, percent, isMax: false }),
      getXPMultiplier: () => 1,
      getDailyMultiplier: () => ({ multiplier: 1, actions: 0 }),
      getXPBreakdown: () => ({ items: [] }),
      getAchievements: () => [],
      getAchievementCategories: () => [],
      getDailyMissions: () => null,
    },
  };
}

function loadScreens() {
  globalThis.window.React = RealReact;
  // eslint-disable-next-line no-eval
  eval(SCREENS_SRC);
  return globalThis.window.HEYS.GamificationScreens;
}

const CEREMONY = {
  from: 17,
  to: 18,
  fromTitle: 'Наставник',
  toTitle: 'Эксперт',
  fromPercent: 36,
  armedAt: Date.now(),
};

function renderSheet(Screens, { ceremony = CEREMONY, onEnd = () => {} } = {}) {
  return render(
    RealReact.createElement(Screens.GamificationSheet, {
      onClose: () => {},
      initialTab: 'levels',
      levelCeremony: ceremony,
      onLevelCeremonyEnd: onEnd,
    }),
  );
}

function sheetRoot(container) {
  return container.querySelector('.game-v4-sheet');
}

function isDimmed(container) {
  return sheetRoot(container).classList.contains('is-quiet-minute');
}

function isReturning(container) {
  return sheetRoot(container).classList.contains('is-quiet-minute-return');
}

function heroNumberText(container) {
  return container.querySelector('.game-v4-sheet__hero-metric').textContent;
}

// ─── Строки «когда играет» и «чего нет»: движок ────────────────────────────

describe('новый уровень · движок молчит и вооружает церемонию', () => {
  let game;
  let sounds;
  let notifications;
  let ceremonies;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage.clear();
    game = loadEngine();
    game.reset();
    game.cancelAllPendingFlushes();
    sounds = [];
    notifications = [];
    ceremonies = [];
    globalThis.HEYS.audio = {
      play: (event) => sounds.push(event),
      haptic: (pattern) => sounds.push(`haptic:${JSON.stringify(pattern)}`),
    };
    globalThis.HEYS.haptic = (kind) => sounds.push(`haptic:${kind}`);
    window.addEventListener('heysGameNotification', (e) => notifications.push(e.detail.type));
    window.addEventListener('heysLevelCeremony', (e) => ceremonies.push(e.detail));
  });

  afterEach(() => {
    game.cancelAllPendingFlushes();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.HEYS;
    delete globalThis.window.HEYS;
  });

  it('уровень вооружает тихую минуту и не даёт ни тоста, ни торжественного звука', () => {
    grantXP(game, 150, 'day_completed');

    expect(game.getStats().level).toBe(2);
    // Строка «когда играет»: празднование одно — тихая минута.
    expect(ceremonies).toHaveLength(1);
    expect(ceremonies[0]).toMatchObject({ from: 1, to: 2 });
    expect(typeof ceremonies[0].toTitle).toBe('string');
    expect(typeof ceremonies[0].fromPercent).toBe('number');

    // Строка «чего нет»: звука и вибрации у уровня нет. `levelUp` в
    // heys_audio_v1.js — категория triumph, а она несёт и вибрацию.
    expect(sounds).not.toContain('levelUp');
    // Строка «когда играет»: тоста «🎉 Уровень N!» нет.
    expect(notifications).not.toContain('level_up');
  });

  it('обычное начисление XP звучит как звучало — тишина только у уровня', () => {
    grantXP(game, 10, 'water_added');

    expect(game.getStats().level).toBe(1);
    expect(sounds).toContain('xpGained');
    expect(ceremonies).toHaveLength(0);
  });

  it('церемония отдаётся один раз и не догоняет через час — строка «прерывание»', () => {
    grantXP(game, 150, 'day_completed');

    const first = game.consumeLevelCeremony();
    expect(first).toMatchObject({ to: 2 });
    // Второй раз она не показывается.
    expect(game.consumeLevelCeremony()).toBe(null);

    // Никто её не забрал — через час она уже не играет.
    grantXP(game, 300, 'perfect_day');
    expect(game.getStats().level).toBeGreaterThan(2);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(game.consumeLevelCeremony()).toBe(null);
  });

  // Пятнадцатая сборка, строка «уведомления и точки входа»: «Уведомлений о
  // достижениях нет: их тридцать шесть, и каждое сообщение обесценивало бы
  // остальные», — вместе со строкой «когда играет» («У достижений и серии
  // празднования нет: достижение отмечается появлением в списке с галочкой»).
  // До неё достижение звучало фанфарой и показывало тост; проверка ровно
  // противоположная прежней и заменяет её, а не дополняет.
  it('достижение молчит: ни тоста, ни звука, ни вибрации', () => {
    // Публичный путь открытия — тот же, которым пользуется серия.
    game.checkStreakAchievements(7);

    const unlocked = game.getAchievements().filter((ach) => ach.unlocked);
    expect(unlocked.length).toBeGreaterThan(0);

    expect(notifications).not.toContain('achievement');
    expect(sounds).not.toContain('achievementUnlocked');
    expect(sounds.filter((s) => String(s).startsWith('haptic:'))).toHaveLength(0);
    // Уровень при этом мог закрыться от XP достижений — его тихая минута
    // остаётся: молчит достижение, а не весь движок.
    expect(notifications).not.toContain('level_up');
  });

  it('звука уровня в движке не осталось вовсе — строка «чего нет»', () => {
    expect(ENGINE_SRC).not.toContain("'levelUp'");
    expect(ENGINE_SRC).not.toContain("'achievementUnlocked'");
  });
});

// ─── Строка «ход по времени» ───────────────────────────────────────────────

describe('тихая минута · ход по времени', () => {
  let Screens;
  let T;

  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
    installRafOnTimers();
    stubHeroLayout();
    stubGameForScreens();
    Screens = loadScreens();
    T = Screens.CEREMONY_TIMELINE;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.window.HEYS;
  });

  it('числа хода по времени — ровно те, что в строке контракта', () => {
    // «0 мс — … за 200 мс · 200–620 мс — число · 300–1200 мс — линия ·
    //  1200–1500 мс — линия гаснет … Всего 1,5 с».
    expect(T.dimMs).toBe(200);
    expect(T.rollStartMs).toBe(200);
    expect(T.rollStartMs + T.rollMs).toBe(620);
    expect(T.lineStartMs).toBe(300);
    expect(T.lineStartMs + T.lineMs).toBe(1200);
    expect(T.returnStartMs).toBe(1200);
    expect(T.returnStartMs + T.returnMs).toBe(1500);
    expect(T.totalMs).toBe(1500);
  });

  it('CSS повторяет те же длительности, а не свои', () => {
    expect(CSS_SRC).toContain('animation: gameV4QuietRing 900ms');
    expect(CSS_SRC).toContain('cubic-bezier(0.33, 0, 0.2, 1) 300ms forwards');
    expect(CSS_SRC).toMatch(/gameV4QuietNumOut 420ms/);
    expect(CSS_SRC).toMatch(/gameV4QuietNumIn 420ms/);
    // Гашение 200 мс, возврат 300 мс.
    expect(CSS_SRC).toMatch(
      /\.game-v4-sheet\.is-quiet-minute [\s\S]{0,400}?opacity: 0\.2;\s*transition: opacity 200ms ease;/,
    );
    expect(CSS_SRC).toMatch(
      /\.game-v4-sheet\.is-quiet-minute-return [\s\S]{0,400}?transition: opacity 300ms ease;/,
    );
    expect(CSS_SRC).toMatch(
      /game-v4-sheet__hero-ring \{[\s\S]{0,200}?transition: opacity 300ms linear;/,
    );
    // Вне минуты лист не получает ни одного нового перехода: переходы висят
    // только на её классах.
    expect(CSS_SRC).not.toMatch(/^\.game-v4-sheet__panel > \*:not\(\.game-v4-sheet__hero\) \{/m);
  });

  it('фазы идут по порядку: кадр покоя → гашение и перекат → линия гаснет → экран вернулся', () => {
    const onEnd = vi.fn();
    const { container } = renderSheet(Screens, { onEnd });

    // Первый кадр карточка стоит нетронутой — иначе гасить было бы нечего.
    expect(isDimmed(container)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(40);
    }); // два кадра rAF
    // 0 мс: гашение включилось, число на карточке ещё старое.
    expect(isDimmed(container)).toBe(true);
    expect(heroNumberText(container)).toContain('17');
    expect(heroNumberText(container)).toContain('Наставник');
    expect(container.querySelector('.game-v4-sheet__hero-num--roll')).toBeNull();
    // Линия уже в разметке — её собственная задержка 300 мс живёт в CSS.
    expect(container.querySelector('.game-v4-sheet__hero-ring')).not.toBeNull();

    // 200 мс: число перекатывается, титул сменился без движения.
    act(() => {
      vi.advanceTimersByTime(T.rollStartMs);
    });
    const roll = container.querySelector('.game-v4-sheet__hero-num--roll');
    expect(roll).not.toBeNull();
    expect(roll.querySelector('.game-v4-sheet__hero-num-out').textContent).toBe('17');
    expect(roll.querySelector('.game-v4-sheet__hero-num-in').textContent).toBe('18');
    expect(heroNumberText(container)).toContain('Эксперт');
    expect(container.querySelector('.game-v4-sheet__hero-ring.is-fading')).toBeNull();

    // 1200 мс: линия гаснет, экран возвращается к полной яркости.
    act(() => {
      vi.advanceTimersByTime(T.returnStartMs - T.rollStartMs);
    });
    expect(isDimmed(container)).toBe(false);
    expect(isReturning(container)).toBe(true);
    expect(container.querySelector('.game-v4-sheet__hero-ring.is-fading')).not.toBeNull();
    expect(onEnd).not.toHaveBeenCalled();

    // 1500 мс: минута кончилась, от церемонии не осталось разметки.
    act(() => {
      vi.advanceTimersByTime(T.totalMs - T.returnStartMs);
    });
    expect(isReturning(container)).toBe(false);
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(container.querySelector('.game-v4-sheet__hero-num--roll')).toBeNull();
    expect(heroNumberText(container)).toContain('18');
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('полоса стоит на прежней ступени и начинается с новой, когда экран вернулся', () => {
    const { container } = renderSheet(Screens);
    const fill = () => container.querySelector('.game-v4-sheet__bar-fill').style.width;

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(fill()).toBe('36%');
    act(() => {
      vi.advanceTimersByTime(T.returnStartMs);
    });
    expect(fill()).toBe('36%');
    act(() => {
      vi.advanceTimersByTime(T.totalMs - T.returnStartMs);
    });
    expect(fill()).toBe('4%');

    // Строка «чего нет»: отдельной анимации у полосы нет — она просто
    // перескакивает на новую ступень.
    expect(CSS_SRC).toMatch(/\.game-v4-sheet__bar-fill \{[^}]*\}/);
    const barFillRule = CSS_SRC.match(/\.game-v4-sheet__bar-fill \{[^}]*\}/)[0];
    expect(barFillRule).not.toMatch(/transition|animation/);
  });
});

// ─── Строка «вид линии» ────────────────────────────────────────────────────

describe('тихая минута · вид линии', () => {
  let Screens;

  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
    installRafOnTimers();
    stubHeroLayout();
    stubGameForScreens();
    Screens = loadScreens();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.window.HEYS;
  });

  it('линия начинается в верхнем центре и идёт по часовой, радиус карточки 26, толщина 1,4', () => {
    expect(Screens.CEREMONY_LINE_WIDTH).toBe(1.4);
    expect(Screens.CEREMONY_CARD_RADIUS).toBe(26);

    const d = Screens.buildCeremonyRingPath(HERO_W, HERO_H);
    const inset = Screens.CEREMONY_LINE_WIDTH / 2;
    const midX = inset + (HERO_W - inset * 2) / 2;
    // Старт — верхний центр.
    expect(d.startsWith(`M ${midX} ${inset}`)).toBe(true);
    // Первый ход — вправо: по часовой.
    expect(d).toContain(`L ${HERO_W - inset - (26 - inset)} ${inset}`);
    // Все дуги в положительном направлении развёртки (sweep-flag = 1).
    const arcs = d.match(/A [\d.]+ [\d.]+ 0 0 1 /g) || [];
    expect(arcs).toHaveLength(4);
    // Радиус дуги — радиус карточки за вычетом половины толщины, чтобы внешний
    // край обводки лёг ровно на край карточки и не сдвинул её.
    expect(d).toContain(`A ${26 - inset} ${26 - inset} 0 0 1`);
    // Путь замкнулся ровно там, где начался — один проход.
    expect(d.endsWith(`L ${midX} ${inset}`)).toBe(true);
  });

  it('штрих равен длине пути — один проход, второго круга нет', () => {
    const len = Screens.ceremonyRingLength(HERO_W, HERO_H);
    const inset = Screens.CEREMONY_LINE_WIDTH / 2;
    const w = HERO_W - inset * 2;
    const h = HERO_H - inset * 2;
    const r = 26 - inset;
    expect(len).toBeCloseTo(2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r, 6);

    const { container } = renderSheet(Screens);
    act(() => {
      vi.advanceTimersByTime(40);
    });
    const p = container.querySelector('.game-v4-sheet__hero-ring-path');
    expect(p.style.getPropertyValue('--ring-len')).toBe(String(len));
    // dasharray и стартовый сдвиг равны длине — линия не может пойти на второй
    // круг, а `forwards` оставляет её дорисованной.
    expect(CSS_SRC).toMatch(/stroke-dasharray: var\(--ring-len\);/);
    expect(CSS_SRC).toMatch(/stroke-dashoffset: var\(--ring-len\);/);
    expect(CSS_SRC).toMatch(/@keyframes gameV4QuietRing \{\s*to \{\s*stroke-dashoffset: 0;/);
    expect(CSS_SRC).not.toMatch(/gameV4QuietRing[^;]*infinite/);
  });

  it('тон линии взят ролью, концы скруглены, а карточка не поехала', () => {
    const rule = CSS_SRC.match(/\.game-v4-sheet__hero-ring-path \{[^}]*\}/)[0];
    expect(rule).toContain('stroke: var(--v4-act, #c67139)');
    expect(rule).toContain('stroke-width: 1.4');
    expect(rule).toContain('stroke-linecap: round');
    expect(rule).toContain('fill: none');

    // Заливка карточки, тени и геометрия при церемонии не меняются: класс
    // добавляет только систему координат для линии и обрезку по радиусу.
    const heroRule = CSS_SRC.match(/\.game-v4-sheet__hero--cream\.is-quiet-minute \{[^}]*\}/)[0];
    expect(heroRule).toMatch(/position: relative;/);
    expect(heroRule).not.toMatch(/background|box-shadow|border-radius|padding|margin|transform/);
    // Названное отступление от кадра «· 1200 мс»: карточка не получает
    // `overflow: hidden` — обрезка съела бы внешнюю половину штриха, а за
    // скругление путь всё равно не выходит.
    expect(heroRule).not.toMatch(/overflow/);
  });
});

// ─── Строка «уменьшенное движение · тихая минута» ──────────────────────────

describe('тихая минута · уменьшенное движение', () => {
  let Screens;

  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(true);
    installRafOnTimers();
    stubHeroLayout();
    stubGameForScreens();
    Screens = loadScreens();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.window.HEYS;
  });

  it('гашение и линия не проигрываются вовсе, число меняется мгновенно', () => {
    const onEnd = vi.fn();
    const { container } = renderSheet(Screens, { onEnd });

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(isDimmed(container)).toBe(false);
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(container.querySelector('.game-v4-sheet__hero-num--roll')).toBeNull();

    // Момент остаётся в том, что число другое — оно новое сразу.
    expect(heroNumberText(container)).toContain('18');
    expect(heroNumberText(container)).toContain('Эксперт');
    expect(container.querySelector('.game-v4-sheet__bar-fill').style.width).toBe('4%');

    // Ни одна фаза не запускается и через полторы секунды.
    act(() => {
      vi.advanceTimersByTime(Screens.CEREMONY_TIMELINE.totalMs);
    });
    expect(isDimmed(container)).toBe(false);
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(onEnd).toHaveBeenCalled();
  });

  it('празднование настройка не отменяет: экран «Уровни» открыт', () => {
    const { container } = renderSheet(Screens);
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(container.querySelector('.game-v4-sheet__header-title').textContent).toBe('Уровни');
  });
});

// ─── Строка «прерывание» ───────────────────────────────────────────────────

describe('тихая минута · прерывание', () => {
  let Screens;
  let T;

  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
    installRafOnTimers();
    stubHeroLayout();
    stubGameForScreens();
    Screens = loadScreens();
    T = Screens.CEREMONY_TIMELINE;
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.window.HEYS;
  });

  it('ушёл в фон посреди минуты — она не доигрывается', () => {
    const onEnd = vi.fn();
    const { container } = renderSheet(Screens, { onEnd });
    act(() => {
      vi.advanceTimersByTime(40 + T.rollStartMs);
    });
    expect(container.querySelector('.game-v4-sheet__hero-ring')).not.toBeNull();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    expect(isDimmed(container)).toBe(false);
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);

    // И оставшиеся фазы уже не срабатывают.
    act(() => {
      vi.advanceTimersByTime(T.totalMs);
    });
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
    // Экран остаётся на новом уровне: напоминать больше нечем.
    expect(heroNumberText(container)).toContain('18');
  });

  it('ушёл с экрана на другую вкладку листа — минута обрывается там же', () => {
    const onEnd = vi.fn();
    const { container } = renderSheet(Screens, { onEnd });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(isDimmed(container)).toBe(true);

    const progressTab = [...container.querySelectorAll('.game-v4-sheet__tab')].find(
      (b) => b.textContent === 'Прогресс',
    );
    act(() => {
      progressTab.click();
    });

    expect(isDimmed(container)).toBe(false);
    expect(container.querySelector('.game-v4-sheet__hero-ring')).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('лист закрыли посреди минуты — таймеры не переживают размонтирование', () => {
    const onEnd = vi.fn();
    const { unmount, container } = renderSheet(Screens, { onEnd });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(container.querySelector('.game-v4-sheet__hero-ring')).not.toBeNull();

    act(() => {
      unmount();
    });
    expect(() => {
      vi.advanceTimersByTime(T.totalMs);
    }).not.toThrow();
  });
});

// ─── Строка «когда играет»: минута положена каждому уровню ─────────────────

describe('тихая минута · где она играет', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.window.HEYS;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
    installRafOnTimers();
    stubHeroLayout();
  });

  it('лист уже открыт на «Прогрессе» — уровень переводит его на «Уровни»', () => {
    stubGameForScreens();
    const Screens = loadScreens();
    const { container, rerender } = render(
      RealReact.createElement(Screens.GamificationSheet, {
        onClose: () => {},
        initialTab: 'progress',
        levelCeremony: null,
        onLevelCeremonyEnd: () => {},
      }),
    );
    expect(container.querySelector('.game-v4-sheet__header-title').textContent).toBe('Прогресс');

    act(() => {
      rerender(
        RealReact.createElement(Screens.GamificationSheet, {
          onClose: () => {},
          initialTab: 'progress',
          levelCeremony: CEREMONY,
          onLevelCeremonyEnd: () => {},
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(container.querySelector('.game-v4-sheet__header-title').textContent).toBe('Уровни');
    expect(isDimmed(container)).toBe(true);
  });

  it('первый день — «Уровни» на время минуты открываются и не захлопываются в её конце', () => {
    // Первая ветка листа прячет «Уровни», но второй уровень случается ещё в
    // первый день, а строка «когда играет» обещает минуту каждому уровню.
    stubGameForScreens({ level: 2, percent: 4 });
    globalThis.HEYS.utils.safeGetStreak = () => 0;
    globalThis.HEYS.utils.safeGetStreakDetails = () => ({ count: 0, yesterdayForgiven: false });
    const Screens = loadScreens();
    const { container } = renderSheet(Screens, {
      ceremony: { from: 1, to: 2, fromTitle: 'Новичок', toTitle: 'Практик', fromPercent: 88 },
    });

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(container.querySelector('.game-v4-sheet__header-title').textContent).toBe('Уровни');

    // Минута кончилась — экран остаётся на новом уровне, а не отскакивает.
    act(() => {
      vi.advanceTimersByTime(Screens.CEREMONY_TIMELINE.totalMs);
    });
    expect(container.querySelector('.game-v4-sheet__header-title').textContent).toBe('Уровни');
    expect(heroNumberText(container)).toContain('2');
  });
});

// ─── Шапка: громкого празднования уровня больше нет ────────────────────────

describe('новый уровень · шапка', () => {
  it('модалка «Новый уровень!» и тост уровня сняты, лист открывается на «Уровнях»', () => {
    // Строка «чего нет»: вспышки, значка и кнопки «Продолжить» больше нет.
    expect(BAR_SRC).not.toContain('level-up-modal');
    expect(BAR_SRC).not.toContain('Новый уровень!');
    expect(BAR_SRC).not.toContain("notification.type === 'level_up'");
    // Строка «когда играет»: уровень открывает лист именно на «Уровнях».
    expect(BAR_SRC).toContain("window.addEventListener('heysLevelCeremony', handleLevelCeremony)");
    expect(BAR_SRC).toContain("initialTab: levelCeremony ? 'levels' : 'progress'");
    // Правило тоста уровня ушло вместе с тостом.
    expect(CSS_SRC).not.toContain('.game-notification.level_up');
  });
});
