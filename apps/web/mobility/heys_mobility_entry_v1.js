// heys_mobility_entry_v1.js — public API for mobility mode.
//
// Source-only module. Generated bundle is produced by scripts/bundle-mobility.cjs.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__entryRegistered) return;
  Mobility.__entryRegistered = true;

  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const h = React && React.createElement;

  let overlayNode = null;
  let overlayRoot = null;
  let previousBodyOverflow = '';
  let previousHtmlOverflow = '';
  let bodyScrollLocked = false;

  const DEFAULT_PROFILE = {
    age: 30,
    level: 'beginner',
    populations: [],
    equipment: ['band', 'strap'],
    goal: 'morning',
    acceptedDisclaimer: true
  };

  const MODE_LABEL = {
    morning_tonify: 'Утро',
    pre_workout_ramp: 'Перед нагрузкой',
    post_workout: 'После нагрузки',
    develop_mobility: 'Развитие диапазона',
    evening_relax: 'Вечер',
    rehab: 'Реабилитационная рамка',
    anti_sedentary: 'Пауза'
  };

  function toast(kind, msg) {
    try {
      const t = HEYS.Toast;
      if (kind === 'error' && t && typeof t.error === 'function') t.error(msg);
      else if (t && typeof t.info === 'function') t.info(msg);
      else if (t && typeof t.show === 'function') t.show(msg);
      else console.info('[Mobility]', msg);
    } catch (_) {
      console.info('[Mobility]', msg);
    }
  }

  function normalizeProfile(profile) {
    const raw = Object.assign({}, DEFAULT_PROFILE, profile || {});
    return Mobility.onboarding && typeof Mobility.onboarding.normalizeProfile === 'function'
      ? Mobility.onboarding.normalizeProfile(raw)
      : raw;
  }

  function readStoredProfile() {
    try {
      const ls = global.localStorage;
      if (!ls || typeof ls.getItem !== 'function') return {};
      const raw = JSON.parse(ls.getItem('heys_profile') || '{}');
      return raw.mobilityProfile || raw.mobility || {};
    } catch (_) {
      return {};
    }
  }

  function getProfile(overrides) {
    return normalizeProfile(Object.assign({}, readStoredProfile(), overrides || {}));
  }

  function protocolFromOptions(opts) {
    const o = opts || {};
    if (!Mobility.protocolCatalog) return null;
    if (o.protocolId && typeof Mobility.protocolCatalog.getProtocol === 'function') {
      return Mobility.protocolCatalog.getProtocol(o.protocolId);
    }
    return null;
  }

  function resolveMode(modeId, profile, opts) {
    if (modeId) return modeId;
    const protocol = protocolFromOptions(opts);
    if (protocol && protocol.modeId) return protocol.modeId;
    if (Mobility.onboarding && typeof Mobility.onboarding.recommendMode === 'function') {
      return Mobility.onboarding.recommendMode(profile, opts || {});
    }
    return 'morning_tonify';
  }

  function buildSession(modeId, profile, opts) {
    if (!Mobility.routineBuilder || typeof Mobility.routineBuilder.buildSession !== 'function') {
      return { ok: false, errors: [{ level: 'error', code: 'mobility.not_loaded', msg: 'модуль мобильности не загружен' }], session: null };
    }
    const p = getProfile(profile);
    const protocol = protocolFromOptions(opts);
    const protocolOptions = protocol && Mobility.protocolCatalog && typeof Mobility.protocolCatalog.buildOptions === 'function'
      ? Mobility.protocolCatalog.buildOptions(protocol)
      : {};
    const options = Object.assign({}, protocolOptions, opts || {});
    return Mobility.routineBuilder.buildSession(resolveMode(modeId, p, options), p, options);
  }

  function buildRunPlan(sessionOrResult) {
    if (!Mobility.routineRunner || typeof Mobility.routineRunner.buildRunPlan !== 'function') return null;
    const session = sessionOrResult && sessionOrResult.session ? sessionOrResult.session : sessionOrResult;
    return Mobility.routineRunner.buildRunPlan(session);
  }

  function modeLabel(modeId) {
    return MODE_LABEL[modeId] || modeId || 'Мобильность';
  }

  function durationFromLog(log) {
    const explicit = Number(log && (log.totalDurationMinutes || log.durationMinutes));
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    const sec = Number(log && log.plan && log.plan.estimatedDurationSec);
    return Number.isFinite(sec) && sec > 0 ? Math.round(sec / 60) : null;
  }

  function renderPreviewPill(props) {
    if (!h) return null;
    const T = (props && props.training) || {};
    const log = T.mobilityLog || {};
    const modeId = log.mode || log.modeId || log.sessionMode || 'mobility';
    const duration = durationFromLog(log);
    const ok = log.ok !== false;
    const dateKey = props && props.dateKey;
    const trainingIndex = props && props.trainingIndex;
    const onClick = (props && props.onClick) || function () {
      Mobility.openFullscreen({ dateKey: dateKey, trainingIndex: trainingIndex, mode: 'edit', mobilityLog: log });
    };

    return h('div', {
      className: 'mobility-pill compact-card',
      role: 'button',
      tabIndex: 0,
      onClick: onClick,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') onClick(); },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        minHeight: 60,
        cursor: 'pointer',
        borderRadius: 12,
        border: '1px solid var(--mobility-card-border, rgba(0,0,0,0.06))',
        background: 'var(--bg-secondary, #fff)'
      },
      'aria-label': 'Мобильность: ' + modeLabel(modeId) + '. Открыть детали.'
    },
      h('span', {
        'aria-hidden': 'true',
        style: {
          width: 28,
          height: 28,
          borderRadius: 8,
          background: ok ? '#dbeafe' : '#fee2e2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ok ? '#1d4ed8' : '#b91c1c',
          fontWeight: 700
        }
      }, 'M'),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, modeLabel(modeId)),
        h('div', { style: { fontSize: 12, opacity: 0.65, display: 'flex', gap: 8, alignItems: 'center' } },
          ok ? h('span', null, 'без блокировок') : h('span', { style: { color: '#b91c1c' } }, 'есть ограничения'),
          duration ? h('span', null, duration + ' мин') : null
        )
      ),
      T.time ? h('span', { style: { fontSize: 12, opacity: 0.6 } }, T.time) : null,
      h('span', { style: { fontSize: 18, opacity: 0.4 } }, '›')
    );
  }

  function close() {
    if (!overlayNode) return;
    try {
      if (overlayRoot && typeof overlayRoot.unmount === 'function') overlayRoot.unmount();
      else if (ReactDOM && typeof ReactDOM.unmountComponentAtNode === 'function') ReactDOM.unmountComponentAtNode(overlayNode);
    } catch (_) { /* noop */ }
    if (overlayNode.parentNode) overlayNode.parentNode.removeChild(overlayNode);
    overlayNode = null;
    overlayRoot = null;
    if (bodyScrollLocked && global.document) {
      try {
        if (global.document.body) global.document.body.style.overflow = previousBodyOverflow;
        if (global.document.documentElement) global.document.documentElement.style.overflow = previousHtmlOverflow;
      } catch (_) { /* noop */ }
    }
    bodyScrollLocked = false;
  }

  function mountElement(element) {
    close();
    if (!global.document || !global.document.body || !ReactDOM) return false;
    previousBodyOverflow = global.document.body.style.overflow || '';
    previousHtmlOverflow = global.document.documentElement ? (global.document.documentElement.style.overflow || '') : '';
    try {
      global.document.body.style.overflow = 'hidden';
      if (global.document.documentElement) global.document.documentElement.style.overflow = 'hidden';
      bodyScrollLocked = true;
    } catch (_) {
      bodyScrollLocked = false;
    }
    overlayNode = global.document.createElement('div');
    overlayNode.className = 'mobility-overlay-root';
    global.document.body.appendChild(overlayNode);
    if (typeof ReactDOM.createRoot === 'function') {
      overlayRoot = ReactDOM.createRoot(overlayNode);
      overlayRoot.render(element);
      return true;
    }
    if (typeof ReactDOM.render === 'function') {
      ReactDOM.render(element, overlayNode);
      return true;
    }
    close();
    return false;
  }

  function openFullscreen(opts) {
    const o = opts || {};
    if (!h || !Mobility.UI || !Mobility.UI.MobilityApp) {
      toast('error', 'Модуль мобильности ещё не загружен.');
      return;
    }
    const profile = getProfile(o.profile);
    const modeId = resolveMode(o.modeId || o.sessionMode, profile, o);
    const element = h('div', {
      className: 'mobility-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Мобильность'
    },
      h(Mobility.UI.MobilityApp, {
        profile: profile,
        onClose: close,
        dateKey: o.dateKey,
        trainingIndex: o.trainingIndex,
        clientId: o.clientId,
        storage: o.storage,
        modeId: modeId,
        protocolId: o.protocolId,
        timeOfDay: o.timeOfDay,
        readiness: o.readiness,
        screens: o.screens,
        records: o.records,
        nowDate: o.nowDate,
        startDate: o.startDate,
        phase: o.phase,
        keyLoadWithinHours: o.keyLoadWithinHours,
        coldWaterPlanned: o.coldWaterPlanned,
        afterAdaptiveStrength: o.afterAdaptiveStrength,
        trainingPhase: o.trainingPhase,
        painFlags: o.painFlags || [],
        contraindications: o.contraindications || []
      })
    );
    if (!mountElement(element)) toast('error', 'Не удалось открыть экран мобильности.');
  }

  function isReady() {
    return !!(h && Mobility.UI && Mobility.UI.MobilityApp && Mobility.routineBuilder && Mobility.routineRunner && Mobility.modeEngine);
  }

  Mobility.getProfile = getProfile;
  Mobility.buildSession = buildSession;
  Mobility.buildRunPlan = buildRunPlan;
  Mobility.renderPreviewPill = renderPreviewPill;
  Mobility.openFullscreen = openFullscreen;
  Mobility.close = close;
  Mobility.isReady = isReady;
})(typeof window !== 'undefined' ? window : globalThis);
