// Баннер решения о дне: число в тексте и порог в расчёте — одна величина.
//
// Восьмого августа порог подняли 0,5 → 0,7, чтобы он совпал с порогом долга
// калорий. Текст остался прежним, и три недели баннер на дне с 65 % нормы
// сообщал «ниже порога 50%». Строка контракта «порог 70 %, не 50 %» это и
// назвала. Чинится не подстановкой другого числа, а тем, что числа больше нет:
// оно считается из самой константы.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_low_cal_banner_v1.js'),
  'utf8'
);

describe('баннер решения о дне · порог в тексте', () => {
  it('в тексте нет зашитого процента — он считается из порога', () => {
    expect(SRC).toContain('${Math.round(THRESHOLD * 100)}%');
    expect(SRC).not.toMatch(/ниже порога 50%/);
  });

  it('порог остался тем же, что у долга калорий', () => {
    expect(SRC).toMatch(/const THRESHOLD = 0\.7;/);
  });

  it('баннер показывается ровно ниже порога', () => {
    expect(SRC).toContain('if (ratio >= THRESHOLD) return null;');
  });
});
