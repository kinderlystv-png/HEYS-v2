#!/usr/bin/env node
/** Audit verdict rows mentioning sand without sand+dark dual color measure. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'nutrition-tab',
      'checkin-morning',
      'date-remainders',
      'reports-insights',
      'registration',
      'subscription',
      'app-splash',
      'undo-bar',
    ];

const COLOR = /\b(цвет|чернил|фон|заливк|background|color|--v4-|--c[12]|--acs|--gr|акцент|ink|rgba?\(|#[0-9a-f]{3,8}|stroke|ton|тон|rgb\()\b/i;
const GEOM = /\b(ширин|высот|padding|margin|gap|radius|радиус|поля|отступ|flex|align|min-height|touch|геометр|space-between|font-weight|font-size|line-height|начертание|кегль|tabular|viewBox|manifest|icon|theme-color|background_color|единственный песочный|не зависит от палитр|одинаково|один на песочном и синем|песочный=синий)\b/i;
const WEAK = /песочн/i;
const DUAL_DARK = /тёмн|dark|sand-dark|blue-dark|песочно-тём|сине-тём|на песочном и тёмном|песочный.*тёмный/i;
const SAND_BLUE = /песочн.*син|sand.*blue|песочной и синей|песочный и синий/i;
const COPY_TEXT = /копия текста|копия кадра стоит|опорные фразы|вне color-аудита|не цвет — вне/i;
const ROLES_FLIP = /роли переворачиваются/i;

function classify(key, row) {
  const f = row.f || '';
  if (!WEAK.test(f)) return null;

  let kind = 'unknown';
  if (COPY_TEXT.test(f) || (/копия кадра/i.test(f) && !COLOR.test(f))) kind = 'copy-text';
  else if (/копия кадра/i.test(f)) kind = 'copy-mixed';
  else if (GEOM.test(f) && !COLOR.test(f)) kind = 'geometry';
  else if (COLOR.test(f)) kind = 'color';
  else if (/manifest|icon|theme-color|background_color|единственный песочный/i.test(f)) kind = 'geometry';

  const hasDark = DUAL_DARK.test(f);
  const hasSandBlue = SAND_BLUE.test(f);
  const hasRolesFlip = ROLES_FLIP.test(f);

  const colorSinglePalette =
    kind === 'color' && !hasDark && (hasSandBlue || hasRolesFlip || !hasDark);

  return {
    key,
    v: row.v,
    kind,
    hasDark,
    hasSandBlue,
    hasRolesFlip,
    colorSinglePalette,
    f: f.slice(0, 100) + (f.length > 100 ? '…' : ''),
  };
}

const summary = [];
let grandSingle = 0;

for (const zone of ZONES) {
  const file = path.join(ROOT, 'docs/ui/verdicts', `${zone}.json`);
  if (!fs.existsSync(file)) {
    console.error('missing', zone);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Object.entries(data.rows || {})
    .map(([k, r]) => classify(k, r))
    .filter(Boolean);

  const color = rows.filter((r) => r.kind === 'color');
  const single = color.filter((r) => r.colorSinglePalette);
  grandSingle += single.length;

  summary.push({
    zone,
    weakTotal: rows.length,
    color: color.length,
    dualDark: color.filter((r) => r.hasDark).length,
    sandBlueOnly: color.filter((r) => r.hasSandBlue && !r.hasDark).length,
    singlePaletteColor: single.length,
    geometry: rows.filter((r) => r.kind === 'geometry').length,
    copyText: rows.filter((r) => r.kind === 'copy-text').length,
    sampleSingle: single.slice(0, 3).map((r) => r.key),
  });
}

console.log(JSON.stringify({ zones: summary, grandSinglePaletteColor: grandSingle }, null, 2));
