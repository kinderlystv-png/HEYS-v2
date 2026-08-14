import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const evalScript = (relativePath) => {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  // eslint-disable-next-line no-eval
  eval(source);
};

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

const createStorageMock = () => {
  const store = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => Object.keys(store)[index] ?? null,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    }
  };
};

describe('advice defects 3c', () => {
  describe('personalizeText replacement order', () => {
    const coreSource = readSource('apps/web/advice/_core.js');

    it('applies punctuation variants before bare firstName placeholder', () => {
      const fnMatch = coreSource.match(/function personalizeText\(text, ctx\) \{[\s\S]*?return result\.trim\(\);\n    \}/);
      expect(fnMatch).toBeTruthy();
      const fnSource = fnMatch[0];

      const commaIdx = fnSource.indexOf('.replace(/\\$\\{firstName\\}, /g');
      const bareIdx = fnSource.indexOf('.replace(/\\$\\{firstName\\}/g, firstName)');
      expect(commaIdx).toBeGreaterThanOrEqual(0);
      expect(bareIdx).toBeGreaterThan(commaIdx);
    });

    it('removes hanging comma when firstName is empty', () => {
      evalScript('apps/web/heys_advice_rules_v1.js');
      evalScript('apps/web/advice/_outcomes.js');
      evalScript('apps/web/advice/_core.js');

      const { personalizeText } = window.HEYS.adviceCoreHelpers;
      const result = personalizeText('${firstName}, после тренировки нужен белок', { prof: {} });
      expect(result).toBe('после тренировки нужен белок');
      expect(result.startsWith(',')).toBe(false);
    });
  });

  describe('insulin wave GI null guard', () => {
    const nutritionSource = readSource('apps/web/advice/_nutrition.js');

    it('requires finite avgGI before low/high GI during wave advices', () => {
      expect(nutritionSource).toMatch(/const hasIwAvgGI = typeof iwAvgGI === 'number' && Number\.isFinite\(iwAvgGI\)/);
      expect(nutritionSource).toMatch(/hasIwAvgGI && iwAvgGI > 65/);
      expect(nutritionSource).toMatch(/hasIwAvgGI && iwAvgGI <= 40/);
    });
  });

  describe('advice drawer counter alignment', () => {
    const adviceUiSource = readSource('apps/web/day/_advice.js');

    it('uses badgeAdvices and totalAdviceCount for drawer title', () => {
      const renderMatch = adviceUiSource.match(/renderManualAdviceList = function renderManualAdviceList\([\s\S]*?return React\.createElement\('div', \{\s*className: 'advice-list-overlay'/);
      expect(renderMatch).toBeTruthy();
      const renderSource = renderMatch[0];

      expect(renderSource).toContain('badgeAdvices');
      expect(renderSource).toContain('totalAdviceCount');
      expect(renderSource).toContain('displayAdviceCount');
      expect(adviceUiSource).toMatch(/Советы \(\$\{displayAdviceCount\}\)/);
      expect(renderSource).toContain('getSortedGroupedAdvices(drawerAdvices)');
    });
  });

  describe('curator-only tech controls in advice drawer', () => {
    const adviceUiSource = readSource('apps/web/day/_advice.js');

    it('moves trace/diagnostics behind curator service screen', () => {
      expect(adviceUiSource).toMatch(/_isCurator && \(adviceTraceAvailable \|\| adviceDiagnostics\)/);
      expect(adviceUiSource).toContain('renderAdviceServiceScreen');
      expect(adviceUiSource).toContain('Служебное');
      expect(adviceUiSource).not.toMatch(/title: 'Скопировать технический лог принятия решений по советам'/);
    });
  });

  describe('advice v4 swipe feedback panels', () => {
    const adviceUiSource = readSource('apps/web/day/_advice.js');

    it('uses v4 read/hide/sync panels from canvas', () => {
      expect(adviceUiSource).toContain('renderAdviceReadFeedbackPanel');
      expect(adviceUiSource).toContain('renderAdviceHideUndoPanel');
      expect(adviceUiSource).toContain('renderAdviceSyncBanner');
      expect(adviceUiSource).toMatch(/👍 Полезно/);
      expect(adviceUiSource).toMatch(/👎 Мимо/);
      expect(adviceUiSource).toContain('Совет скрыт до завтра');
      expect(adviceUiSource).toContain('Отметки не сохранились');
      expect(adviceUiSource).toContain('advice-v4-hide-ring');
    });
  });
});

describe('advice defects 3c runtime helpers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageMock(),
      writable: true,
      configurable: true
    });
    globalThis.window = globalThis;
    globalThis.window.HEYS = {};
    evalScript('apps/web/heys_advice_rules_v1.js');
    evalScript('apps/web/advice/_outcomes.js');
    evalScript('apps/web/advice/_core.js');
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true,
      configurable: true
    });
  });

  it('keeps firstName when profile has it', () => {
    const { personalizeText } = window.HEYS.adviceCoreHelpers;
    const result = personalizeText('${firstName}, добавь белок', { prof: { firstName: 'Анна' } });
    expect(result).toBe('Анна, добавь белок');
  });
});
