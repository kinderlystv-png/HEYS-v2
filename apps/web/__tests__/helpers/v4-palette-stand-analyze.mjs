/**
 * Анализ замеров стенда: читаемость, залипание светлого на тёмном, пропавший контур.
 */
import { normColor, SETS } from './v4-palette-stand.mjs';

const SAND_LIGHT_HEX = new Set([
  '#f7efe2', '#efe3cf', '#fffaf1', '#f6e6dd', '#f3e0d2', '#201e1d', '#8a4a20', '#c67139',
]);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fgHex, bgHex) {
  if (!fgHex || !bgHex) return null;
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isDarkSet(setId) {
  return setId.endsWith('-dark');
}

function lightPairFor(setId) {
  if (setId === 'sand-dark') return 'sand';
  if (setId === 'blue-dark') return 'blue';
  return null;
}

/**
 * @param {{ zone: string, result: import('./v4-palette-stand.mjs').measureZone extends Function ? Awaited<ReturnType<import('./v4-palette-stand.mjs').measureZone>> : never, contourKeys?: string[] }} opts
 * @returns {{ zone: string, set: string, issue: string, key: string }[]}
 */
export function analyzeStand({ zone, result, contourKeys = [] }) {
  const findings = [];
  const keys = Object.keys(result.sets.sand || {});

  for (const setId of SETS) {
    const lightRef = lightPairFor(setId);
    for (const key of keys) {
      const m = result.sets[setId][key];
      if (!m) continue;

      const fg = normColor(m.color);
      const bg = normColor(m.background);
      const border = normColor(m.borderColor);
      const ratio = contrastRatio(fg, bg);
      const size = parseFloat(m.fontSize);
      const weight = Number(m.fontWeight);
      let minRatio = 4.5;
      if (size >= 18 || weight >= 700) minRatio = 3;
      else if (size <= 12.5 && weight <= 600) minRatio = 4;

      if (fg && bg && ratio !== null && ratio < minRatio) {
        findings.push({
          zone,
          set: setId,
          key,
          issue: `текст плохо читается (контраст ${ratio.toFixed(2)}:1)`,
        });
      }

      if (lightRef) {
        const ref = result.sets[lightRef][key];
        if (ref && normColor(ref.background) === bg && bg && SAND_LIGHT_HEX.has(bg)) {
          findings.push({
            zone,
            set: setId,
            key,
            issue: 'песочная подложка не сменилась на тёмном наборе',
          });
        }
        if (ref && normColor(ref.color) === fg && fg && SAND_LIGHT_HEX.has(fg)) {
          findings.push({
            zone,
            set: setId,
            key,
            issue: 'песочный текст не сменился на тёмном наборе',
          });
        }
      }

      if (contourKeys.includes(key)) {
        const hasBorder = border && border !== '#ffffff' && border !== bg;
        const hasRing = m.boxShadow && m.boxShadow !== 'none';
        if (!hasBorder && !hasRing) {
          findings.push({
            zone,
            set: setId,
            key,
            issue: 'пропал контур (нет border и inset ring)',
          });
        }
      }
    }
  }

  return findings;
}

export function formatFindingsTable(findings) {
  if (!findings.length) return [];
  return findings.map((f) => `${f.zone} · ${f.set} · ${f.key}: ${f.issue}`);
}
