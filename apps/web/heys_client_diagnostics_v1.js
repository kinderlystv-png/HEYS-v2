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
      '.cd-toolbar .cd-control{width:auto;flex:0 0 150px;padding:0 12px;min-width:120px}.cd-copy{padding:0 14px;margin-left:auto;color:#434587;font-weight:650}',
      '.cd-body{padding:18px 24px 26px;overflow:auto}.cd-summary{font-size:14px;color:#62637a;margin-bottom:12px}',
      '.cd-session{background:#fff;border:1px solid #e4e4ee;border-radius:14px;margin-bottom:10px;overflow:hidden}.cd-session--failed{border-color:#e6b5b5}.cd-session--degraded,.cd-session--abandoned{border-color:#ead6a1}',
      '.cd-session-btn{width:100%;border:0;background:transparent;text-align:left;padding:15px 16px;cursor:pointer;color:inherit}',
      '.cd-session-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cd-status{display:inline-flex;align-items:center;min-height:25px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:750}',
      '.cd-status--ready{background:#e8f5ee;color:#27734b}.cd-status--failed{background:#fdecec;color:#a53b3b}.cd-status--degraded,.cd-status--abandoned{background:#fff5dc;color:#84601e}.cd-status--starting{background:#ececf7;color:#555789}',
      '.cd-time{font-weight:700;font-size:14px}.cd-device{font-size:13px;color:#696a80;margin-left:auto}.cd-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:#7b7c91;font-size:12px}',
      '.cd-timeline{border-top:1px solid #ececf3;padding:8px 16px 14px}.cd-full-log{width:100%;padding:0 14px;margin:4px 0 8px;border-color:#434587;background:#434587;color:#fff;font-weight:700}.cd-event{position:relative;padding:8px 0 8px 22px;font-size:13px}.cd-event:before{content:"";position:absolute;left:4px;top:14px;width:8px;height:8px;border-radius:50%;background:#7779ad}.cd-event--failed:before{background:#b94a4a}.cd-event-time{color:#88899c;margin-right:8px}.cd-event-context{display:block;color:#77788d;font-size:12px;margin-top:2px;word-break:break-word}',
      '.cd-section-title{font-size:15px;font-weight:750;margin:22px 0 10px}.cd-login{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;background:#fff;border:1px solid #e7e7ef;border-radius:11px;margin-bottom:7px;font-size:13px}.cd-login-time{white-space:nowrap;color:#6f7085}.cd-login-ua{color:#7b7c90;word-break:break-word}',
      '.cd-empty,.cd-loading,.cd-error{padding:36px 18px;text-align:center;color:#74758c;background:#fff;border:1px solid #e6e6ef;border-radius:14px}.cd-error{color:#963d3d;border-color:#efcccc}',
      '.cdo{max-width:1180px;margin:0 auto;color:#282941}.cdo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.cdo-title{font-size:22px;font-weight:760}.cdo-note{font-size:13px;color:#74758c;margin-top:4px}.cdo-actions{display:flex;gap:8px;flex-wrap:wrap}.cdo-primary,.cdo-secondary,.cdo-more{min-height:44px;border-radius:11px;padding:0 15px;font:inherit;font-weight:700;cursor:pointer}.cdo-primary{border:1px solid #434587;background:#434587;color:#fff}.cdo-primary.is-active{background:#303260}.cdo-secondary,.cdo-more{border:1px solid #d9d9e8;background:#fff;color:#434587}.cdo-updated{font-size:12px;color:#7b7c91;text-align:right;margin-top:5px}',
      '.cdo-metrics{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin-bottom:14px}.cdo-metric{border:1px solid #e2e2ed;background:#fff;border-radius:13px;padding:13px;text-align:left;cursor:pointer;color:inherit}.cdo-metric strong{display:block;font-size:22px}.cdo-metric span{font-size:12px;color:#727389}.cdo-metric--bad{border-color:#edc6c6}.cdo-metric--warn{border-color:#ead9ae}',
      '.cdo-filters{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:9px;padding:13px;background:#fff;border:1px solid #e4e4ed;border-radius:14px;margin-bottom:14px}.cdo-control{min-height:44px;border:1px solid #d8d8e6;border-radius:10px;background:#fff;color:#343553;padding:0 11px;font:inherit;min-width:0}.cdo-search{grid-column:span 2}.cdo-list{display:flex;flex-direction:column;gap:9px}.cdo-session{background:#fff;border:1px solid #e4e4ee;border-radius:14px;overflow:hidden}.cdo-session--failed{border-color:#e6b5b5;background:#fffafa}.cdo-session--degraded,.cdo-session--abandoned{border-color:#ead6a1}.cdo-row{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(120px,.8fr) minmax(170px,1.1fr) minmax(120px,.8fr) auto;gap:12px;align-items:center;width:100%;padding:14px;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer}.cdo-client{font-weight:750}.cdo-small{font-size:12px;color:#75768b;margin-top:3px}.cdo-problem{font-size:13px;color:#873d3d}.cdo-ok{font-size:13px;color:#347052}.cdo-chevron{color:#7779ad;font-size:18px}.cdo-detail{border-top:1px solid #e9e9f1;padding:14px}.cdo-detail-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:8px}.cdo-full-log{border-color:#434587;background:#434587;color:#fff}.cdo-timeline{display:flex;flex-direction:column}.cdo-event{display:grid;grid-template-columns:80px 190px 1fr;gap:10px;position:relative;padding:8px 8px 8px 20px;font-size:13px}.cdo-event:before{content:"";position:absolute;left:4px;top:14px;width:8px;height:8px;border-radius:50%;background:#7779ad}.cdo-event--failed:before{background:#b94a4a}.cdo-event-context{color:#76778b;word-break:break-word}.cdo-empty{padding:34px 18px;text-align:center;background:#fff;border:1px solid #e5e5ee;border-radius:14px;color:#727389}.cdo-more{align-self:center;margin:12px auto 0;display:block}',
      '@media(max-width:640px){.cd-backdrop{padding:0;align-items:flex-end}.cd-modal{max-height:94vh;border-radius:20px 20px 0 0}.cd-head{padding:18px 16px 14px}.cd-toolbar{padding:12px 16px}.cd-body{padding:14px 16px 24px}.cd-toolbar .cd-control{flex:1 1 120px;min-width:0;width:auto}.cd-copy{width:100%;margin-left:0}.cd-device{width:100%;margin-left:0}.cd-session-btn{padding:14px}}'
      ,'@media(max-width:760px){.cdo-head{display:block}.cdo-actions{margin-top:12px}.cdo-actions>*{flex:1}.cdo-actions .cdo-primary{flex-basis:100%}.cdo-updated{text-align:left}.cdo-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cdo-metric:first-child{grid-column:span 2}.cdo-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.cdo-search{grid-column:span 2}.cdo-row{grid-template-columns:1fr auto;padding:13px}.cdo-row>div:nth-child(2),.cdo-row>div:nth-child(3),.cdo-row>div:nth-child(4){grid-column:1 / -1}.cdo-chevron{grid-column:2;grid-row:1}.cdo-event{grid-template-columns:68px 1fr}.cdo-event-context{grid-column:2}.cdo-detail{padding:10px}.cdo-primary,.cdo-secondary,.cdo-more,.cdo-control{min-height:44px}}',
      '@media(max-width:480px){.cdo-filters{grid-template-columns:1fr}.cdo-search{grid-column:span 1}}'
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
    boot_started: 'Запуск приложения', boot_ready: 'Приложение готово', boot_failed: 'Ошибка запуска',
    app_runtime_failed: 'Ошибка приложения', sync_cycle_started: 'Синхронизация началась',
    sync_cycle_completed: 'Синхронизация завершена', sync_cycle_failed: 'Ошибка синхронизации',
    sync_recovered: 'Синхронизация восстановлена', write_queued: 'Изменения ждут отправки',
    write_uploaded: 'Изменения сохранены', write_failed: 'Не удалось сохранить изменения',
    whats_new_shown: 'Показано «Что нового»', whats_new_acknowledged: '«Что нового» закрыто',
    curator_changes_shown: 'Показаны правки куратора', curator_changes_acknowledged: 'Правки куратора прочитаны',
    hunger_prompt_shown: 'Показан голод', hunger_prompt_submitted: 'Голод заполнен',
    morning_checkin_shown: 'Показан чекин', morning_checkin_completed: 'Чекин завершён'
  };
  var STAGE_LABELS = { boot: 'загрузка', sync: 'синхронизация', write: 'сохранение', runtime: 'работа приложения', warning: 'предупреждение' };

  function eventLabel(name) { return EVENT_LABELS[name] || String(name || 'Событие').replace(/_/g, ' '); }
  function contextLabel(context) {
    if (!context || typeof context !== 'object') return '';
    var labels = { phase: 'этап', step: 'шаг', screen: 'экран', source: 'источник', reason: 'причина', pending_count: 'в очереди', count: 'записей', queue_size: 'очередь', key_group: 'группа', attempt: 'попытка', result: 'результат', mode: 'режим', online: 'онлайн', problem_stage: 'этап проблемы' };
    return Object.keys(context).map(function (key) { return (labels[key] || key) + ': ' + context[key]; }).join(' · ');
  }

  var SAFE_CONTEXT_KEYS = ['phase', 'step', 'screen', 'source', 'reason', 'pending_count', 'count', 'queue_size', 'key_group', 'attempt', 'result', 'mode', 'online', 'problem_stage', 'release_version', 'unseen_count'];

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
      'Статус: ' + status[0] + ' (' + (session.outcome || 'starting') + ')',
      'Проблемный этап: ' + (session.problem_stage || 'не определён'),
      'Проблемное событие: ' + (session.problem_event || 'не определено'),
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
    (session.events || []).forEach(function (event, index) {
      var context = safeContext(event.context);
      lines.push([
        String(index + 1) + '.', event.at || 'unknown', event.name || 'event',
        'status=' + (event.status || 'unknown'), 'level=' + (event.level || 'unknown'),
        'source=' + (event.source || 'unknown'), 'duration_ms=' + Number(event.duration_ms || 0),
        'context=' + JSON.stringify(context)
      ].join(' | '));
    });
    if (!(session.events || []).length) lines.push('Нет структурированных событий.');
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
      'Запусков: ' + Number(summary.launches || 0) + ' | Штатно: ' + Number(summary.ready || 0) + ' | Сбоев: ' + Number(summary.failed || 0),
      ''
    ];
    (data && data.sessions || []).forEach(function (session) {
      lines.push([session.client_name || 'Клиент', formatDate(session.started_at), (STATUS[session.outcome] || STATUS.starting)[0], session.device_class, session.os_name, session.browser_name, session.display_mode, 'build=' + (session.build_id || 'unknown')].filter(Boolean).join(' | '));
      if (session.problem_stage) lines.push('  Проблемный этап: ' + (STAGE_LABELS[session.problem_stage] || session.problem_stage));
      (session.events || []).forEach(function (event) { lines.push('  ' + formatDate(event.at) + ' ' + eventLabel(event.name) + ' ' + (event.status || '')); });
    });
    return lines.join('\n');
  }

  function rangeSince(range) {
    var hours = range === '30d' ? 24 * 30 : (range === '7d' ? 24 * 7 : 24);
    return new Date(Date.now() - hours * 3600000).toISOString();
  }

  function buildOverviewParams(filters, cursor) {
    return {
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
    var initialFilters = { range: '24h', clientId: '', search: '', status: 'all', device: '', mode: '', build: '', stage: '', sort: 'problems' };
    var _filters = React.useState(initialFilters), filters = _filters[0], setFilters = _filters[1];
    var _query = React.useState(''), searchQuery = _query[0], setSearchQuery = _query[1];
    var _data = React.useState({ summary: {}, sessions: [], next_cursor: null, has_more: false }), data = _data[0], setData = _data[1];
    var _loading = React.useState(true), loading = _loading[0], setLoading = _loading[1];
    var _error = React.useState(''), error = _error[0], setError = _error[1];
    var _updated = React.useState(null), updatedAt = _updated[0], setUpdatedAt = _updated[1];
    var _expanded = React.useState({}), expanded = _expanded[0], setExpanded = _expanded[1];

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
        setError('Не удалось загрузить диагностику. Повторите позже.');
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

    var summary = data.summary || {};
    return h('section', { className: 'cdo', 'aria-label': 'Диагностика клиентских запусков' },
      h('div', { className: 'cdo-head' },
        h('div', null, h('div', { className: 'cdo-title' }, 'Диагностика'), h('div', { className: 'cdo-note' }, 'Запуски, входы и синхронизация клиентов. Ошибки показаны без содержимого дневника.')),
        h('div', null,
          h('div', { className: 'cdo-actions' },
            h('button', { type: 'button', className: 'cdo-primary' + (filters.status === 'problems' ? ' is-active' : ''), onClick: function () { update('status', filters.status === 'problems' ? 'all' : 'problems'); } }, filters.status === 'problems' ? 'Показать все' : 'Показать сбои'),
            h('button', { type: 'button', className: 'cdo-secondary', onClick: function () { load(false); }, disabled: loading }, loading ? 'Обновляю…' : 'Обновить'),
            h('button', { type: 'button', className: 'cdo-secondary', onClick: copyReport, disabled: !(data.sessions || []).length }, 'Скопировать отчёт')
          ),
          h('div', { className: 'cdo-updated' }, updatedAt ? 'Обновлено ' + updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' · автообновление 60 сек' : 'Автообновление 60 сек')
        )
      ),
      h('div', { className: 'cdo-metrics' },
        metric('Активных клиентов', summary.active_clients), metric('Запусков', summary.launches), metric('Штатно · ' + Number(summary.success_rate || 0) + '%', summary.ready, 'ready'), metric('Сбои', summary.failed, 'failed', 'bad'), metric('Отклонения', Number(summary.degraded || 0) + Number(summary.abandoned || 0), 'problems', 'warn')
      ),
      h('div', { className: 'cdo-filters' },
        h('input', { className: 'cdo-control cdo-search', type: 'search', placeholder: 'Поиск клиента…', value: searchQuery, onChange: function (e) { setSearchQuery(e.target.value); }, 'aria-label': 'Поиск клиента' }),
        h('select', { className: 'cdo-control', value: filters.range, onChange: function (e) { update('range', e.target.value); }, 'aria-label': 'Период' }, option('24h', '24 часа'), option('7d', '7 дней'), option('30d', '30 дней')),
        h('select', { className: 'cdo-control', value: filters.clientId, onChange: function (e) { update('clientId', e.target.value); }, 'aria-label': 'Клиент' }, option('', 'Все клиенты'), clients.map(function (client) { return option(client.id, client.name); })),
        h('select', { className: 'cdo-control', value: filters.status, onChange: function (e) { update('status', e.target.value); }, 'aria-label': 'Статус' }, option('all', 'Все статусы'), option('problems', 'Только проблемы'), option('ready', 'Штатно'), option('failed', 'Сбой'), option('degraded', 'С отклонениями'), option('abandoned', 'Не завершено'), option('starting', 'Загружается')),
        h('select', { className: 'cdo-control', value: filters.device, onChange: function (e) { update('device', e.target.value); }, 'aria-label': 'Устройство' }, option('', 'Все устройства'), option('mobile', 'Телефон'), option('tablet', 'Планшет'), option('desktop', 'Компьютер')),
        h('select', { className: 'cdo-control', value: filters.mode, onChange: function (e) { update('mode', e.target.value); }, 'aria-label': 'Режим запуска' }, option('', 'Браузер и приложение'), option('standalone', 'Установленное приложение'), option('browser', 'Браузер')),
        h('input', { className: 'cdo-control', value: filters.build, onChange: function (e) { update('build', e.target.value.trim()); }, placeholder: 'Версия / build', 'aria-label': 'Версия приложения' }),
        h('select', { className: 'cdo-control', value: filters.stage, onChange: function (e) { update('stage', e.target.value); }, 'aria-label': 'Проблемный этап' }, option('', 'Все этапы'), option('boot', 'Загрузка'), option('sync', 'Синхронизация'), option('write', 'Сохранение'), option('runtime', 'Работа приложения'), option('warning', 'Предупреждение')),
        h('select', { className: 'cdo-control', value: filters.sort, onChange: function (e) { update('sort', e.target.value); }, 'aria-label': 'Сортировка' }, option('problems', 'Сначала проблемы'), option('newest', 'Сначала новые'), option('duration', 'Самые долгие'))
      ),
      error && h('div', { className: 'cd-error' }, error),
      !error && loading && !(data.sessions || []).length && h('div', { className: 'cdo-empty' }, 'Загружаю диагностику…'),
      !error && !loading && !(data.sessions || []).length && h('div', { className: 'cdo-empty' }, filters.status === 'problems' ? 'Сбоев за выбранный период нет' : 'Запусков за выбранный период нет'),
      h('div', { className: 'cdo-list' }, (data.sessions || []).map(function (session) {
        var status = STATUS[session.outcome] || STATUS.starting;
        var key = session.client_id + ':' + session.boot_id;
        var isOpen = !!expanded[key];
        var isProblem = isProblemOutcome(session.outcome);
        var problemText = session.problem_stage ? 'Проблема: ' + (STAGE_LABELS[session.problem_stage] || session.problem_stage) : 'Последний успешный этап: ' + eventLabel(session.last_success_event);
        return h('article', { key: key, className: 'cdo-session cdo-session--' + status[1] },
          h('button', { type: 'button', className: 'cdo-row', 'aria-expanded': isOpen, onClick: function () { setExpanded(function (prev) { var next = Object.assign({}, prev); next[key] = !prev[key]; return next; }); } },
            h('div', null, h('div', { className: 'cdo-client' }, session.client_name || 'Клиент'), h('div', { className: 'cdo-small' }, formatDate(session.started_at))),
            h('div', null, h('span', { className: 'cd-status cd-status--' + status[1] }, status[0]), h('div', { className: 'cdo-small' }, formatDuration(session.duration_ms))),
            h('div', null, h('div', null, [session.device_class, session.os_name, session.browser_name].filter(Boolean).join(' · ') || 'Не определено'), h('div', { className: 'cdo-small' }, (session.display_mode || '—') + ' · ' + (session.build_id || 'unknown'))),
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
            }) : h('div', { className: 'cdo-empty' }, 'Структурированных событий нет'))
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

    var state = { range: '24h', status: 'all', data: null };
    var root = el('div', 'cd-backdrop');
    activeRoot = root;
    var modal = el('section', 'cd-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Диагностика загрузок клиента');
    root.appendChild(modal);

    var head = el('header', 'cd-head');
    var heading = el('div');
    heading.appendChild(el('div', 'cd-title', 'Диагностика загрузок'));
    heading.appendChild(el('div', 'cd-subtitle', options.clientName || 'Клиент'));
    head.appendChild(heading);
    var closeButton = el('button', 'cd-icon-btn', '×');
    closeButton.type = 'button'; closeButton.title = 'Закрыть'; closeButton.addEventListener('click', close);
    head.appendChild(closeButton); modal.appendChild(head);

    var toolbar = el('div', 'cd-toolbar');
    var range = el('select', 'cd-control');
    [['24h', '24 часа'], ['7d', '7 дней'], ['30d', '30 дней']].forEach(function (item) { var o = el('option', '', item[1]); o.value = item[0]; range.appendChild(o); });
    var status = el('select', 'cd-control');
    [['all', 'Все запуски'], ['problems', 'Только проблемы'], ['ready', 'Только штатные']].forEach(function (item) { var o = el('option', '', item[1]); o.value = item[0]; status.appendChild(o); });
    var copy = el('button', 'cd-copy', 'Скопировать отчёт'); copy.type = 'button'; copy.disabled = true;
    toolbar.appendChild(range); toolbar.appendChild(status); toolbar.appendChild(copy); modal.appendChild(toolbar);
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
      body.appendChild(el('div', 'cd-summary', sessions.length + ' запусков · ошибки и незавершённые загрузки показаны первыми'));
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
        var response = await HEYS.YandexAPI.rpc('get_client_observability_by_curator', {
          p_client_id: options.clientId, p_since: since, p_limit: 100
        });
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
    _test: { buildOverviewParams: buildOverviewParams, eventLabel: eventLabel, overviewReport: overviewReport, sessionDebugReport: sessionDebugReport, unwrapRpcPayload: unwrapRpcPayload }
  };
})(typeof window !== 'undefined' ? window : globalThis);
