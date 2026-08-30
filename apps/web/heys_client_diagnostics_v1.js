// heys_client_diagnostics_v1.js — curator-facing client boot/session diagnostics.
(function (global) {
  'use strict';
  var HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.ClientDiagnostics) return;

  var activeRoot = null;
  var STYLE_ID = 'heys-client-diagnostics-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.cd-backdrop{position:fixed;inset:0;z-index:10040;background:rgba(25,27,46,.46);display:flex;align-items:center;justify-content:center;padding:20px}',
      '.cd-modal{width:min(920px,100%);max-height:min(820px,calc(100vh - 40px));background:#f8f8fc;border:1px solid rgba(67,69,135,.14);border-radius:20px;box-shadow:0 24px 70px rgba(28,31,64,.24);display:flex;flex-direction:column;overflow:hidden;color:#25263d}',
      '.cd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 16px;background:#fff;border-bottom:1px solid #e8e8f0}',
      '.cd-title{font-size:20px;font-weight:750;line-height:1.25}.cd-subtitle{font-size:13px;color:#74758c;margin-top:4px}',
      '.cd-icon-btn,.cd-control,.cd-copy,.cd-full-log{min-height:44px;border-radius:11px;border:1px solid #dadae8;background:#fff;color:#343553;font:inherit;cursor:pointer}',
      '.cd-icon-btn{width:44px;font-size:20px}.cd-toolbar{display:flex;gap:10px;flex-wrap:wrap;padding:14px 24px;background:#fff;border-bottom:1px solid #e8e8f0}',
      '.cd-toolbar .cd-control{width:auto;flex:0 0 150px;padding:0 12px;min-width:120px}.cd-copy{padding:0 14px;margin-left:auto;color:var(--v4-act, #c67139);font-weight:650}',
      '.cd-body{padding:18px 24px 26px;overflow:auto}.cd-summary{font-size:14px;color:#62637a;margin-bottom:12px}',
      '.cd-session{background:#fff;border:1px solid #e4e4ee;border-radius:14px;margin-bottom:10px;overflow:hidden}.cd-session--failed{border-color:#e6b5b5}.cd-session--degraded,.cd-session--abandoned{border-color:#ead6a1}',
      '.cd-session-btn{width:100%;border:0;background:transparent;text-align:left;padding:15px 16px;cursor:pointer;color:inherit}',
      '.cd-session-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cd-status{display:inline-flex;align-items:center;min-height:25px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:750}',
      '/* .cd-status--* — в styles/modules/734: метку состояния рисует и лист «Диагностики», там роли набора и гейт перекраски */',
      '.cd-time{font-weight:700;font-size:14px}.cd-device{font-size:13px;color:#696a80;margin-left:auto}.cd-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:#7b7c91;font-size:12px}',
      '.cd-timeline{border-top:1px solid #ececf3;padding:8px 16px 14px}.cd-full-log{width:100%;padding:0 14px;margin:4px 0 8px;border-color:var(--v4-act, #c67139);background:var(--v4-act, #c67139);color:var(--v4-btn-on-act, #fff5ef);font-weight:700}.cd-event{position:relative;padding:8px 0 8px 22px;font-size:13px}.cd-event:before{content:"";position:absolute;left:4px;top:14px;width:8px;height:8px;border-radius:50%;background:#7779ad}.cd-event--failed:before{background:#b94a4a}.cd-event-time{color:#88899c;margin-right:8px}.cd-event-context{display:block;color:#77788d;font-size:12px;margin-top:2px;word-break:break-word}',
      '.cd-section-title{font-size:15px;font-weight:750;margin:22px 0 10px}.cd-login{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;background:#fff;border:1px solid #e7e7ef;border-radius:11px;margin-bottom:7px;font-size:13px}.cd-login-time{white-space:nowrap;color:#6f7085}.cd-login-ua{color:#7b7c90;word-break:break-word}',
      '.cd-empty,.cd-loading,.cd-error{padding:36px 18px;text-align:center;color:#74758c;background:#fff;border:1px solid #e6e6ef;border-radius:14px}.cd-error{color:#963d3d;border-color:#efcccc}',
      '/* .cdo, .cdo-head, .cdo-title, .cdo-note, .cdo-actions, .cdo-list — в styles/modules/734: там роли набора и гейт перекраски */',
      '/* .cdo-metrics и .cdo-metric переехали в styles/modules/734: там они на ролях набора и под гейтом перекраски */',
      '/* .cdo-megalog и .cdo-mega-btn — там же */',
      '/* .cdo-filters и .cdo-control — там же */.cdo-search{grid-column:span 2}',
      '/* .cdo-sessions, .cdo-session, .cdo-row, .cdo-client, .cdo-small, .cdo-problem, .cdo-ok, .cdo-chevron, .cdo-detail, .cdo-timeline, .cdo-event и .cdo-more — там же: лист вкладки собран набором */',
      '@media(max-width:640px){.cd-backdrop{padding:0;align-items:flex-end}.cd-modal{max-height:94vh;border-radius:20px 20px 0 0}.cd-head{padding:18px 16px 14px}.cd-toolbar{padding:12px 16px}.cd-body{padding:14px 16px 24px}.cd-toolbar .cd-control{flex:1 1 120px;min-width:0;width:auto}.cd-copy{width:100%;margin-left:0}.cd-device{width:100%;margin-left:0}.cd-session-btn{padding:14px}}'
      ,'/* адаптив вкладки — в styles/modules/734 вместе с самими правилами */'
    ].join('');
    document.head.appendChild(style);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDuration(ms) {
    var seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    if (seconds < 60) return seconds + ' сек';
    return Math.floor(seconds / 60) + ' мин ' + (seconds % 60) + ' сек';
  }

  var STATUS = {
    ready: ['Штатно', 'ready'], failed: ['Сбой', 'failed'], degraded: ['С отклонениями', 'degraded'],
    abandoned: ['Не завершено', 'abandoned'], starting: ['Загружается', 'starting']
  };

  function safeReport(clientName, data) {
    var lines = ['HEYS — диагностика загрузок', 'Клиент: ' + (clientName || 'Без имени'), 'Период с: ' + (data.since || '—'), ''];
    (data.sessions || []).forEach(function (session) {
      lines.push([formatDate(session.started_at), session.outcome, session.device_class, session.os_name, session.browser_name, session.display_mode, 'build=' + (session.build_id || 'unknown')].filter(Boolean).join(' | '));
      (session.events || []).forEach(function (event) {
        lines.push('  ' + formatDate(event.at) + ' ' + (event.name || 'event') + ' ' + (event.status || ''));
      });
    });
    return lines.join('\n');
  }

  var EVENT_LABELS = {
    pin_success: 'Вход выполнен', pin_failed: 'Ошибка входа', pin_rate_limited: 'Вход временно ограничен',
    visit_started: 'Посещение началось', client_opened: 'Клиент открыт', app_foregrounded: 'Приложение открыто из фона', visit_ready: 'Посещение готово',
    boot_started: 'Запуск приложения', boot_ready: 'Приложение готово', boot_failed: 'Ошибка запуска',
    app_runtime_failed: 'Ошибка приложения', sync_cycle_started: 'Синхронизация началась',
    sync_cycle_completed: 'Синхронизация завершена', sync_cycle_failed: 'Ошибка синхронизации',
    sync_recovered: 'Синхронизация восстановлена', write_queued: 'Изменения ждут отправки',
    write_uploaded: 'Изменения сохранены', write_failed: 'Не удалось сохранить изменения',
    whats_new_shown: 'Показано «Что нового»', whats_new_acknowledged: '«Что нового» закрыто',
    curator_changes_shown: 'Показаны правки куратора', curator_changes_acknowledged: 'Правки куратора прочитаны',
    hunger_prompt_shown: 'Показан голод', hunger_prompt_submitted: 'Голод заполнен',
    morning_checkin_shown: 'Показан чекин', morning_checkin_completed: 'Чекин завершён',
    ews_input_insufficient: 'Недостаточно данных для раннего предупреждения',
    initial_sync_phase_a_ready: 'Критические данные первого экрана готовы',
    initial_sync_ready: 'Полная синхронизация готова',
    initial_sync_fallback_wait: 'Синхронизация ждала резервные данные',
    first_visible_frame: 'Первый экран действительно показан',
    blank_screen_guard_triggered: 'Экран не появился вовремя',
    blank_screen_recovered: 'Экран восстановлен',
    blank_screen_recovery_failed: 'Не удалось восстановить экран',
    unstructured_console_error: 'Скрытая системная ошибка'
  };
  var STAGE_LABELS = { boot: 'загрузка', sync: 'синхронизация', write: 'сохранение', runtime: 'работа приложения', warning: 'предупреждение' };

  function eventLabel(name) { return EVENT_LABELS[name] || String(name || 'Событие').replace(/_/g, ' '); }
  function problemEventName(session) {
    if (session && session.problem_event) return session.problem_event;
    return Number(session && session.error_count || 0) > 0 ? 'unstructured_console_error' : 'не определено';
  }
  function visitKindLabel(kind, compact) {
    if (kind === 'resume') return compact ? 'возврат' : 'возврат из фона';
    if (kind === 'client_entry') return compact ? 'вход' : 'вход в клиента';
    return compact ? 'запуск' : 'холодный запуск';
  }
  function runtimeEnvLabel(runtimeEnv) {
    if (runtimeEnv === 'local') return 'локальный QA';
    if (runtimeEnv === 'test') return 'автотест';
    return 'production';
  }
  function contextLabel(context) {
    if (!context || typeof context !== 'object') return '';
    var labels = { phase: 'этап', step: 'шаг', screen: 'экран', source: 'источник', reason: 'причина', pending_count: 'в очереди', count: 'записей', queue_size: 'очередь', key_group: 'группа', key_family: 'тип данных', key_id: 'ID ключа', error_code: 'код ошибки', attempt: 'попытка', result: 'результат', mode: 'режим', online: 'онлайн', problem_stage: 'этап проблемы', days_received: 'дней получено', min_required: 'минимум дней', visit_kind: 'тип посещения', absence_ms: 'в фоне, мс', auth_state: 'авторизация', sync_state: 'синхронизация' };
    return Object.keys(context).map(function (key) { return (labels[key] || key) + ': ' + context[key]; }).join(' · ');
  }

  var SAFE_CONTEXT_KEYS = ['phase', 'step', 'screen', 'source', 'reason', 'pending_count', 'count', 'queue_size', 'key_group', 'key_family', 'key_id', 'error_code', 'attempt', 'result', 'mode', 'online', 'problem_stage', 'release_version', 'unseen_count', 'days_received', 'min_required', 'visit_kind', 'absence_ms', 'auth_state', 'sync_state'];

  function safeContext(context) {
    if (!context || typeof context !== 'object') return {};
    return SAFE_CONTEXT_KEYS.reduce(function (result, key) {
      if (Object.prototype.hasOwnProperty.call(context, key)) result[key] = context[key];
      return result;
    }, {});
  }

  function sessionDebugReport(clientName, clientId, session) {
    session = session || {};
    var status = STATUS[session.outcome] || STATUS.starting;
    var lines = [
      'HEYS — полный безопасный лог сбоя',
      'Сформировано: ' + new Date().toISOString(),
      'Клиент: ' + (clientName || session.client_name || 'Без имени'),
      'client_id: ' + (clientId || session.client_id || 'unknown'),
      'boot_id: ' + (session.boot_id || 'unknown'),
      'visit_id: ' + (session.visit_id || 'unknown'),
      'Тип посещения: ' + visitKindLabel(session.visit_kind, false),
      'Окружение: ' + runtimeEnvLabel(session.runtime_env),
      'Статус: ' + status[0] + ' (' + (session.outcome || 'starting') + ')',
      'Проблемный этап: ' + (session.problem_stage || 'не определён'),
      'Проблемное событие: ' + problemEventName(session),
      'Последний успешный этап: ' + (session.last_success_event || 'не определён'),
      'Начало: ' + (session.started_at || 'unknown'),
      'Последнее событие: ' + (session.last_event_at || 'unknown'),
      'Длительность: ' + Number(session.duration_ms || 0) + ' ms',
      'build_id: ' + (session.build_id || 'unknown'),
      'device_id: ' + (session.device_id || 'unknown'),
      'Устройство: ' + [session.device_class, session.os_name, session.browser_name, session.display_mode].filter(Boolean).join(' · '),
      'Событий: ' + Number(session.event_count || 0) + ' | Ошибок: ' + Number(session.error_count || 0) + ' | Предупреждений: ' + Number(session.warning_count || 0),
      'Начальная синхронизация: ' + (session.initial_sync_completed ? 'завершена' : 'не подтверждена'),
      '',
      'События:'
    ];
    var events = session.events || [];
    events.forEach(function (event, index) {
      var context = safeContext(event.context);
      lines.push([
        String(index + 1) + '.', event.at || 'unknown', event.name || 'event',
        'status=' + (event.status || 'unknown'), 'level=' + (event.level || 'unknown'),
        'source=' + (event.source || 'unknown'), 'duration_ms=' + Number(event.duration_ms || 0),
        'context=' + JSON.stringify(context)
      ].join(' | '));
    });
    if (!events.length) lines.push('Нет структурированных событий.');
    var structuredErrorCount = events.filter(function (event) {
      return event && (event.level === 'error' || event.status === 'failed');
    }).length;
    var hiddenErrorCount = Math.max(0, Number(session.error_count || 0) - structuredErrorCount);
    if (hiddenErrorCount > 0) {
      lines.push('', 'Скрытые системные ошибки: ' + hiddenErrorCount + '. Текст raw console не включён из-за требований приватности.');
    }
    lines.push('', 'Приватность: без дневника, сообщений, телефона, IP-адреса и токенов.');
    return lines.join('\n');
  }

  async function copyText(value) {
    if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
      await global.navigator.clipboard.writeText(value);
      return;
    }
    if (!global.document || !document.body || typeof document.execCommand !== 'function') throw new Error('clipboard_unavailable');
    var textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    var copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('clipboard_copy_failed');
  }

  function isProblemOutcome(outcome) {
    return ['failed', 'degraded', 'abandoned'].includes(outcome);
  }

  function overviewReport(data) {
    var summary = data && data.summary || {};
    var lines = [
      'HEYS — панель диагностики',
      'Сформировано: ' + formatDate(data && data.generated_at),
      'Посещений: ' + Number(summary.visits || summary.launches || 0) + ' | Штатно: ' + Number(summary.ready || 0) + ' | Сбоев: ' + Number(summary.failed || 0),
      ''
    ];
    (data && data.sessions || []).forEach(function (session) {
      lines.push([session.client_name || 'Клиент', formatDate(session.started_at), visitKindLabel(session.visit_kind, true), runtimeEnvLabel(session.runtime_env), (STATUS[session.outcome] || STATUS.starting)[0], session.device_class, session.os_name, session.browser_name, session.display_mode, 'build=' + (session.build_id || 'unknown')].filter(Boolean).join(' | '));
      if (session.problem_stage) lines.push('  Проблемный этап: ' + (STAGE_LABELS[session.problem_stage] || session.problem_stage));
      (session.events || []).forEach(function (event) { lines.push('  ' + formatDate(event.at) + ' ' + eventLabel(event.name) + ' ' + (event.status || '')); });
    });
    return lines.join('\n');
  }

  function localDayStartIso(nowValue) {
    var day = nowValue == null ? new Date() : new Date(nowValue);
    day.setHours(0, 0, 0, 0);
    return day.toISOString();
  }

  function buildDailyProblemsParams(cursor, nowValue, includeNonProduction) {
    var params = {
      p_since: localDayStartIso(nowValue),
      p_client_id: null,
      p_search: null,
      p_statuses: ['failed', 'degraded', 'abandoned'],
      p_device_class: null,
      p_display_mode: null,
      p_build_id: null,
      p_problem_stage: null,
      p_sort: 'newest',
      p_cursor_started_at: cursor && cursor.started_at || null,
      p_cursor_boot_id: cursor && cursor.boot_id || null,
      p_cursor_problem_rank: cursor && cursor.problem_rank != null ? cursor.problem_rank : null,
      p_cursor_duration_ms: cursor && cursor.duration_ms != null ? cursor.duration_ms : null,
      p_limit: 100
    };
    if (includeNonProduction) params.p_include_nonproduction = true;
    return params;
  }

  async function fetchAllDailyProblemVisits(rpc, nowValue, includeNonProduction) {
    if (typeof rpc !== 'function') throw new Error('observability_rpc_unavailable');
    var sessions = [];
    var seenVisits = Object.create(null);
    var seenCursors = Object.create(null);
    var cursor = null;
    var firstPayload = null;
    do {
      var response = await rpc('get_curator_observability_overview', buildDailyProblemsParams(cursor, nowValue, includeNonProduction));
      if (response && response.error) throw new Error(response.error.message || response.error);
      var payload = unwrapRpcPayload(response, 'get_curator_observability_overview') || { sessions: [] };
      if (!firstPayload) firstPayload = payload;
      (payload.sessions || []).forEach(function (session) {
        var key = [session.client_id || '', session.visit_id || session.boot_id || '', session.started_at || ''].join(':');
        if (seenVisits[key]) return;
        seenVisits[key] = true;
        sessions.push(session);
      });
      if (!payload.has_more) break;
      if (!payload.next_cursor) throw new Error('observability_cursor_missing');
      var cursorKey = JSON.stringify(payload.next_cursor);
      if (seenCursors[cursorKey]) throw new Error('observability_cursor_repeated');
      seenCursors[cursorKey] = true;
      cursor = payload.next_cursor;
    } while (true);
    sessions.sort(function (left, right) {
      return new Date(left.started_at).getTime() - new Date(right.started_at).getTime()
        || String(left.visit_id || left.boot_id || '').localeCompare(String(right.visit_id || right.boot_id || ''));
    });
    return {
      since: localDayStartIso(nowValue),
      generated_at: firstPayload && firstPayload.generated_at || new Date().toISOString(),
      sessions: sessions
    };
  }

  function dailyMegaLogReport(data) {
    var sessions = data && data.sessions || [];
    var clientIds = Object.create(null);
    var outcomes = { failed: 0, degraded: 0, abandoned: 0 };
    var stages = Object.create(null);
    var problemEvents = Object.create(null);
    var hours = Object.create(null);
    sessions.forEach(function (session) {
      if (session.client_id) clientIds[session.client_id] = true;
      if (Object.prototype.hasOwnProperty.call(outcomes, session.outcome)) outcomes[session.outcome] += 1;
      var stage = session.problem_stage || 'unknown';
      stages[stage] = (stages[stage] || 0) + 1;
      var problemEvent = problemEventName(session);
      problemEvents[problemEvent] = (problemEvents[problemEvent] || 0) + 1;
      var hour = String(new Date(session.started_at).getHours()).padStart(2, '0') + ':00–' + String(new Date(session.started_at).getHours()).padStart(2, '0') + ':59';
      if (!hours[hour]) hours[hour] = { total: 0, failed: 0, degraded: 0, abandoned: 0 };
      hours[hour].total += 1;
      if (Object.prototype.hasOwnProperty.call(hours[hour], session.outcome)) hours[hour][session.outcome] += 1;
    });
    function countLines(values, label) {
      var keys = Object.keys(values).sort();
      return keys.length ? keys.map(function (key) { return '  ' + (label ? label(key) : key) + ': ' + values[key]; }) : ['  нет'];
    }
    var lines = [
      'HEYS — мегалог всех проблемных посещений за сегодня',
      'Сформировано: ' + new Date(data && data.generated_at || Date.now()).toISOString(),
      'Период: ' + formatDate(data && data.since) + ' — ' + formatDate(data && data.generated_at),
      'Проблемных посещений: ' + sessions.length,
      'Клиентов с проблемами: ' + Object.keys(clientIds).length,
      'Статусы: сбоев ' + outcomes.failed + ' | с отклонениями ' + outcomes.degraded + ' | не завершено ' + outcomes.abandoned,
      '',
      'Проблемные этапы:'
    ].concat(countLines(stages, function (key) { return STAGE_LABELS[key] || key; }), [
      '',
      'Проблемные события:'
    ], countLines(problemEvents, eventLabel), [
      '',
      'Динамика по часам:'
    ], Object.keys(hours).sort().map(function (hour) {
      var row = hours[hour];
      return '  ' + hour + ' | всего ' + row.total + ' | сбоев ' + row.failed + ' | отклонений ' + row.degraded + ' | не завершено ' + row.abandoned;
    }), [
      '',
      'Полные безопасные логи в хронологическом порядке:'
    ]);
    if (!sessions.length) lines.push('Проблемных посещений за сегодня нет.');
    sessions.forEach(function (session, index) {
      lines.push('', '════════════════════════════════════════', 'ПОСЕЩЕНИЕ ' + (index + 1) + ' ИЗ ' + sessions.length, sessionDebugReport(session.client_name, session.client_id, session));
    });
    lines.push('', 'Приватность: без дневника, сообщений, телефона, IP-адреса и токенов.');
    return lines.join('\n');
  }

  function rangeSince(range) {
    var hours = range === '30d' ? 24 * 30 : (range === '7d' ? 24 * 7 : 24);
    return new Date(Date.now() - hours * 3600000).toISOString();
  }

  function buildOverviewParams(filters, cursor) {
    var params = {
      p_since: rangeSince(filters.range),
      p_client_id: filters.clientId || null,
      p_search: filters.search || null,
      p_statuses: filters.status === 'problems' ? ['failed', 'degraded', 'abandoned'] : (filters.status === 'all' ? null : [filters.status]),
      p_device_class: filters.device || null,
      p_display_mode: filters.mode || null,
      p_build_id: filters.build || null,
      p_problem_stage: filters.stage || null,
      p_sort: filters.sort || 'problems',
      p_cursor_started_at: cursor && cursor.started_at || null,
      p_cursor_boot_id: cursor && cursor.boot_id || null,
      p_cursor_problem_rank: cursor && cursor.problem_rank != null ? cursor.problem_rank : null,
      p_cursor_duration_ms: cursor && cursor.duration_ms != null ? cursor.duration_ms : null,
      p_limit: 50
    };
    if (filters.includeNonProduction) params.p_include_nonproduction = true;
    return params;
  }

  function unwrapRpcPayload(response, functionName) {
    var data = response && response.data;
    if (data && typeof data === 'object' && !Array.isArray(data)
      && Object.prototype.hasOwnProperty.call(data, functionName)) {
      return data[functionName];
    }
    return data;
  }

  function Overview(props) {
    var React = global.React;
    if (!React) return null;
    ensureStyles();
    var h = React.createElement;
    var clients = props && props.clients || [];
    var initialFilters = { range: '24h', clientId: '', search: '', status: 'all', device: '', mode: '', build: '', stage: '', sort: 'problems', includeNonProduction: false };
    var _filters = React.useState(initialFilters), filters = _filters[0], setFilters = _filters[1];
    var _query = React.useState(''), searchQuery = _query[0], setSearchQuery = _query[1];
    var _data = React.useState({ summary: {}, sessions: [], next_cursor: null, has_more: false }), data = _data[0], setData = _data[1];
    var _loading = React.useState(true), loading = _loading[0], setLoading = _loading[1];
    var _error = React.useState(''), error = _error[0], setError = _error[1];
    var _updated = React.useState(null), updatedAt = _updated[0], setUpdatedAt = _updated[1];
    var _expanded = React.useState({}), expanded = _expanded[0], setExpanded = _expanded[1];
    var _megaLoading = React.useState(false), megaLoading = _megaLoading[0], setMegaLoading = _megaLoading[1];

    React.useEffect(function () {
      var timer = setTimeout(function () { setFilters(function (prev) { return Object.assign({}, prev, { search: searchQuery.trim() }); }); }, 300);
      return function () { clearTimeout(timer); };
    }, [searchQuery]);

    var load = React.useCallback(async function (append) {
      setLoading(true); setError('');
      try {
        var cursor = append ? data.next_cursor : null;
        var response = await HEYS.YandexAPI.rpc('get_curator_observability_overview', buildOverviewParams(filters, cursor));
        if (response && response.error) throw new Error(response.error.message || response.error);
        var next = unwrapRpcPayload(response, 'get_curator_observability_overview') || { summary: {}, sessions: [] };
        setData(function (prev) { return append ? Object.assign({}, next, { sessions: (prev.sessions || []).concat(next.sessions || []) }) : next; });
        setUpdatedAt(new Date());
      } catch (loadError) {
        setError('Сервер не ответил на запрос посещений.');
        HEYS.analytics?.trackError?.(loadError, { context: 'curator_observability_overview' });
      } finally { setLoading(false); }
    }, [filters, data.next_cursor]);

    React.useEffect(function () { load(false); }, [filters]);
    React.useEffect(function () {
      var interval = setInterval(function () { load(false); }, 60000);
      return function () { clearInterval(interval); };
    }, [load]);

    function update(key, value) { setFilters(function (prev) { var next = Object.assign({}, prev); next[key] = value; return next; }); }
    function option(value, label) { return h('option', { value: value, key: value || 'all' }, label); }
    function metric(label, value, status, kind) {
      return h('button', { type: 'button', className: 'cdo-metric' + (kind ? ' cdo-metric--' + kind : ''), onClick: function () { if (status) update('status', status); } }, h('strong', null, String(value || 0)), h('span', null, label));
    }
    async function copyReport() {
      try { await copyText(overviewReport(data)); HEYS.Toast?.success?.('Отчёт скопирован'); }
      catch (_) { HEYS.Toast?.warning?.('Не удалось скопировать отчёт'); }
    }
    async function copyDailyMegaLog() {
      setMegaLoading(true);
      try {
        var megaData = await fetchAllDailyProblemVisits(HEYS.YandexAPI.rpc.bind(HEYS.YandexAPI), new Date(), filters.includeNonProduction);
        await copyText(dailyMegaLogReport(megaData));
        HEYS.Toast?.success?.('Мегалог скопирован: ' + megaData.sessions.length + ' посещений');
      } catch (megaError) {
        HEYS.Toast?.warning?.('Не удалось собрать полный мегалог');
        HEYS.analytics?.trackError?.(megaError, { context: 'curator_observability_daily_megalog' });
      } finally { setMegaLoading(false); }
    }

    var summary = data.summary || {};
    return h('section', { className: 'cdo', 'aria-label': 'Диагностика клиентских посещений' },
      h('div', { className: 'cdo-head' },
        h('div', { className: 'cdo-title' }, 'Диагностика'),
        h('div', { className: 'cdo-note' },
          'посещения, входы и синхронизация · без содержимого дневников')
      ),
      // Кадр «Диагностика»: четыре числа сеткой, под ними лист, под ним два
      // действия. Прежде порядок был обратный — сначала три кнопки, потом
      // «Автообновление» строкой, потом числа: вкладку открывают ради чисел,
      // а они лежали третьим экраном.
      //
      // В сетку идёт то, ради чего открывают вкладку. «Штатно» ушло из сетки
      // в лист: это доля от посещений, а не четвёртое независимое число, и
      // рядом с ними читалось как ещё один счёт.
      h('div', { className: 'cdo-metrics' },
        metric('активных клиентов', summary.active_clients),
        metric('посещений', summary.visits || summary.launches),
        metric('сбоев', summary.failed, 'failed', 'bad'),
        metric('отклонений', Number(summary.degraded || 0) + Number(summary.abandoned || 0), 'problems', 'warn')
      ),
      h('div', { className: 'cdo-list' },
        h('div', { className: 'cdo-list-row' },
          h('span', { className: 'cdo-list-key' }, 'Штатно'),
          h('span', { className: 'cdo-list-val is-ok' },
            Number(summary.success_rate || 0) + ' %')
        ),
        h('div', { className: 'cdo-list-row' },
          h('span', { className: 'cdo-list-key' },
            updatedAt
              ? 'Обновлено ' + updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : 'Автообновление'),
          h('span', { className: 'cdo-list-val' }, 'каждые 60 с')
        )
      ),
      // Строка контракта «диагностика · три действия»: три кнопки в общем ряду
      // и все на подложке набора. Кадр рисует две и заливает «Показать сбои»
      // акцентом — при расхождении верен контракт. Заливка снята потому, что
      // ни одно из трёх не является главным: фильтр, копирование и обновление
      // равны по весу, и акцент на одном из них назначал бы старшинство,
      // которого нет.
      //
      // «Обновить» вернулась в ряд из строки листа: автообновление раз в
      // минуту не заменяет живой вкладке ручного.
      h('div', { className: 'cdo-actions' },
        h('button', { type: 'button', className: 'cdo-secondary' + (filters.status === 'problems' ? ' is-active' : ''), onClick: function () { update('status', filters.status === 'problems' ? 'all' : 'problems'); } }, filters.status === 'problems' ? 'Показать все' : 'Показать сбои'),
        h('button', { type: 'button', className: 'cdo-secondary', onClick: copyReport, disabled: !(data.sessions || []).length }, 'Скопировать отчёт'),
        h('button', { type: 'button', className: 'cdo-secondary', onClick: function () { load(false); }, disabled: loading }, loading ? 'Обновляю…' : 'Обновить')
      ),
      // Второе копирование — другого объёма: отчёт берёт текущий фильтр,
      // мегалог собирает все сбои за день. В кадре его нет; убрать значило бы
      // отнять у куратора единственный способ отдать разработчику полный день.
      h('div', { className: 'cdo-megalog' },
        h('button', { type: 'button', className: 'cdo-mega-btn', onClick: copyDailyMegaLog, disabled: megaLoading }, megaLoading ? 'Собираю…' : 'Скопировать сбои за день')
      ),
      h('div', { className: 'cdo-filters' },
        h('input', { className: 'cdo-control cdo-search', type: 'search', placeholder: 'Поиск клиента…', value: searchQuery, onChange: function (e) { setSearchQuery(e.target.value); }, 'aria-label': 'Поиск клиента' }),
        h('select', { className: 'cdo-control', value: filters.range, onChange: function (e) { update('range', e.target.value); }, 'aria-label': 'Период' }, option('24h', '24 часа'), option('7d', '7 дней'), option('30d', '30 дней')),
        h('select', { className: 'cdo-control', value: filters.clientId, onChange: function (e) { update('clientId', e.target.value); }, 'aria-label': 'Клиент' }, option('', 'Все клиенты'), clients.map(function (client) { return option(client.id, client.name); })),
        h('select', { className: 'cdo-control', value: filters.status, onChange: function (e) { update('status', e.target.value); }, 'aria-label': 'Статус' }, option('all', 'Все статусы'), option('problems', 'Только проблемы'), option('ready', 'Штатно'), option('failed', 'Сбой'), option('degraded', 'С отклонениями'), option('abandoned', 'Не завершено'), option('starting', 'Загружается')),
        h('select', { className: 'cdo-control', value: filters.device, onChange: function (e) { update('device', e.target.value); }, 'aria-label': 'Устройство' }, option('', 'Все устройства'), option('mobile', 'Телефон'), option('tablet', 'Планшет'), option('desktop', 'Компьютер')),
        h('select', { className: 'cdo-control', value: filters.mode, onChange: function (e) { update('mode', e.target.value); }, 'aria-label': 'Режим запуска' }, option('', 'Браузер и приложение'), option('standalone', 'Установленное приложение'), option('browser', 'Браузер')),
        h('select', { className: 'cdo-control', value: filters.includeNonProduction ? 'all' : 'production', onChange: function (e) { update('includeNonProduction', e.target.value === 'all'); }, 'aria-label': 'Окружение' }, option('production', 'Только рабочие входы'), option('all', 'Включая локальные тесты')),
        h('input', { className: 'cdo-control', value: filters.build, onChange: function (e) { update('build', e.target.value.trim()); }, placeholder: 'Версия / build', 'aria-label': 'Версия приложения' }),
        h('select', { className: 'cdo-control', value: filters.stage, onChange: function (e) { update('stage', e.target.value); }, 'aria-label': 'Проблемный этап' }, option('', 'Все этапы'), option('boot', 'Загрузка'), option('sync', 'Синхронизация'), option('write', 'Сохранение'), option('runtime', 'Работа приложения'), option('warning', 'Предупреждение')),
        h('select', { className: 'cdo-control', value: filters.sort, onChange: function (e) { update('sort', e.target.value); }, 'aria-label': 'Сортировка' }, option('problems', 'Сначала проблемы'), option('newest', 'Сначала новые'), option('duration', 'Самые долгие'))
      ),
      // Отказ и пустота — приёмами кабинета: карточка с причиной и одной
      // кнопкой повтора, как у панели. Прежде это были свои .cd-error и
      // .cdo-empty — белые плашки с холодной рамкой и своим красным.
      error && h('div', { className: 'cur-panel__empty' },
        h('div', { className: 'cur-panel__empty-title' }, 'Диагностика не загрузилась'),
        h('div', { className: 'cur-panel__empty-note' }, error),
        h('button', {
          type: 'button',
          className: 'cur-panel__retry',
          onClick: function () { load(false); }
        }, 'Повторить')
      ),
      !error && loading && !(data.sessions || []).length
        && h('div', { className: 'cur-panel__stub' }, 'Считаем…'),
      !error && !loading && !(data.sessions || []).length
        && h('div', { className: 'cur-panel__empty' },
          h('div', { className: 'cur-panel__empty-title' },
            filters.status === 'problems'
              ? 'Сбоев за выбранный период нет'
              : 'Посещений за выбранный период нет'),
          h('div', { className: 'cur-panel__empty-note' },
            'Период и остальные условия — в фильтрах выше.')
        ),
      h('div', { className: 'cdo-sessions' }, (data.sessions || []).map(function (session) {
        var status = STATUS[session.outcome] || STATUS.starting;
        var key = session.client_id + ':' + (session.visit_id || session.boot_id);
        var isOpen = !!expanded[key];
        var isProblem = isProblemOutcome(session.outcome);
        var problemText = session.problem_stage ? 'Проблема: ' + (STAGE_LABELS[session.problem_stage] || session.problem_stage) : 'Последний успешный этап: ' + eventLabel(session.last_success_event);
        return h('article', { key: key, className: 'cdo-session cdo-session--' + status[1] },
          h('button', { type: 'button', className: 'cdo-row', 'aria-expanded': isOpen, onClick: function () { setExpanded(function (prev) { var next = Object.assign({}, prev); next[key] = !prev[key]; return next; }); } },
            h('div', null, h('div', { className: 'cdo-client' }, session.client_name || 'Клиент'), h('div', { className: 'cdo-small' }, formatDate(session.started_at) + ' · ' + visitKindLabel(session.visit_kind, true))),
            h('div', null, h('span', { className: 'cd-status cd-status--' + status[1] }, status[0]), h('div', { className: 'cdo-small' }, formatDuration(session.duration_ms))),
            h('div', null, h('div', null, [session.device_class, session.os_name, session.browser_name].filter(Boolean).join(' · ') || 'Не определено'), h('div', { className: 'cdo-small' }, (session.display_mode || '—') + ' · ' + (session.build_id || 'unknown') + ' · ' + runtimeEnvLabel(session.runtime_env))),
            h('div', { className: session.problem_stage ? 'cdo-problem' : 'cdo-ok' }, problemText),
            h('span', { className: 'cdo-chevron', 'aria-hidden': 'true' }, isOpen ? '⌃' : '⌄')
          ),
          isOpen && h('div', { className: 'cdo-detail' },
            h('div', { className: 'cdo-detail-actions' },
              isProblem && h('button', { type: 'button', className: 'cdo-primary cdo-full-log', onClick: async function () {
                try { await copyText(sessionDebugReport(session.client_name, session.client_id, session)); HEYS.Toast?.success?.('Полный лог скопирован'); }
                catch (_) { HEYS.Toast?.warning?.('Не удалось скопировать лог'); }
              } }, 'Скопировать полный лог'),
              h('button', { type: 'button', className: 'cdo-secondary', onClick: function () { show({ clientId: session.client_id, clientName: session.client_name }); } }, 'Открыть клиента')
            ),
            h('div', { className: 'cdo-timeline' }, (session.events || []).length ? session.events.map(function (event, index) {
              var failed = event.status === 'failed' || event.level === 'error';
              return h('div', { key: String(event.at) + ':' + index, className: 'cdo-event' + (failed ? ' cdo-event--failed' : '') }, h('span', { className: 'cdo-small' }, new Date(event.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), h('strong', null, eventLabel(event.name)), h('span', { className: 'cdo-event-context' }, contextLabel(event.context)));
            }) : h('div', { className: 'cdo-small' }, 'Структурированных событий нет'))
          )
        );
      })),
      data.has_more && h('button', { type: 'button', className: 'cdo-more', onClick: function () { load(true); }, disabled: loading }, loading ? 'Загружаю…' : 'Показать ещё')
    );
  }

  function close() {
    if (!activeRoot) return;
    activeRoot.remove();
    activeRoot = null;
    document.body.style.overflow = '';
  }

  function renderSession(session, clientName, clientId) {
    var status = STATUS[session.outcome] || STATUS.starting;
    var card = el('article', 'cd-session cd-session--' + status[1]);
    var button = el('button', 'cd-session-btn');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    var top = el('div', 'cd-session-top');
    top.appendChild(el('span', 'cd-status cd-status--' + status[1], status[0]));
    top.appendChild(el('span', 'cd-time', formatDate(session.started_at)));
    top.appendChild(el('span', 'cd-device', [session.device_class, session.os_name, session.browser_name, session.display_mode].filter(Boolean).join(' · ') || 'Устройство не определено'));
    button.appendChild(top);
    var meta = el('div', 'cd-meta');
    meta.appendChild(el('span', '', visitKindLabel(session.visit_kind, false).replace(/^./, function (char) { return char.toUpperCase(); })));
    meta.appendChild(el('span', '', 'Версия: ' + (session.build_id || 'unknown')));
    meta.appendChild(el('span', '', 'Длительность: ' + formatDuration(session.duration_ms)));
    meta.appendChild(el('span', '', 'Событий: ' + Number(session.event_count || 0)));
    if (session.error_count) meta.appendChild(el('span', '', 'Ошибок: ' + session.error_count));
    button.appendChild(meta);
    card.appendChild(button);

    var timeline = el('div', 'cd-timeline');
    timeline.hidden = true;
    if (isProblemOutcome(session.outcome)) {
      var fullLog = el('button', 'cd-full-log', 'Скопировать полный лог');
      fullLog.type = 'button';
      fullLog.addEventListener('click', async function () {
        try {
          await copyText(sessionDebugReport(clientName, clientId, session));
          fullLog.textContent = 'Полный лог скопирован';
          setTimeout(function () { fullLog.textContent = 'Скопировать полный лог'; }, 1500);
        } catch (_) { fullLog.textContent = 'Не удалось скопировать лог'; }
      });
      timeline.appendChild(fullLog);
    }
    (session.events || []).forEach(function (event) {
      var row = el('div', 'cd-event' + (event.status === 'failed' || event.level === 'error' ? ' cd-event--failed' : ''));
      row.appendChild(el('span', 'cd-event-time', formatDate(event.at)));
      row.appendChild(el('strong', '', event.name || 'event'));
      if (event.context && Object.keys(event.context).length) {
        row.appendChild(el('span', 'cd-event-context', Object.entries(event.context).map(function (pair) { return pair[0] + ': ' + pair[1]; }).join(' · ')));
      }
      timeline.appendChild(row);
    });
    if (!(session.events || []).length) timeline.appendChild(el('div', 'cd-event', 'Структурированных событий нет'));
    card.appendChild(timeline);
    button.addEventListener('click', function () {
      timeline.hidden = !timeline.hidden;
      button.setAttribute('aria-expanded', timeline.hidden ? 'false' : 'true');
    });
    return card;
  }

  function show(options) {
    options = options || {};
    if (!options.clientId) return;
    close();
    ensureStyles();
    document.body.style.overflow = 'hidden';

    var state = { range: '24h', status: 'all', includeNonProduction: false, data: null };
    var root = el('div', 'cd-backdrop');
    activeRoot = root;
    var modal = el('section', 'cd-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Диагностика посещений клиента');
    root.appendChild(modal);

    var head = el('header', 'cd-head');
    var heading = el('div');
    heading.appendChild(el('div', 'cd-title', 'Диагностика посещений'));
    heading.appendChild(el('div', 'cd-subtitle', options.clientName || 'Клиент'));
    head.appendChild(heading);
    var closeButton = el('button', 'cd-icon-btn', '×');
    closeButton.type = 'button'; closeButton.title = 'Закрыть'; closeButton.addEventListener('click', close);
    head.appendChild(closeButton); modal.appendChild(head);

    var toolbar = el('div', 'cd-toolbar');
    var range = el('select', 'cd-control');
    [['24h', '24 часа'], ['7d', '7 дней'], ['30d', '30 дней']].forEach(function (item) { var o = el('option', '', item[1]); o.value = item[0]; range.appendChild(o); });
    var status = el('select', 'cd-control');
    [['all', 'Все посещения'], ['problems', 'Только проблемы'], ['ready', 'Только штатные']].forEach(function (item) { var o = el('option', '', item[1]); o.value = item[0]; status.appendChild(o); });
    var environment = el('select', 'cd-control');
    [['production', 'Только рабочие входы'], ['all', 'Включая локальные тесты']].forEach(function (item) { var o = el('option', '', item[1]); o.value = item[0]; environment.appendChild(o); });
    var copy = el('button', 'cd-copy', 'Скопировать отчёт'); copy.type = 'button'; copy.disabled = true;
    toolbar.appendChild(range); toolbar.appendChild(status); toolbar.appendChild(environment); toolbar.appendChild(copy); modal.appendChild(toolbar);
    var body = el('div', 'cd-body'); modal.appendChild(body);

    function draw() {
      body.replaceChildren();
      var sessions = (state.data && state.data.sessions || []).slice().filter(function (session) {
        if (state.status === 'ready') return session.outcome === 'ready';
        if (state.status === 'problems') return ['failed', 'degraded', 'abandoned'].includes(session.outcome);
        return true;
      }).sort(function (left, right) {
        var leftProblem = ['failed', 'degraded', 'abandoned'].includes(left.outcome) ? 1 : 0;
        var rightProblem = ['failed', 'degraded', 'abandoned'].includes(right.outcome) ? 1 : 0;
        return rightProblem - leftProblem || Date.parse(right.started_at || 0) - Date.parse(left.started_at || 0);
      });
      body.appendChild(el('div', 'cd-summary', sessions.length + ' посещений · ошибки и незавершённые загрузки показаны первыми'));
      if (!sessions.length) body.appendChild(el('div', 'cd-empty', 'За выбранный период событий нет'));
      sessions.forEach(function (session) { body.appendChild(renderSession(session, options.clientName, options.clientId)); });
      var logins = state.data && state.data.logins || [];
      body.appendChild(el('div', 'cd-section-title', 'История входов'));
      if (!logins.length) body.appendChild(el('div', 'cd-empty', 'Входов за период нет'));
      logins.forEach(function (login) {
        var row = el('div', 'cd-login');
        row.appendChild(el('span', 'cd-login-time', formatDate(login.at)));
        row.appendChild(el('strong', '', login.type === 'pin_success' ? 'Вход выполнен' : login.type));
        row.appendChild(el('span', 'cd-login-ua', login.user_agent || 'Устройство не определено'));
        body.appendChild(row);
      });
    }

    async function load() {
      body.replaceChildren(el('div', 'cd-loading', 'Загружаю события…'));
      copy.disabled = true;
      var hours = state.range === '30d' ? 24 * 30 : (state.range === '7d' ? 24 * 7 : 24);
      var since = new Date(Date.now() - hours * 3600000).toISOString();
      try {
        var rpcParams = { p_client_id: options.clientId, p_since: since, p_limit: 100 };
        if (state.includeNonProduction) rpcParams.p_include_nonproduction = true;
        var response = await HEYS.YandexAPI.rpc('get_client_observability_by_curator', rpcParams);
        if (response && response.error) throw new Error(response.error.message || response.error);
        state.data = unwrapRpcPayload(response, 'get_client_observability_by_curator') || { sessions: [], logins: [] };
        copy.disabled = false;
        draw();
      } catch (error) {
        body.replaceChildren(el('div', 'cd-error', 'Не удалось загрузить диагностику. Повторите позже.'));
        HEYS.analytics?.trackError?.(error, { context: 'client_observability', clientId: options.clientId });
      }
    }

    range.addEventListener('change', function () { state.range = range.value; load(); });
    status.addEventListener('change', function () { state.status = status.value; draw(); });
    environment.addEventListener('change', function () { state.includeNonProduction = environment.value === 'all'; load(); });
    copy.addEventListener('click', async function () {
      if (!state.data) return;
      try {
        await copyText(safeReport(options.clientName, state.data));
        copy.textContent = 'Скопировано';
        setTimeout(function () { copy.textContent = 'Скопировать отчёт'; }, 1500);
      } catch (_) { copy.textContent = 'Не удалось скопировать'; }
    });
    root.addEventListener('click', function (event) { if (event.target === root) close(); });
    document.addEventListener('keydown', function onKey(event) {
      if (event.key === 'Escape' && activeRoot === root) { document.removeEventListener('keydown', onKey); close(); }
    });
    document.body.appendChild(root);
    closeButton.focus();
    load();
  }

  HEYS.ClientDiagnostics = {
    show: show,
    close: close,
    Overview: Overview,
    _test: { buildOverviewParams: buildOverviewParams, buildDailyProblemsParams: buildDailyProblemsParams, fetchAllDailyProblemVisits: fetchAllDailyProblemVisits, dailyMegaLogReport: dailyMegaLogReport, eventLabel: eventLabel, overviewReport: overviewReport, sessionDebugReport: sessionDebugReport, unwrapRpcPayload: unwrapRpcPayload }
  };
})(typeof window !== 'undefined' ? window : globalThis);
