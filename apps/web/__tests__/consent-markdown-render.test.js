import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.resolve(__dirname, '../heys_consents_v1.js'), 'utf8');
const privacy = fs.readFileSync(
  path.join(repo, 'apps/web/public/docs/privacy-policy.md'),
  'utf8'
);
const offer = fs.readFileSync(
  path.join(repo, 'apps/web/public/docs/user-agreement.md'),
  'utf8'
);
const health = fs.readFileSync(
  path.join(repo, 'apps/web/public/docs/health-data-consent.md'),
  'utf8'
);

function loadParseMarkdown() {
  const previousHEYS = global.window?.HEYS;
  const previousReact = global.window?.React;
  global.window = global.window || {};
  window.HEYS = {};
  window.React = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (callback) => callback,
    useRef: (initial) => ({ current: initial }),
    createElement: () => null,
  };
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return window.HEYS.Consents.parseMarkdown;
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
  }
}

describe('consent markdown render', () => {
  const parseMarkdown = loadParseMarkdown();

  it('exports parseMarkdown', () => {
    expect(typeof parseMarkdown).toBe('function');
  });

  it('renders literal <br> from legal templates as breaks, not text', () => {
    const html = parseMarkdown(offer);
    expect(html).not.toContain('&lt;br');
    expect(html).not.toMatch(/>Версия:[\s\S]*?&lt;br/);
    expect(html).toContain('<br>');
    expect(html).toContain('<strong>Версия:</strong>');
  });

  it('renders privacy data table instead of raw pipe row', () => {
    const html = parseMarkdown(privacy);
    expect(html).not.toContain('| Группа');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Группа');
    expect(html).toContain('Примеры');
    expect(html).toContain('Цель');
    expect(html).toContain('Идентификация и связь');
  });

  it('keeps ordered lists in separate ol blocks (no global 36.)', () => {
    const html = parseMarkdown(health);
    const ols = html.match(/<ol\b/g) || [];
    expect(ols.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('<ol class="my-2 list-decimal pl-5">');
    // First goals list starts at 1 visually via fresh <ol>, not continued counter.
    expect(html).toContain('Ведения дневника питания');
  });

  it('merges split blockquote so bold markers do not leak', () => {
    const html = parseMarkdown(health);
    expect(html).not.toContain('**Последнее');
    expect(html).toContain('<strong>Последнее обновление:</strong>');
  });

  it('does not alter legal source bytes', () => {
    // Guard: this suite only reads docs; hashes stay owned by consent-release-contract.
    expect(privacy).toContain('| Группа');
    expect(offer).toContain('<br>');
  });
});

describe('consent notifications default', () => {
  it('keeps reminders checkbox unchecked by default', () => {
    expect(source).toMatch(
      /notificationsOptIn,\s*setNotificationsOptIn\]\s*=\s*useState\(false\)/
    );
    expect(source).not.toMatch(
      /notificationsOptIn,\s*setNotificationsOptIn\]\s*=\s*useState\(true\)/
    );
  });
});
