// Canvas home-widgets: «нет данных за день» означает прочерк без графики.
// Ноль допустим только для воды; пустой дневник не доказывает нулевое питание.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const DATA_SOURCE = fs.readFileSync(path.join(WEB, 'widgets/widget_data.js'), 'utf8');
const UI_SOURCE = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');

function boot(day) {
  window.HEYS = {
    Widgets: { emit: () => {}, on: () => {}, off: () => {} },
    utils: { lsGet: (_key, fallback) => fallback },
  };
  eval(DATA_SOURCE);
  const data = window.HEYS.Widgets.data;
  data._isDemoMode = () => false;
  data._getDay = () => day;
  data._getDayTotals = () => ({ kcal: 0, prot: 0, fat: 0, carbs: 0 });
  data._getOptimum = () => 1931;
  data._getProfile = () => ({});
  data._getNorms = () => ({});
  data._getNormAbs = () => ({ prot: 150, fat: 62, carbs: 180 });
  data._isClosedDay = () => false;
  return data;
}

describe('пустой день на Главной · контракт Canvas v4', () => {
  afterEach(() => {
    delete window.HEYS;
  });

  it('пустой дневник помечает калории и БЖУ как отсутствие данных', () => {
    const data = boot({ date: '2026-09-02', meals: [] });

    expect(data.getCaloriesData().hasData).toBe(false);
    expect(data.getMacrosData().hasData).toBe(false);
    expect(data.getProteinWidgetData()).toMatchObject({ hasData: false, protein: null });
  });

  it('записанный приём сохраняет честный ноль как факт, а не как прочерк', () => {
    const data = boot({
      date: '2026-09-02',
      meals: [{ items: [{ name: 'Вода без нутриентов', grams: 250 }] }],
    });

    expect(data.getCaloriesData()).toMatchObject({ hasData: true, eaten: 0 });
    expect(data.getMacrosData()).toMatchObject({
      hasData: true,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });

  it('crash-risk поведенчески различает недоступный, пустой и упавший provider', () => {
    const data = boot({ date: '2026-09-02', meals: [] });

    expect(data.getCrashRiskData()).toMatchObject({
      hasData: false,
      emptyReason: 'provider_unavailable',
    });

    window.HEYS.Widgets.DataProviders = { crashRisk: { getData: () => null } };
    expect(data.getCrashRiskData()).toMatchObject({
      hasData: false,
      emptyReason: 'provider_error',
    });

    window.HEYS.Widgets.DataProviders.crashRisk.getData = () => { throw new Error('fixture failure'); };
    expect(data.getCrashRiskData()).toMatchObject({
      hasData: false,
      emptyReason: 'provider_error',
    });
  });

  it('рендер пустого дня не проходит в ветки чисел, колец и полос', () => {
    const calories = UI_SOURCE.slice(
      UI_SOURCE.indexOf('function CaloriesVariantBody'),
      UI_SOURCE.indexOf('function CaloriesWidgetContent'),
    );
    const macros = UI_SOURCE.slice(
      UI_SOURCE.indexOf('function MacrosVariantBody'),
      UI_SOURCE.indexOf('function MacrosWidgetContent'),
    );

    expect(calories).toContain("if (data?.hasData !== true)");
    // Пустой день у калорий рисуется не универсальной плиткой, а своими кадрами
    // «Калории · пустой день · 2×2» и «· 2×1»: норма считается из профиля и известна
    // с утра, поэтому она остаётся на плитке, а прочерк ставится только факту.
    // Сторожим правило — у ветки своё представление и она выходит из функции
    // на каждом размере, — а не имя вызова: именем тест упал бы на починке.
    const emptyAt = calories.indexOf('if (data?.hasData !== true)');
    const emptyFrames = [...calories.slice(emptyAt).matchAll(/return React\.createElement\([^;]*?widget-calories--empty/gs)];
    expect(emptyFrames, 'пустой день возвращает свои кадры 2×2 и 2×1').toHaveLength(2);
    expect(calories.indexOf('const animActivity = useWidgetMotionValue(activityKcal'))
      .toBeLessThan(calories.indexOf("if (data?.hasData !== true)"));
    expect(macros).toContain("if (data?.hasData !== true)");
    // Кадр «Кольца БЖУ · пустой день»: кольца остаются на месте с нормой под
    // каждым, помеченные пустыми, — прежде здесь стоял голый прочерк, а норма
    // известна с утра. Ниже 3×2 кольца не помещаются, и там пустой день
    // отдаётся универсальной плиткой; этим срез ветки и ограничен.
    const macrosEmpty = macros.slice(
      macros.indexOf('if (data?.hasData !== true)'),
      macros.indexOf("return v4EmptyTile('БЖУ')"),
    );
    expect(macrosEmpty, 'малые размеры падают на общую пустую плитку').not.toBe('');
    for (const label of ['Белки', 'Жиры', 'Углеводы']) {
      expect(macrosEmpty, `кольцо «${label}» пропало с пустого дня`).toContain(`label: '${label}'`);
    }
    expect([...macrosEmpty.matchAll(/empty: true/g)], 'все три кольца помечены пустыми').toHaveLength(3);
  });
});
