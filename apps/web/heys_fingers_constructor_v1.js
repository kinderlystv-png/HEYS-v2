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
  // iOS form-grouped style: карточка = white rect c overflow hidden, внутри
  // stacked rows. Каждая row — grid (label слева, value справа), border-bottom
  // встроен. Никаких отдельных <hr> — divider это border строки.
  // Исключение: "Доп. вес" — крупная строка (44px кнопки), отдельный блок.
  const BORDER_LITE = '0.5px solid rgba(60, 60, 67, 0.13)';
  const BG = 'var(--fingers-bg, #fff)';
  const FG = 'var(--fingers-text, #1a1a1f)';
  const MUTED = 'var(--fingers-muted-text, rgba(0, 0, 0, 0.6))';
  const ACCENT = 'var(--fingers-accent, #007aff)';

  const ST_CARD = {
    padding: 0, borderRadius: 14, border: BORDER_LITE, background: BG,
    color: FG, display: 'flex', flexDirection: 'column', gap: 0,
    overflow: 'hidden', marginBottom: 16,
  };
  // ST_DIVIDER оставлен для совместимости с местами где хочется явный hr.
  // Большинство секций используют border-bottom встроенный в row.
  const ST_DIVIDER = { display: 'none' };

  // Hero — фото хвата на всю ширину карточки, native aspect ratio.
  const ST_HERO_WRAP = {
    width: '100%',
    borderBottom: BORDER_LITE,
    background: 'rgba(120, 120, 128, 0.05)',
    lineHeight: 0,
  };
  const ST_HERO = {
    width: '100%',
    height: 'auto',
    display: 'block',
  };
  // Под фото — список работающих мышц, каждая на своей строке.
  const ST_HERO_MUSCLES = {
    display: 'flex', flexDirection: 'column',
    background: BG, lineHeight: 1.3,
  };
  const ST_HERO_MUSCLE_ROW = {
    appearance: 'none', background: 'transparent', cursor: 'pointer',
    border: 'none', borderTop: BORDER_LITE,
    padding: '10px 14px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, textAlign: 'left',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: FG,
    width: '100%', minHeight: 38,
  };
  const ST_HERO_MUSCLE_ARROW = {
    flex: '0 0 auto', fontSize: 14, color: MUTED, fontWeight: 400,
  };
  // Header — заголовок + remove (без иконки, фото живёт в hero).
  const ST_HEADER = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    background: 'rgba(120, 120, 128, 0.05)',
    borderBottom: BORDER_LITE,
    lineHeight: 1.2,
  };
  const ST_TITLE = { flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', minWidth: 0 };
  const ST_REMOVE = {
    width: 28, height: 28, borderRadius: '50%', border: 'none',
    background: 'rgba(120, 120, 128, 0.12)',
    cursor: 'pointer', fontSize: 14, color: MUTED, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  // iOS-row: grid 2 col, label left + value/control right.
  // border-bottom встроен → не нужны hr между ними.
  const ST_ROW = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    padding: '4px 14px', minHeight: 32, columnGap: 10,
    lineHeight: 1.3,
    borderBottom: BORDER_LITE,
  };
  const ST_LABEL = {
    fontSize: 14, fontWeight: 400, color: FG,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    margin: 0,
  };
  // Compact inline input/select для row (transparent, text-style как iOS settings)
  const ST_INLINE_INPUT = {
    width: 'auto', maxWidth: 90, minWidth: 40,
    padding: '2px 4px', borderRadius: 6, border: 'none',
    background: 'transparent', color: ACCENT,
    fontSize: 16, fontWeight: 500, fontFamily: 'inherit',
    textAlign: 'right',
  };
  const ST_INLINE_SELECT = {
    maxWidth: 180, width: 'auto',
    padding: '2px 4px', borderRadius: 6, border: 'none',
    background: 'transparent', color: ACCENT,
    fontSize: 16, fontWeight: 500, fontFamily: 'inherit',
    textAlign: 'right', cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none',
  };
  const ST_TIME_WRAP = { display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' };
  const ST_TIME_UNIT = { fontSize: 14, color: MUTED, fontWeight: 400 };

  // ==== Доп. вес — крупная отдельная строка ====
  const ST_STEP_ROW = { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' };
  const ST_STEP_BTN = {
    flex: '0 0 auto', minWidth: 56, height: 44, padding: '0 12px', borderRadius: 10,
    background: 'rgba(120, 120, 128, 0.16)', color: FG,
    border: 'none', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const ST_STEP_VAL = {
    minWidth: 64, height: 44, textAlign: 'center', borderRadius: 10,
    border: 'none', background: 'transparent',
    color: ACCENT, fontSize: 18, fontWeight: 600,
    fontFamily: 'inherit',
  };

  // Hint section (small caption под stepper / row)
  const ST_HINT = {
    padding: '4px 14px 8px', fontSize: 12, color: MUTED,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    borderBottom: BORDER_LITE,
  };

  // Anatomy section
  const ST_ANAT_SECTION = { padding: '10px 14px', borderBottom: BORDER_LITE };
  const ST_ANAT_TITLE = {
    fontSize: 11, fontWeight: 500, color: MUTED,
    marginBottom: 6, display: 'block',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const ST_ANAT_WRAP = { display: 'flex', justifyContent: 'center', padding: '4px 0 8px' };
  const ST_MUSCLES = { display: 'flex', flexWrap: 'wrap', gap: 4 };
  const ST_MUSCLE_CHIP = {
    padding: '4px 10px', borderRadius: 10,
    border: '0.5px solid rgba(60, 60, 67, 0.18)',
    background: 'rgba(120, 120, 128, 0.06)', color: FG,
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    lineHeight: 1.3, whiteSpace: 'nowrap',
    minHeight: 'auto', minWidth: 'auto',
    height: 26,
  };

  // Method tip — info-style block в конце
  const ST_METHOD = {
    padding: '10px 14px', background: 'rgba(0, 102, 255, 0.05)',
    display: 'flex', flexDirection: 'column', gap: 6,
  };
  const ST_METHOD_TXT = { fontSize: 13, lineHeight: 1.4, color: FG };

  // Legacy aliases (на случай если внешние модули ссылаются)
  const ST_INPUT = ST_INLINE_INPUT;

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
  function renderHero(grip) {
    const img = R.createElement('img', {
      src: '/exercises/' + grip.id + '.webp',
      alt: 'Хват: ' + grip.label,
      loading: 'lazy',
      decoding: 'async',
      className: 'fingers-fs-grip-hero fingers-fs-grip-hero--' + grip.id,
      style: ST_HERO,
      onError: function (e) { try { e.target.style.display = 'none'; } catch (_) {} },
    });
    // Под фото — мышцы колонкой, каждая строка кликабельна → drill-down.
    const muscleIds = (grip && Array.isArray(grip.primaryMuscles)) ? grip.primaryMuscles : [];
    const known = (Fingers.MUSCLE_INFO && typeof Fingers.MUSCLE_INFO === 'object')
      ? muscleIds.filter(function (m) {
          return Object.prototype.hasOwnProperty.call(Fingers.MUSCLE_INFO, m);
        })
      : [];
    const rows = known.map(function (mid) {
      const info = Fingers.MUSCLE_INFO[mid];
      const label = (info && info.name) ? info.name : mid;
      return R.createElement('button', {
        key: mid, type: 'button',
        className: 'fingers-fs-hero-muscle-row',
        style: ST_HERO_MUSCLE_ROW,
        'aria-label': 'Подробнее: ' + label,
        onClick: function () {
          if (typeof Fingers.openMuscleDetail === 'function') {
            try { Fingers.openMuscleDetail(mid); } catch (_) {}
          }
        },
      },
        R.createElement('span', null, label),
        R.createElement('span', { style: ST_HERO_MUSCLE_ARROW, 'aria-hidden': 'true' }, '›'),
      );
    });
    const muscles = rows.length > 0
      ? R.createElement('div', { style: ST_HERO_MUSCLES, className: 'fingers-fs-hero-muscles' }, rows)
      : null;
    return R.createElement('div', { style: ST_HERO_WRAP, className: 'fingers-fs-hero-wrap' }, img, muscles);
  }
  function renderHeader(grip, onRemove) {
    return R.createElement('div', { style: ST_HEADER },
      R.createElement('div', { style: ST_TITLE }, grip.label),
      R.createElement('button', {
        type: 'button', 'aria-label': 'Удалить упражнение',
        onClick: function () { onRemove(); }, style: ST_REMOVE,
      }, '×'),
    );
  }

  function renderGripSelect(currentGripId, gripsAvailable, onPick, suffix) {
    const idGrip = 'fc-grip-' + (suffix != null ? suffix : '0');
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' },
      R.createElement('label', { style: ST_LABEL, htmlFor: idGrip }, 'Хват'),
      R.createElement('select', {
        id: idGrip, value: currentGripId,
        onChange: function (e) { onPick(e.target.value); },
        style: ST_INLINE_SELECT,
      }, gripsAvailable.map(function (g) {
        return R.createElement('option', { key: g.id, value: g.id }, g.label);
      })),
    );
  }

  function renderEdgeSelect(boardId, gripId, edgeSizeMm, onChangeMm, suffix) {
    const sfx = suffix != null ? suffix : '0';
    if (boardId && typeof Fingers.findCompatibleEdges === 'function') {
      const compat = Fingers.findCompatibleEdges(boardId, gripId) || [];
      if (compat.length > 0) {
        let currentKey = compat[0].id;
        for (let i = 0; i < compat.length; i++) {
          if (compat[i].sizeMm === edgeSizeMm) { currentKey = compat[i].id; break; }
        }
        const idEdge = 'fc-edge-' + sfx;
        return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' },
          R.createElement('label', { style: ST_LABEL, htmlFor: idEdge }, 'Грань'),
          R.createElement('select', {
            id: idEdge, value: currentKey,
            onChange: function (e) {
              const picked = compat.find(function (c) { return c.id === e.target.value; });
              if (picked) onChangeMm(picked.sizeMm);
            },
            style: ST_INLINE_SELECT,
          }, compat.map(function (e) {
            return R.createElement('option', { key: e.id, value: e.id },
              e.label + ' (' + e.sizeMm + ' мм)');
          })),
        );
      }
    }
    // fallback — ручной ввод
    const idEdgeMm = 'fc-edge-mm-' + sfx;
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' },
      R.createElement('label', { style: ST_LABEL, htmlFor: idEdgeMm }, 'Грань, мм'),
      R.createElement('input', {
        id: idEdgeMm, type: 'number', min: 4, max: 60, step: 1,
        value: edgeSizeMm,
        onChange: function (e) { onChangeMm(clamp(parseInt(e.target.value, 10), 4, 60)); },
        style: ST_INLINE_INPUT,
      }),
    );
  }

  function renderWeightStepper(addedKg, onChange, suffix) {
    const idWeight = 'fc-weight-' + (suffix != null ? suffix : '0');
    return R.createElement('div', { className: 'fingers-fs-weight-row' },
      R.createElement('label', { style: ST_LABEL, htmlFor: idWeight }, 'Доп. вес, кг'),
      R.createElement('div', { style: ST_STEP_ROW },
        R.createElement('button', {
          type: 'button', 'aria-label': 'Уменьшить на 2.5 кг',
          className: 'fingers-fs-weight-btn',
          style: ST_STEP_BTN,
          onClick: function () { onChange(snap(addedKg - 2.5, 0.5)); },
        }, '−2.5'),
        R.createElement('input', {
          id: idWeight, type: 'number', step: 0.5, value: addedKg,
          onChange: function (e) {
            const raw = parseFloat(e.target.value);
            onChange(Number.isFinite(raw) ? snap(raw, 0.5) : 0);
          },
          className: 'fingers-fs-weight-input',
          style: ST_STEP_VAL,
        }),
        R.createElement('button', {
          type: 'button', 'aria-label': 'Увеличить на 2.5 кг',
          className: 'fingers-fs-weight-btn',
          style: ST_STEP_BTN,
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
      return R.createElement('div', { style: ST_HINT, className: 'fingers-fs-hint-row' },
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
      return R.createElement('div', { style: ST_HINT, className: 'fingers-fs-hint-row' }, els);
    }
    if (mvc.type === 'time') {
      return R.createElement('div', { style: ST_HINT, className: 'fingers-fs-hint-row' },
        R.createElement('span', null, 'Max hold: ' + (Number(mvc.holdTime) || 0) + 'с (без веса)'));
    }
    return null;
  }

  function renderTimeInput(label, value, onChange, min, max, mmSs) {
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' },
      R.createElement('label', { style: ST_LABEL }, label),
      R.createElement('div', { style: ST_TIME_WRAP },
        R.createElement('input', {
          type: 'number', min: min, max: max, step: 1, value: value,
          onChange: function (e) { onChange(clamp(parseInt(e.target.value, 10), min, max)); },
          style: ST_INLINE_INPUT,
        }),
        R.createElement('span', { style: ST_TIME_UNIT }, mmSs ? fmtMmSs(value) : 'с'),
      ),
    );
  }

  function renderIntInput(label, value, onChange, min, max) {
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' },
      R.createElement('label', { style: ST_LABEL }, label),
      R.createElement('input', {
        type: 'number', min: min, max: max, step: 1, value: value,
        onChange: function (e) { onChange(clamp(parseInt(e.target.value, 10), min, max)); },
        style: ST_INLINE_INPUT,
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
        className: 'fingers-fs-muscle-chip',
        onClick: function () { handleChip(mid); },
        'aria-label': 'Подробнее: ' + label, style: ST_MUSCLE_CHIP,
      }, label);
    });

    return R.createElement('div', { style: ST_ANAT_SECTION },
      R.createElement('span', { style: ST_ANAT_TITLE }, 'Задействованные мышцы'),
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
    // Age fail-closed: null если не указан → filterGrips вернёт [] → ниже guard
    // отрендерит «возраст не указан» вместо опасных хватов (ранее дефолтилось
    // 99 → fail-open, любые grips доступны).
    const userAge = Number.isFinite(Number(p.userAge)) ? Number(p.userAge) : null;
    const exIdx = Number.isFinite(Number(p.exIdx)) ? Number(p.exIdx) : 0;
    const onChange = typeof p.onChange === 'function' ? p.onChange : function () {};
    const onRemove = typeof p.onRemove === 'function' ? p.onRemove : function () {};
    const patch = function (diff) { onChange(Object.assign({}, ex, diff)); };

    // Age fail-closed guard: возраст не указан в профиле — показываем CTA
    // вместо опасных хватов (вместо тихо отфильтрованного списка).
    if (userAge == null) {
      return R.createElement('div', { style: { padding: 24, textAlign: 'center', border: '1px solid var(--fingers-card-border, rgba(0,0,0,0.08))', borderRadius: 12 } },
        R.createElement('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 8 } },
          'Укажите возраст в профиле'),
        R.createElement('div', { style: { fontSize: 13, opacity: 0.72, lineHeight: 1.4 } },
          'Безопасные хваты подбираются по возрасту (UIAA/BMC рекомендации). '
          + 'До 18 лет некоторые техники могут травмировать растущие пальцевые блоки.'),
        R.createElement('button', {
          type: 'button',
          onClick: function () { onRemove(); },
          style: { marginTop: 16, padding: '8px 14px', fontSize: 13 },
        }, 'Удалить упражнение')
      );
    }

    const allGrips = Array.isArray(Fingers.GRIPS) ? Fingers.GRIPS : [];
    const ageFiltered = (Fingers.ageGate && typeof Fingers.ageGate.filterGrips === 'function')
      ? Fingers.ageGate.filterGrips(allGrips, userAge)
      : allGrips;
    const grip = (Fingers.getGripById && Fingers.getGripById(ex.gripId))
      || ageFiltered[0]
      || { id: ex.gripId, label: ex.gripId, primaryMuscles: [], icon: '🖐' };

    const els = [];
    els.push(R.createElement(R.Fragment, { key: 'hero' }, renderHero(grip)));
    els.push(R.createElement(R.Fragment, { key: 'h' }, renderHeader(grip, onRemove)));

    // iOS form-grouped: каждое поле — отдельная row с label слева, value справа.
    els.push(R.createElement(R.Fragment, { key: 'grip' },
      renderGripSelect(ex.gripId, ageFiltered, function (nid) { patch({ gripId: nid }); }, exIdx)));
    els.push(R.createElement(R.Fragment, { key: 'edge' },
      renderEdgeSelect(userBoard, ex.gripId, ex.edgeSizeMm, function (mm) { patch({ edgeSizeMm: mm }); }, exIdx)));

    // Доп. вес — единственная "крупная" строка с большими кнопками
    els.push(R.createElement(R.Fragment, { key: 'w' },
      renderWeightStepper(ex.addedWeightKg, function (kg) { patch({ addedWeightKg: kg }); }, exIdx)));
    const hint = renderMvcHint(ex.gripId, ex.edgeSizeMm, ex.addedWeightKg);
    if (hint) els.push(R.createElement(R.Fragment, { key: 'wh' }, hint));

    els.push(R.createElement(R.Fragment, { key: 'hang' },
      renderTimeInput('Длительность виса', ex.hangSec,
        function (v) { patch({ hangSec: v }); }, 1, 30, false)));
    els.push(R.createElement(R.Fragment, { key: 'rest' },
      renderTimeInput('Отдых между висами', ex.restSec,
        function (v) { patch({ restSec: v }); }, 0, 600, false)));
    els.push(R.createElement(R.Fragment, { key: 'reps' },
      renderIntInput('Висов в подходе', ex.repsPerSet,
        function (v) { patch({ repsPerSet: v }); }, 1, 30)));
    els.push(R.createElement(R.Fragment, { key: 'sets' },
      renderIntInput('Подходов', ex.setsCount,
        function (v) { patch({ setsCount: v }); }, 1, 12)));
    els.push(R.createElement(R.Fragment, { key: 'restset' },
      renderTimeInput('Отдых между подходами', ex.restBetweenSetsSec,
        function (v) { patch({ restBetweenSetsSec: v }); }, 0, 900, true)));

    els.push(R.createElement(R.Fragment, { key: 'm' }, renderMusclesPanel(grip)));

    const method = renderMethodSection(ex.gripId, ex.edgeSizeMm, ex.hangSec);
    if (method) {
      els.push(R.createElement(R.Fragment, { key: 'me' }, method));
    }

    return R.createElement('div', {
      className: 'fingers-fs-constructor-card', style: ST_CARD,
    }, els);
  };

})(typeof window !== 'undefined' ? window : globalThis);
