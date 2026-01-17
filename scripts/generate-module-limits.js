import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import { readMetrics } from './arch-metrics.js';

const DEFAULT_LIMITS = {
  loc: { warn: 1500, error: 2000 },
  functions: { warn: 60, error: 80 },
  heysRefs: { warn: 40, error: 50 },
};

const BUFFER_PCT = 0.1;
const CONFIG_PATH = path.join(process.cwd(), 'config', 'module-limits.json');
const PATTERNS = ['apps/web/**/heys_*.js', '!apps/web/**/dist/**'];

const buildLimits = (count) => {
  const warn = count;
  const error = Math.max(warn, Math.ceil(count * (1 + BUFFER_PCT)));
  return { warn, error };
};

const buildFileEntry = (metrics) => {
  const { loc, functions, heysRefs } = metrics;
  return {
    metrics: { loc, functions, heysRefs },
    limits: {
      loc: buildLimits(loc),
      functions: buildLimits(functions),
      heysRefs: buildLimits(heysRefs),
    },
  };
};

const main = async () => {
  const files = await glob(PATTERNS, { gitignore: true });
  const entries = {};

  for (const file of files) {
    const metrics = await readMetrics(file);
    const relativePath = path.relative(process.cwd(), file).split(path.sep).join('/');
    entries[relativePath] = buildFileEntry(metrics);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    bufferPct: BUFFER_PCT,
    defaults: DEFAULT_LIMITS,
    files: entries,
  };

  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`✅ Module limits generated for ${Object.keys(entries).length} file(s).`);
  console.log(`→ ${path.relative(process.cwd(), CONFIG_PATH)}`);
};

main().catch((error) => {
  console.error('❌ Failed to generate module limits:', error);
  process.exit(1);
});
