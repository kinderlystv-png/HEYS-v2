import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_consents_v1.js'), 'utf8');

function renderConsentScreen(outdatedTypes = []) {
  const previousHEYS = window.HEYS;
  const previousReact = window.React;

  window.HEYS = {};
  window.React = {
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: callback => callback,
    useMemo: fn => fn(),
    useRef: initial => ({ current: initial }),
    createElement: (type, props, ...children) => (
      typeof type === 'function'
        ? type(props || {})
        : { type, props: props || {}, children }
    ),
  };

  try {
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return window.HEYS.Consents.ConsentScreen({
      clientId: 'client-1',
      outdatedTypes,
    });
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
  }
}

function collectText(node, output = []) {
  if (typeof node === 'string') output.push(node);
  if (!node || typeof node !== 'object') return output;
  for (const child of node.children || []) collectText(child, output);
  return output;
}

describe('honest consent summaries', () => {
  it('shows short plain-language disclosures for a new client', () => {
    const text = collectText(renderConsentScreen()).join(' ');

    expect(text.match(/Коротко и честно/g)).toHaveLength(4);
    expect(text).toContain('условия тарифа и оплаты');
    expect(text).toContain('не заменяет это согласие');
    expect(text).toContain('без потери доступа к HEYS');
    expect(text).toContain('Рекламное согласие оформляется отдельно');
  });

  it('keeps the same plain-language contents for re-consent', () => {
    const text = collectText(renderConsentScreen([
      { type: 'personal_data', current: '1.7', expected: '1.0' },
    ])).join(' ');

    expect(text.match(/Коротко и честно/g)).toHaveLength(4);
    expect(text).not.toContain('Что изменилось');
    expect(text).toContain('не заменяет это согласие');
    expect(text).toContain('Проверьте содержание документов и подтвердите актуальные условия');
  });

  it('stacks above bottom tabs so iPhone can tap Continue', () => {
    expect(source).toContain("data-heys-visible-frame': 'consent'");
    expect(source).toContain('zIndex: 11000');
    expect(source).toContain("paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))'");
  });
});
