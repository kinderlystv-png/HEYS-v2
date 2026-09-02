// heys/bcf696: «не вводил шаги» и «явный ноль» — разные вещи.
//
// ensureDay схлопывал отсутствие значения в ноль через `+d.steps || 0`. День
// после этого выглядел честно нулевым, и медиана прошлых дней уже не
// подставлялась — хотя по решению 18.08 оценка ставится именно там, где факта
// нет, а `steps === 0` означает явный ввод.
//
// Потребители отличать null умеют: heys_day_core_bundle_v1.js:2021 и
// heys_day_utils.js:2016 проверяют его явно, — значит терялось значение
// раньше, чем до них доходило.
import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const MODELS_SRC = fs.readFileSync(path.join(WEB, 'heys_models_v1.js'), 'utf8');

describe('ensureDay: шаги отличают «нет данных» от нуля', () => {
  let ensureDay;

  beforeAll(() => {
    window.HEYS = window.HEYS || {};
    // eslint-disable-next-line no-new-func
    new Function(MODELS_SRC)();
    ensureDay = window.HEYS.models.ensureDay;
    expect(typeof ensureDay).toBe('function');
  });

  it('поле не передано — steps остаётся null, а не нулём', () => {
    expect(ensureDay({ date: '2026-09-02' }).steps).toBeNull();
  });

  it('пустая строка — это тоже «не вводил»', () => {
    expect(ensureDay({ date: '2026-09-02', steps: '' }).steps).toBeNull();
  });

  it('явный ноль сохраняется нулём', () => {
    expect(ensureDay({ date: '2026-09-02', steps: 0 }).steps).toBe(0);
  });

  it('обычное число проходит числом', () => {
    expect(ensureDay({ date: '2026-09-02', steps: 7400 }).steps).toBe(7400);
  });

  it('строка с числом приводится к числу', () => {
    expect(ensureDay({ date: '2026-09-02', steps: '5200' }).steps).toBe(5200);
  });
});
