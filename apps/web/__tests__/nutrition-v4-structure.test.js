// Вкладка «Питание» против канваса nutrition-tab.v4.dc.html.
// Контракт [data-contract="nutrition-tab"]: строки «порядок блоков», «один
// экран для всех ширин», «прокрутка», «формат чисел», «строка приёма»,
// «состав листа», «действия приёма», «ряд чипов», «дубль в настройках»,
// «палитры», «вторичный тон», «заметность чипа».
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

const nutritionSource = read('../heys_day_nutrition_v1.js');
const cssSource = read('../styles/modules/732-ui-v4-nutrition.css');
const shellSource = read('../heys_day_page_shell.js');
const diarySource = read('../heys_day_diary_section.js');
const appShellSource = read('../heys_app_shell_v1.js');
const paletteSource = read('../styles/modules/002-ui-v4-palette-roles.css');
const mealsSource = read('../day/_meals.js');
const paywallSource = read('../heys_paywall_v1.js');

describe('Nutrition tab v4 structure', () => {
  it('строит вкладку одной полосой без ярусов «Сейчас / Дневник / Разбор дня»', () => {
    expect(nutritionSource).toContain('function NutritionTabV4');
    expect(nutritionSource).toContain('nutrition-v4-hero');
    expect(nutritionSource).toContain('nutrition-v4-window');
    expect(nutritionSource).toContain('nutrition-v4-diary');
    expect(nutritionSource).toContain('Добавить приём пищи');
    expect(nutritionSource).toContain('nutrition-v4-totals');
    expect(nutritionSource).toContain('nutrition-v4-quality');
    expect(nutritionSource).toContain('nutrition-v4-config');
    // Ярусов-заголовков больше нет: третий уровень заголовков на телефоне шумит.
    expect(nutritionSource).not.toContain('nutrition-v4-tier');
    expect(cssSource).not.toContain('.nutrition-v4-tier');
    // Таблица 5×4 заменена пятью строками с полосами.
    expect(nutritionSource).not.toContain('nutrition-v4-breakdown');
    expect(nutritionSource).toContain("{ key: 'fiber', label: 'Клетчатка', unit: 'г'");
  });

  it('держит порядок блоков контракта', () => {
    const order = [
      'ca-day-entry',
      'nutrition-v4-hero',
      'nutrition-v4-window',
      'nutrition-v4-diary',
      'nutrition-v4-cta',
      "className: 'nutrition-v4-totals'",
      'dayWaterCard?.buildWaterCard',
      "className: 'nutrition-v4-quality'",
      'optionalBlocks',
      'nutrition-v4-config',
    ];
    const positions = order.map((marker) => nutritionSource.lastIndexOf(marker));
    positions.forEach((position, index) => {
      expect(position, order[index]).toBeGreaterThan(-1);
      if (index > 0) expect(position, order[index]).toBeGreaterThan(positions[index - 1]);
    });
  });

  it('снимает скрытый легаси-дневник и его мёртвую цель прокрутки', () => {
    expect(nutritionSource).not.toContain('nutrition-v4-legacy-meals');
    expect(nutritionSource).not.toContain('legacyMealsUI');
    expect(cssSource).not.toContain('.nutrition-v4-legacy-meals');
    // FAB «еда» больше не скроллит к display:none-заголовку и не ждёт 800 мс.
    expect(shellSource).not.toContain("getElementById('diary-heading')");
    expect(shellSource).not.toContain('setTimeout(() => addMeal(), 800)');
  });

  it('делает строку приёма нажимаемой и оставляет кнопку добавления отдельной', () => {
    expect(nutritionSource).toContain('function findMealIndexInDay');
    expect(nutritionSource).toContain('nutrition-v4-meal-row__add');
    expect(nutritionSource).toContain('nutrition-v4-meal-row__num');
    expect(nutritionSource).toContain('nutrition-v4-meal-row__chevron');
    expect(nutritionSource).toContain('openMealSheet');
    expect(nutritionSource).toContain('openAddProductForMeal');
    expect(nutritionSource).toContain('event.stopPropagation()');
    expect(cssSource).toMatch(/\.nutrition-v4-meal-row \{[^}]*min-height: 44px/);
  });

  it('лист правки приёма собран из существующих обработчиков дневника', () => {
    expect(nutritionSource).toContain('function MealEditSheet');
    ['openTimeEditor', 'openEditGramsModal', 'openCopyMealModal',
      'openMoveMealModal', 'saveAsPreset', 'repeatTodayMeal', 'repeatYesterdayMeal',
      'removeMeal', 'removeItem', 'copyItem', 'moveItem'].forEach((handler) => {
      expect(nutritionSource, handler).toContain(handler);
    });
    // Контракт nutrition-tab «действия приёма»: четыре строки подряд после
    // опциональных «Советы · N»; «Оценки приёма» сняты из листа.
    expect(nutritionSource).toContain('Повторить сегодня');
    expect(nutritionSource).not.toContain('Оценки приёма');
    expect(nutritionSource).not.toContain('openMoodEditor');
    expect(nutritionSource).toMatch(/actionRow\('repeat', 'Повторить сегодня'[\s\S]*actionRow\('copy', 'Копировать приём'[\s\S]*actionRow\('move', 'Переместить на другой день'[\s\S]*actionRow\('preset', 'Сохранить набором'/);
    expect(nutritionSource).toContain('Копировать приём');
    expect(nutritionSource).toContain('Переместить на другой день');
    expect(nutritionSource).toContain('Сохранить набором');
    expect(nutritionSource).toContain('Удалить приём');
    // Кнопки «Готово» нет: правки применяются сразу.
    expect(nutritionSource).not.toMatch(/createElement\([^)]*'Готово'/);
    expect(cssSource).toContain('.nutrition-v4-sheet-backdrop');
    // Подложка product-модалок — один blur на всё приложение.
    expect(cssSource).toContain('blur(var(--v4-modal-backdrop-blur))');
    expect(cssSource).not.toMatch(/blur\((4|7|8|12|18)px\)/);
  });

  it('вкладка «Питание» рендерится одинаково на телефоне и десктопе', () => {
    expect(shellSource).toMatch(/mobileSubTab === 'diary'\) && isTabActive && compactNutrition/);
    // Легаси-секция дневника больше не участвует в мобильной вкладке.
    expect(diarySource).toContain("if (isMobile && mobileSubTab === 'diary') return null;");
    expect(diarySource).toContain('const showDiary = !isMobile;');
  });

  it('семь чипов хранятся в профиле, раздел «Ещё → Дневник» снят', () => {
    expect(nutritionSource).toMatch(/const CHIPS = \[[\s\S]*showDiaryHungerPanel[\s\S]*showDiaryFiberPanel[\s\S]*showDiarySupplementsPanel[\s\S]*showDiaryRefeedPanel[\s\S]*showDiaryMealsTimelinePanel[\s\S]*showDiaryScoreRiskTrendPanel[\s\S]*showDiaryInsulinWavePanel[\s\S]*\]/);
    expect(nutritionSource).toContain("lsSet?.('heys_profile', updated)");
    expect(nutritionSource).toContain('requestHealthFeatureToggle');
    expect(nutritionSource).toContain('Что показывать на этой вкладке');
    // Планер и распределение уехали в «Инсайты» — чипов у них здесь нет.
    expect(nutritionSource).not.toContain('showDiaryPlannerPanel');
    expect(nutritionSource).not.toContain('showDiaryDistributionPanel');
    // Прежние пять переключателей «Дневник» в листе настроек сняты: адрес один.
    expect(appShellSource).not.toContain('DIARY_PANEL_VISIBILITY_OPTIONS');
    expect(appShellSource).not.toContain('handleToggleDiaryPanel');
    expect(appShellSource).not.toContain('diaryPanelsVisibility');
  });

  // Вид и длительность бара отмены уехали в свой канвас undo-bar.v4.dc.html и
  // проверяются в undo-bar-v4-contract.test.js. Здесь остаётся только то, что
  // принадлежит самой вкладке: удаление без вопроса и через общий бар.
  it('удаление приёма и продукта — без вопроса и через общий бар отмены', () => {
    // Подтверждающего вопроса заранее нет: его платят все ради редкой ошибки.
    expect(mealsSource).not.toContain('Удалить приём пищи?');
    expect(mealsSource).toMatch(/label: mealName \+ ' удалён',[\s\S]{0,400}batch: \{ key: 'meal'/);
    expect(mealsSource).toMatch(/label: removedName \+ ' удалён',[\s\S]{0,400}batch: \{ key: 'meal-product'/);
    // Окно защиты записи от облачной перезаписи равно окну бара.
    expect(mealsSource).toContain('markUndoWindow(5000)');
  });

  it('только чтение: плашка называет причину и что делать, кнопки гаснут', () => {
    expect(paywallSource).toContain('Пробный период закончился');
    expect(paywallSource).toContain('День и история открыты для чтения');
    // Эмодзи и стрелка сняты: плашка живёт над содержимым вкладки.
    const banner = paywallSource.slice(
      paywallSource.indexOf('// Плашка называет причину'),
      paywallSource.indexOf('// GATING LOGIC'),
    );
    expect(banner).not.toContain("'⏰'");
    expect(banner).not.toContain("'→'");
    expect(cssSource).toMatch(/\[data-readonly='true'\][\s\S]{0,200}opacity: 0\.4/);
  });

  it('офлайн без данных объясняет причину без эмодзи', () => {
    expect(shellSource).toContain('Данные за сегодня не загрузились');
    expect(shellSource).not.toContain('offline-nodata-icon');
    const overlay = shellSource.slice(
      shellSource.indexOf('function OfflineNoDataOverlay'),
      shellSource.indexOf('function OfflineNoDataOverlay') + 2000,
    );
    expect(overlay).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  });

  it('положение прокрутки живёт по вкладке и сбрасывается сменой дня', () => {
    expect(appShellSource).toContain('scrollMemoryRef');
    expect(appShellSource).toMatch(/scrollMemoryRef\.current = 0;[\s\S]{0,220}\}, \[selectedDate\]\);/);
  });

  it('палитры: ролевые токены вместо литералов', () => {
    const mainCss = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
    expect(mainCss).toContain('732-ui-v4-nutrition.css');
    // Литералов как значений нет: цвет берётся ролью. Запасные значения ролей —
    // страховка на случай неопределённой роли, а не самостоятельная краска.
    // (До 24.08 они были записью того, что покажет каноничная палитра, и это
    // сторожил снятый гейт scripts/ui-v4-check-classic-drift.mjs.)
    const bareLiterals = cssSource
      .split(/\r?\n/)
      .filter((line) => /:\s*#[0-9a-fA-F]{3,8}\s*;/.test(line) && !/--nut-dim/.test(line))
      .map((line) => line.trim());
    expect(bareLiterals).toEqual([]);
    expect(cssSource).toMatch(/var\(--v4-act-text[,)]/);
    expect(cssSource).toMatch(/var\(--v4-warn-text[,)]/);
    expect(cssSource).toMatch(/var\(--v4-bad-text[,)]/);
    // Неопределённых ролей на вкладке нет. `--v4-chip` был в этом списке,
    // пока роль не была задана ни в одной палитре и подставляла литерал;
    // 24.08 она заведена в четырёх v4-наборах (002-ui-v4-palette-roles.css)
    // и держится тестом v4-palette-roles-contract, поэтому запрет снят.
    expect(cssSource).not.toContain('--v4-undefined-role');
    expect(cssSource).not.toContain('--v4-surface-strong');
    expect(cssSource).not.toContain('--v4-surface-2');
    // Новые роли объявлены во всех наборах. Наборов четыре, а не шесть:
    // каноничная палитра и её тёмная убраны из 002-ui-v4-palette-roles.css
    // 24.08 (канон живёт только на зеркале stable.heyslab.ru, а миграция в
    // heys_theme_v1.js переписывает сохранённое `classic` на `sand`).
    ['--v4-warn-text', '--v4-tint', '--v4-past'].forEach((token) => {
      expect((paletteSource.match(new RegExp(token + ':', 'g')) || []).length, token).toBe(4);
    });
  });

  it('вторичный тон сплошной, чип выключен обводкой 2 px', () => {
    expect(cssSource).toMatch(/--nut-dim: #6b5f4f;/);
    expect(cssSource).toMatch(/--nut-dim: #5a6474;/);
    expect(cssSource).toMatch(/--nut-dim: rgba\(242, 237, 230, 0\.62\);/);
    expect(cssSource).toMatch(/--nut-dim: rgba\(232, 238, 246, 0\.62\);/);
    expect(cssSource).toMatch(/\.nutrition-v4-chip\.is-off \{[^}]*inset 0 0 0 2px var\(--v4-act[,)]/);
  });

  it('эмодзи на вкладке нет', () => {
    expect(nutritionSource).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
    expect(cssSource).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  });

  it('wires the in-tab curator day cue to the same filtered sheet', () => {
    expect(nutritionSource).toContain('ca-day-entry');
    expect(nutritionSource).toContain('getVisibleCue');
    expect(nutritionSource).toContain('getDayCue');
    expect(nutritionSource).toContain('openFromCue');
    expect(nutritionSource).toContain('heys:curator-review-cues');
    expect(nutritionSource).toContain('curatorCue.title');
    expect(nutritionSource).toContain('curatorCue.date');
    expect(nutritionSource).toContain('setSelectedDate');
  });

  it('localizes diary meal titles instead of showing english type keys', () => {
    expect(nutritionSource).toContain('function mealTypeLabel');
    expect(nutritionSource).toContain('localizeMealName');
    // Фиксацией названия считается только явное касание чипа типа.
    expect(nutritionSource).toContain('meal?.mealTypePinned');
  });
});
