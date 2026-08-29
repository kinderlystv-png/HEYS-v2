// Панель куратора — пятая вкладка кабинета.
//
// Проверяется исходник: компонент живёт внутри кураторского входа, и поднять
// его целиком дороже, чем закрепить правила, которые вёрстка обязана
// соблюсти. Логика строк уже покрыта отдельно (curator-panel-rows) — здесь
// только поверхность и запись решения.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_curator_panel_v1.js'), 'utf8');
const GATE = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css'),
  'utf8'
);
const MAIN = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
const BUNDLE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/legacy-bundle-config.mjs'),
  'utf8'
);

let CP;
beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  CP = window.HEYS.CuratorPanel;
});

describe('панель куратора · место в кабинете', () => {
  it('пятая вкладка, и порядок групп — старшинство контракта', () => {
    expect(GATE).toContain("setCuratorTab('panel')");
    expect(GATE).toContain("curatorTab === 'panel'");
    expect(CP.GROUPS.map((g) => g.state)).toEqual([
      'awaits', 'decided_today', 'silent', 'mismatch', 'collecting', 'fine'
    ]);
  });

  it('вход в дневник не заводит вторую механику переключения', () => {
    // switchClient живёт в списке клиентов и остаётся одной механикой на
    // весь кабинет.
    const start = GATE.indexOf('HEYS.CuratorPanel.Component');
    const body = GATE.slice(start, GATE.indexOf("curatorTab === 'moderation'", start))
      .split('
').filter((l) => !l.trim().startsWith('//')).join('
');
    expect(body).not.toContain('switchClient');
    expect(body).toContain("setCuratorTab('clients')");
  });

  it('стили подключены и живут своим модулем', () => {
    expect(MAIN).toContain("734-ui-v4-curator-panel.css");
    expect(BUNDLE).toContain('heys_curator_panel_v1.js');
  });
});

describe('панель куратора · строка клиента', () => {
  const row = (over) => Object.assign({
    clientId: 'c1', state: 'awaits', ageDays: 3, alsoNote: null,
    silentDays: 0, mismatchPct: 8, collecting: false,
    result: { loggedDays: 14, weighIns: 4, missing: {} },
    card: { recommendation: { stepFactor: 0.97, currentNorm: 2112, norm: 2049 } }
  }, over);

  it('ждёт решения — поправка и обе нормы в строке', () => {
    expect(CP.stateLine(row({}))).toBe('поправка ×0,97 · норма 2 112 → 2 049');
  });

  it('молчит — дни склоняются, и второе состояние идёт фразой', () => {
    expect(CP.stateLine(row({ state: 'silent', silentDays: 1, alsoNote: null })))
      .toBe('не пишет 1 день');
    expect(CP.stateLine(row({ state: 'silent', silentDays: 4, alsoNote: 'и расчёт разошёлся' })))
      .toBe('не пишет 4 дня · и расчёт разошёлся');
  });

  it('копят данные — счёт по обоим гейтам, а не по длине окна', () => {
    // Знаменатель 21 в строку не идёт: это длина окна, а не условие.
    const line = CP.stateLine(row({ state: 'collecting' }));
    expect(line).toBe('дни 14 из 10 · взвешивания 4 из 6');
    expect(line).not.toContain('21');
  });

  it('пилюля меряет длительность, а у решённого сегодня стоит «вы»', () => {
    expect(CP.agePill(row({}))).toBe('3 дн');
    expect(CP.agePill(row({ state: 'decided_today' }))).toBe('вы');
  });

  it('у копящих данные пилюля говорит, чего не хватает', () => {
    const r = row({ state: 'collecting', result: { loggedDays: 14, weighIns: 4, missing: { weighIns: 2 } } });
    expect(CP.agePill(r)).toBe('нужно 2');
  });

  it('инициалы берутся из имени и не падают на пустом', () => {
    expect(CP.initials('Анна Кузнецова')).toBe('АК');
    expect(CP.initials('Анна')).toBe('А');
    expect(CP.initials('')).toBe('—');
  });
});

describe('панель куратора · решение и границы', () => {
  it('решение пишется серверным merge, а не заменой блоба', () => {
    // Профиль и история клиента — не наши объекты: заменить целиком значит
    // стереть всё, чего мы не прислали, включая метку просьбы о замере.
    expect(SRC).toContain('api.mergeSaveKV(clientId');
    expect(SRC).not.toContain('api.saveKV(');
  });

  it('поправка пишется в профиль двумя скалярами, своего ключа у неё нет', () => {
    expect(SRC).toContain("mergeSaveKV(clientId, 'heys_profile'");
    expect(SRC).toContain('normCorrectionFactor');
    expect(SRC).toContain('normCorrectionAppliedAt');
    expect(SRC).not.toContain('heys_profile_norm_correction');
  });

  it('все три действия считаются ответом', () => {
    // Иначе строка не уйдёт из «ждут решения» и вернётся завтра такой же.
    for (const what of ['applied', 'frozen', 'postponed']) {
      expect(SRC, what).toContain("'" + what + "'");
    }
  });

  it('панель ничего не пересчитывает — числа приходят из модели', () => {
    expect(SRC).toContain('HEYS.NormCorrection && HEYS.NormCorrection.buildPanelRows');
    // Ни одной собственной арифметики нормы.
    expect(SRC).not.toMatch(/deficitPct|baseExpenditure|\* *0\.9/);
  });

  it('«где сидит расхождение» показывается только в кураторском листе', () => {
    expect(SRC).toContain('card.whereMismatchSits');
    expect(CSS).toContain('.cur-sheet__where');
  });

  it('лист перекрывает панель, а не уводит на другой экран', () => {
    expect(CSS).toMatch(/\.cur-sheet-scrim[\s\S]{0,200}position: fixed/);
    expect(SRC).toContain('cur-sheet-scrim');
  });

  it('«всё ровно» свёрнуто по умолчанию', () => {
    expect(SRC).toContain('const [fineOpen, setFineOpen] = React.useState(false)');
    expect(SRC).toContain("fineOpen ? 'скрыть' : 'показать'");
  });

  it('чипы меняют состав, а не порядок', () => {
    // Выбран один — группы не показываются, строки идут сплошняком.
    expect(SRC).toContain("h('div', { className: 'cur-panel__flat' }");
    expect(SRC).not.toContain('sort(');
  });

  it('акцент только там, где нужно решение', () => {
    expect(CSS).toMatch(/\.cur-row__state\.is-act[\s\S]{0,120}--v4-act-text/);
  });
});
