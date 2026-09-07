import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const CSS = read('../styles/modules/000-base-and-gamification.css');
const SCREENS = read('../heys_gamification_screens_v1.js');

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return CSS.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || '';
};

describe('gamification v4 · ink-2 ladder', () => {
  it.each([
    '.game-v4-sheet__streak-bar-caption',
    '.game-v4-sheet__card-sub',
    '.game-v4-sheet__card-meta',
    '.game-v4-sheet__level-floor-hint',
    '.game-v4-sheet__level-line-hint',
    '.game-v4-sheet__ach-cond',
    '.game-v4-sheet__ladder-xp',
    '.game-v4-sheet__xp-value',
    '.game-v4-sheet__footnote',
  ])('%s uses ink-2 for auxiliary captions', (selector) => {
    expect(rule(selector)).toContain('var(--v4-ink-2');
  });

  it('.game-v4-sheet__hero-muted uses ink-2 at 12.5px per frame ·08', () => {
    const heroMuted = rule('.game-v4-sheet__hero-muted');
    expect(heroMuted).toContain('font-size: 12.5px');
    expect(heroMuted).toContain('var(--v4-ink-2');
  });

  it('.game-v4-sheet__ach-name держит полные чернила по строке «Достижения · 15»', () => {
    // Проверка стояла на ink-2 со ссылкой на строку ·15 пакета 43, но сама
    // строка просит другое: «„Клетчатка-чемпион“ — шрифт 700 13px/1.3 Figtree,
    // цвет var(--tx)», то есть полные чернила. Имя достижения — название строки,
    // а не подпись под ней; на вспомогательной ступени 12,5/700 читалось как
    // подпись. Кадр разбора говорит то же (#201e1d), и до этой правки два наших
    // теста требовали друг против друга.
    const achName = rule('.game-v4-sheet__ach-name');
    expect(achName).toContain('font-size: 12.5px');
    expect(achName).toContain('font-weight: 700');
    expect(achName).toContain('var(--v4-ink,');
  });

  it('keeps mission progress captions contextual instead of changing every card', () => {
    const heroMeta = rule('.game-v4-sheet__hero .game-v4-sheet__card-meta');
    expect(heroMeta).toContain('margin-top: 11px');
    expect(heroMeta).toContain('font-size: 11px');
    expect(heroMeta).toContain('font-weight: 600');

    const missionMeta = rule('.game-v4-sheet__mission-card .game-v4-sheet__card-meta');
    expect(missionMeta).toContain('margin-top: 9px');
  });

  it('keeps the first-day level row separated from achievement groups', () => {
    expect(CSS).toMatch(/\.game-v4-sheet__level-line\s*\{[^}]*margin-top:\s*18px/);
  });
});

describe('gamification v4 · 31 August scope decisions', () => {
  it('keeps closest achievement on Achievements and not on Progress', () => {
    const progress = SCREENS.slice(
      SCREENS.indexOf('function ProgressTab'),
      SCREENS.indexOf('function renderNearAchievement'),
    );
    const achievements = SCREENS.slice(
      SCREENS.indexOf('function AchievementsTab'),
      SCREENS.indexOf('function buildLevelLadder'),
    );
    expect(progress).not.toContain("'Ближе всего'");
    expect(achievements).toContain("'Ближе всего'");
  });

  it('does not turn canvas rule annotations into product copy', () => {
    expect(SCREENS).not.toContain('В группе показываются достигнутые и два ближайших');
    expect(SCREENS).not.toContain('Работают все 17 действий. Показаны восемь строк');
  });

  it('renders the more-groups action with canvas geometry and chevron', () => {
    const moreGroups = rule('.game-v4-sheet__more-groups');
    expect(moreGroups).toContain('align-items: center');
    expect(moreGroups).toContain('justify-content: space-between');
    expect(moreGroups).toContain('border-radius: 20px');
    expect(moreGroups).toContain('padding: 16px 18px');
    expect(moreGroups).toContain('margin-top: 14px');
    expect(SCREENS).toContain("d: 'M9 6l6 6-6 6'");
  });
});
