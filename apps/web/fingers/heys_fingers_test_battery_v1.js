// heys_fingers_test_battery_v1.js — UI ввода результатов тест-батареи (§8.1).
//
// Замыкает цепочку «реальные данные → лимитёр → фокус мезоцикла»: пользователь
// вводит результаты тестов из assessment.TEST_BATTERY, модуль сохраняет их через
// records.saveAssessmentBattery и сразу показывает оценку (assessLatestBattery):
// ведущий лимитёр + веса блоков. Данные-слой (assessment + records) уже готов —
// здесь только форма + дисплей.
//
// Public:
//   HEYS.Fingers.TestBatteryTab          — React-компонент вкладки
//   HEYS.Fingers.testBattery.buildRawFromState(state, battery) — чистый хелпер
//   HEYS.Fingers.testBattery.summarizeAssessment(result, labels, topN) — чистый

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__testBatteryRegistered) return;
  Fingers.__testBatteryRegistered = true;

  const React = global.React;
  const h = React && React.createElement;

  // ─── Чистые хелперы (node-тестируемые, без React) ─────────────────────────

  // state[id] = { score?: string, markers?: string } → raw для
  // records.saveAssessmentBattery. Включаем только реально введённые поля; пустая
  // строка / NaN игнорируются (нельзя затирать прошлый результат пустотой).
  function buildRawFromState(state, battery) {
    const raw = {};
    const tb = battery || {};
    Object.keys(state || {}).forEach(function (id) {
      const v = state[id] || {};
      const test = tb[id];
      if (!test) return;
      const entry = {};
      if (test.scoreKey && v.score !== '' && v.score != null) {
        const s = Number(v.score);
        if (isFinite(s)) entry.score = s;
      }
      if (test.flagKey && v.markers !== '' && v.markers != null) {
        const m = Number(v.markers);
        if (isFinite(m)) {
          entry.markers = Math.max(0, m);
          entry.maxMarkers = test.maxMarkers || null;
        }
      }
      if (Object.keys(entry).length) raw[id] = entry;
    });
    return raw;
  }

  // assessResult → дисплей-сводка: {limiter, label, weights:[{quality,label,weight}]}
  // отсортировано по убыванию веса, top-N.
  function summarizeAssessment(result, labels, topN) {
    if (!result || !result.leadingLimiter) return null;
    const lab = labels || {};
    const bw = result.blockWeights || {};
    const weights = Object.keys(bw).map(function (q) {
      return { quality: q, label: lab[q] || q, weight: bw[q] };
    }).sort(function (a, b) { return b.weight - a.weight; });
    const n = typeof topN === 'number' ? topN : 4;
    return {
      limiter: result.leadingLimiter,
      label: lab[result.leadingLimiter] || result.leadingLimiter,
      weights: weights.slice(0, n)
    };
  }

  // ─── React-компонент ──────────────────────────────────────────────────────

  function TestBatteryTab(props) {
    if (!h) return null;
    const A = Fingers.assessment;
    const R = Fingers.records;
    const QC = Fingers.qualityCatalog;
    if (!A || !R || !A.TEST_BATTERY) {
      return h('div', { className: 'fingers-tb' }, 'Модуль оценки недоступен.');
    }
    const TB = A.TEST_BATTERY;
    const labels = (QC && QC.QUALITY_LABELS) || {};
    const profile = (Fingers.getProfile && Fingers.getProfile()) || {};
    const level = (props && props.level) || profile.level || 'intermediate';

    const [state, setState] = React.useState(function () {
      const saved = R.loadAssessmentBattery ? R.loadAssessmentBattery() : {};
      const init = {};
      Object.keys(TB).forEach(function (id) {
        const s = saved[id] || {};
        init[id] = {
          score: (s.score != null ? String(s.score) : ''),
          markers: (s.markers != null ? String(s.markers) : '')
        };
      });
      return init;
    });
    const [result, setResult] = React.useState(function () {
      try { return R.assessLatestBattery ? R.assessLatestBattery(level) : null; }
      catch (_) { return null; }
    });
    const [savedTick, setSavedTick] = React.useState(0);

    const due = React.useMemo(function () {
      try {
        const saved = R.loadAssessmentBattery ? R.loadAssessmentBattery() : {};
        return A.dueTests ? A.dueTests(saved) : [];
      } catch (_) { return []; }
    }, [savedTick]);
    const dueById = Object.create(null);
    due.forEach(function (d) { dueById[d.id] = d; });

    function setField(id, field, val) {
      setState(function (prev) {
        const next = Object.assign({}, prev);
        next[id] = Object.assign({}, next[id]);
        next[id][field] = val;
        return next;
      });
    }

    function handleSave() {
      const raw = buildRawFromState(state, TB);
      if (!Object.keys(raw).length) {
        if (HEYS.Toast && HEYS.Toast.warn) HEYS.Toast.warn('Заполните хотя бы один тест');
        return;
      }
      try {
        R.saveAssessmentBattery(raw, { source: 'manual' });
        setResult(R.assessLatestBattery(level));
        setSavedTick(function (n) { return n + 1; });
        if (HEYS.Toast && HEYS.Toast.success) HEYS.Toast.success('Оценка обновлена');
      } catch (_) {
        if (HEYS.Toast && HEYS.Toast.warn) HEYS.Toast.warn('Не удалось сохранить оценку');
      }
    }

    const numericTests = Object.keys(TB).filter(function (id) { return TB[id].scoreKey; });
    const checklistTests = Object.keys(TB).filter(function (id) { return TB[id].flagKey; });
    const summary = summarizeAssessment(result, labels, 4);

    function numericRow(id) {
      const t = TB[id];
      const d = dueById[id];
      return h('label', { key: id, className: 'fingers-tb__row' },
        h('span', { className: 'fingers-tb__label' },
          t.label,
          h('span', { className: 'fingers-tb__unit' }, ' · ' + t.unit),
          d && d.due ? h('span', { className: 'fingers-tb__due' }, ' пора пересдать') : null),
        h('input', {
          type: 'number', inputMode: 'decimal', className: 'fingers-ob-input',
          value: state[id] ? state[id].score : '',
          placeholder: '—',
          onChange: function (e) { setField(id, 'score', e.target.value); }
        }));
    }

    function checklistRow(id) {
      const t = TB[id];
      const mx = t.maxMarkers || 0;
      return h('label', { key: id, className: 'fingers-tb__row' },
        h('span', { className: 'fingers-tb__label' },
          t.label,
          h('span', { className: 'fingers-tb__unit' }, ' · слабых 0–' + mx)),
        h('input', {
          type: 'number', min: 0, max: mx, className: 'fingers-ob-input',
          value: state[id] ? state[id].markers : '',
          placeholder: '—',
          onChange: function (e) { setField(id, 'markers', e.target.value); }
        }));
    }

    return h('div', { className: 'fingers-tb' },
      h('p', { className: 'fingers-tb__intro' },
        'Введите результаты тестов — движок определит ведущий лимитёр и выставит '
        + 'фокус мезоцикла. Заполняйте то, что есть, пустые поля игнорируются.'),
      h('div', { className: 'fingers-tb__group' },
        h('h4', { className: 'fingers-tb__group-title' }, 'Силовые и энергосистемы'),
        numericTests.map(numericRow)),
      h('div', { className: 'fingers-tb__group' },
        h('h4', { className: 'fingers-tb__group-title' },
          'Навыковые чек-листы (сколько маркеров слабые)'),
        checklistTests.map(checklistRow)),
      h('button', {
        className: 'fingers-fs-cta',
        onClick: handleSave,
        style: { width: '100%', marginTop: 14 }
      }, 'Сохранить и оценить'),
      summary ? h('div', { className: 'fingers-tb__result' },
        h('h4', { className: 'fingers-tb__result-title' },
          'Ведущий лимитёр: ', h('strong', null, summary.label)),
        h('p', { className: 'fingers-tb__hint' },
          'Лимитёр становится фокусом «develop» мезоцикла, остальное — поддержание.'),
        h('div', { className: 'fingers-tb__bars' },
          summary.weights.map(function (w) {
            return h('div', { key: w.quality, className: 'fingers-tb__bar-row' },
              h('span', { className: 'fingers-tb__bar-label' }, w.label),
              h('span', { className: 'fingers-tb__bar-track' },
                h('span', {
                  className: 'fingers-tb__bar-fill',
                  style: { width: Math.round(w.weight * 100) + '%' }
                })),
              h('span', { className: 'fingers-tb__bar-pct' }, Math.round(w.weight * 100) + '%'));
          }))
      ) : null
    );
  }

  Fingers.TestBatteryTab = TestBatteryTab;
  Fingers.testBattery = {
    buildRawFromState: buildRawFromState,
    summarizeAssessment: summarizeAssessment,
    __registered: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
