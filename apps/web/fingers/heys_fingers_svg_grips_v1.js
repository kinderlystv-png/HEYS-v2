// heys_fingers_svg_grips_v1.js — Wave 2-B (visual).
// HEYS.Fingers.GripIcon({ gripId, size, variant, theme }) — иконка хвата руки.
//
// Public API:
//   HEYS.Fingers.GripIcon(props)
//     props.gripId  : 'openhand4' | 'halfcrimp' | 'fullcrimp'
//                    | 'front3' | 'back3' | 'mono' | 'pinch' | 'sloper'
//     props.size    : px (default 80)
//     props.variant : 'photo' (default) — фотореалистичный <img> из /exercises/<gripId>.webp
//                    'svg'             — line-art inline SVG (legacy fallback)
//     props.theme   : 'A' | 'B' | 'C' (svg-only hint)
//     props.label   : bool — подпись угла сустава (svg-only)
//
// React.createElement (no JSX — legacy IIFE bundle).
// SVG: viewBox 0 0 100 100, line-art (stroke=currentColor).
// Photo: 384×440 webp, object-fit: cover, скруглённые углы.
// Идемпотентность: Fingers.GripIcon__registered.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.GripIcon__registered) return;
  Fingers.GripIcon__registered = true;

  const R = (typeof global.React !== 'undefined' && global.React) || null;
  if (!R) {
    // dev-time warning; runtime will surface if GripIcon called before React loaded.
    try { console.warn('[Fingers.GripIcon] React not yet loaded — component unavailable until boot.'); } catch (_) {}
  }

  // Утилита: ===== создать <path d="..." /> с дефолтными стилями =====
  function path(d, extraProps) {
    return R.createElement('path', Object.assign({ d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }, extraProps || {}));
  }
  function circle(cx, cy, r, extraProps) {
    return R.createElement('circle', Object.assign({ cx, cy, r, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }, extraProps || {}));
  }
  function rect(x, y, w, h, extraProps) {
    return R.createElement('rect', Object.assign({ x, y, width: w, height: h, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, rx: 2 }, extraProps || {}));
  }
  function line(x1, y1, x2, y2, extraProps) {
    return R.createElement('line', Object.assign({ x1, y1, x2, y2, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }, extraProps || {}));
  }
  function text(x, y, content, extraProps) {
    return R.createElement('text', Object.assign({ x, y, fill: 'currentColor', fontSize: 7, fontFamily: 'system-ui, sans-serif', textAnchor: 'middle' }, extraProps || {}), content);
  }
  // Подсветка hold (зацепка) — заливка accent-цветом
  function hold(x, y, w, h, extraProps) {
    return R.createElement('rect', Object.assign({ x, y, width: w, height: h, fill: 'var(--fingers-accent, #0066ff)', opacity: 0.18, stroke: 'var(--fingers-accent, #0066ff)', strokeWidth: 1, rx: 1 }, extraProps || {}));
  }

  // ===== 8 ICON BUILDERS =====
  // Все используют один viewBox; ладонь схематично, sketch-style.

  function buildOpenhand4(showLabel) {
    // Open hand (full extension) — пальцы выпрямлены, DIP/PIP slightly extended на широкой кромке (jug).
    const els = [];
    // ладонь (palm)
    els.push(path('M30 70 L30 50 Q30 45 35 45 L65 45 Q70 45 70 50 L70 70 Z'));
    // 4 finger (index/middle/ring/pinky) — выпрямленные
    els.push(line(37, 45, 37, 18)); // index
    els.push(line(46, 45, 46, 14)); // middle (самый длинный)
    els.push(line(55, 45, 55, 16)); // ring
    els.push(line(64, 45, 64, 22)); // pinky
    // DIP / PIP / MCP суставы — точки
    [37, 46, 55, 64].forEach((x, i) => {
      const lengths = [27, 31, 29, 23];
      const top = 45 - lengths[i];
      els.push(circle(x, 45, 1.3, { fill: 'currentColor' })); // MCP
      els.push(circle(x, 45 - lengths[i] * 0.45, 1.3, { fill: 'currentColor' })); // PIP
      els.push(circle(x, 45 - lengths[i] * 0.75, 1.3, { fill: 'currentColor' })); // DIP
      els.push(circle(x, top - 1.5, 1.2, { fill: 'currentColor' })); // tip
    });
    // большой палец (thumb) сбоку, расслаблен
    els.push(path('M30 55 Q22 55 22 47 Q22 42 28 40'));
    // hold (jug) — сверху, широкий
    els.push(hold(28, 8, 44, 8));
    if (showLabel) els.push(text(50, 95, 'open hand'));
    return els;
  }

  function buildHalfcrimp(showLabel) {
    // Half crimp: PIP flexion 90°, DIP neutral. Пальцы зажаты на узкой кромке.
    const els = [];
    // ладонь
    els.push(path('M30 70 L30 52 Q30 47 35 47 L65 47 Q70 47 70 52 L70 70 Z'));
    // 4 finger в half crimp — bend на PIP, прямые после
    // index/middle/ring/pinky: вертикально вниз от MCP → 90° сгиб → горизонтально к hold
    [37, 46, 55, 64].forEach((x) => {
      // MCP → PIP (вертикально вверх ~12px)
      els.push(line(x, 47, x, 30));
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' })); // MCP
      els.push(circle(x, 30, 1.5, { fill: 'currentColor' })); // PIP — выделенный (90° сгиб)
      // PIP → DIP (горизонтально к hold)
      els.push(line(x, 30, x + 6, 30));
      els.push(circle(x + 6, 30, 1.3, { fill: 'currentColor' })); // DIP
      els.push(line(x + 6, 30, x + 9, 30)); // tip — finger pad на грани
    });
    // thumb — расслаблен сбоку
    els.push(path('M30 55 Q22 55 22 47 Q22 42 28 40'));
    // hold (edge ~10mm) — узкий
    els.push(hold(65, 27, 12, 5));
    if (showLabel) els.push(text(50, 95, 'half crimp  PIP 90°'));
    return els;
  }

  function buildFullcrimp(showLabel) {
    // Full crimp: PIP 90° + DIP hyperextension + thumb over index nail.
    const els = [];
    els.push(path('M30 70 L30 52 Q30 47 35 47 L65 47 Q70 47 70 52 L70 70 Z'));
    [37, 46, 55, 64].forEach((x) => {
      els.push(line(x, 47, x, 32)); // MCP → PIP
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' }));
      els.push(circle(x, 32, 1.8, { fill: 'var(--fingers-accent, #0066ff)' })); // PIP сильно flexed
      // PIP → DIP — горизонталь, потом DIP hyperextended (наклон вверх обратно)
      els.push(line(x, 32, x + 5, 32));
      els.push(circle(x + 5, 32, 1.3, { fill: 'currentColor' })); // DIP
      // DIP hyperextended — кончик слегка вверх
      els.push(line(x + 5, 32, x + 9, 29.5));
    });
    // thumb over index (closed grip, thumb wraps over index fingernail)
    els.push(path('M30 50 Q22 50 22 42 Q24 36 32 35 L40 32 Q44 31 45 33 Q44 35 41 35 L37 36'));
    // hold (narrow edge)
    els.push(hold(65, 29, 12, 5));
    // подпись «полное закрытие, ↑ риск A2»
    if (showLabel) els.push(text(50, 95, 'full crimp  31× A2'));
    return els;
  }

  function buildFront3(showLabel) {
    // Front-3: index/middle/ring на грани. Pinky подогнут.
    const els = [];
    els.push(path('M30 70 L30 52 Q30 47 35 47 L65 47 Q70 47 70 52 L70 70 Z'));
    // index/middle/ring — half crimp
    [37, 46, 55].forEach((x) => {
      els.push(line(x, 47, x, 30));
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' }));
      els.push(circle(x, 30, 1.5, { fill: 'currentColor' }));
      els.push(line(x, 30, x + 6, 30));
      els.push(circle(x + 6, 30, 1.3, { fill: 'currentColor' }));
    });
    // pinky — подогнут (curled), не на hold
    els.push(path('M64 47 Q64 38 60 36 Q56 35 56 40 Q56 44 60 46'));
    els.push(circle(64, 47, 1.3, { fill: 'currentColor' }));
    // thumb — расслаблен сбоку
    els.push(path('M30 55 Q22 55 22 47 Q22 42 28 40'));
    // hold — только под index/middle/ring
    els.push(hold(36, 27, 25, 5));
    if (showLabel) els.push(text(50, 95, 'front 3 (i+m+r)'));
    return els;
  }

  function buildBack3(showLabel) {
    // Back-3: middle/ring/pinky на грани. Index подогнут.
    const els = [];
    els.push(path('M30 70 L30 52 Q30 47 35 47 L65 47 Q70 47 70 52 L70 70 Z'));
    // index — curled
    els.push(path('M37 47 Q37 38 41 36 Q45 35 45 40 Q45 44 41 46'));
    els.push(circle(37, 47, 1.3, { fill: 'currentColor' }));
    // middle/ring/pinky — half crimp
    [46, 55, 64].forEach((x) => {
      els.push(line(x, 47, x, 30));
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' }));
      els.push(circle(x, 30, 1.5, { fill: 'currentColor' }));
      els.push(line(x, 30, x + 6, 30));
      els.push(circle(x + 6, 30, 1.3, { fill: 'currentColor' }));
    });
    els.push(path('M30 55 Q22 55 22 47 Q22 42 28 40')); // thumb
    els.push(hold(45, 27, 25, 5));
    if (showLabel) els.push(text(50, 95, 'back 3 (m+r+p)'));
    return els;
  }

  function buildMono(showLabel) {
    // Mono pocket: только middle finger в pocket. Остальные подогнуты.
    const els = [];
    els.push(path('M30 70 L30 52 Q30 47 35 47 L65 47 Q70 47 70 52 L70 70 Z'));
    // index curled
    els.push(path('M37 47 Q37 38 41 36 Q45 35 45 40 Q45 44 41 46'));
    els.push(circle(37, 47, 1.3, { fill: 'currentColor' }));
    // middle — straight в pocket
    els.push(line(46, 47, 46, 22));
    els.push(circle(46, 47, 1.3, { fill: 'currentColor' }));
    els.push(circle(46, 35, 1.3, { fill: 'currentColor' }));
    els.push(circle(46, 26, 1.3, { fill: 'currentColor' }));
    // ring + pinky curled
    [55, 64].forEach((x) => {
      els.push(path('M' + x + ' 47 Q' + x + ' 38 ' + (x - 4) + ' 36 Q' + (x - 8) + ' 35 ' + (x - 8) + ' 40 Q' + (x - 8) + ' 44 ' + (x - 4) + ' 46'));
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' }));
    });
    els.push(path('M30 55 Q22 55 22 47 Q22 42 28 40')); // thumb
    // pocket — круглое отверстие
    els.push(circle(46, 17, 6, { fill: 'var(--fingers-accent, #0066ff)', fillOpacity: 0.18, stroke: 'var(--fingers-accent, #0066ff)', strokeWidth: 1 }));
    if (showLabel) els.push(text(50, 95, 'mono pocket  ⚠ A2'));
    return els;
  }

  function buildPinch(showLabel) {
    // Pinch: большой и указательный (+ остальные) схватывают block с двух сторон.
    const els = [];
    // pinch block в центре сверху (вертикальный)
    els.push(hold(45, 14, 10, 30));
    // ладонь снизу
    els.push(path('M30 78 L30 60 Q30 55 35 55 L65 55 Q70 55 70 60 L70 78 Z'));
    // 4 finger — обхватывают block справа (вертикально по нему)
    [38, 45, 52, 59].forEach((x) => {
      // от MCP вверх и слегка внутрь к блоку
      els.push(path('M' + x + ' 55 L' + (x + 1) + ' 44 Q' + (x + 1) + ' 40 ' + (x + 3) + ' 39 L' + 56 + ' 38'));
      els.push(circle(x, 55, 1.3, { fill: 'currentColor' }));
    });
    // thumb — обхватывает блок слева, согнут
    els.push(path('M35 60 Q26 60 26 50 Q26 42 34 40 L44 38'));
    els.push(circle(35, 60, 1.3, { fill: 'currentColor' })); // CMC
    els.push(circle(34, 40, 1.3, { fill: 'currentColor' })); // IP thumb
    if (showLabel) els.push(text(50, 95, 'pinch (thumb-side)'));
    return els;
  }

  function buildSloper(showLabel) {
    // Sloper: open palm на округлой поверхности. Friction-dependent.
    const els = [];
    // sloper — большая округлая дуга сверху
    els.push(path('M15 24 Q50 4 85 24', { strokeWidth: 2, opacity: 0.4 }));
    els.push(R.createElement('path', { d: 'M15 24 Q50 4 85 24 L85 36 Q50 16 15 36 Z', fill: 'var(--fingers-accent, #0066ff)', opacity: 0.12, stroke: 'none' }));
    // ладонь — широко раскрытая, контактирует с поверхностью
    els.push(path('M28 70 L28 52 Q28 47 33 47 L67 47 Q72 47 72 52 L72 70 Z'));
    // 4 finger выпрямлены, контактируют по дуге
    [35, 45, 55, 65].forEach((x, i) => {
      const targets = [{ x: 30, y: 31 }, { x: 44, y: 22 }, { x: 56, y: 22 }, { x: 70, y: 31 }];
      const t = targets[i];
      els.push(path('M' + x + ' 47 Q' + x + ' 38 ' + t.x + ' ' + t.y));
      els.push(circle(x, 47, 1.3, { fill: 'currentColor' }));
      els.push(circle(t.x, t.y, 1.5, { fill: 'currentColor' }));
    });
    // thumb — раскрыт в сторону
    els.push(path('M28 55 Q18 53 16 45 Q15 38 22 35'));
    if (showLabel) els.push(text(50, 95, 'sloper (open palm)'));
    return els;
  }

  const BUILDERS = {
    openhand4: buildOpenhand4,
    halfcrimp: buildHalfcrimp,
    fullcrimp: buildFullcrimp,
    front3:    buildFront3,
    back3:     buildBack3,
    mono:      buildMono,
    pinch:     buildPinch,
    sloper:    buildSloper,
  };

  const LABELS = {
    openhand4: 'Open hand 4 (jug)',
    halfcrimp: 'Half crimp',
    fullcrimp: 'Full crimp',
    front3:    'Front 3 (i+m+r)',
    back3:     'Back 3 (m+r+p)',
    mono:      'Mono pocket',
    pinch:     'Pinch',
    sloper:    'Sloper',
  };

  Fingers.GRIP_IDS = Object.freeze(Object.keys(BUILDERS));
  Fingers.GRIP_LABELS = Object.freeze(LABELS);

  // ===== ПУБЛИЧНЫЙ КОМПОНЕНТ =====
  Fingers.GripIcon = function GripIcon(props) {
    if (!R) return null;
    const p = props || {};
    const gid = p.gripId || 'halfcrimp';
    const tier = p.equipmentTier || null;
    const size = typeof p.size === 'number' ? p.size : 80;
    const variant = p.variant || 'photo';
    const showLabel = !!p.label;
    const builder = BUILDERS[gid];

    // Tier-aware src: для block/door есть отдельные фото с реальным оборудованием.
    // Если файла нет — onError ниже откатывается на базовый.
    const baseSrc = '/exercises/' + gid + '.webp';
    const tieredSrc = (tier && tier !== 'full' && tier !== 'none')
      ? '/exercises/' + gid + '_' + tier + '.webp'
      : baseSrc;

    if (variant === 'photo' && builder) {
      return R.createElement('img', {
        src: tieredSrc,
        'data-fallback-tried': tieredSrc === baseSrc ? 'true' : 'false',
        width: size,
        height: size,
        alt: 'Хват: ' + (LABELS[gid] || gid),
        className: 'fingers-fs-grip-icon fingers-fs-grip-icon--' + gid + ' fingers-fs-grip-icon--photo',
        loading: 'lazy',
        decoding: 'async',
        style: {
          display: 'inline-block',
          objectFit: 'cover',
          borderRadius: Math.max(4, Math.round(size * 0.12)),
          verticalAlign: 'middle',
        },
        onError: function (e) {
          try {
            const el = e.target;
            if (el.getAttribute('data-fallback-tried') !== 'true' && baseSrc !== tieredSrc) {
              el.setAttribute('data-fallback-tried', 'true');
              el.src = baseSrc;
              return;
            }
            el.style.visibility = 'hidden';
          } catch (_) {}
        },
      });
    }

    if (!builder) {
      // unknown grip — рисуем "?" placeholder
      return R.createElement('svg', { width: size, height: size, viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Unknown grip: ' + gid },
        R.createElement('text', { x: 50, y: 55, fill: 'currentColor', fontSize: 30, textAnchor: 'middle' }, '?'),
      );
    }
    const children = builder(showLabel);
    return R.createElement('svg', {
      width: size,
      height: size,
      viewBox: '0 0 100 100',
      role: 'img',
      'aria-label': 'Хват: ' + (LABELS[gid] || gid),
      className: 'fingers-fs-grip-icon fingers-fs-grip-icon--' + gid,
      style: { color: 'var(--fingers-text, #1a1a1f)', display: 'inline-block' },
    }, ...children);
  };

  // Получить SVG-маркер всех 8 для grid-picker (вспомогательная функция)
  Fingers.getAllGripIds = function getAllGripIds() { return Fingers.GRIP_IDS.slice(); };

})(typeof window !== 'undefined' ? window : globalThis);
