import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'tinyglobby';

const stripStrings = (text) =>
  text.replace(/(['"`])(?:\\.|(?!\1)[^\\])*?\1/g, '');

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const sanitizeText = (text) => stripComments(stripStrings(text));

const countFunctions = (text) => {
  const cleaned = sanitizeText(text);

  const functionDecl = cleaned.match(/\bfunction\b\s*[a-zA-Z_$]*\s*\(/g) || [];
  const arrowFns = cleaned.match(/=>\s*(\{|[a-zA-Z_$])/g) || [];
  const methodRegex = /(^|[^\w$])(?!if\b|for\b|while\b|switch\b|catch\b|with\b|return\b|else\b)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
  const methods = cleaned.match(methodRegex) || [];

  return functionDecl.length + arrowFns.length + methods.length;
};

const countHeysRefs = (text) => (text.match(/HEYS\.[a-zA-Z_]+/g) || []).length;

const getMetricsFromText = (text) => {
  const loc = text.split(/\r?\n/).length;
  const functions = countFunctions(text);
  const heysRefs = countHeysRefs(text);

  return { loc, functions, heysRefs };
};

export const readMetrics = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return getMetricsFromText(content);
};

const parseArgs = (argv) => {
  const args = { metric: 'all', file: null, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg === '--metric') {
      args.metric = argv[i + 1] || 'all';
      i += 1;
    } else if (arg === '--all') {
      args.all = true;
    }
  }
  return args;
};

const outputMetric = (metrics, metric) => {
  if (metric === 'loc') return `${metrics.loc}`;
  if (metric === 'functions') return `${metrics.functions}`;
  if (metric === 'heysRefs') return `${metrics.heysRefs}`;
  return `${metrics.loc}|${metrics.functions}|${metrics.heysRefs}`;
};

const runAll = async () => {
  const files = await glob(['apps/web/**/heys_*.js'], { gitignore: true });
  const rows = [];

  for (const file of files) {
    const metrics = await readMetrics(file);
    rows.push(`${path.basename(file)}|${metrics.loc}|${metrics.functions}|${metrics.heysRefs}`);
  }

  console.log('file|loc|functions|heysRefs');
  rows.sort().forEach((row) => console.log(row));
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.all) {
    await runAll();
    return;
  }

  if (!args.file) {
    console.error('❌ Provide --file <path> or --all');
    process.exit(1);
  }

  const metrics = await readMetrics(args.file);
  process.stdout.write(outputMetric(metrics, args.metric));
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  run().catch((error) => {
    console.error('❌ Failed to read metrics:', error);
    process.exit(1);
  });
}
