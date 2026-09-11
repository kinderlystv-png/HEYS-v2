// Строка контракта settings-system.v4 «ярус «Приложение» · пять рядов»: ряды
// в порядке Оформление, Домашняя вкладка, Подписка, Обзор приложения, Звук и
// время напоминаний. «Подписка» стояла первой в ярусе — тест сторожит порядок
// тех рядов, что в продукте есть («Обзор приложения» не построен, см.
// UI_V4_FINDINGS «settings-app-tier-rows-conflict»).
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SHELL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_app_shell_v1.js'), 'utf8');

describe('настройки · ярус «Приложение» по порядку строки контракта', () => {
  const groupIdx = SHELL_SRC.indexOf("renderSettingsGroup('app', 'Приложение'");
  const nextGroupIdx = SHELL_SRC.indexOf("renderSettingsGroup('", groupIdx + 1);
  const tier = SHELL_SRC.slice(groupIdx, nextGroupIdx);
  const at = (key) => tier.indexOf(`key: '${key}'`);

  it('ряды яруса лежат внутри него', () => {
    expect(groupIdx).toBeGreaterThan(-1);
    for (const key of ['theme', 'subscription', 'notify']) expect(at(key), key).toBeGreaterThan(-1);
  });

  it('Оформление → Подписка → Обзор приложения → Звук и время', () => {
    expect(at('theme')).toBeLessThan(at('subscription'));
    expect(at('subscription')).toBeLessThan(at('tour'));
    expect(at('tour')).toBeLessThan(at('notify'));
    expect(SHELL_SRC.match(/key: 'subscription'/g)).toHaveLength(1);
  });

  it('«Обзор приложения» запускает обзор из настроек с первого шага', () => {
    const row = tier.slice(at('tour'), tier.indexOf('}),', at('tour')));
    expect(row).toContain("label: 'Обзор приложения'");
    expect(row).toContain('start?.({ force: true, fromSettings: true })');
  });
});

describe('настройки · ярус «Вы» — «Дневник · N из M блоков»', () => {
  const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
  const youIdx = SHELL_SRC.indexOf("renderSettingsGroup('you', 'Вы'");
  const you = SHELL_SRC.slice(youIdx, SHELL_SRC.indexOf("renderSettingsGroup('", youIdx + 1));

  it('строка стоит между «Профиль и цели» и «Мои продукты», как в кадре', () => {
    expect(you.indexOf("key: 'profile'")).toBeLessThan(you.indexOf("key: 'diary'"));
    expect(you.indexOf("key: 'diary'")).toBeLessThan(you.indexOf("key: 'products'"));
  });

  it('счёт берётся из тех же чипов вкладки «Питание», а не своей копией', () => {
    expect(NUTRITION_SRC).toMatch(/function countConfigChips\(profile\)[\s\S]*?listConfigChips\(source\)[\s\S]*?readChipState\(source\)/);
    expect(NUTRITION_SRC).toMatch(/HEYS\.NutritionV4 = \{[\s\S]*?countConfigChips,/);
    expect(SHELL_SRC).toContain('window.HEYS?.NutritionV4?.countConfigChips?.()');
    expect(SHELL_SRC).toContain("`${counted.on} из ${counted.total} ${noun}`");
  });

  it('ведёт к ряду чипов «Что показывать на этой вкладке»', () => {
    expect(SHELL_SRC).toContain("closeSettingsAndSwitch('diary', 'settings-sheet-diary-blocks')");
    expect(SHELL_SRC).toContain("document.querySelector('.nutrition-v4-config')");
    expect(NUTRITION_SRC).toContain("React.createElement('section', { className: 'nutrition-v4-config' }");
  });
});
