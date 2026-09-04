import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const catalogSource = fs.readFileSync(path.join(WEB, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');
const metaSource = fs.readFileSync(path.join(WEB, 'heys_exercise_catalog_v1.js'), 'utf8');

describe('strength builder · Упражнение · группы мышц v4 canvas contract', () => {
  it('exports ExerciseMuscleGroupsScreen with canvas copy and tiers', () => {
    expect(catalogSource).toContain('ExerciseMuscleGroupsScreen');
    expect(catalogSource).toContain('sb-ex-muscle-screen');
    expect(catalogSource).toContain("' · мышцы'");
    expect(catalogSource).toContain("'одна основная, синергисты по желанию'");
    expect(catalogSource).toContain("'Основная — одна'");
    expect(catalogSource).toContain("'Синергисты — сколько нужно'");
    expect(catalogSource).toContain("'Как это ляжет в объём'");
    expect(catalogSource).toContain('Список закрыт одиннадцатью и своих групп не принимает');
    expect(catalogSource).toContain('CATALOG_V4_BRIDGE');
    expect(catalogSource).toContain('muscleVolumePreviewRows');
  });

  it('keeps meta helpers for volume preview', () => {
    expect(metaSource).toContain('muscleVolumePreviewRows');
    expect(metaSource).toContain('formatVolumeKg');
    expect(metaSource).toContain('bodyweightSimilarOptions');
  });
});
