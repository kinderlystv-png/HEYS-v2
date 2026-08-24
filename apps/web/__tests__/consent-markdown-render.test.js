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
    Fragment: 'fragment',
  };
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return {
      parseMarkdown: window.HEYS.Consents.parseMarkdown,
      parseConsentDocument: window.HEYS.Consents.parseConsentDocument,
      prepareConsentMarkdown: window.HEYS.Consents.prepareConsentMarkdown,
    };
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
  }
}

describe('consent markdown render', () => {
  const { parseMarkdown, parseConsentDocument, prepareConsentMarkdown } = loadParseMarkdown();

  it('exports parseMarkdown', () => {
    expect(typeof parseMarkdown).toBe('function');
    expect(typeof parseConsentDocument).toBe('function');
    expect(typeof prepareConsentMarkdown).toBe('function');
  });

  it('prepareConsentMarkdown strips (Оферта) and metadata blockquote for canvas hero', () => {
    const meta = prepareConsentMarkdown(offer);
    expect(meta.title).toBe('Пользовательское соглашение');
    expect(meta.version).toBeTruthy();
    expect(meta.effectiveDate).toContain('августа');
    expect(meta.body).not.toMatch(/^#\s+/m);
    expect(meta.body).not.toContain('**Версия:**');
  });

  it('parseConsentDocument renders canvas typography classes, not prose italics', () => {
    const parsed = parseConsentDocument(offer);
    expect(parsed.html).toContain('consent-doc-h2');
    expect(parsed.html).toContain('consent-doc-p');
    expect(parsed.html).not.toContain('**Версия:**');
    expect(parsed.html).not.toContain('Пользовательское соглашение (Оферта)');
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

describe('PEP: обязательные согласия только после чтения', () => {
  it('не ставит галочку обязательного без дочитывания — открывает полный текст', () => {
    expect(source).toContain('readRequiredTypes');
    expect(source).toContain('handleRequiredOrOptionalToggle');
    expect(source).toContain('lockUntilRead');
    expect(source).toContain("idle: isReadonlyHost ? 'Продолжить' : (allRequiredAccepted ? 'Подписать' : 'Подписать оба')");
    expect(source).toMatch(/if \(isRequiredRead && !readRequiredTypes\[type\] && !consents\[type\]\)/);
    expect(source).toContain('setShowFullText(type)');
  });

  it('кнопка «Ознакомлен» в полном тексте только после прокрутки', () => {
    expect(source).toContain('!loading && !error && React.createElement(\'button\'');
    // Проверка сторожила запрет действия до дочитывания, а не атрибут disabled.
    // Строка контракта «доступность» требует, чтобы до дочитывания причина была
    // названа словами (aria-disabled + описание), — из обхода кнопка выпадать не
    // должна. Запрет теперь держит guard в onClick, disabled остался только на
    // время запроса. Поведение проверяется рендером:
    // __tests__/consent-v4-accessibility-smoke.test.js.
    expect(source).toContain('if (busy || !hasScrolledToEnd) return;');
    expect(source).toContain('disabled: !!busy,');
    expect(source).toContain("'aria-disabled': (!!busy || !hasScrolledToEnd) ? 'true' : undefined");
    expect(source).toContain("idle: (acceptLabel || 'Ознакомлен, принимаю')");
  });
});
