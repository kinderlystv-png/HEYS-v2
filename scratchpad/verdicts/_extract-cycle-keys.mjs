import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(
  path.resolve(
    'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/cycle.v4.dc.html',
  ),
  'utf8',
);
const rows = [...html.matchAll(/<div class="spec"><b>([^<]+)<\/b><span data-v="([^"]*)"/g)].map((m) => ({
  key: m[1],
  value: m[2],
}));
console.log('count', rows.length);
rows.forEach((r, i) => console.log(`${i + 1}. ${r.key}`));
