// Действия листов разбора против публичного API дня.
//
// Кнопка внизу листа («Добавить приём», «Записать вес», «Заполнить чек-ин»)
// уходит через goToDayAndRun в window.HEYS.Day по имени. Имена были выдуманы:
// openAddMeal, openActivityPicker, openWeightEditor, openSleepEditor,
// openMorningCheckin — день не публикует ни одного. Вкладка переключалась,
// действие не выполнялось, и по виду это было неотличимо от работающего:
// goToDayAndRun молчал.
//
// Этот гейт держит соответствие: каждое имя, которое зовут листы, либо
// опубликовано в исходниках дня, либо стоит в списке известных дыр с причиной.
// Список может только уменьшаться.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const UI = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');

// Исходники дня, где публикуется window.HEYS.Day. Собранные бандлы не читаем:
// они generated и повторяют те же строки.
const DAY_SOURCES = fs.readdirSync(WEB)
  .filter((f) => /^heys_day_.*\.js$/.test(f) && !/bundle/.test(f))
  .map((f) => fs.readFileSync(path.join(WEB, f), 'utf8'))
  .join('\n');

// Имена, которых день пока не публикует. У каждого — почему и чей файл.
//
// 31 августа список сократился с трёх до одного: openWeightPicker и
// openSleepQualityPicker выведены наружу (heys_day_tab_impl_v1.js, коммит
// 3c3399f94) — и сокращения потребовал сам этот гейт: проверка ниже упала на
// том, что закрытая дыра осталась в списке.
const KNOWN_GAPS = new Map([
  ['openMorningCheckin',
    'мастер живёт на уровне приложения (setShowMorningCheckin в heys_app_gate_flow_v1.js), '
    + 'у дня его нет вовсе; звать ли чек-ин с виджетов — решение владельца, а не вопрос экспорта']
]);

describe('действия листов разбора доезжают до дня', () => {
  const published = new Set(
    [...DAY_SOURCES.matchAll(/HEYS\.Day\.([a-zA-Z]+)\s*=/g)].map((m) => m[1])
  );

  // Имена берём из самого switch, а не из списка рядом: список бы врал.
  const called = [...UI.matchAll(/goToDayAndRun\('day',\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);

  it('лист зовёт день по нескольким действиям', () => {
    expect(called.length).toBeGreaterThanOrEqual(5);
    expect(published.size).toBeGreaterThan(5);
  });

  it('каждое имя либо опубликовано днём, либо названо известной дырой', () => {
    const broken = called.filter((name) => !published.has(name) && !KNOWN_GAPS.has(name));
    expect(broken).toEqual([]);
  });

  it('список дыр не разросся и не содержит уже починенного', () => {
    expect(KNOWN_GAPS.size).toBe(1);
    // Дыра, которую день уже закрыл, обязана уйти из списка — иначе он
    // перестанет быть долгом и станет украшением.
    const stale = [...KNOWN_GAPS.keys()].filter((name) => published.has(name));
    expect(stale).toEqual([]);
  });

  it('пропущенное действие не молчит', () => {
    // Без предупреждения дыра прожила год: вкладка переключалась, и это
    // выглядело как работающее действие.
    expect(UI).toContain('действие листа не доехало');
  });
});
