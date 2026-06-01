// heys_fingers_svg_anatomy_v1.js — Wave 2-B (visual).
// HEYS.Fingers.AnatomyDiagram({ highlightMuscles, showPulleys, onMuscleClick, size })
//   — единая inline SVG предплечья + кисти (palmar view, ладонью к зрителю).
// Мышцы — отдельные <path> с уникальными id; подсветка через fill={accent}/{muted}.
// Tap на мышцу — через <button>-wrapper для accessibility (aria-label).
//
// Public API:
//   HEYS.Fingers.AnatomyDiagram(props)
//     props.highlightMuscles : string[] — id мышц для подсветки
//     props.showPulleys      : bool     — показать A2/A4 связки маркерами
//     props.onMuscleClick    : (muscleId) => void
//     props.size             : px (default 240)
//
//   HEYS.Fingers.MUSCLE_INFO : Object<muscleId, {name, latin, function, injuries, sourceIds}>
//   HEYS.Fingers.MUSCLE_IDS  : string[]
//
// Идемпотентность: Fingers.AnatomyDiagram__registered.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.AnatomyDiagram__registered) return;
  Fingers.AnatomyDiagram__registered = true;

  const R = (typeof global.React !== 'undefined' && global.React) || null;
  if (!R) {
    try { console.warn('[Fingers.AnatomyDiagram] React not loaded — component unavailable until boot.'); } catch (_) {}
  }

  // ===== MUSCLE INFO (single source of truth) =====
  // sourceIds — ссылки на heys_fingers_bibliography_v1.js (Wave 2-A).
  const MUSCLE_INFO = Object.freeze({
    FDP: Object.freeze({
      name: 'Глубокий сгибатель пальцев',
      latin: 'Flexor Digitorum Profundus',
      function: 'Сгибает дистальный (DIP) сустав каждого пальца — основная сила в crimp/half-crimp хвате.',
      injuries: ['A2 pulley rupture', 'FDP avulsion (rugby finger)', 'Tendinopathy'],
      sourceIds: ['schweizer2008', 'schoffl2021'],
    }),
    FDS: Object.freeze({
      name: 'Поверхностный сгибатель пальцев',
      latin: 'Flexor Digitorum Superficialis',
      function: 'Сгибает проксимальный (PIP) сустав. В sloper и open-hand работает наравне с FDP.',
      injuries: ['FDS tendon strain', 'PIP synovitis', 'Lumbrical shift'],
      sourceIds: ['schweizer2008'],
    }),
    lumbricals: Object.freeze({
      name: 'Червеобразные мышцы',
      latin: 'Lumbricals',
      function: 'Сгибают MCP-сустав, разгибают IP. Перегружаются в pocket-хватах с неравномерной нагрузкой пальцев.',
      injuries: ['Lumbrical shift syndrome', 'Strain in pocket pulls'],
      sourceIds: ['schweizer2008'],
    }),
    brachioradialis: Object.freeze({
      name: 'Плечелучевая',
      latin: 'Brachioradialis',
      function: 'Сгибатель предплечья + supinator. Поддерживает hangboard грип через локтевой угол.',
      injuries: ['Forearm strain', 'Elbow tendinopathy'],
      sourceIds: ['horst_podcast10'],
    }),
    ECR: Object.freeze({
      name: 'Лучевой разгибатель запястья',
      latin: 'Extensor Carpi Radialis',
      function: 'Антагонист сгибателей пальцев. Слабость → pulley injury (Hörst: extensor balance критичен).',
      injuries: ['Lateral epicondylitis (climber\'s elbow)', 'Forearm overuse'],
      sourceIds: ['horst_podcast10'],
    }),
    FCR: Object.freeze({
      name: 'Лучевой сгибатель запястья',
      latin: 'Flexor Carpi Radialis',
      function: 'Сгибает запястье, ассистирует pinch и sloper хватам.',
      injuries: ['Medial epicondylitis', 'Wrist strain'],
      sourceIds: ['schweizer2008'],
    }),
    adductor_pollicis: Object.freeze({
      name: 'Приводящая мышца большого пальца',
      latin: 'Adductor Pollicis',
      function: 'Прижимает большой палец к ладони — главная мышца pinch-хвата.',
      injuries: ['Thumb CMC strain', 'Skier\'s thumb (UCL rupture)'],
      sourceIds: ['schweizer2008'],
    }),
  });

  const MUSCLE_IDS = Object.freeze(Object.keys(MUSCLE_INFO));

  Fingers.MUSCLE_INFO = MUSCLE_INFO;
  Fingers.MUSCLE_IDS = MUSCLE_IDS;

  // ===== SVG SHAPES =====
  // Premium-стиль: palmar view, кисть СВЕРХУ (пальцы вверх) → запястье →
  // предплечье ВНИЗ. viewBox 0 0 280 400. Силуэт — один заполненный path
  // (skin tone), мышцы — органичные формы с мягким fill, активная — с glow
  // через radialGradient + drop-shadow filter + лейбл-плашка снизу.

  // Hand silhouette: контур кисти + предплечья. Один closed path.
  // Пропорции: палец длинн. ≈ palm width, форearm ≈ 1.4 × palm length.
  const HAND_SILHOUETTE_D =
    // Старт у основания большого пальца (left palm)
    'M 88 168 ' +
    // Левая сторона ладони → к пальцам
    'L 86 130 Q 86 124 92 122 ' +
    // Указательный палец (left side)
    'L 100 122 L 100 56 Q 100 48 108 48 L 116 48 Q 124 48 124 56 L 124 124 ' +
    // Средний палец
    'L 134 124 L 134 40 Q 134 32 142 32 L 150 32 Q 158 32 158 40 L 158 124 ' +
    // Безымянный
    'L 168 124 L 168 50 Q 168 42 176 42 L 184 42 Q 192 42 192 50 L 192 124 ' +
    // Мизинец
    'L 200 124 L 200 72 Q 200 64 208 64 L 216 64 Q 224 64 224 72 L 224 130 ' +
    // Правая сторона ладони → запястье
    'Q 224 158 220 178 L 218 218 ' +
    // Запястье справа
    'L 222 230 ' +
    // Предплечье справа (расширяется к локтю)
    'Q 234 290 244 380 L 244 388 ' +
    'L 80 388 L 80 380 ' +
    // Предплечье слева
    'Q 90 290 102 230 ' +
    // Запястье слева
    'L 106 218 L 100 178 ' +
    // Большой палец (отведён в сторону)
    'Q 92 174 88 170 ' +
    // Назад к старту через thumb root
    'Q 70 178 56 198 Q 44 220 56 238 Q 70 252 88 240 L 96 218 ' +
    'Z';

  // Inner muscle shapes — мягкие organic формы.
  // Forearm: y=240..380, 5 продольных «полос» (анатомически по группам).
  // Palm: lumbricals — центр ладони; adductor_pollicis — thenar (основание большого).
  const MUSCLE_PATHS = Object.freeze({
    // Forearm (palmar view, слева→справа по компасу скрин):
    // brachioradialis — radial side (left, тонкая)
    brachioradialis: 'M 96 248 Q 92 290 96 360 Q 102 372 112 368 Q 116 320 118 252 Q 110 244 96 248 Z',
    // FCR — следом
    FCR:             'M 122 250 Q 120 295 124 360 Q 132 372 144 366 Q 144 320 146 254 Q 134 246 122 250 Z',
    // FDS — центр
    FDS:             'M 150 252 Q 150 300 154 364 Q 162 376 174 370 Q 174 322 176 256 Q 162 248 150 252 Z',
    // FDP — глубже, чуть правее
    FDP:             'M 180 254 Q 178 300 184 366 Q 192 378 204 372 Q 204 324 206 258 Q 192 250 180 254 Z',
    // ECR — ulnar side (right, толще)
    ECR:             'M 210 250 Q 210 296 214 362 Q 222 372 230 366 Q 232 318 232 252 Q 222 244 210 250 Z',
    // Palm muscles
    lumbricals:        'M 118 158 Q 114 178 120 196 Q 130 206 156 206 Q 188 206 200 196 Q 206 178 200 158 Q 188 152 156 152 Q 130 152 118 158 Z',
    adductor_pollicis: 'M 70 200 Q 56 210 56 226 Q 58 240 76 238 Q 92 236 100 222 L 102 200 Q 88 192 70 200 Z',
  });

  // Hand silhouette — заполненная фигура (skin tone) + тонкий контур.
  function staticHandOutline() {
    return [
      R.createElement('path', {
        key: 'hand-fill',
        d: HAND_SILHOUETTE_D,
        fill: 'url(#skinGradient)',
        stroke: 'var(--fingers-text, #1a1a1f)',
        strokeWidth: 1.2,
        strokeOpacity: 0.45,
        strokeLinejoin: 'round',
        filter: 'url(#handShadow)',
      }),
      // Запястье (тонкая горизонтальная линия-сгиб)
      R.createElement('line', {
        key: 'wrist-crease',
        x1: 108, y1: 222, x2: 218, y2: 222,
        stroke: 'var(--fingers-text, #1a1a1f)',
        strokeWidth: 0.6, strokeOpacity: 0.25, strokeLinecap: 'round',
      }),
      // Складки на ладони (palm creases) — едва видимые
      R.createElement('path', {
        key: 'crease-1', d: 'M 112 152 Q 160 142 218 156',
        fill: 'none', stroke: 'var(--fingers-text, #1a1a1f)',
        strokeWidth: 0.6, strokeOpacity: 0.18, strokeLinecap: 'round',
      }),
      R.createElement('path', {
        key: 'crease-2', d: 'M 108 180 Q 150 168 200 178',
        fill: 'none', stroke: 'var(--fingers-text, #1a1a1f)',
        strokeWidth: 0.6, strokeOpacity: 0.18, strokeLinecap: 'round',
      }),
      // Knuckle dots (PIP/DIP суставы) — субтильные референсы
      ...[
        [112, 80], [112, 105],  // index
        [146, 65], [146, 95],   // middle
        [180, 72], [180, 100],  // ring
        [212, 96], [212, 114],  // pinky
      ].map(([cx, cy], i) => R.createElement('circle', {
        key: 'joint-' + i, cx, cy, r: 1.2,
        fill: 'var(--fingers-text, #1a1a1f)', fillOpacity: 0.18,
      })),
    ];
  }

  // Render muscle shape — два режима: inactive (тонкий контур-намёк) и
  // active (заливка accent gradient + glow filter + лейбл).
  function muscleShape(d, id, isHighlighted, onClick) {
    if (isHighlighted) {
      return R.createElement('path', {
        key: 'muscle-' + id,
        d,
        fill: 'url(#muscleActiveGradient)',
        fillOpacity: 0.85,
        stroke: 'var(--fingers-accent, #0066ff)',
        strokeWidth: 1.4,
        strokeOpacity: 0.9,
        filter: 'url(#muscleGlow)',
        'data-muscle-id': id,
        style: onClick ? { pointerEvents: 'none' } : undefined,
      });
    }
    return R.createElement('path', {
      key: 'muscle-' + id,
      d,
      fill: 'transparent',
      stroke: 'var(--fingers-text, #1a1a1f)',
      strokeWidth: 0.6,
      strokeOpacity: 0.18,
      strokeDasharray: '2 3',
      'data-muscle-id': id,
      style: onClick ? { pointerEvents: 'none' } : undefined,
    });
  }

  // Pulleys (A2/A4) — показывать опционально (новые координаты пальцев)
  function pulleyMarkers() {
    const stroke = 'var(--fingers-accent, #0066ff)';
    const markers = [];
    // 4 пальца: index x≈112, middle x≈146, ring x≈180, pinky x≈212
    [[112, 56], [146, 40], [180, 50], [212, 72]].forEach(([x, topY], i) => {
      const pipY = topY + (124 - topY) * 0.5;
      const dipY = topY + (124 - topY) * 0.8;
      markers.push(R.createElement('rect', {
        key: 'a2-' + i, x: x - 6, y: pipY - 2, width: 12, height: 3, rx: 1.5,
        fill: stroke, fillOpacity: 0.85,
      }));
      markers.push(R.createElement('rect', {
        key: 'a4-' + i, x: x - 5, y: dipY - 1.5, width: 10, height: 2, rx: 1,
        fill: stroke, fillOpacity: 0.6,
      }));
    });
    return markers;
  }

  // ===== ОСНОВНОЙ КОМПОНЕНТ =====
  Fingers.AnatomyDiagram = function AnatomyDiagram(props) {
    if (!R) return null;
    const p = props || {};
    const size = typeof p.size === 'number' ? p.size : 240;
    const highlights = Array.isArray(p.highlightMuscles) ? p.highlightMuscles : [];
    const showPulleys = !!p.showPulleys;
    const onMuscleClick = typeof p.onMuscleClick === 'function' ? p.onMuscleClick : null;

    const highlightSet = new Set(highlights);

    // Сборка мышц
    const muscleEls = MUSCLE_IDS.map((mid) => {
      const d = MUSCLE_PATHS[mid];
      if (!d) return null;
      return muscleShape(d, mid, highlightSet.has(mid), onMuscleClick);
    }).filter(Boolean);

    // <defs>: gradients + filters для premium-эффекта.
    // skinGradient — мягкая «кожа» (нейтральный беж/серый); подстраивается под
    // тёмную тему через CSS var с дефолтом.
    const defs = R.createElement('defs', { key: 'defs' },
      R.createElement('linearGradient', { id: 'skinGradient', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
        R.createElement('stop', { offset: '0%', stopColor: 'var(--fingers-skin-1, #f5efe7)' }),
        R.createElement('stop', { offset: '100%', stopColor: 'var(--fingers-skin-2, #e6dccf)' }),
      ),
      R.createElement('radialGradient', { id: 'muscleActiveGradient', cx: '50%', cy: '50%', r: '60%' },
        R.createElement('stop', { offset: '0%', stopColor: 'var(--fingers-accent, #0066ff)', stopOpacity: '0.55' }),
        R.createElement('stop', { offset: '100%', stopColor: 'var(--fingers-accent, #0066ff)', stopOpacity: '0.18' }),
      ),
      R.createElement('filter', { id: 'muscleGlow', x: '-30%', y: '-30%', width: '160%', height: '160%' },
        R.createElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '3', result: 'blur' }),
        R.createElement('feMerge', null,
          R.createElement('feMergeNode', { in: 'blur' }),
          R.createElement('feMergeNode', { in: 'SourceGraphic' }),
        ),
      ),
      R.createElement('filter', { id: 'handShadow', x: '-10%', y: '-10%', width: '120%', height: '120%' },
        R.createElement('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '4' }),
        R.createElement('feOffset', { dx: '0', dy: '2', result: 'offsetblur' }),
        R.createElement('feComponentTransfer', null,
          R.createElement('feFuncA', { type: 'linear', slope: '0.18' }),
        ),
        R.createElement('feMerge', null,
          R.createElement('feMergeNode', null),
          R.createElement('feMergeNode', { in: 'SourceGraphic' }),
        ),
      ),
    );

    const svgChildren = [defs];
    // 1) Контур + заливка кисти (skin tone)
    svgChildren.push(...staticHandOutline());
    // 2) Мышцы — поверх кожи (активная видна, остальные dashed-намёк)
    svgChildren.push(...muscleEls);
    // 3) Pulleys (опционально, сверху всего)
    if (showPulleys) svgChildren.push(...pulleyMarkers());

    const svgEl = R.createElement('svg', {
      width: size,
      height: Math.round(size * 400 / 280),
      viewBox: '0 0 280 400',
      role: 'img',
      'aria-label': 'Анатомия предплечья и кисти. Подсвечены: ' + (highlights.length ? highlights.join(', ') : 'нет'),
      className: 'fingers-fs-anatomy-svg',
      style: { display: 'block', maxWidth: '100%' },
    }, ...svgChildren);

    // Если есть обработчик — рендерим overlay-кнопки для каждой мышцы (accessible).
    if (!onMuscleClick) {
      return R.createElement('div', { className: 'fingers-fs-anatomy-wrap', style: { position: 'relative', display: 'inline-block' } }, svgEl);
    }

    // Overlay-buttons: positioned absolute поверх SVG-областей.
    // Координаты (cx,cy в SVG-системе 280×400) → перевод в % контейнера.
    const HOTSPOTS = {
      brachioradialis:  { cx: 106, cy: 310 },
      FCR:              { cx: 134, cy: 310 },
      FDS:              { cx: 164, cy: 314 },
      FDP:              { cx: 194, cy: 314 },
      ECR:              { cx: 222, cy: 308 },
      lumbricals:       { cx: 160, cy: 180 },
      adductor_pollicis:{ cx: 78,  cy: 220 },
    };

    const buttons = MUSCLE_IDS.map((mid) => {
      const info = MUSCLE_INFO[mid];
      const hs = HOTSPOTS[mid];
      if (!hs || !info) return null;
      const leftPct = (hs.cx / 280) * 100;
      const topPct  = (hs.cy / 400) * 100;
      return R.createElement('button', {
        key: 'btn-' + mid,
        type: 'button',
        className: 'fingers-fs-anatomy-hotspot' + (highlightSet.has(mid) ? ' is-active' : ''),
        'aria-label': info.latin + ' — ' + info.name + '. ' + info.function,
        onClick: function () { onMuscleClick(mid); },
        style: {
          position: 'absolute',
          left: leftPct + '%',
          top: topPct + '%',
          transform: 'translate(-50%, -50%)',
          width: '32px',
          height: '32px',
          minHeight: '44px',
          minWidth: '44px',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        },
      });
    }).filter(Boolean);

    return R.createElement(
      'div',
      { className: 'fingers-fs-anatomy-wrap', style: { position: 'relative', display: 'inline-block', width: size } },
      svgEl,
      ...buttons,
    );
  };

})(typeof window !== 'undefined' ? window : globalThis);
