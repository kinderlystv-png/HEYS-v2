import fs from 'fs';
import path from 'path';

import { describe, expect, it, vi } from 'vitest';

// Два контрола в шапке переключали вкладку и не работали:
// «Настройки» в дропдауне аккаунта звали setActiveTab, который в AppHeader
// только деструктурировался из props, но никем не передавался — и просили
// вкладку 'profile', которой не существует (профиль живёт под ключом 'user').
// Бейдж пушей звал switchTabWithUndoCommit — хелпер из области AppTabsNav,
// то есть падал с ReferenceError. Хелпер поднят на уровень модуля.

const WEB_DIR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');

// Тело компонента верхнего уровня: от объявления до закрывающей скобки
// с той же индентацией (4 пробела).
function componentBody(name) {
  const lines = SRC.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`    function ${name}(`));
  expect(start, `компонент ${name} не найден`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l === '    }');
  expect(end, `конец ${name} не найден`).toBeGreaterThan(start);
  return { body: lines.slice(start, end + 1).join('\n'), start, end };
}

describe('переключение вкладки из шапки', () => {
  it('AppHeader не зовёт хелпер из чужой области видимости', () => {
    const header = componentBody('AppHeader');
    const nav = componentBody('AppTabsNav');

    // switchTabWithUndoCommit объявлен внутри AppTabsNav — для AppHeader это
    // ReferenceError, а не тихий промах.
    expect(nav.body).toContain('const switchTabWithUndoCommit =');
    expect(header.body).not.toContain('switchTabWithUndoCommit');
  });

  it('общий хелпер объявлен на уровне модуля и раньше обоих компонентов', () => {
    const declaration = SRC.indexOf('\n    function commitUndoAndSwitchTab(');
    expect(declaration, 'хелпер не на уровне модуля').toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(SRC.indexOf('\n    function AppHeader('));
    expect(declaration).toBeLessThan(SRC.indexOf('\n    function AppTabsNav('));
  });

  it('«Настройки» в дропдаунe открывают вкладку user, а не несуществующую profile', () => {
    const header = componentBody('AppHeader');
    expect(header.body).toContain("reason: 'account-dropdown-settings'");
    expect(header.body).not.toMatch(/setActiveTab\('profile'\)/);
    // Мёртвый проп убран целиком — иначе его снова кто-нибудь позовёт.
    // Комментарии не считаем: в них имя упомянуто как история.
    const code = header.body.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('setActiveTab');
  });

  it('бейдж пушей убран из шапки (UI v4); скролл к push — во вкладке user', () => {
    const header = componentBody('AppHeader');
    expect(header.body).not.toContain("reason: 'push-settings-badge'");
    expect(header.body).toMatch(/Колокольчик убран из шапки/);
    const userTab = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');
    expect(userTab).toContain('heys:scroll-to-push-settings');
  });

  it('оба компонента реально получают tab и setTab из props', () => {
    for (const name of ['AppHeader', 'AppTabsNav']) {
      const { body } = componentBody(name);
      const props = body.slice(0, body.indexOf('} = props;'));
      expect(props, `${name}: нет tab`).toMatch(/^\s+tab,$/m);
      expect(props, `${name}: нет setTab`).toMatch(/^\s+setTab,$/m);
    }
  });

  it('setTab действительно передаётся в AppHeader сборщиком пропсов', () => {
    const props = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_props_v1.js'), 'utf8');
    expect(props).toMatch(/^\s+setTab,$/m);
  });
});

describe('commitUndoAndSwitchTab: поведение', () => {
  // Хелпер самодостаточен — вытаскиваем его исходник и исполняем как есть.
  function loadHelper() {
    const start = SRC.indexOf('    function commitUndoAndSwitchTab(');
    const end = SRC.indexOf('\n    }\n', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const src = SRC.slice(start, end + 6);
    // eslint-disable-next-line no-new-func
    return new Function('window', 'console', `${src}; return commitUndoAndSwitchTab;`);
  }

  const quietConsole = { info: () => { } };

  it('переключает вкладку', () => {
    const fn = loadHelper()({ HEYS: {} }, quietConsole);
    const setTab = vi.fn();
    fn(setTab, 'user', { currentTab: 'stats', reason: 'test' });
    expect(setTab).toHaveBeenCalledWith('user');
  });

  it('коммитит висящий undo перед переключением', () => {
    const commit = vi.fn();
    const fn = loadHelper()({ HEYS: { Undo: { pending: true, commit } } }, quietConsole);
    const setTab = vi.fn();
    fn(setTab, 'user', { currentTab: 'stats', reason: 'account-dropdown-settings' });
    expect(commit).toHaveBeenCalledWith('account-dropdown-settings');
    expect(setTab).toHaveBeenCalledWith('user');
  });

  it('без висящего undo ничего не коммитит', () => {
    const commit = vi.fn();
    const fn = loadHelper()({ HEYS: { Undo: { pending: false, commit } } }, quietConsole);
    fn(vi.fn(), 'user', {});
    expect(commit).not.toHaveBeenCalled();
  });

  it('падение Undo.commit не срывает переключение вкладки', () => {
    const fn = loadHelper()(
      { HEYS: { Undo: { pending: true, commit: () => { throw new Error('boom'); } } } },
      quietConsole
    );
    const setTab = vi.fn();
    expect(() => fn(setTab, 'user', {})).not.toThrow();
    expect(setTab).toHaveBeenCalledWith('user');
  });
});
