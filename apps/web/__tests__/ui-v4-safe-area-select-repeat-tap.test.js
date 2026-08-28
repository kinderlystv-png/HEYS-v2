// Три сквозных дефекта из построчной сверки контракта v4 (десятая сборка,
// «правила продукта») в зонах login/registration/questionnaire: врезки
// экрана, запрет выделения служебного текста, защита от повторного тапа.
//
// Как замерено:
//   1. safe-area — там, где значение keyword (justify-content), читается
//      вычисленный стиль реальных модулей CSS: так в этом проекте уже
//      находили перебитые правила (см. widgets-v4-corner-zones.test.js).
//      Для самих env()/calc() пар вычисленный стиль недоступен в принципе:
//      happy-dom (окружение этого проекта, vitest.config.ts) не парсит
//      `calc(... env(...) ...)` ни в каскаде, ни в инлайн-style — значение
//      отбрасывается целиком (проверено отдельно). Поэтому для env()/calc()
//      берётся текст ПОБЕЖДАЮЩЕГО в каскаде объявления (уникальный
//      селектор — проверено, что второго такого блока в styles/ нет), а не
//      «встречается где-то в файле». Тот же приём уже применяет
//      app-nav-v4-frame.test.js для своего safe-area.
//   2. user-select — keyword, читается вычисленный стиль честно.
//   3. повторный тап — реальный рендер компонента, реальный двойной клик,
//      счётчик сетевых/save-вызовов. Это ловит именно то, о чём предупреждает
//      контракт: блокировка на время операции не спасает, если сеть отвечает
//      быстрее 350 мс.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const LOGIN_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/733-ui-v4-login-theme.css'), 'utf8');

function extractRule(css, startSelectorRegex) {
  const m = startSelectorRegex.exec(css);
  expect(m, `правило ${startSelectorRegex} не найдено`).toBeTruthy();
  const open = css.indexOf('{', m.index);
  const close = css.indexOf('}', open);
  return css.slice(m.index, close + 1);
}

// ── Задача 1: врезки экрана ────────────────────────────────────────────────
describe('safe-area — врезки экрана', () => {
  describe('login: карточка центруется между врезками, а не прижата к верху', () => {
    function mountShell(extraClass = '') {
      document.head.innerHTML = '';
      document.body.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = LOGIN_CSS;
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.id = 'heys-login-gate';
      el.className = `heys-auth-shell ${extraClass}`.trim();
      document.body.appendChild(el);
      return el;
    }

    it('клиентский экран: justify-content реально резолвится в center (было flex-start)', () => {
      const el = mountShell();
      expect(getComputedStyle(el).justifyContent).toBe('center');
    });

    it('кураторский экран остался центрированным (свой override не задет)', () => {
      const el = mountShell('heys-auth-shell--curator');
      expect(getComputedStyle(el).justifyContent).toBe('center');
    });

    it('нижняя врезка добавлена поверх прежнего нулевого отступа', () => {
      // Селектор `.heys-auth-shell` — единственный такой блок в styles/
      // (проверено: grep не находит второго определения), поэтому текст
      // этого блока и есть побеждающее в каскаде объявление.
      const rule = extractRule(LOGIN_CSS, /^\.heys-auth-shell,\r?\n#heys-login-gate\.heys-auth-shell \{/m);
      expect(rule).toMatch(/padding-bottom:\s*calc\(0px \+ env\(safe-area-inset-bottom, 0px\)\)\s*!important/);
    });
  });

  describe('registration: шторка подписи и модалка документа — врезки уже были верны (регресс-охрана)', () => {
    it('шторка подписи держит нижнюю врезку', () => {
      const rule = extractRule(LOGIN_CSS, /^\.heys-consent-sign-sheet \{/m);
      expect(rule).toMatch(/padding-bottom:\s*calc\(22px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    });

    it('модалка полного текста документа держит верхнюю и нижнюю врезку', () => {
      const rule = extractRule(LOGIN_CSS, /^\.consent-fulltext-backdrop \{/m);
      expect(rule).toMatch(/padding-top:\s*calc\(12px \+ env\(safe-area-inset-top, 0px\)\)/);
      expect(rule).toMatch(/padding-bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    });
  });

  describe('questionnaire: врезок не было вовсе — теперь есть', () => {
    const intakeSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_trial_intake_v1.js'), 'utf8');

    it('фон экрана анкеты несёт верхнюю и нижнюю врезку поверх базовых 24/48', () => {
      const shellStyleBlock = intakeSrc.slice(
        intakeSrc.indexOf('const shellStyle = {'),
        intakeSrc.indexOf('};', intakeSrc.indexOf('const shellStyle = {')),
      );
      expect(shellStyleBlock).toMatch(/paddingTop:\s*'calc\(24px \+ env\(safe-area-inset-top, 0px\)\)'/);
      expect(shellStyleBlock).toMatch(/paddingBottom:\s*'calc\(48px \+ env\(safe-area-inset-bottom, 0px\)\)'/);
    });

    it('полноэкранная модалка (подтверждение выхода/рестарта/резюме) несёт врезки', () => {
      const noticeStart = intakeSrc.indexOf("position: 'fixed', inset: 0, zIndex: 40");
      expect(noticeStart).toBeGreaterThan(-1);
      const noticeBlock = intakeSrc.slice(noticeStart, noticeStart + 400);
      expect(noticeBlock).toMatch(/paddingTop:\s*'calc\(16px \+ env\(safe-area-inset-top, 0px\)\)'/);
      expect(noticeBlock).toMatch(/paddingBottom:\s*'calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\)'/);
    });
  });
});

// ── Задача 2: запрет выделения там, где строка контракта его требует ──────
describe('запрет выделения — только служебные/одноразовые узлы', () => {
  function mountAll(classNames) {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = LOGIN_CSS;
    document.head.appendChild(style);
    const map = {};
    classNames.forEach((cls) => {
      const el = document.createElement('div');
      el.className = cls;
      document.body.appendChild(el);
      map[cls] = el;
    });
    return map;
  }

  it('login: цифры в боксах кода не выделяются (боксы — 733:420, было без user-select)', () => {
    const els = mountAll(['heys-auth-pin-input', 'heys-auth-prefix', 'heys-auth-title']);
    expect(getComputedStyle(els['heys-auth-pin-input']).userSelect).toBe('none');
    // Контроль: уже было — не сломано.
    expect(getComputedStyle(els['heys-auth-prefix']).userSelect).toBe('none');
    // Контроль: заголовок экрана трогать не просили — выделение по умолчанию.
    expect(getComputedStyle(els['heys-auth-title']).userSelect).not.toBe('none');
  });

  it('registration: подпись/дата/версия документа не выделяются, а текст документа — можно', () => {
    const els = mountAll([
      'heys-consent-sign-sheet__doc-edition',
      'heys-consent-sign-sheet__done-meta',
      'heys-consent-sign-sheet__doc-version',
      'consent-fulltext__badge consent-fulltext__badge--version',
      'consent-fulltext__badge consent-fulltext__badge--date',
      'consent-fulltext__scroll',
    ]);
    expect(getComputedStyle(els['heys-consent-sign-sheet__doc-edition']).userSelect).toBe('none');
    expect(getComputedStyle(els['heys-consent-sign-sheet__done-meta']).userSelect).toBe('none');
    expect(getComputedStyle(els['heys-consent-sign-sheet__doc-version']).userSelect).toBe('none');
    expect(getComputedStyle(els['consent-fulltext__badge consent-fulltext__badge--version']).userSelect).toBe('none');
    expect(getComputedStyle(els['consent-fulltext__badge consent-fulltext__badge--date']).userSelect).toBe('none');
    // Строка контракта требует обратного для самого текста документа —
    // регресс-охрана, чтобы никто не расширил запрет по инерции.
    expect(getComputedStyle(els['consent-fulltext__scroll']).userSelect).not.toBe('none');
  });

  // Строка «вид блока предупреждения» (переписана 25 августа) развернула это
  // правило: текст предупреждения выделяется и копируется — человек имеет право
  // сохранить или показать то, что подтверждает. Строка «язык, выделение,
  // часовой пояс» той же зоны всё ещё зовёт его служебным, но она прежней
  // редакции, а изменённая строка называет исключение прямо.
  it('questionnaire: предупреждение выделяется как исключение', () => {
    const intakeSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_trial_intake_v1.js'), 'utf8');
    const warnBlockStart = intakeSrc.indexOf("id: 'intake-warning-text'");
    expect(warnBlockStart).toBeGreaterThan(-1);
    const warnBlock = intakeSrc.slice(warnBlockStart, warnBlockStart + 1400);
    expect(warnBlock).toMatch(/userSelect:\s*'text'/);
    expect(warnBlock).not.toMatch(/userSelect:\s*'none'/);
  });
});

// ── Задача 3: защита от повторного тапа — минимум 350 мс ──────────────────
function flushMs(ms) {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('повторный тап — минимум 350 мс поверх блокировки на время операции', () => {
  describe('registration: «Дальше» в мастере профиля (heys_step_modal_v1.js)', () => {
    const STEP_MODAL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_step_modal_v1.js'), 'utf8');

    function loadStepModal() {
      window.React = React;
      window.ReactDOM = { createRoot: vi.fn() };
      window.HEYS = {
        utils: { lsGet: () => ({}), lsSet: vi.fn() },
        dayUtils: { todayISO: () => '2026-08-24' },
      };
      // eslint-disable-next-line no-new-func
      new Function(STEP_MODAL_SRC)();
      return window.HEYS.StepModal;
    }

    afterEach(() => {
      cleanup();
    });

    it('быстрый save (резолвится почти мгновенно) не открывает окно для второго тапа раньше 350 мс — а после окна тап снова проходит', async () => {
      const modal = loadStepModal();
      const save = vi.fn(() => Promise.resolve({ completed: true }));
      modal.registerStep('weight', {
        component: () => React.createElement('div', null, 'weight'),
        save,
      });
      const onComplete = vi.fn();
      render(React.createElement(modal.Component, {
        steps: ['weight'],
        requireStepAck: true,
        onComplete,
        showTip: false,
      }));

      const finish = screen.getByRole('button', { name: 'Готово' });
      await act(async () => {
        finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // save() и onComplete() резолвятся почти мгновенно — это и есть риск
        // из контракта: без 350-мс пола actionInFlightRef успел бы
        // сброситься до истечения защитного окна.
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);

      // Второй тап внутри защитного окна (< 350 мс от первого) — не проходит.
      await act(async () => {
        finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);

      // Окно (350 мс от первого тапа) истекло — обычный повторный тап
      // снова возможен, защита не стала постоянной блокировкой.
      await flushMs(320);
      await act(async () => {
        finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      // onComplete, а не save — у save своя дедупликация по неизменной
      // подписи шага (getStepSaveSignature), она к 350-мс защите не
      // относится и не должна маскировать проверку.
      expect(onComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('registration: «Подписать» в шторке доступа (heys_consents_v1.js)', () => {
    function loadScript(relPath) {
      const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
      // eslint-disable-next-line no-new-func
      new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
    }

    // Версия должна совпасть с ожидаемой (CURRENT_VERSIONS) — иначе загрузчик
    // документа считает ответ CDN устаревшим и подпись остаётся недоступной.
    function docMarkdown(url) {
      const version = (/\/v(\d+(?:\.\d+)?)\//.exec(String(url))
        || /[?&]v=(\d+(?:\.\d+)?)/.exec(String(url))
        || [null, '1.0'])[1];
      return ['# Документ', '', `**Версия:** ${version}`, '', 'Текст документа для смоука.', ''].join('\n');
    }

    beforeAll(() => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      window.React = React;
      window.HEYS = window.HEYS || {};
      window.__heysLoadingProgress = { skippedForTest: true };
      loadScript('heys_loading_progress_v1.js');
      loadScript('heys_auth_pin_keypad_v1.js');
      loadScript('heys_consents_v1.js');
    });

    let roots = [];
    function renderNode(node) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      act(() => { root.render(node); });
      roots.push({ root, host });
      return host;
    }
    function click(el) {
      act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    }
    async function flush() {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }

    let signRpc;
    let feedbackEmit;

    beforeEach(() => {
      window.HEYS.auth = Object.assign({}, window.HEYS.auth, {
        validatePinStrict: (value) => /^\d{4}$/.test(String(value || '')),
      });
      global.fetch = vi.fn(async (url) => ({ ok: true, status: 200, text: async () => docMarkdown(url) }));
      signRpc = vi.fn(async () => ({ data: { sign_consents_with_access_code_by_session: { success: true } } }));
      feedbackEmit = vi.fn();
      window.HEYS.feedback = { emit: feedbackEmit };
      window.HEYS.YandexAPI = {
        logConsentsBySession: vi.fn(async () => ({
          data: { log_consents_by_session: { success: false, error: 'signing_requires_access_code' } },
        })),
        signConsentsWithAccessCodeBySession: signRpc,
      };
    });

    afterEach(() => {
      act(() => { roots.forEach(({ root }) => root.unmount()); });
      roots.forEach(({ host }) => host.remove());
      roots = [];
      vi.restoreAllMocks();
      localStorage.clear();
    });

    it('PIN-автоотправка и явный тап по «Подписать» почти одновременно — подпись уходит на сервер один раз', async () => {
      const host = renderNode(React.createElement(window.HEYS.Consents.ConsentScreen, {
        clientId: 'smoke-client',
        phone: null,
        onComplete: () => {},
        onCancel: () => {},
        onError: () => {},
      }));

      // Оба обязательных документа: открыть, дочитать (в jsdom/happy-dom
      // короткий документ помещается без скролла и засчитывается сразу),
      // принять — реальный путь handleProceedToVerify, без diagnosticReplay,
      // иначе защита в handleAccessCodeSign вообще не исполняется.
      for (let pass = 0; pass < 2; pass += 1) {
        const openBtn = Array.from(host.querySelectorAll('button'))
          .filter((el) => (el.textContent || '').includes('Читать полностью'))[pass];
        click(openBtn);
        // eslint-disable-next-line no-await-in-loop
        await flush();
        const accept = document.querySelector('.consent-fulltext__accept');
        click(accept);
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }

      const proceed = Array.from(host.querySelectorAll('button'))
        .find((el) => (el.textContent || '').trim().startsWith('Подписать'));
      click(proceed);
      await flush();

      const sheet = document.querySelector('.heys-consent-sign-sheet');
      expect(sheet).toBeTruthy();
      // Тот же 350-мс пол (handleProceedToVerify) держит `loading` ещё
      // немного после перехода на шторку — общее состояние экрана. Ждём,
      // пока клавиатура разблокируется, иначе ниже проверялся бы не тот тап.
      await flushMs(360);

      // Набираем 4 цифры кода клавиатурой шторки — по завершении срабатывает
      // автоотправка (useEffect на isComplete). Кнопка «Подписать» тем
      // временем гаснет сама (loading), и попытка тапнуть по ней следом
      // (habit tap) естественно не проходит — обе дорожки ведут к одному
      // и тому же вызову, который должен уйти на сервер ровно один раз.
      const digits = ['2', '1', '2', '3'];
      digits.forEach((d) => {
        const key = Array.from(sheet.querySelectorAll('button'))
          .find((el) => el.textContent.trim() === d);
        click(key);
      });
      const signBtn = Array.from(sheet.querySelectorAll('button'))
        .find((el) => (el.textContent || '').includes('Подписать'));
      if (signBtn) click(signBtn);

      await flush();
      await flushMs(60);
      expect(signRpc).toHaveBeenCalledTimes(1);
      expect(feedbackEmit).toHaveBeenCalledOnce();
      expect(feedbackEmit).toHaveBeenCalledWith('document.signed');

      // Спустя полное защитное окно новых самопроизвольных вызовов нет.
      await flushMs(350);
      expect(signRpc).toHaveBeenCalledTimes(1);
      expect(feedbackEmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('questionnaire: «Отправить» на шаге 5 / в сводке (heys_trial_intake_v1.js)', () => {
    const intakeSource = fs.readFileSync(path.join(WEB_DIR, 'heys_trial_intake_v1.js'), 'utf8');
    const completedAnswers = {
      goals: { primary_goal: 'Наладить регулярное питание', success_definition: 'Стабильный режим' },
      experience: { previous_experience: 'self' },
      lifestyle: { schedule: 'Рабочий день', sleep: 'Около восьми часов' },
      collaboration: { daily_tracking: 'yes', feedback_style: 'concise' },
      warning: {
        acknowledged_at: '2026-08-11T10:00:00.000Z',
        text_version: 'pending-owner-text',
        // Вторая отметка шага 5: без неё «Отправить» заблокирована.
        age_confirmed_at: '2026-08-11T10:00:00.000Z',
      },
      meta: { schema_version: '1.2' },
    };

    const originalHEYS = window.HEYS;
    const originalReact = window.React;

    afterEach(() => {
      cleanup();
      vi.restoreAllMocks();
      window.HEYS = originalHEYS;
      window.React = originalReact;
      window.history.replaceState({}, '', '/');
    });

    it('быстрый ответ сервера не открывает окно для второй отправки раньше 350 мс', async () => {
      const rpc = vi.fn(async (fn, params) => {
        if (fn === 'get_trial_intake_by_session') {
          return { data: { get_trial_intake_by_session: {
            success: true,
            intake: { status: 'in_progress', current_step: 4, answers: completedAnswers },
          } } };
        }
        // Сервер отвечает почти мгновенно — ровно риск, который назван в
        // контракте: без пола второй тап успел бы отправить анкету дважды.
        return { data: { save_trial_intake_by_session: {
          success: true,
          status: params.p_complete ? 'completed' : 'in_progress',
          current_step: params.p_current_step,
        } } };
      });
      window.React = React;
      window.HEYS = { YandexAPI: { rpc } };
      // eslint-disable-next-line no-eval
      (0, eval)(intakeSource);

      render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
      const submit = await screen.findByRole('button', { name: 'Отправить куратору' });

      await act(async () => {
        fireEvent.click(submit);
        fireEvent.click(submit);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const completeCalls = rpc.mock.calls.filter(([fn, params]) => (
        fn === 'save_trial_intake_by_session' && params.p_complete === true
      ));
      expect(completeCalls.length).toBe(1);
      await screen.findByText('Анкета отправлена');
    });
  });
});
