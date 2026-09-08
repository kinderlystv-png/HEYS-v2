import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

/**
 * Блок «Нормы» живёт в двух копиях: рабочей (heys_user_tab_impl_v1.js) и
 * резервной (heys_user_v12.js, исполняется только если рабочая не загрузилась).
 *
 * Сторожа на этот блок не было, и 08.09 копии разъехались молча: поле
 * «Белок (г/кг)» появилось только в рабочей, а резервная осталась с подписью
 * «Белки (%) — вручную», которая врёт про смысл поля. Соседние дубли
 * (stepsGoal, помощники подписки) свои сторожа имеют — этот их догоняет.
 *
 * Сверяются не байты файла, а сами строки полей: остальное в копиях
 * расходится законно.
 */

const WEB_DIR = path.resolve(__dirname, '..');
const sources = ['heys_user_tab_impl_v1.js', 'heys_user_v12.js'].map((name) => ({
  name,
  source: fs.readFileSync(path.join(WEB_DIR, name), 'utf8'),
}));

/** Подписи полей блока «Нормы» в порядке появления. */
function normFieldLabels(source) {
  const labels = [];
  const re = /React\.createElement\('label', null, '([^']*(?:\(%\)|\(г\/кг\)|\(г\/1000 ккал\))[^']*)'\)/g;
  for (const m of source.matchAll(re)) labels.push(m[1]);
  return labels;
}

describe('блок «Нормы»: рабочая копия и резервная не расходятся', () => {
  it('обе копии показывают один набор полей в одном порядке', () => {
    const [impl, legacy] = sources.map((s) => normFieldLabels(s.source));
    expect(impl.length).toBeGreaterThan(0);
    expect(legacy).toEqual(impl);
  });

  it('поле коэффициента белка есть в обеих копиях', () => {
    for (const { name, source } of sources) {
      expect(source, `${name}: нет поля «Белок (г/кг)»`).toContain('Белок (г/кг) — вручную, пусто = по режиму');
      expect(source, `${name}: нет обработчика updateProteinCoeff`).toContain('updateProteinCoeff');
      expect(source, `${name}: коэффициент не зажат потолком 2.4`).toContain('Math.min(2.4, Math.max(1.2, num))');
    }
  });

  it('подпись процента белка не обещает, что он задаёт норму белка', () => {
    for (const { name, source } of sources) {
      expect(source, `${name}: вернулась подпись «Белки (%) — вручную»`).not.toContain("'Белки (%) — вручную'");
    }
  });
});
