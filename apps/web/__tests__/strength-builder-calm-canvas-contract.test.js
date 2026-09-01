// strength-builder-calm-canvas-contract.test.js — спокойный активный список А1б.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');
const BUILDER = fs.readFileSync(path.resolve(__dirname, '../strength/heys_strength_builder_ui_v1.js'), 'utf8');
const SUPERSET = fs.readFileSync(path.resolve(__dirname, '../strength/heys_strength_superset_ui_v1.js'), 'utf8');

function lastRule(selector) {
  const pattern = new RegExp('(?:^|\\n)' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}', 'g');
  return Array.from(CSS.matchAll(pattern)).at(-1)?.[1] || '';
}

describe('strength builder: спокойные состояния активного списка', () => {
  it('оставляет спокойный зелёный сигнал галочке, а не карточке и полям', () => {
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).not.toContain('--sb-okbg');
    expect(lastRule('.sb-ex.is-complete')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ex.is-complete')).not.toContain('--sb-okbg');
    const doneCheck = lastRule('.sb-builder-screen.is-exercise-open .sb-ap-check.is-done');
    expect(doneCheck).toContain('background: var(--sb-okbg)');
    expect(doneCheck).toContain('color: var(--sb-okTx)');
    expect(doneCheck).not.toContain('--v4-ok-text');
  });

  it('выделяет открытое упражнение спокойно, а ввод — рамкой полей', () => {
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex.is-open')).toContain('box-shadow: inset 0 0 0 1px var(--sb-br)');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ap.is-current .sb-ap-field')).toContain('border: 2px solid var(--sb-acc-strong)');
    expect(lastRule('.sb-ap.is-current .sb-ap-num')).not.toContain('background: var(--sb-acc)');
  });

  it('держит преждевременное завершение вторичным действием', () => {
    expect(lastRule('.sb-finish')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-finish')).toContain('border: 1px solid var(--sb-br)');
    expect(lastRule('.sb-finish')).not.toContain('linear-gradient');
  });

  it('держит отдых доком над панелью, а не полноэкранной подложкой', () => {
    const rest = lastRule('.sb-rest');
    expect(rest).toContain('bottom: calc(82px + env(safe-area-inset-bottom, 0px))');
    expect(rest).not.toContain('inset: 0');
    expect(rest).not.toContain('background: var(--sb-bg)');
    expect(lastRule('.sb-root--rest-docked .sb-rest')).toContain('position: relative');
    expect(lastRule('.sb-root--rest-docked .sb-panel')).toContain('position: relative');
    expect(lastRule('.sb-rest-ring')).toContain('width: 168px');
  });

  it('держит пилюли прошлого подхода и рекорда в точных спокойных ролях А1б', () => {
    const history = lastRule('.sb-builder-screen.is-exercise-open .sb-hist span');
    expect(history).toContain('background: var(--sb-bg)');
    expect(history).toContain('color: var(--sb-mut)');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-hist span.is-record'))
      .toContain('color: var(--sb-acc)');
  });

  it('повторяет контракт кольца Е3: контекст, число, подпись и три действия', () => {
    expect(BUILDER).toContain("'отдых между подходами'");
    expect(BUILDER).toContain("' из ' + agg.totalApproaches + ' подходов'");
    expect(BUILDER).toContain("'дальше ' + owner.charAt(0).toLowerCase() + owner.slice(1) + ' · раунд '");
    expect(BUILDER).toContain("'Кольцо стоит над кнопкой «Завершить», а не поверх списка:");
    expect(BUILDER).toContain("'из ' + restSourceName");
    expect(BUILDER).toContain("'по правилу «' + (restSourceName || 'отдыха') + '»'");
    expect(SUPERSET).toContain("h('small', null, 'осталось')");
    expect(SUPERSET).toContain("}, '+10 секунд')");
    expect(SUPERSET).toContain("}, 'пропустить')");
    expect(SUPERSET).toContain("}, 'свернуть')");
    expect(lastRule('.sb-rest-ring')).toContain('height: 168px');
    expect(lastRule('.sb-rest-value')).toContain('font-size: 38px');
    expect(lastRule('.sb-rest-value small')).toContain('font-size: 9.5px');
    expect(lastRule('.sb-rest-value small')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-context small')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-next')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-compact-copy span')).toContain('rgba(var(--ink, 15, 23, 42), 0.45)');
    expect(lastRule('.sb-rest-actions')).toContain('gap: 7px');
    expect(lastRule('.sb-rest-actions')).toContain('margin-top: 14px');
    expect(lastRule('.sb-rest-actions .sb-rest-collapse')).toContain('padding: 0 14px');
  });

  it('держит запрет дропа внутри связки у writer, а не только скрытой кнопкой', () => {
    const addDrop = BUILDER.slice(
      BUILDER.indexOf('function addDrop(exIdx)'),
      BUILDER.indexOf('function addExercise(name)'),
    );
    expect(addDrop).toContain('if (groupByIndex[exIdx]) return;');
    expect(addDrop.indexOf('if (groupByIndex[exIdx]) return;'))
      .toBeLessThan(addDrop.indexOf('patchExercises(next)'));
  });
});
