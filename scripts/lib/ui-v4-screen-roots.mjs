import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');
export const WEB_DIR = path.join(ROOT, 'apps', 'web');
export const REGISTRY_FILE = path.join(ROOT, 'docs', 'ui', 'UI_V4_SCREEN_COVERAGE.json');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['__tests__', 'coverage', 'dist', 'node_modules', 'public']);
const CLASS_LITERAL_RE = /className\s*[:=]\s*(['"])([^'"]+)\1/g;
const ROOT_CLASS_RE = /(?:^|[-_])(modal|sheet|overlay|fullscreen|screen)$/;

function normalizeClassToken(token) {
  const value = String(token || '').trim();
  if (!value || value.includes('__')) return null;
  const base = value.replace(/--.*$/, '');
  if (!ROOT_CLASS_RE.test(base) && !base.endsWith('-overlay-root')) return null;
  return base;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

export function extractScreenRoots(source, { file = '<inline>' } = {}) {
  const found = new Map();
  for (const match of String(source).matchAll(CLASS_LITERAL_RE)) {
    for (const token of match[2].split(/\s+/)) {
      const identity = normalizeClassToken(token);
      if (!identity) continue;
      const key = `${identity}\u0000${file}`;
      const current = found.get(key) || {
        identity,
        file,
        lines: [],
      };
      current.lines.push(lineAt(source, match.index));
      found.set(key, current);
    }
  }
  return [...found.values()].map((item) => ({
    ...item,
    lines: [...new Set(item.lines)].sort((a, b) => a - b),
  }));
}

function listSourceFiles(dir, root = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...listSourceFiles(path.join(dir, entry.name), root));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(path.relative(root, path.join(dir, entry.name)).replaceAll('\\', '/'));
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

export function readProductScreenRoots(webDir = WEB_DIR) {
  const byIdentity = new Map();
  for (const file of listSourceFiles(webDir)) {
    const absolute = path.join(webDir, file);
    for (const item of extractScreenRoots(fs.readFileSync(absolute, 'utf8'), { file })) {
      const current = byIdentity.get(item.identity) || { identity: item.identity, locations: [] };
      current.locations.push({ file: item.file, lines: item.lines });
      byIdentity.set(item.identity, current);
    }
  }
  return [...byIdentity.values()].sort((a, b) => a.identity.localeCompare(b.identity, 'en'));
}

export function readScreenCoverageRegistry(file = REGISTRY_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function frameExists(canvasesByZone, target) {
  const canvas = canvasesByZone.get(target?.zone);
  return Boolean(canvas?.productFrames.some((frame) => frame.identity === target?.frame));
}

export function buildCodeScreenCoverageReport(roots, canvases, registry) {
  const rootsById = new Map(roots.map((item) => [item.identity, item]));
  const canvasesByZone = new Map(canvases.map((item) => [item.zoneId, item]));
  const reviewed = registry?.reviewed && typeof registry.reviewed === 'object'
    ? registry.reviewed
    : {};
  const unreviewed = new Set(Array.isArray(registry?.unreviewed) ? registry.unreviewed : []);
  const registered = new Set([...Object.keys(reviewed), ...unreviewed]);

  const missing = roots.filter((item) => !registered.has(item.identity));
  const stale = [...registered].filter((identity) => !rootsById.has(identity)).sort();
  const invalid = [];
  const gaps = [];
  const excluded = [];
  const covered = [];

  for (const [identity, entry] of Object.entries(reviewed)) {
    if (!rootsById.has(identity)) continue;
    if (entry?.status === 'covered') {
      const targets = Array.isArray(entry.frames) ? entry.frames : [];
      if (!targets.length || targets.some((target) => !frameExists(canvasesByZone, target))) {
        invalid.push({ identity, entry });
      } else {
        covered.push({ identity, entry });
      }
    } else if (entry?.status === 'excluded' && String(entry.reason || '').trim()) {
      excluded.push({ identity, entry });
    } else if (entry?.status === 'gap' && String(entry.reason || '').trim()) {
      gaps.push({ identity, entry });
    } else {
      invalid.push({ identity, entry });
    }
  }

  const pending = roots.filter((item) => unreviewed.has(item.identity));
  return {
    ok: !missing.length && !stale.length && !invalid.length && !gaps.length && !pending.length,
    totals: {
      codeRoots: roots.length,
      covered: covered.length,
      excluded: excluded.length,
      gaps: gaps.length,
      pending: pending.length,
      missing: missing.length,
      stale: stale.length,
      invalid: invalid.length,
    },
    missing,
    stale,
    invalid,
    gaps,
    pending,
    covered,
    excluded,
  };
}
