// heys_dark_theme_interceptor.js — Auto-transform inline colors for dark theme
// Patches React.createElement to wrap hardcoded colors in var(--token, fallback)
// Light mode: var undefined → fallback (original). Dark mode: var defined → dark value.
// UI v4 stage 2: on sand/blue palettes neutral literals map to var(--v4-*, #fallback);
// classic palette keeps legacy --muted/--border/--text so appearance stays pixel-identical.
// v1.1.0 | 2026-08-10
(function () {
  'use strict';

  if (!window.React || !window.React.createElement) {
    console.warn('[DarkInterceptor] React not found, skipping');
    return;
  }

  const _origCE = React.createElement;

  // ═══════════════════════════════════════════
  // COLOR MAPS (context-aware by property type)
  // ═══════════════════════════════════════════

  // Background / backgroundColor
  const BG = new Map([
    ['#fff', 'var(--card, #fff)'],
    ['#ffffff', 'var(--card, #ffffff)'],
    ['white', 'var(--card, white)'],
    // Neutral grays
    ['#f3f4f6', 'var(--bg-secondary, #f3f4f6)'],
    ['#f8fafc', 'var(--bg-secondary, #f8fafc)'],
    ['#f1f5f9', 'var(--bg-secondary, #f1f5f9)'],
    ['#f9fafb', 'var(--bg-secondary, #f9fafb)'],
    ['#e5e7eb', 'var(--bg-secondary, #e5e7eb)'],
    ['#e2e8f0', 'var(--bg-secondary, #e2e8f0)'],
    // Green tints
    ['#ecfdf5', 'var(--bg-success-subtle, #ecfdf5)'],
    ['#f0fdf4', 'var(--bg-success-subtle, #f0fdf4)'],
    ['#dcfce7', 'var(--bg-success-subtle, #dcfce7)'],
    // Yellow/amber tints
    ['#fef3c7', 'var(--bg-warning-subtle, #fef3c7)'],
    ['#fef9c3', 'var(--bg-warning-subtle, #fef9c3)'],
    ['#fefce8', 'var(--bg-warning-subtle, #fefce8)'],
    // Red tints
    ['#fee2e2', 'var(--bg-danger-subtle, #fee2e2)'],
    ['#fef2f2', 'var(--bg-danger-subtle, #fef2f2)'],
    // Blue tints
    ['#dbeafe', 'var(--bg-info-subtle, #dbeafe)'],
    ['#eff6ff', 'var(--bg-info-subtle, #eff6ff)'],
    ['#eef2ff', 'var(--bg-info-subtle, #eef2ff)'],
    // Pink tints
    ['#fce7f3', 'var(--bg-pink-subtle, #fce7f3)'],
    ['#fdf2f8', 'var(--bg-pink-subtle, #fdf2f8)'],
  ]);

  // color (text)
  const TEXT = new Map([
    // Dark text (invisible on dark bg)
    ['#1e293b', 'var(--text, #1e293b)'],
    ['#1f2937', 'var(--text, #1f2937)'],
    ['#374151', 'var(--text, #374151)'],
    ['#111827', 'var(--text, #111827)'],
    ['#0f172a', 'var(--text, #0f172a)'],
    // Medium gray (poor contrast on dark bg)
    ['#64748b', 'var(--muted, #64748b)'],
    ['#6b7280', 'var(--muted, #6b7280)'],
    ['#4b5563', 'var(--muted, #4b5563)'],
    ['#475569', 'var(--muted, #475569)'],
    ['#9ca3af', 'var(--muted, #9ca3af)'],
  ]);

  // borderColor
  const BORDER = new Map([
    ['#e2e8f0', 'var(--border, #e2e8f0)'],
    ['#e5e7eb', 'var(--border, #e5e7eb)'],
    ['#d1d5db', 'var(--border, #d1d5db)'],
    ['#cbd5e1', 'var(--border, #cbd5e1)'],
  ]);

  // UI v4 stage 2 — sand/blue palettes only (classic keeps legacy maps above)
  const V4_BG = new Map([
    ['#fff', 'var(--v4-bg, #fff)'],
    ['#ffffff', 'var(--v4-bg, #ffffff)'],
    ['white', 'var(--v4-bg, white)'],
    ['#f8fafc', 'var(--v4-hero, #f8fafc)'],
    ['#f1f5f9', 'var(--v4-surface, #f1f5f9)'],
    ['#f3f4f6', 'var(--v4-surface, #f3f4f6)'],
    ['#f9fafb', 'var(--v4-surface, #f9fafb)'],
    ['#e5e7eb', 'var(--v4-line, #e5e7eb)'],
    ['#e2e8f0', 'var(--v4-line, #e2e8f0)'],
  ]);

  const V4_TEXT = new Map([
    ['#0f172a', 'var(--v4-ink, #0f172a)'],
    ['#1f2937', 'var(--v4-ink, #1f2937)'],
    ['#111827', 'var(--v4-ink, #111827)'],
    ['#1e293b', 'var(--v4-ink, #1e293b)'],
    ['#374151', 'var(--v4-ink, #374151)'],
    ['#64748b', 'var(--v4-ink-2, #64748b)'],
    ['#94a3b8', 'var(--v4-ink-3, #94a3b8)'],
    ['#475569', 'var(--v4-ink-2, #475569)'],
    ['#334155', 'var(--v4-ink-2, #334155)'],
    ['#6b7280', 'var(--v4-ink-2, #6b7280)'],
    ['#9ca3af', 'var(--v4-ink-3, #9ca3af)'],
    ['#71717a', 'var(--v4-ink-3, #71717a)'],
    ['#cbd5e1', 'var(--v4-ink-3, #cbd5e1)'],
  ]);

  const V4_BORDER = new Map([
    ['#e2e8f0', 'var(--v4-line, #e2e8f0)'],
    ['#e5e7eb', 'var(--v4-line, #e5e7eb)'],
    ['#d1d5db', 'var(--v4-line, #d1d5db)'],
    ['#cbd5e1', 'var(--v4-line, #cbd5e1)'],
  ]);

  // ═══════════════════════════════════════════
  // PROPERTY SETS
  // ═══════════════════════════════════════════

  const BG_PROPS = new Set(['background', 'backgroundColor']);
  const TEXT_PROPS = new Set(['color']);
  const BORDER_PROPS = new Set([
    'borderColor', 'borderTopColor', 'borderBottomColor',
    'borderLeftColor', 'borderRightColor', 'outlineColor'
  ]);
  // Compound props that might contain a color value
  const COMPOUND_BORDER_PROPS = new Set([
    'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight'
  ]);

  // Pre-built regex for compound border replacement (sorted longest-first)
  const BORDER_REGEX = /#e5e7eb|#e2e8f0|#d1d5db|#cbd5e1/gi;

  function usesV4PaletteRoles() {
    try {
      var palette = document.documentElement.getAttribute('data-palette');
      return palette === 'sand' || palette === 'blue';
    } catch (_err) {
      return false;
    }
  }

  function mergeColorMaps(primary, fallback) {
    var merged = new Map(fallback);
    primary.forEach(function (value, key) {
      merged.set(key, value);
    });
    return merged;
  }

  function getColorMaps() {
    if (!usesV4PaletteRoles()) {
      return { bg: BG, text: TEXT, border: BORDER, borderRegex: BORDER_REGEX };
    }
    return {
      bg: mergeColorMaps(V4_BG, BG),
      text: mergeColorMaps(V4_TEXT, TEXT),
      border: V4_BORDER,
      borderRegex: BORDER_REGEX,
    };
  }

  // ═══════════════════════════════════════════
  // TRANSFORM ENGINE
  // ═══════════════════════════════════════════

  function transformStyle(style) {
    if (!style || typeof style !== 'object') return style;

    var maps = getColorMaps();
    var bgMap = maps.bg;
    var textMap = maps.text;
    var borderMap = maps.border;
    var borderRegex = maps.borderRegex;

    var changed = false;
    var result = null;

    for (var key in style) {
      var val = style[key];
      if (typeof val !== 'string' || val.length < 3) continue;
      // Skip already-wrapped values
      if (val.charCodeAt(0) === 118 && val.charCodeAt(1) === 97 && val.charCodeAt(2) === 114) continue; // 'var'

      var mapped = undefined;
      var lower = val.toLowerCase();

      if (BG_PROPS.has(key)) {
        // Skip gradients and complex values
        if (lower.indexOf('gradient') === -1 && lower.indexOf('url(') === -1) {
          mapped = bgMap.get(lower);
        }
      } else if (TEXT_PROPS.has(key)) {
        mapped = textMap.get(lower);
      } else if (BORDER_PROPS.has(key)) {
        mapped = borderMap.get(lower);
      } else if (COMPOUND_BORDER_PROPS.has(key)) {
        // Handle compound: '1px solid #e5e7eb' → '1px solid var(--border, #e5e7eb)'
        if (lower.indexOf('#') !== -1) {
          var replaced = val.replace(borderRegex, function (m) {
            return borderMap.get(m.toLowerCase()) || m;
          });
          if (replaced !== val) mapped = replaced;
        }
      }

      if (mapped !== undefined) {
        if (!changed) {
          result = {};
          for (var k in style) result[k] = style[k];
          changed = true;
        }
        result[key] = mapped;
      }
    }

    return changed ? result : style;
  }

  // ═══════════════════════════════════════════
  // PATCH React.createElement
  // ═══════════════════════════════════════════

  function patchedCreateElement(type, props) {
    if (props !== null && props !== undefined && props.style) {
      var newStyle = transformStyle(props.style);
      if (newStyle !== props.style) {
        // Clone props + replace style, pass all children through
        var newProps = {};
        for (var k in props) newProps[k] = props[k];
        newProps.style = newStyle;
        var args = [type, newProps];
        for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
        return _origCE.apply(null, args);
      }
    }
    return _origCE.apply(null, arguments);
  }

  // Module namespace objects (from bundlers) have getter-only props.
  // Try direct assignment first; if frozen, replace window.React entirely.
  try {
    React.createElement = patchedCreateElement;
  } catch (_directErr) {
    // React is a frozen/sealed module namespace — rebuild window.React
    var newReact = {};
    // Copy all enumerable own properties
    var keys = Object.getOwnPropertyNames(React);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === 'createElement') continue;
      try { newReact[key] = React[key]; } catch (_) { }
    }
    newReact.createElement = patchedCreateElement;
    // Also copy Symbol keys (e.g. Symbol.toStringTag)
    if (typeof Object.getOwnPropertySymbols === 'function') {
      var syms = Object.getOwnPropertySymbols(React);
      for (var s = 0; s < syms.length; s++) {
        try { newReact[syms[s]] = React[syms[s]]; } catch (_) { }
      }
    }
    window.React = newReact;
  }

  // Preserve any static properties on createElement
  try {
    Object.keys(_origCE).forEach(function (k) {
      patchedCreateElement[k] = _origCE[k];
    });
  } catch (_) { }

  console.info('[DarkInterceptor] Patched React.createElement — legacy %d/%d/%d, v4 %d/%d/%d mappings',
    BG.size, TEXT.size, BORDER.size, V4_BG.size, V4_TEXT.size, V4_BORDER.size);
})();
