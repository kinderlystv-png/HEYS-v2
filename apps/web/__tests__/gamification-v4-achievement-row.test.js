/**
 * Сверка строки контракта gamification «вид строки достижения» (пятнадцатая
 * сборка): «достижения списком: строка — поля 13/0 px, разделитель 1 px тоном
 * чернил 7 %, слева квадрат 34 px радиусом 12, зазор 13; справа название
 * 12,5 px/700 чернилами, под ним через 5 условие 11 px/500 тоном чернил 42 %,
 * у правого края награда «+N XP» 11 px/700 тоном --ac без переноса.
 * Достигнутое: квадрат --gr-bg с галочкой 16 px обводкой 3,2 тоном --gr.
 * Недостигнутое: квадрат --c2 с замком 15 px обводкой 2,5 тоном чернил 30 %.
 * Гашения текста и дат в строках нет».
 *
 * Почему смоуком, а не глазами. Экран показывает три группы из восьми, и в
 * каждой — только достигнутые плюс два ближайших недостигнутых. Чтобы увидеть
 * рядом достигнутую и недостигнутую строку, человеку нужна уже накопленная
 * картина достижений; собрать её по требованию нельзя. Здесь она задаётся
 * заглушкой движка, а лист монтируется настоящим React.
 *
 * Почему вычисленным стилем, а не грепом по CSS. В файле выше по каскаду живут
 * правила legacy-экрана достижений; грепом видно объявление, а не победителя.
 *
 * Отступление от кадров названо вслух (контракт старше кадра): кадр
 * «Достижения» у недостигнутой строки награду не рисует вовсе и гасит название
 * до 50 %. Строка контракта требует награду у правого края без оговорки про
 * достигнутость и прямо запрещает гашение — иначе два недостигнутых нельзя
 * сравнить по цене. Верна строка.
 */
import fs from 'node:fs';
import path from 'node:path';

import * as RealReact from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

const SCREENS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_gamification_screens_v1.js'), 'utf8');

const CSS_FILES = [
  'styles/modules/002-ui-v4-palette-roles.css',
  'styles/modules/000-base-and-gamification.css',
];

const SETS = ['sand', 'sand-dark', 'blue', 'blue-dark'];
const PALETTE_OF = { sand: 'sand', 'sand-dark': 'sand', blue: 'blue', 'blue-dark': 'blue' };

// Роли канваса по наборам — v4-canvas.css пакета дизайна.
// Лист прогресса — «painted module»: решением владельца от 2026-08-12 он
// держит песочный вид на всех наборах, поэтому поверхность, чернила названия и
// акцент награды берутся из закреплённых ролей --v4-sand-* и за палитрой не
// следуют. «Тёплый вид» в тёмном наборе — это тёмный тёплый: в обоих тёмных
// наборах семейство --v4-sand-* держит одни и те же тёмные значения. В
// сине-тёмной оно было копией светлого до 31.08 (cbf713f1f): светлая плашка со
// светлыми чернилами на тёмном экране, контраст 1,0. Здесь колонка blue-dark
// повторяет sand-dark именно поэтому, а не по совпадению.
// Меняются по наборам только зелёные роли медальона — канвасные --gr-bg и --gr.
const SAND_TX = { sand: '#201e1d', 'sand-dark': '#f2ede6', blue: '#201e1d', 'blue-dark': '#f2ede6' };
const SAND_AC = { sand: '#8a4a20', 'sand-dark': '#e2a468', blue: '#8a4a20', 'blue-dark': '#e2a468' };
const SAND_C1 = { sand: '#f7efe2', 'sand-dark': '#23201b', blue: '#f7efe2', 'blue-dark': '#23201b' };
const SAND_C2 = { sand: '#efe3cf', 'sand-dark': '#2f2820', blue: '#efe3cf', 'blue-dark': '#2f2820' };
const GR_BG = { sand: '#eaefe0', 'sand-dark': '#242c20', blue: '#e4efe7', 'blue-dark': '#17302a' };
const GR = { sand: '#5c6a45', 'sand-dark': '#9fb981', blue: '#1f6e4d', 'blue-dark': '#7fd1a0' };

function norm(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'transparent' || raw === 'initial' || raw === 'rgba(0, 0, 0, 0)') return 'none';
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!rgb) return raw;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return '#' + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
}

function applySet(id) {
  document.documentElement.setAttribute('data-theme-id', id);
  document.documentElement.setAttribute(
    'data-theme',
    PALETTE_OF[id] + (id.endsWith('dark') ? '-dark' : ''),
  );
}

// Группа «Серия»: две достигнутые строки и две недостигнутые с разной ценой —
// ровно та картина, ради которой награда вернулась в списки групп.
const ACHIEVEMENTS = [
  { id: 'streak_3', name: 'Три дня подряд', desc: 'Серия не меньше трёх дней', xp: 40, category: 'streak', unlocked: true },
  { id: 'streak_5', name: 'Пять дней подряд', desc: 'Серия не меньше пяти дней', xp: 60, category: 'streak', unlocked: true },
  { id: 'streak_7', name: 'Семь дней подряд', desc: 'Серия не меньше семи дней', xp: 150, category: 'streak', unlocked: false, progress: { current: 5, target: 7 } },
  { id: 'streak_14', name: 'Две недели подряд', desc: 'Серия не меньше четырнадцати дней', xp: 300, category: 'streak', unlocked: false, progress: { current: 5, target: 14 } },
];

function stubGame() {
  globalThis.window.HEYS = globalThis.HEYS = {
    utils: {
      safeGetStreak: () => 5,
      safeGetStreakDetails: () => ({ count: 5, yesterdayForgiven: false }),
    },
    game: {
      LEVEL_TITLES: [{ min: 1, max: 25, title: 'Практик', icon: '🌱', color: '#94a3b8' }],
      XP_ACTIONS: {},
      ACHIEVEMENTS: Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])),
      getStats: () => ({
        level: 6,
        totalXP: 1240,
        unlockedCount: 2,
        totalAchievements: 36,
        progress: { current: 100, required: 500, percent: 20, isMax: false },
      }),
      getProgress: () => ({ current: 100, required: 500, percent: 20, isMax: false }),
      getXPMultiplier: () => 1,
      getDailyMultiplier: () => ({ multiplier: 1, actions: 0 }),
      getXPBreakdown: () => ({ items: [] }),
      getAchievements: () => ACHIEVEMENTS,
      getAchievementCategories: () => [{ id: 'streak', name: 'Серия', achievements: ACHIEVEMENTS.map((a) => a.id) }],
      getInProgressAchievements: () => [],
      getDailyMissions: () => null,
      isAchievementUnlocked: (id) => !!ACHIEVEMENTS.find((a) => a.id === id && a.unlocked),
    },
  };
}

function loadScreens() {
  globalThis.window.React = RealReact;
  // eslint-disable-next-line no-eval
  eval(SCREENS_SRC);
  return globalThis.window.HEYS.GamificationScreens;
}

function renderAchievements() {
  const Screens = loadScreens();
  const { container } = render(
    RealReact.createElement(Screens.GamificationSheet, {
      onClose: () => {},
      initialTab: 'achievements',
    }),
  );
  return container;
}

function rows(container) {
  return [...container.querySelectorAll('.game-v4-sheet__ach-row')];
}

function rowByName(container, name) {
  return rows(container).find(
    (el) => el.querySelector('.game-v4-sheet__ach-name').textContent === name,
  );
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const style = document.createElement('style');
  style.textContent = CSS_FILES.map((rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8')).join('\n');
  document.head.appendChild(style);
});

beforeEach(() => {
  applySet('sand');
  stubGame();
});

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
  delete globalThis.window.HEYS;
});

describe('gamification · «вид строки достижения»', () => {
  it('достижения идут списком строк, а не стопкой карточек', () => {
    const container = renderAchievements();

    expect(rows(container)).toHaveLength(4);
    expect(container.querySelector('.game-v4-sheet__ach-card')).toBe(null);

    const list = container.querySelector('.game-v4-sheet__ach-list');
    const cs = window.getComputedStyle(list);
    expect(cs.borderRadius).toBe('20px');
    expect(cs.paddingTop).toBe('2px');
    expect(cs.paddingLeft).toBe('16px');
  });

  it('строка — поля 13/0, зазор 13, разделитель 1 px; у последней его нет', () => {
    const container = renderAchievements();
    const all = rows(container);
    const cs = window.getComputedStyle(all[0]);

    expect(cs.paddingTop).toBe('13px');
    expect(cs.paddingBottom).toBe('13px');
    expect(cs.paddingLeft).toBe('0px');
    expect(cs.gap).toBe('13px');
    expect(cs.borderBottomWidth).toBe('1px');
    expect(window.getComputedStyle(all[all.length - 1]).borderBottomWidth).toBe('0px');
  });

  it('квадрат 34 радиусом 12; значок достигнутого — галочка 16/3,2, закрытого — замок 15/2,5', () => {
    const container = renderAchievements();
    const done = rowByName(container, 'Три дня подряд');
    const todo = rowByName(container, 'Семь дней подряд');

    for (const row of [done, todo]) {
      const medal = window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-medal'));
      expect(medal.width).toBe('34px');
      expect(medal.height).toBe('34px');
      expect(medal.borderRadius).toBe('12px');
    }

    const check = done.querySelector('svg');
    expect(check.getAttribute('width')).toBe('16');
    expect(check.getAttribute('stroke-width')).toBe('3.2');
    const lock = todo.querySelector('svg');
    expect(lock.getAttribute('width')).toBe('15');
    expect(lock.getAttribute('stroke-width')).toBe('2.5');
  });

  it('название 12,5/700, условие 11/500 через 5, награда 11/700 без переноса', () => {
    const container = renderAchievements();
    const row = rowByName(container, 'Три дня подряд');

    const name = window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-name'));
    expect(name.fontSize).toBe('12.5px');
    expect(name.fontWeight).toBe('700');

    const cond = window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-cond'));
    expect(cond.fontSize).toBe('11px');
    expect(cond.fontWeight).toBe('500');
    expect(cond.marginTop).toBe('5px');

    const xp = window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-xp'));
    expect(xp.fontSize).toBe('11px');
    expect(xp.fontWeight).toBe('700');
    expect(xp.whiteSpace).toBe('nowrap');
  });

  // Ради чего строка менялась: прежняя редакция убирала цену из списков групп,
  // и два недостигнутых нельзя было сравнить по цене.
  it('награда стоит в каждой строке, в том числе у недостигнутых', () => {
    const container = renderAchievements();

    expect(rowByName(container, 'Три дня подряд').querySelector('.game-v4-sheet__ach-xp').textContent).toBe('+40 XP');
    expect(rowByName(container, 'Семь дней подряд').querySelector('.game-v4-sheet__ach-xp').textContent).toBe('+150 XP');
    expect(rowByName(container, 'Две недели подряд').querySelector('.game-v4-sheet__ach-xp').textContent).toBe('+300 XP');
    for (const row of rows(container)) {
      expect(row.querySelector('.game-v4-sheet__ach-xp')).not.toBe(null);
    }
  });

  it('гашения нет: у недостигнутого те же чернила и тот же акцент, что у достигнутого', () => {
    const container = renderAchievements();
    const done = rowByName(container, 'Три дня подряд');
    const todo = rowByName(container, 'Семь дней подряд');

    const nameOf = (row) => norm(window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-name')).color);
    const xpOf = (row) => norm(window.getComputedStyle(row.querySelector('.game-v4-sheet__ach-xp')).color);

    expect(nameOf(todo)).toBe(nameOf(done));
    expect(xpOf(todo)).toBe(xpOf(done));
  });

  it('условие видно и у недостигнутого, и несёт остаток до выполнения', () => {
    const container = renderAchievements();
    const todo = rowByName(container, 'Семь дней подряд');

    expect(todo.querySelector('.game-v4-sheet__ach-cond').textContent).toBe(
      'Серия не меньше семи дней · 5 из 7',
    );
  });

  it.each(SETS)('%s: тона строки — роли, а не литералы', (id) => {
    applySet(id);
    const container = renderAchievements();
    const done = rowByName(container, 'Три дня подряд');
    const todo = rowByName(container, 'Семь дней подряд');

    expect(norm(window.getComputedStyle(container.querySelector('.game-v4-sheet__ach-list')).backgroundColor)).toBe(SAND_C1[id]);
    expect(norm(window.getComputedStyle(done.querySelector('.game-v4-sheet__ach-name')).color)).toBe(SAND_TX[id]);
    expect(norm(window.getComputedStyle(done.querySelector('.game-v4-sheet__ach-xp')).color)).toBe(SAND_AC[id]);

    // Обводка значка идёт currentColor — цвет живёт ролью на медальоне.
    const doneMedal = window.getComputedStyle(done.querySelector('.game-v4-sheet__ach-medal'));
    expect(norm(doneMedal.backgroundColor)).toBe(GR_BG[id]);
    expect(norm(doneMedal.color)).toBe(GR[id]);

    // Пары ролей не смешиваются: под песочным квадратом замка стоят песочные
    // чернила — семейство --v4-sand-* светлеет и темнеет целиком, а роль из
    // набора под ним за ним не следует.
    const todoMedal = window.getComputedStyle(todo.querySelector('.game-v4-sheet__ach-medal'));
    expect(norm(todoMedal.backgroundColor)).toBe(SAND_C2[id]);
    expect(norm(todoMedal.color)).toBe(SAND_TX[id]);
    expect(window.getComputedStyle(todo.querySelector('.game-v4-sheet__ach-medal svg')).opacity).toBe('0.3');
  });
});
