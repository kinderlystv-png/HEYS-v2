// heys_fingers_constructor_v1.js — Wave 3-B (constructor).
// UI карточки одного fingerboard-упражнения: хват, доска, грань, вес, циклы
// + live SVG руки + анатомия + методическая подсказка с источником.
//
// Public API:
//   HEYS.Fingers.ExerciseConstructor({ exercise, userBoard, userAge,
//                                      onChange, onRemove })
//   HEYS.Fingers.createBlankExercise({ gripId, boardId }) → default объект
//
// CSS namespace: .fingers-fs-constructor-*. Идемпотентность:
// Fingers.ExerciseConstructor__registered.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.ExerciseConstructor__registered) return;
  Fingers.ExerciseConstructor__registered = true;

  const R = (typeof global.React !== 'undefined' && global.React) || null;
  if (!R) {
    try { console.warn('[Fingers.ExerciseConstructor] React not loaded.'); } catch (_) {}
  }

  // ===== ХЕЛПЕРЫ =====
  function fmtMmSs(t) {
    const s = Math.max(0, Math.round(Number(t) || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return n < min ? min : (n > max ? max : n);
  }
  function snap(n, step) {
    return Math.round((Number(n) || 0) / step) * step;
  }

  function createBlankExercise(opts) {
    const o = opts || {};
    return {
      gripId: o.gripId || 'openhand4',
      edgeSizeMm: 20,
      addedWeightKg: 0,
      hangSec: 7,
      restSec: 3,
      repsPerSet: 6,
      setsCount: 3,
      restBetweenSetsSec: 180,
      boardId: o.boardId || null,
    };
  }
  Fingers.createBlankExercise = createBlankExercise;

  // ===== INLINE STYLE TOKENS =====
  // Намеренно компактно: повторяющиеся куски (border, input-base, и т.п.) — в
  // переменные; вместо больших style-объектов рендер inline через factory.
  const BORDER = '1px solid var(--fingers-card-border, rgba(0, 0, 0, 0.12))';
  const BORDER_LITE = '1px solid var(--fingers-card-border, rgba(0, 0, 0, 0.08))';
  const BG = 'var(--fingers-bg, #fff)';
  const FG = 'var(--fingers-text, #1a1a1f)';
  const MUTED = 'var(--fingers-muted-text, rgba(0, 0, 0, 0.6))';

  const ST_CARD = {
    padding: 24, borderRadius: 16, border: BORDER_LITE, background: BG,
    color: FG, display: 'flex', flexDirection: 'column', gap: 18,
  };
  const ST_DIVIDER = { height: 1, background: 'var(--fingers-card-border, rgba(0, 0, 0, 0.08))', margin: '4px 0', border: 0 };
  const ST_HEADER = { display: 'flex', alignItems: 'center', gap: 14 };
  const ST_TITLE = { flex: 1, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' };
  const ST_REMOVE = {
    width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: 20, color: MUTED,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const ST_TWO_COL = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const ST_LABEL = { fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 6, display: 'block' };
  const ST_INPUT = {
    width: '100%', padding: '10px 12px', borderRadius: 10, border: BORDER,
    background: BG, color: FG, fontSize: 15, fontFamily: 'inherit', minHeight: 44,
  };
  const ST_STEP_ROW = { display: 'flex', alignItems: 'center', gap: 8 };
  const ST_STEP_BTN = {
    flex: '0 0 auto', minWidth: 56, height: 44, padding: '0 12px', borderRadius: 10,
    border: BORDER, background: BG, color: FG, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const ST_STEP_VAL = {
    flex: 1, minWidth: 0, height: 44, textAlign: 'center', borderRadius: 10,
    border: BORDER, background: BG, color: FG, fontSize: 16, fontWeight: 600,
    fontFamily: 'inherit',
  };
  const ST_HINT = { marginTop: 8, fontSize: 13, color: MUTED, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
  const ST_MUSCLES = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 };
  const ST_MUSCLE_CHIP = {
    padding: '6px 12px', borderRadius: 999, border: BORDER, background: BG, color: FG,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    minHeight: 36, minWidth: 36,
  };
  const ST_ANAT_WRAP = { display: 'flex', justifyContent: 'center', padding: '8px 0' };
  const ST_METHOD = {
    padding: 14, borderRadius: 12,
    background: 'var(--fingers-bg-soft, rgba(0, 102, 255, 0.05))',
    display: 'flex', flexDirection: 'column', gap: 8,
  };
  const ST_METHOD_TXT = { fontSize: 14, lineHeight: 1.5, color: FG };
  const ST_TIME_WRAP = { display: 'flex', alignItems: 'center', gap: 6 };
  const ST_TIME_UNIT = { fontSize: 13, color: MUTED };

  // ===== METHOD TIPS (RU) =====
  // Возвращает { text, sourceId } или null. Hardcoded для самых частых
  // grip×edge×hangSec комбинаций; источники — id из bibliography.
  function getMethodTip(gripId, edgeMm, hangSec) {
    if (!gripId) return null;
    if (gripId === 'halfcrimp' && edgeMm >= 18 && edgeMm <= 22 && hangSec === 7) {
      return { text: 'Half crimp 7с/3с — главный паттерн силовой выносливости (repeaters). Чередуй с открытым хватом на той же грани через сессию.', sourceId: 'horst_753' };
    }
    if (gripId === 'openhand4' && edgeMm >= 18) {
      return { text: 'Открытый хват — самый безопасный для пальцевых блоков. Хорош для длительных висов, base-фазы и дней с низкой готовностью.', sourceId: 'horst_753' };
    }
    if (gripId === 'fullcrimp') {
      return { text: 'Замок (full crimp) нагружает блок A2 примерно в 31 раз сильнее открытого хвата. Используй экономно — короткие висы, только под конкретный проект.', sourceId: 'schweizer2008' };
    }
    if (gripId === 'mono') {
      return { text: 'Mono — самый травмоопасный хват. Только после 2+ лет лазания, тёплый разогрев и короткие висы 5-7с.', sourceId: 'schoffl2021' };
    }
    if (gripId === 'sloper') {
      return { text: 'Sloper тренирует стабилизаторы плеча и сцепление кожи, а не пальцевые блоки. Подходят длительные висы 10-15с с лёгким весом.', sourceId: 'beastmaker_1000' };
    }
    if (gripId === 'pinch') {
      return { text: 'Pinch развивает оппозицию большого пальца. Безопасен для A2, но нагружает кисть — следи за разминкой.', sourceId: 'lopez2019' };
    }
    if (hangSec >= 8 && hangSec <= 12) {
      return { text: 'Длинные висы 8-12с с дополнительным весом — Max Hangs протокол. 4-5 подходов с отдыхом 3 минуты.', sourceId: 'horst_podcast10' };
    }
    return null;
  }

  // ===== SUB-RENDERERS =====
  function renderHeader(grip, onRemove) {
    const icon = Fingers.GripIcon
      ? R.createElement(Fingers.GripIcon, { gripId: grip.id, size: 80 })
      : R.createElement('div', { style: { width: 80, height: 80 } }, grip.icon || '🖐');
    return R.createElement('div', { style: ST_HEADER },
      R.createElement('div', { style: { flex: '0 0 auto' } }, icon),
      R.createElement('div', { style: ST_TITLE }, grip.label),
      R.createElement('button', {
        type: 'button', 'aria-label': 'Удалить упражнение',
        onClick: function () { onRemove(); }, style: ST_REMOVE,
      }, '×'),
    );
  }

  function renderGripSelect(currentGripId, gripsAvailable, onPick) {
    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL, htmlFor: 'fc-grip' }, 'Хват'),
      R.createElement('select', {
        id: 'fc-grip', value: currentGripId,
        onChange: function (e) { onPick(e.target.value); }, style: ST_INPUT,
      }, gripsAvailable.map(function (g) {
        return R.createElement('option', { key: g.id, value: g.id }, g.label);
      })),
    );
  }

  function renderEdgeSelect(boardId, gripId, edgeSizeMm, onChangeMm) {
    if (boardId && typeof Fingers.findCompatibleEdges === 'function') {
      const compat = Fingers.findCompatibleEdges(boardId, gripId) || [];
      if (compat.length > 0) {
        let currentKey = compat[0].id;
        for (let i = 0; i < compat.length; i++) {
          if (compat[i].sizeMm === edgeSizeMm) { currentKey = compat[i].id; break; }
        }
        return R.createElement('div', null,
          R.createElement('label', { style: ST_LABEL, htmlFor: 'fc-edge' }, 'Грань'),
          R.createElement('select', {
            id: 'fc-edge', value: currentKey,
            onChange: function (e) {
              const picked = compat.find(function (c) { return c.id === e.target.value; });
              if (picked) onChangeMm(picked.sizeMm);
            },
            style: ST_INPUT,
          }, compat.map(function (e) {
            return R.createElement('option', { key: e.id, value: e.id },
              e.label + ' (' + e.sizeMm + ' мм)');
          })),
        );
      }
    }
    // fallback — ручной ввод
    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL, htmlFor: 'fc-edge-mm' }, 'Грань, мм'),
      R.createElement('input', {
        id: 'fc-edge-mm', type: 'number', min: 4, max: 60, step: 1,
        value: edgeSizeMm,
        onChange: function (e) { onChangeMm(clamp(parseInt(e.target.value, 10), 4, 60)); },
        style: ST_INPUT,
      }),
    );
  }

  function renderWeightStepper(addedKg, onChange) {
    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL, htmlFor: 'fc-weight' }, 'Доп. вес, кг'),
      R.createElement('div', { style: ST_STEP_ROW },
        R.createElement('button', {
          type: 'button', 'aria-label': 'Уменьшить на 2.5 кг', style: ST_STEP_BTN,
          onClick: function () { onChange(snap(addedKg - 2.5, 0.5)); },
        }, '−2.5'),
        R.createElement('input', {
          id: 'fc-weight', type: 'number', step: 0.5, value: addedKg,
          onChange: function (e) {
            const raw = parseFloat(e.target.value);
            onChange(Number.isFinite(raw) ? snap(raw, 0.5) : 0);
          },
          style: ST_STEP_VAL,
        }),
        R.createElement('button', {
          type: 'button', 'aria-label': 'Увеличить на 2.5 кг', style: ST_STEP_BTN,
          onClick: function () { onChange(snap(addedKg + 2.5, 0.5)); },
        }, '+2.5'),
      ),
    );
  }

  function renderMvcHint(gripId, edgeSizeMm, addedKg) {
    if (!Fingers.records || typeof Fingers.records.getMVC !== 'function') return null;
    let mvc = null;
    try { mvc = Fingers.records.getMVC(gripId, edgeSizeMm); } catch (_) { mvc = null; }
    if (!mvc) {
      return R.createElement('div', { style: ST_HINT },
        R.createElement('span', null, 'Сделай Max Hang Test для расчёта % от MVC'));
    }
    if (mvc.type === 'weight') {
      const mvcKg = Number(mvc.mvcKg) || 0;
      const bw = Number(HEYS && HEYS.user && HEYS.user.weightKg) || 70;
      const total = bw + (Number(addedKg) || 0);
      const pct = mvcKg > 0 ? Math.round(100 * total / mvcKg) : 0;
      const els = [R.createElement('span', { key: 'p' }, pct + '% от MVC (' + mvcKg.toFixed(1) + ' кг)')];
      if (Fingers.SourceBadge) {
        els.push(R.createElement(Fingers.SourceBadge, { key: 's', sourceId: 'horst_podcast10' }));
      }
      return R.createElement('div', { style: ST_HINT }, els);
    }
    if (mvc.type === 'time') {
      return R.createElement('div', { style: ST_HINT },
        R.createElement('span', null, 'Max hold: ' + (Number(mvc.holdTime) || 0) + 'с (без веса)'));
    }
    return null;
  }

  function renderTimeInput(label, value, onChange, min, max, mmSs) {
    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL }, label),
      R.createElement('div', { style: ST_TIME_WRAP },
        R.createElement('input', {
          type: 'number', min: min, max: max, step: 1, value: value,
          onChange: function (e) { onChange(clamp(parseInt(e.target.value, 10), min, max)); },
          style: ST_INPUT,
        }),
        R.createElement('span', { style: ST_TIME_UNIT }, mmSs ? fmtMmSs(value) : 'с'),
      ),
    );
  }

  function renderIntInput(label, value, onChange, min, max) {
    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL }, label),
      R.createElement('input', {
        type: 'number', min: min, max: max, step: 1, value: value,
        onChange: function (e) { onChange(clamp(parseInt(e.target.value, 10), min, max)); },
        style: ST_INPUT,
      }),
    );
  }

  function renderMusclesPanel(grip) {
    const muscleIds = (grip && Array.isArray(grip.primaryMuscles)) ? grip.primaryMuscles : [];
    const known = (Fingers.MUSCLE_INFO && typeof Fingers.MUSCLE_INFO === 'object')
      ? muscleIds.filter(function (m) {
          return Object.prototype.hasOwnProperty.call(Fingers.MUSCLE_INFO, m);
        })
      : [];

    const handleChip = function (mid) {
      if (typeof Fingers.openMuscleDetail === 'function') {
        try { Fingers.openMuscleDetail(mid); return; } catch (_) {}
      }
      const msg = 'Деталь мышцы появится после загрузки модуля.';
      try {
        if (HEYS.Toast && typeof HEYS.Toast.info === 'function') HEYS.Toast.info(msg);
        else if (HEYS.Toast && typeof HEYS.Toast.show === 'function') HEYS.Toast.show(msg);
      } catch (_) {}
    };

    const anatomyEl = Fingers.AnatomyDiagram
      ? R.createElement(Fingers.AnatomyDiagram, { highlightMuscles: known, size: 200 })
      : null;

    const chips = known.map(function (mid) {
      const info = Fingers.MUSCLE_INFO[mid];
      const label = (info && info.name) ? info.name : mid;
      return R.createElement('button', {
        key: mid, type: 'button',
        onClick: function () { handleChip(mid); },
        'aria-label': 'Подробнее: ' + label, style: ST_MUSCLE_CHIP,
      }, label);
    });

    return R.createElement('div', null,
      R.createElement('label', { style: ST_LABEL }, 'Задействованные мышцы'),
      anatomyEl ? R.createElement('div', { style: ST_ANAT_WRAP }, anatomyEl) : null,
      chips.length > 0 ? R.createElement('div', { style: ST_MUSCLES }, chips) : null,
    );
  }

  function renderMethodSection(gripId, edgeSizeMm, hangSec) {
    const tip = getMethodTip(gripId, edgeSizeMm, hangSec);
    if (!tip) return null;
    const children = [];
    if (Fingers.SourceBadge && tip.sourceId) {
      children.push(R.createElement('div', { key: 'b' },
        R.createElement(Fingers.SourceBadge, { sourceId: tip.sourceId })));
    }
    children.push(R.createElement('div', { key: 't', style: ST_METHOD_TXT }, tip.text));
    return R.createElement('div', { style: ST_METHOD }, children);
  }

  // ===== ПУБЛИЧНЫЙ КОМПОНЕНТ =====
  Fingers.ExerciseConstructor = function ExerciseConstructor(props) {
    if (!R) return null;
    const p = props || {};
    const ex = p.exercise || createBlankExercise({});
    const userBoard = p.userBoard || ex.boardId || null;
    const userAge = Number.isFinite(Number(p.userAge)) ? Number(p.userAge) : 99;
    const onChange = typeof p.onChange === 'function' ? p.onChange : function () {};
    const onRemove = typeof p.onRemove === 'function' ? p.onRemove : function () {};
    const patch = function (diff) { onChange(Object.assign({}, ex, diff)); };

    const allGrips = Array.isArray(Fingers.GRIPS) ? Fingers.GRIPS : [];
    const ageFiltered = (Fingers.ageGate && typeof Fingers.ageGate.filterGrips === 'function')
      ? Fingers.ageGate.filterGrips(allGrips, userAge)
      : allGrips;
    const grip = (Fingers.getGripById && Fingers.getGripById(ex.gripId))
      || ageFiltered[0]
      || { id: ex.gripId, label: ex.gripId, primaryMuscles: [], icon: '🖐' };

    const els = [];
    els.push(R.createElement('div', { key: 'h' }, renderHeader(grip, onRemove)));
    els.push(R.createElement('hr', { key: 'd1', style: ST_DIVIDER }));

    els.push(R.createElement('div', { key: 'g', style: ST_TWO_COL },
      renderGripSelect(ex.gripId, ageFiltered, function (nid) { patch({ gripId: nid }); }),
      renderEdgeSelect(userBoard, ex.gripId, ex.edgeSizeMm, function (mm) { patch({ edgeSizeMm: mm }); }),
    ));

    els.push(R.createElement('div', { key: 'w' },
      renderWeightStepper(ex.addedWeightKg, function (kg) { patch({ addedWeightKg: kg }); }),
      renderMvcHint(ex.gripId, ex.edgeSizeMm, ex.addedWeightKg),
    ));

    els.push(R.createElement('hr', { key: 'd2', style: ST_DIVIDER }));

    els.push(R.createElement('div', { key: 't1', style: ST_TWO_COL },
      renderTimeInput('Длительность виса, с', ex.hangSec,
        function (v) { patch({ hangSec: v }); }, 1, 30, false),
      renderTimeInput('Отдых между висами, с', ex.restSec,
        function (v) { patch({ restSec: v }); }, 0, 600, false),
    ));
    els.push(R.createElement('div', { key: 'r' },
      renderIntInput('Висов в подходе', ex.repsPerSet,
        function (v) { patch({ repsPerSet: v }); }, 1, 30)));
    els.push(R.createElement('div', { key: 't2', style: ST_TWO_COL },
      renderIntInput('Подходов', ex.setsCount,
        function (v) { patch({ setsCount: v }); }, 1, 12),
      renderTimeInput('Отдых между подходами', ex.restBetweenSetsSec,
        function (v) { patch({ restBetweenSetsSec: v }); }, 0, 900, true),
    ));

    els.push(R.createElement('hr', { key: 'd3', style: ST_DIVIDER }));
    els.push(R.createElement('div', { key: 'm' }, renderMusclesPanel(grip)));

    const method = renderMethodSection(ex.gripId, ex.edgeSizeMm, ex.hangSec);
    if (method) {
      els.push(R.createElement('hr', { key: 'd4', style: ST_DIVIDER }));
      els.push(R.createElement('div', { key: 'me' }, method));
    }

    return R.createElement('div', {
      className: 'fingers-fs-constructor-card', style: ST_CARD,
    }, els);
  };

})(typeof window !== 'undefined' ? window : globalThis);
