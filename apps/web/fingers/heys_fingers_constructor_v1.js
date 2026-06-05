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

  // Целевой % от MVC для авто-подбора рабочего веса, по интенсивности протокола.
  // Hörst Max Hangs = 85-95% MVC → берём консервативные 90 для max. Без активной
  // программы дефолтим 80% (умеренный progression-вес).
  const MVC_TARGET_PCT = { recovery: 60, moderate: 75, max: 90 };
  const MVC_TARGET_DEFAULT = 80;

  // B4: авто-прогрессия рабочего веса. Чистый движок: по RPE прошлой сессии
  // (B1) + готовности (cooldown/readiness) + недавней боли (B6) советует шаг.
  // Консервативно и safety-first: расти ТОЛЬКО при readyForMax и без боли;
  // «тяжело» → держать/снизить. input:
  //   { rpe:[ 'easy'|'ok'|'hard' ], readyForMax:bool, hasPain:bool,
  //     currentKg:number, stepKg?:number }
  // → { action:'increase'|'hold'|'decrease', deltaKg, suggestedKg, reason }.
  function suggestProgression(input) {
    const o = input || {};
    const rpe = Array.isArray(o.rpe) ? o.rpe.filter(Boolean) : [];
    const cur = Number(o.currentKg) || 0;
    const step = Number(o.stepKg) > 0 ? Number(o.stepKg) : 1;
    const mk = function (action, deltaKg, reason) {
      return {
        action: action,
        deltaKg: deltaKg,
        suggestedKg: Math.max(0, snap(cur + deltaKg, 0.5)),
        reason: reason
      };
    };
    if (o.hasPain) return mk('hold', 0, 'Недавняя боль — не прогрессируем, дай связкам восстановиться.');
    if (!o.readyForMax) return mk('hold', 0, 'Готовность не максимальная — закрепи текущий вес.');
    if (!rpe.length) return mk('hold', 0, 'Нет RPE с прошлой сессии — оцени подходы, чтобы получить рекомендацию.');
    const hard = rpe.filter(function (r) { return r === 'hard'; }).length;
    const easy = rpe.filter(function (r) { return r === 'easy'; }).length;
    if (hard >= 2) return mk('decrease', -step, 'Прошлая сессия была тяжёлой (' + hard + ' подхода) — снизь вес.');
    if (hard === 1) return mk('hold', 0, 'Был тяжёлый подход — закрепи текущий вес ещё раз.');
    if (easy === rpe.length) return mk('increase', step, 'Все подходы дались легко при полной готовности — можно добавить.');
    return mk('increase', step / 2, 'Подходы по плану, готовность максимальная — небольшой шаг вверх.');
  }
  Fingers.suggestProgression = suggestProgression;

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
  // (display:block у img уже устраняет inline-baseline-gap, lineHeight:0 на
  // wrapper'е НЕ нужен — он каскадно ломает текст в дочерних кнопках.)
  const ST_HERO_WRAP = {
    width: '100%',
    borderBottom: BORDER_LITE,
    background: 'rgba(120, 120, 128, 0.05)',
  };
  const ST_HERO = {
    width: '100%',
    height: 'auto',
    display: 'block',
  };
  // Под фото — список работающих мышц, каждая на своей строке.
  // Block layout (НЕ flex) — flex с wrap'ом текста + chevron'ом давал
  // нестабильные высоты. Chevron позиционируем absolute справа.
  const ST_HERO_MUSCLES = {
    display: 'block',
    background: BG,
  };
  const ST_HERO_MUSCLE_ROW = {
    appearance: 'none', background: 'transparent', cursor: 'pointer',
    border: 'none', borderTop: BORDER_LITE,
    // left pad освобождает место под thumb (absolute, повёрнутый 90°).
    padding: '8px 36px 8px 84px',
    minHeight: 44,
    textAlign: 'left',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: FG,
    lineHeight: 1.4,
    width: '100%', display: 'block',
    position: 'relative',
    whiteSpace: 'normal',
  };
  // Wrapper: горизонтальный слот (рука лёжа). Внутри img-portrait + rotate 90°.
  const ST_HERO_MUSCLE_THUMB_WRAP = {
    position: 'absolute', left: 12, top: '50%',
    transform: 'translateY(-50%)',
    width: 64, height: 28, borderRadius: 6,
    overflow: 'hidden',
    background: 'rgba(120, 120, 128, 0.08)',
    pointerEvents: 'none',
  };
  const ST_HERO_MUSCLE_THUMB_IMG = {
    position: 'absolute', top: '50%', left: '50%',
    // Содержимое — портрет 28×64; поворот вокруг центра даёт визуально 64×28.
    width: 28, height: 64,
    objectFit: 'cover',
    transform: 'translate(-50%, -50%) rotate(90deg)',
  };
  const ST_HERO_MUSCLE_ARROW = {
    position: 'absolute', right: 14, top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 18, color: MUTED, fontWeight: 400,
    lineHeight: 1, pointerEvents: 'none',
  };
  // Header — заголовок + remove (без иконки, фото живёт в hero).
  const ST_HEADER = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    background: 'rgba(120, 120, 128, 0.05)',
    borderBottom: BORDER_LITE,
    lineHeight: 1.2,
  };
  const ST_TITLE_GROUP = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 };
  const ST_TITLE_KICKER = {
    fontSize: 11, fontWeight: 600, color: MUTED,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };
  const ST_TITLE = { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
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
  // MVC% превышает безопасный диапазон — оранжевый/красный chip с warning.
  // Hörst Max Hangs протокол: 85-95% MVC. >110% = de facto failure rep.
  const ST_HINT_WARN = {
    padding: '8px 14px', fontSize: 12, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    borderBottom: BORDER_LITE,
    background: 'rgba(245, 158, 11, 0.10)', color: '#92400e',
  };
  const ST_HINT_DANGER = {
    padding: '8px 14px', fontSize: 12, fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    borderBottom: BORDER_LITE,
    background: 'rgba(220, 38, 38, 0.10)', color: '#991b1b',
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
      const thumbSrc = '/anatomy/' + String(mid).toLowerCase() + '.webp';
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
        R.createElement('span', { style: ST_HERO_MUSCLE_THUMB_WRAP, 'aria-hidden': 'true' },
          R.createElement('img', {
            src: thumbSrc, alt: '',
            loading: 'lazy', decoding: 'async',
            style: ST_HERO_MUSCLE_THUMB_IMG,
            onError: function (e) {
              try { e.target.parentNode.style.visibility = 'hidden'; } catch (_) {}
            },
          })
        ),
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
    // Нумерация «Упражнение N из M» вынесена наружу карточки (в ConstructorTab
    // — центральный разделитель между карточками), здесь только название хвата
    // + кнопка удаления.
    return R.createElement('div', { style: ST_HEADER, className: 'fingers-fs-exercise-header' },
      R.createElement('div', { style: ST_TITLE_GROUP },
        R.createElement('div', { style: ST_TITLE }, grip.label),
      ),
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
          // data-weight-sign — для цветового акцента: positive → красный (нагрузка),
          // negative → циан (разгрузка), zero → нейтрал (gradient slate).
          'data-weight-sign': addedKg > 0 ? 'plus' : addedKg < 0 ? 'minus' : 'zero',
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

  function renderMvcHint(gripId, edgeSizeMm, addedKg, onOpenTest, onPickWeight, targetPct) {
    if (!Fingers.records || typeof Fingers.records.getMVC !== 'function') return null;
    let mvc = null;
    try { mvc = Fingers.records.getMVC(gripId, edgeSizeMm); } catch (_) { mvc = null; }
    if (!mvc) {
      // Premium CTA — открывает inline-test модалку через onOpenTest callback.
      // Также dispatch'ит событие 'fingers-open-calibration' для внешних подписчиков.
      return R.createElement('div', { className: 'fingers-fs-hint-row fingers-fs-hint-row--cta' },
        R.createElement('button', {
          type: 'button',
          className: 'fingers-fs-mvc-cta',
          onClick: function () {
            if (typeof onOpenTest === 'function') {
              onOpenTest({ gripId: gripId, edgeMm: edgeSizeMm, startWeight: addedKg });
            }
            try {
              window.dispatchEvent(new CustomEvent('fingers-open-calibration', {
                detail: { type: 'maxHang', gripId: gripId, edgeMm: edgeSizeMm }
              }));
            } catch (_) {}
          }
        },
          R.createElement('span', { className: 'fingers-fs-mvc-cta__icon', 'aria-hidden': 'true' }, '⚡'),
          R.createElement('span', { className: 'fingers-fs-mvc-cta__text' },
            R.createElement('strong', null, 'Max Hang Test'),
            ' — посчитать % от MVC'),
          R.createElement('span', { className: 'fingers-fs-mvc-cta__arrow', 'aria-hidden': 'true' }, '›')
        ));
    }
    if (mvc.type === 'weight') {
      const mvcKg = Number(mvc.mvcKg) || 0;
      // Источник веса: heys_profile.weight (canonical) / .baseWeight (legacy alias).
      // Раньше использовался HEYS.user.weightKg — поля которого нет в кодовой
      // базе (audit-finding 2026-06-01). У 100% юзеров % MVC считался с дефолтом
      // 70кг. Если профильный вес отсутствует — показываем приглушённую
      // подсказку «укажи вес» вместо тихого fallback'а.
      const bm = (Fingers.getBodyWeight && Fingers.getBodyWeight()) || { kg: 70, source: 'fallback' };
      const isFallback = bm.source === 'fallback';
      const total = bm.kg + (Number(addedKg) || 0);
      const pct = mvcKg > 0 ? Math.round(100 * total / mvcKg) : 0;
      // Hörst Max Hangs: 85-95% MVC. >110% — риск pulley-травмы повышен.
      const overLimit = pct > 110;
      const danger = pct > 125;
      const pctLabel = pct + '% от MVC (' + mvcKg.toFixed(1) + ' кг)' + (isFallback ? ' ≈' : '');
      const baseEls = [R.createElement('span', { key: 'p' }, pctLabel)];
      if (Fingers.SourceBadge) {
        baseEls.push(R.createElement(Fingers.SourceBadge, { key: 's', sourceId: 'horst_podcast10' }));
      }
      // Edit-кнопка справа — открывает Max Hang Test заново чтобы переписать MVC
      // (после прогресса или re-test через 8 нед).
      if (typeof onOpenTest === 'function') {
        baseEls.push(R.createElement('button', {
          key: 'edit',
          type: 'button',
          className: 'fingers-fs-mvc-edit',
          onClick: function () {
            onOpenTest({ gripId: gripId, edgeMm: edgeSizeMm, startWeight: addedKg });
          },
          'aria-label': 'Переделать Max Hang Test'
        }, '↻ Изменить'));
      }
      // Авто-подбор веса: считаем доп. вес под целевой % MVC и подставляем в
      // stepper. addedKg = mvcKg*targetPct/100 − bodyWeight, клампим >= 0 и
      // снапим к 0.5. При fallback-весе (70кг) показываем «≈» — расчёт грубый.
      const tPct = Number.isFinite(Number(targetPct)) ? Number(targetPct) : MVC_TARGET_DEFAULT;
      if (typeof onPickWeight === 'function' && mvcKg > 0) {
        const suggested = clamp(snap(mvcKg * tPct / 100 - bm.kg, 0.5), 0, 999);
        baseEls.push(R.createElement('button', {
          key: 'autofill',
          type: 'button',
          className: 'fingers-fs-mvc-autofill',
          onClick: function () { onPickWeight(suggested); },
          'aria-label': 'Подставить вес под ' + tPct + '% MVC',
        }, '⚖ Под ' + tPct + '% MVC' + (isFallback ? ' ≈' : '')));
      }
      const rows = [R.createElement('div', { key: 'base', style: ST_HINT, className: 'fingers-fs-hint-row' }, baseEls)];
      if (isFallback) {
        // Fail-loud (но не fail-closed): показываем цифру но честно говорим
        // что вес не указан. Skipping % полностью был бы хуже UX — юзер бы
        // не понял почему индикатор пропал.
        rows.push(R.createElement('div', {
          key: 'weight-hint',
          style: ST_HINT,
          className: 'fingers-fs-hint-row',
        }, R.createElement('span', { style: { opacity: 0.7 } },
          'Вес тела не указан — расчёт по 70 кг. Уточни в Профиле для точного %.')));
      }
      if (overLimit) {
        const warnText = danger
          ? '🚨 ' + pct + '% MVC — критично выше нормы. Hörst Max Hangs: 85-95%. Резкий рост риска разрыва A2-блока.'
          : '⚠ ' + pct + '% MVC — выше безопасного диапазона. Hörst рекомендует 85-95% для max-hangs.';
        rows.push(R.createElement('div', {
          key: 'warn',
          style: danger ? ST_HINT_DANGER : ST_HINT_WARN,
          className: 'fingers-fs-hint-warn' + (danger ? ' is-danger' : ''),
          role: 'alert',
        }, warnText));
      }
      // B4: авто-прогрессия — движок советует шаг по RPE прошлой сессии +
      // готовности + боли. Кнопка только на increase (actionable); decrease —
      // приглушённое предупреждение. Не показываем при overLimit (сначала
      // привести вес в безопасный диапазон).
      if (!overLimit && typeof onPickWeight === 'function'
          && Fingers.suggestProgression && Fingers.lastGripFeedback) {
        try {
          const fb = Fingers.lastGripFeedback(gripId);
          const cd = (Fingers.cooldownCheck && Fingers.cooldownCheck()) || null;
          const pain = (Fingers.recentFingerPain && Fingers.recentFingerPain()) || { hasPain: false };
          const sug = Fingers.suggestProgression({
            rpe: fb.rpe,
            readyForMax: !!(cd && cd.recommendation === 'max'),
            hasPain: pain.hasPain,
            currentKg: Number(addedKg) || 0,
          });
          if (sug.action === 'increase' && sug.deltaKg > 0) {
            rows.push(R.createElement('div', { key: 'prog', style: ST_HINT, className: 'fingers-fs-hint-row' },
              R.createElement('button', {
                type: 'button',
                className: 'fingers-fs-mvc-autofill',
                onClick: function () { onPickWeight(sug.suggestedKg); },
                'aria-label': sug.reason,
              }, '↑ Готов добавить +' + sug.deltaKg + ' кг → ' + sug.suggestedKg + ' кг')));
          } else if (sug.action === 'decrease') {
            rows.push(R.createElement('div', { key: 'prog', style: ST_HINT_WARN, className: 'fingers-fs-hint-warn' },
              R.createElement('span', null, '↓ ' + sug.reason)));
          }
        } catch (_) { /* noop */ }
      }
      return R.createElement(R.Fragment, null, rows);
    }
    if (mvc.type === 'time') {
      return R.createElement('div', { style: ST_HINT, className: 'fingers-fs-hint-row' },
        R.createElement('span', null, 'Max hold: ' + (Number(mvc.holdTime) || 0) + 'с (без веса)'));
    }
    return null;
  }

  // locked=true → input read-only, выглядит приглушённо, в label префикс 🔒
  // (см. protocolLocked в ExerciseConstructor — поля времени/повторов/подходов
  // залочены пока активна программа, чтобы юзер не ломал калибровку протокола).
  function renderTimeInput(label, value, onChange, min, max, mmSs, locked) {
    const labelStyle = locked ? Object.assign({}, ST_LABEL, { opacity: 0.55 }) : ST_LABEL;
    const inputStyle = locked
      ? Object.assign({}, ST_INLINE_INPUT, { opacity: 0.55, cursor: 'not-allowed', color: MUTED })
      : ST_INLINE_INPUT;
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' + (locked ? ' is-locked' : '') },
      R.createElement('label', { style: labelStyle }, (locked ? '🔒 ' : '') + label),
      R.createElement('div', { style: ST_TIME_WRAP },
        R.createElement('input', {
          type: 'number', min: min, max: max, step: 1, value: value,
          readOnly: !!locked,
          disabled: !!locked,
          onChange: function (e) {
            if (locked) return;
            onChange(clamp(parseInt(e.target.value, 10), min, max));
          },
          style: inputStyle,
        }),
        R.createElement('span', { style: ST_TIME_UNIT }, mmSs ? fmtMmSs(value) : 'с'),
      ),
    );
  }

  function renderIntInput(label, value, onChange, min, max, locked) {
    const labelStyle = locked ? Object.assign({}, ST_LABEL, { opacity: 0.55 }) : ST_LABEL;
    const inputStyle = locked
      ? Object.assign({}, ST_INLINE_INPUT, { opacity: 0.55, cursor: 'not-allowed', color: MUTED })
      : ST_INLINE_INPUT;
    return R.createElement('div', { style: ST_ROW, className: 'fingers-fs-row' + (locked ? ' is-locked' : '') },
      R.createElement('label', { style: labelStyle }, (locked ? '🔒 ' : '') + label),
      R.createElement('input', {
        type: 'number', min: min, max: max, step: 1, value: value,
        readOnly: !!locked,
        disabled: !!locked,
        onChange: function (e) {
          if (locked) return;
          onChange(clamp(parseInt(e.target.value, 10), min, max));
        },
        style: inputStyle,
      }),
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
    return R.createElement('div', { style: ST_METHOD, className: 'fingers-fs-method-tip' }, children);
  }

  // ===== ПУБЛИЧНЫЙ КОМПОНЕНТ =====
  // ─── Max Hang Test inline modal ─────────────────────────────────────────
  // Минимальный workflow: юзер делает вис до отказа в реале (off-app),
  // вводит holdTime + вес → recordResult сохраняет MVC + показывает gate
  // suggestion («идеально/слишком тяжело/легко»). Модалка inline в карточке,
  // не отдельный portal — проще + меньше слоёв z-index.
  function MaxHangTestSheet(props) {
    const params = props && props.params;
    const onClose = (props && props.onClose) || function () {};
    const onSaved = (props && props.onSaved) || function () {};
    if (!params || !R) return null;
    const gripId = params.gripId;
    const edgeMm = Number(params.edgeMm) || 20;
    const startWeight = Number(params.startWeight) || 0;
    const grip = Fingers.getGripById ? Fingers.getGripById(gripId) : null;
    const gripLabel = (grip && grip.label) || gripId;

    const [addedKg, setAddedKg] = R.useState(startWeight);
    const [holdTime, setHoldTime] = R.useState(7);
    const [result, setResult] = R.useState(null);
    // Рука: 'both' (двуручный — стандарт, пишет bare gripId), 'left'/'right'
    // (одноручный диагностический тест — пишет gripId_L / gripId_R для
    // asymmetries()). Двуручные данные остаются валидны для grade-таблицы.
    const [hand, setHand] = R.useState('both');

    function handleSave() {
      const bm = (Fingers.getBodyWeight && Fingers.getBodyWeight()) || { kg: 70, source: 'fallback' };
      // Одноручный тест → суффикс _L/_R в gripId. recordResult/updateIfPR
      // slug'ят чисто по переданному id, так что запись ложится в отдельный
      // slug и asymmetries() её подхватывает. 'both' пишет bare id (стандарт).
      const recGripId = hand === 'left' ? gripId + '_L'
        : hand === 'right' ? gripId + '_R'
        : gripId;
      try {
        const out = (Fingers.calibration && Fingers.calibration.maxHang &&
          Fingers.calibration.maxHang.recordResult)
          ? Fingers.calibration.maxHang.recordResult(recGripId, edgeMm,
              Number(holdTime), Number(addedKg), bm.kg)
          : null;
        if (out) {
          setResult({
            isPR: out.isPR,
            suggestion: out.suggestion,
            mvc: Number(addedKg) + bm.kg,
            bwSource: bm.source
          });
          // B2: яркий PR-feedback. isPR уже посчитан records.updateIfPR (max-wins).
          if (out.isPR && HEYS.Toast && HEYS.Toast.success) {
            const wTxt = Number(addedKg) > 0 ? (' +' + Number(addedKg) + 'кг') : '';
            try {
              HEYS.Toast.success('🏆 Новый рекорд: ' + Number(holdTime) + 'с @ '
                + edgeMm + 'мм ' + gripLabel + wTxt);
            } catch (_) { /* noop */ }
          }
          onSaved();
        }
      } catch (e) {
        console.warn('[Fingers.MaxHangTest] recordResult failed:', e);
      }
    }

    function resetForm() {
      setResult(null);
      setHoldTime(7);
      setAddedKg(startWeight);
      setHand('both');
    }

    // Stage 1 — input form. Stage 2 — result with suggestion.
    const body = result
      ? R.createElement('div', { className: 'fingers-mh-test__result' },
          R.createElement('div', {
            className: 'fingers-mh-test__result-icon',
            'data-action': result.suggestion.action
          }, result.suggestion.action === 'store' ? '✓' : '↻'),
          R.createElement('h3', { className: 'fingers-mh-test__result-title' },
            result.isPR ? '🏆 Новый MVC!' : 'Записано'),
          R.createElement('div', { className: 'fingers-mh-test__result-mvc' },
            'MVC ≈ ', R.createElement('strong', null, result.mvc.toFixed(1) + ' кг')),
          R.createElement('p', { className: 'fingers-mh-test__result-explain' },
            'Это максимальная нагрузка, которую ты можешь держать 7-10 секунд на ',
            R.createElement('strong', null, gripLabel + ' / ' + edgeMm + ' мм'),
            '. В карточке упражнения теперь будет считаться ',
            R.createElement('strong', null, '% от MVC'),
            ' и подсветится warning если доп. вес опасно высокий.'),
          R.createElement('div', { className: 'fingers-mh-test__result-msg-block' },
            R.createElement('span', { className: 'fingers-mh-test__result-msg-icon' },
              result.suggestion.action === 'store' ? '✓' : 'ℹ'),
            R.createElement('span', { className: 'fingers-mh-test__result-msg' },
              result.suggestion.message)),
          result.bwSource === 'fallback'
            ? R.createElement('p', { className: 'fingers-mh-test__result-warn' },
                '⚠ Вес тела не указан в Профиле — взяли 70 кг. Уточни для точного MVC.')
            : null,
          R.createElement('div', { className: 'fingers-mh-test__result-actions' },
            R.createElement('button', {
              type: 'button',
              className: 'fingers-mh-test__btn fingers-mh-test__btn--cancel',
              onClick: resetForm
            }, '↻ Переделать'),
            R.createElement('button', {
              type: 'button',
              className: 'fingers-mh-test__btn fingers-mh-test__btn--save',
              onClick: onClose
            }, 'Готово')
          )
        )
      : R.createElement('div', { className: 'fingers-mh-test__form' },

          // Explainer block — что это / зачем / как
          R.createElement('div', { className: 'fingers-mh-test__explainer' },
            R.createElement('div', { className: 'fingers-mh-test__explainer-row' },
              R.createElement('span', { className: 'fingers-mh-test__explainer-icon' }, '🎯'),
              R.createElement('div', null,
                R.createElement('strong', null, 'Зачем нужен этот тест: '),
                'найти максимальную нагрузку которую ты можешь держать на этом хвате/грани. ',
                'Потом из него рассчитывается % MVC — критично для безопасной тренировки.')
            ),
            R.createElement('div', { className: 'fingers-mh-test__explainer-row' },
              R.createElement('span', { className: 'fingers-mh-test__explainer-icon' }, '🤲'),
              R.createElement('div', null,
                R.createElement('strong', null, 'Как делать: '),
                'хорошо прогрейся, потом подвесься с выбранным весом на ',
                gripLabel.toLowerCase(),
                ' / ',
                edgeMm,
                ' мм до отказа. Замерь время виса.')
            ),
            R.createElement('div', { className: 'fingers-mh-test__explainer-row' },
              R.createElement('span', { className: 'fingers-mh-test__explainer-icon' }, '⏱'),
              R.createElement('div', null,
                R.createElement('strong', null, 'Цель — 7-10 секунд. '),
                'Меньше → вес слишком большой, подбери легче. Больше → слишком лёгкий, добавь.')
            )
          ),

          R.createElement('div', { className: 'fingers-mh-test__field' },
            R.createElement('span', null, 'Рука',
              R.createElement('em', { className: 'fingers-mh-test__sweet-zone' },
                'для анализа асимметрии')),
            R.createElement('div', { className: 'fingers-mh-test__hand', role: 'radiogroup', 'aria-label': 'Рука' },
              [['both', 'Обе'], ['left', 'Левая'], ['right', 'Правая']].map(function (opt) {
                return R.createElement('button', {
                  key: opt[0],
                  type: 'button',
                  role: 'radio',
                  'aria-checked': hand === opt[0] ? 'true' : 'false',
                  'data-active': hand === opt[0] ? 'true' : 'false',
                  className: 'fingers-mh-test__hand-btn',
                  onClick: function () { setHand(opt[0]); }
                }, opt[1]);
              })
            )
          ),

          R.createElement('label', { className: 'fingers-mh-test__field' },
            R.createElement('span', null, 'Доп. вес, кг'),
            R.createElement('input', {
              type: 'number', step: 0.5, value: addedKg,
              onChange: function (e) { setAddedKg(parseFloat(e.target.value) || 0); }
            })
          ),
          R.createElement('label', { className: 'fingers-mh-test__field' },
            R.createElement('span', null,
              'Время виса, с',
              R.createElement('em', { className: 'fingers-mh-test__sweet-zone' },
                'цель 7–10 с')),
            R.createElement('input', {
              type: 'number', step: 0.5, min: 1, max: 60, value: holdTime,
              onChange: function (e) { setHoldTime(parseFloat(e.target.value) || 0); }
            })
          ),
          R.createElement('div', { className: 'fingers-mh-test__actions' },
            R.createElement('button', {
              type: 'button',
              className: 'fingers-mh-test__btn fingers-mh-test__btn--cancel',
              onClick: onClose
            }, 'Отмена'),
            R.createElement('button', {
              type: 'button',
              className: 'fingers-mh-test__btn fingers-mh-test__btn--save',
              onClick: handleSave
            }, 'Записать результат')
          )
        );

    return R.createElement('div', {
      className: 'fingers-mh-test__backdrop',
      onClick: onClose,
      role: 'presentation'
    },
      R.createElement('div', {
        className: 'fingers-mh-test',
        role: 'dialog',
        'aria-label': 'Max Hang Test',
        onClick: function (e) { e.stopPropagation(); }
      },
        R.createElement('div', { className: 'fingers-mh-test__header' },
          R.createElement('h2', { className: 'fingers-mh-test__title' },
            R.createElement('span', { 'aria-hidden': 'true' }, '⚡'),
            ' Max Hang Test'),
          R.createElement('div', { className: 'fingers-mh-test__sub' },
            gripLabel + ' · ' + edgeMm + ' мм')
        ),
        body
      )
    );
  }
  Fingers.MaxHangTestSheet = MaxHangTestSheet;

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
    const exTotal = Number.isFinite(Number(p.exTotal)) ? Number(p.exTotal) : 1;
    const onChange = typeof p.onChange === 'function' ? p.onChange : function () {};
    const onRemove = typeof p.onRemove === 'function' ? p.onRemove : function () {};
    const patch = function (diff) { onChange(Object.assign({}, ex, diff)); };
    // Когда активна программа — параметры протокола (время виса/отдых/повторы/
    // подходы) залочены: это калиброванные значения под конкретный энергообмен,
    // менять их = ломать смысл программы. Доступны для изменения только grip,
    // edge и доп. вес — стандартные progression knobs.
    const protocolLocked = !!p.protocolLocked;
    // Интенсивность активной программы (recovery|moderate|max) → целевой % MVC
    // для авто-подбора веса. Нет программы / неизвестна → дефолт 80%.
    const targetPct = MVC_TARGET_PCT[p.programIntensity] || MVC_TARGET_DEFAULT;
    // Max Hang Test inline-модалка: {gripId, edgeMm, startWeight} или null.
    // Открывается при клике на CTA «Max Hang Test», закрывается ручкой или
    // после записи результата.
    const [mhTestParams, setMhTestParams] = R.useState(null);

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
    // B6: при недавней finger-боли убираем full crimp / mono из выбора (fail-safe,
    // A2/A4 шкивы). painGate читает боль из dayv2 (B1: hadPain/setFeedback.pain).
    const painInfo = (Fingers.recentFingerPain && Fingers.recentFingerPain()) || { hasPain: false };
    const gripChoices = (painInfo.hasPain && Fingers.painGate && Fingers.painGate.filterGripsForPain)
      ? Fingers.painGate.filterGripsForPain(ageFiltered, true)
      : ageFiltered;
    const grip = (Fingers.getGripById && Fingers.getGripById(ex.gripId))
      || gripChoices[0]
      || { id: ex.gripId, label: ex.gripId, primaryMuscles: [], icon: '🖐' };

    const els = [];
    // Заголовок (название упражнения + крестик) — теперь СВЕРХУ, до фото.
    // Тогда юзер сразу видит контекст и может удалить упражнение без скролла.
    els.push(R.createElement(R.Fragment, { key: 'h' }, renderHeader(grip, onRemove)));
    els.push(R.createElement(R.Fragment, { key: 'hero' }, renderHero(grip)));

    // B6: примечание почему скрыты risky-хваты (если недавняя боль).
    if (painInfo.hasPain) {
      els.push(R.createElement('div', {
        key: 'pain-note',
        className: 'fingers-c-pain-note',
        style: { fontSize: 13, lineHeight: 1.4, padding: '8px 12px', marginBottom: 8,
          borderRadius: 8, background: 'rgba(220,38,38,0.10)', color: '#fca5a5' }
      }, '🩹 Недавно была боль в пальцах — full crimp и mono временно скрыты. Дай связкам восстановиться.'));
    }
    // iOS form-grouped: каждое поле — отдельная row с label слева, value справа.
    els.push(R.createElement(R.Fragment, { key: 'grip' },
      renderGripSelect(ex.gripId, gripChoices, function (nid) { patch({ gripId: nid }); }, exIdx)));
    els.push(R.createElement(R.Fragment, { key: 'edge' },
      renderEdgeSelect(userBoard, ex.gripId, ex.edgeSizeMm, function (mm) { patch({ edgeSizeMm: mm }); }, exIdx)));

    // Доп. вес — единственная "крупная" строка с большими кнопками
    els.push(R.createElement(R.Fragment, { key: 'w' },
      renderWeightStepper(ex.addedWeightKg, function (kg) { patch({ addedWeightKg: kg }); }, exIdx)));
    const hint = renderMvcHint(ex.gripId, ex.edgeSizeMm, ex.addedWeightKg, setMhTestParams,
      function (kg) { patch({ addedWeightKg: kg }); }, targetPct);
    if (hint) els.push(R.createElement(R.Fragment, { key: 'wh' }, hint));

    els.push(R.createElement(R.Fragment, { key: 'hang' },
      renderTimeInput('Длительность виса', ex.hangSec,
        function (v) { patch({ hangSec: v }); }, 1, 30, false, protocolLocked)));
    els.push(R.createElement(R.Fragment, { key: 'rest' },
      renderTimeInput('Отдых между висами', ex.restSec,
        function (v) { patch({ restSec: v }); }, 0, 600, false, protocolLocked)));
    els.push(R.createElement(R.Fragment, { key: 'reps' },
      renderIntInput('Висов в подходе', ex.repsPerSet,
        function (v) { patch({ repsPerSet: v }); }, 1, 30, protocolLocked)));
    els.push(R.createElement(R.Fragment, { key: 'sets' },
      renderIntInput('Подходов', ex.setsCount,
        function (v) { patch({ setsCount: v }); }, 1, 12, protocolLocked)));
    els.push(R.createElement(R.Fragment, { key: 'restset' },
      renderTimeInput('Отдых между подходами', ex.restBetweenSetsSec,
        function (v) { patch({ restBetweenSetsSec: v }); }, 0, 900, true, protocolLocked)));

    const method = renderMethodSection(ex.gripId, ex.edgeSizeMm, ex.hangSec);
    if (method) {
      els.push(R.createElement(R.Fragment, { key: 'me' }, method));
    }

    return R.createElement('div', {
      className: 'fingers-fs-constructor-card',
      style: ST_CARD,
      // data-attr используется ExerciseStickyBar для определения активного
      // упражнения через scroll listener (см. session_ui).
      'data-exercise-index': exIdx,
      'data-exercise-grip': grip.label,
      'data-exercise-total': exTotal,
    }, els.concat(mhTestParams
      ? [R.createElement(MaxHangTestSheet, {
          key: 'mh-modal',
          params: mhTestParams,
          onClose: function () { setMhTestParams(null); },
          onSaved: function () { /* keep open для показа результата */ }
        })]
      : []));
  };

})(typeof window !== 'undefined' ? window : globalThis);
