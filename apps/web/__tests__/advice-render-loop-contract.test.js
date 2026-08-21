import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// Переводы строк нормализуем: в рабочем дереве на Windows файлы лежат с CRLF,
// и многострочные ожидания не находятся на верном коде.
const read = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('advice render-loop contract', () => {
  it('memoizes the heavy advice engine by real inputs and keeps minute refresh', () => {
    const source = read('day/_advice.js');

    expect(source).toContain('const adviceResult = useMemo(() => {');
    expect(source).toContain('const adviceInputKey = (() => {');
    expect(source).toContain('return adviceEngine({');
    expect(source).toContain('currentMinute,');
    expect(source).toContain("const lastToastPresentationKeyRef = useRef('');");
    expect(source).toContain('if (lastToastPresentationKeyRef.current === toastPresentationKey) return;');
  });

  it('passes the minute signal through DayTab advice integration', () => {
    const dayTab = read('heys_day_tab_impl_v1.js');
    const integration = read('heys_day_advice_integration_v1.js');

    expect(dayTab).toContain('currentMinute,\n            setShowConfetti');
    expect(dayTab).toContain('pIndex,\n            prodSig,\n            dayTot');
    expect(integration).toContain('currentMinute: ctx.currentMinute');
    expect(integration).toContain('prodSig: ctx.prodSig');
  });
});
