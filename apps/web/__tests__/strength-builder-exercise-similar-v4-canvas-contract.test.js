import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const catalogSource = fs.readFileSync(path.join(WEB, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');
const metaSource = fs.readFileSync(path.join(WEB, 'heys_exercise_catalog_v1.js'), 'utf8');

describe('strength builder · Упражнение · на что похоже v4 canvas contract', () => {
  it('exports ExerciseSimilarScreen with canvas copy and options', () => {
    expect(catalogSource).toContain('ExerciseSimilarScreen');
    expect(catalogSource).toContain('sb-ex-similar-screen');
    expect(catalogSource).toContain("' · свой вес'");
    expect(catalogSource).toContain("'сколько тела поднимается'");
    expect(catalogSource).toContain('bodyweightSimilarOptions');
    expect(catalogSource).toContain('row.label');
    expect(catalogSource).toContain('row.hint');
    expect(catalogSource).toContain('row.isUnknown');
    expect(catalogSource).toContain('Вес тела берётся из профиля на день тренировки');
    expect(catalogSource).toContain('Спрашиваем не число, а образец');
    expect(catalogSource).toContain('CATALOG_V4_BRIDGE');
  });

  it('keeps canonical similar options in meta', () => {
    expect(metaSource).toContain('Как приседания на одной');
    expect(metaSource).toContain('почти всё, ноги на опоре');
    expect(metaSource).toContain('0.85');
    expect(metaSource).toContain('0.35');
    expect(metaSource).toContain('formatBodyweightFactor');
  });
});
