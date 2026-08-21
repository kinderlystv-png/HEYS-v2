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
  const lines = SRC.split(/\r?\n/);
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

    // switchTab объявлен внутри AppTabsNav — для AppHeader это
    // ReferenceError, а не тихий промах.
    expect(nav.body).toContain('const switchTab =');
    expect(header.body).not.toContain('switchTab(');
  });

  it('общий хелпер объявлен на уровне модуля и раньше обоих компонентов', () => {
    const declaration = SRC.indexOf('\n    function switchAppTab(');
    expect(declaration, 'хелпер не на уровне модуля').toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(SRC.indexOf('\n    function AppHeader('));
    expect(declaration).toBeLessThan(SRC.indexOf('\n    function AppTabsNav('));
  });

  it('«Настройки» в дропдаунe открывают вкладку user, а не несуществующую profile', () => {
    const header = componentBody('AppHeader');
    expect(header.body).toContain("switchAppTab(setTab, 'user'");
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

  it('лист «Ещё»: pushBusy объявлен в AppTabsNav, без чужого setPushStatus', () => {
    const nav = componentBody('AppTabsNav');
    // Открытие листа рендерит disabled: pushBusy — без локального state это
    // ReferenceError и ErrorBoundary (2026-08-16).
    expect(nav.body).toContain('const [pushBusy, setPushBusy] = React.useState(false)');
    expect(nav.body).toContain('disabled: pushBusy');
    expect(nav.body).not.toContain('setPushStatus(');
  });

  it('лист «Ещё»: тумблер push открывает PIN при consent_needs_access_code', () => {
    const nav = componentBody('AppTabsNav');
    expect(nav.body).toContain("r.reason === 'consent_needs_access_code'");
    expect(nav.body).toContain('setSettingsMenuOpen(false)');
    expect(nav.body).toContain('setSheetPushAccessOpen(true)');
    expect(nav.body).toContain('handleSheetPushAccessSign');
    expect(nav.body).toContain('accessCode: sheetPushAccessPin.pinValue');
    expect(nav.body).toContain('sheetPushAccessOpen');
    expect(nav.body).toContain('.sheet-push-access-sign');
  });

  it('setTab действительно передаётся в AppHeader сборщиком пропсов', () => {
    const props = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_props_v1.js'), 'utf8');
    expect(props).toMatch(/^\s+setTab,$/m);
  });
});

describe('switchAppTab: поведение', () => {
  // Хелпер самодостаточен — вытаскиваем его исходник и исполняем как есть.
  function loadHelper() {
    const start = SRC.indexOf('    function switchAppTab(');
    const endMatch = SRC.slice(start).match(/\r?\n    }\r?\n/);
    const end = endMatch ? start + endMatch.index : -1;
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const src = SRC.slice(start, end + endMatch[0].length);
    // eslint-disable-next-line no-new-func
    return new Function('window', 'console', `${src}; return switchAppTab;`);
  }

  const quietConsole = { info: () => { } };

  // Модель настоящего HEYS.Undo: commit() уходит в commitCurrent → onExpire,
  // а onExpire у вызывающих — необратимое удаление (deleteClient, deletePhoto,
  // deleteTask, удаление продукта). См. apps/web/heys_undo_v1.js.
  function fakeUndoBar(onExpire) {
    const bar = {
      pending: true,
      commit: vi.fn((reason = 'manual') => {
        if (!bar.pending) return;
        bar.pending = false;
        onExpire(reason);
      }),
    };
    return bar;
  }

  it('переключает вкладку', () => {
    const fn = loadHelper()({ HEYS: {} }, quietConsole);
    const setTab = vi.fn();
    fn(setTab, 'user');
    expect(setTab).toHaveBeenCalledWith('user');
  });

  // Контракт v4 («тост и навигация»): уход со вкладки тост не гасит — он живёт
  // свои 5 с поверх нижней навигации на любом экране.
  it('не трогает висящую отмену: бар остаётся, onExpire не выполняется', () => {
    const onExpire = vi.fn();
    const undo = fakeUndoBar(onExpire);
    const fn = loadHelper()({ HEYS: { Undo: undo } }, quietConsole);
    const setTab = vi.fn();

    fn(setTab, 'user');

    expect(setTab).toHaveBeenCalledWith('user');
    expect(undo.commit).not.toHaveBeenCalled();
    // Главное: отложенное удаление не выполнено раньше срока.
    expect(onExpire).not.toHaveBeenCalled();
    expect(undo.pending).toBe(true);
  });

  it('несколько переключений подряд не съедают отмену', () => {
    const onExpire = vi.fn();
    const undo = fakeUndoBar(onExpire);
    const fn = loadHelper()({ HEYS: { Undo: undo } }, quietConsole);
    const setTab = vi.fn();

    fn(setTab, 'stats');
    fn(setTab, 'diary');
    fn(setTab, 'widgets');

    expect(setTab).toHaveBeenCalledTimes(3);
    expect(undo.commit).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
    expect(undo.pending).toBe(true);
  });

  it('в исходнике хелпера не осталось коммита отмены', () => {
    const start = SRC.indexOf('    function switchAppTab(');
    const endMatch = SRC.slice(start).match(/\r?\n    }\r?\n/);
    const body = SRC.slice(start, start + endMatch.index);
    expect(body).not.toContain('Undo');
  });

  // Заодно закрываем обход мимо хелпера: коммитов отмены в оболочке ровно два,
  // и оба — про смену контекста, а не про вкладку.
  it('во всей оболочке коммитят отмену только дата и смена контекста', () => {
    const calls = SRC.split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .filter((line) => /Undo\??\.commit\(/.test(line))
      .map((line) => line.trim());
    expect(calls).toEqual([
      "HEYS.Undo.commit('header-date-switch');",
      'HEYS.Undo.commit(reason);',
    ]);
  });
});

describe('смена контекста, в отличие от вкладки, отмену коммитит', () => {
  // Отмена восстановила бы запись в невидимый пользователю день или чужому
  // клиенту — здесь коммит остаётся намеренно.
  it('шапка коммитит undo при смене даты и при смене клиента', () => {
    expect(SRC).toContain("HEYS.Undo.commit('header-date-switch')");
    expect(SRC).toContain("commitPendingUndoBeforeContextChange('client-switch'");
  });

  it('отчёты коммитят undo при смене даты', () => {
    const stats = fs.readFileSync(path.join(WEB_DIR, 'heys_day_stats_v1.js'), 'utf8');
    expect(stats).toContain("commit('stats-date-switch')");
  });
});
