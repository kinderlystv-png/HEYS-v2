// agent-zones.mjs — shared helper for agent-zones manifest.
//
// Manifest: .claude/agent-zones.json — declares which paths each parallel
// agent owns. Used by:
//   - scripts/check-agent-staging.mjs — forbid cross-zone staging
//   - scripts/auto-sync-legacy-bundles.mjs — auto-stash foreign-dirty files
//     so hook can rebuild from clean baseline (improvement B).
//
// Glob rules (minimal subset to keep zero-dep):
//   "foo/**"   → any path under foo/
//   "foo/*.js" → direct child .js files in foo/
//   "foo*"     → filename glob (single segment)
// Returns null if no match.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const MANIFEST_PATH = path.join(ROOT_DIR, '.claude', 'agent-zones.json');

let _manifestCache = null;

export function loadZonesManifest() {
    if (_manifestCache) return _manifestCache;
    if (!fs.existsSync(MANIFEST_PATH)) {
        _manifestCache = { zones: {} };
        return _manifestCache;
    }
    try {
        _manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        if (!_manifestCache.zones || typeof _manifestCache.zones !== 'object') {
            _manifestCache.zones = {};
        }
        return _manifestCache;
    } catch (e) {
        console.warn(`[agent-zones] failed to parse ${MANIFEST_PATH}: ${e.message}`);
        _manifestCache = { zones: {} };
        return _manifestCache;
    }
}

// Convert glob pattern to RegExp. Minimal subset (no { } [ ]).
function globToRegExp(pattern) {
    let re = '^';
    let i = 0;
    while (i < pattern.length) {
        const c = pattern[i];
        if (c === '*' && pattern[i + 1] === '*') {
            re += '.*';
            i += 2;
            if (pattern[i] === '/') i++;
        } else if (c === '*') {
            re += '[^/]*';
            i++;
        } else if (c === '?') {
            re += '[^/]';
            i++;
        } else if ('.+^$()|\\'.indexOf(c) >= 0) {
            re += '\\' + c;
            i++;
        } else {
            re += c;
            i++;
        }
    }
    re += '$';
    return new RegExp(re);
}

// Returns zone name (e.g. "fingers") or null if no match.
export function getZoneForFile(filePath) {
    const manifest = loadZonesManifest();
    const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    for (const [zoneName, patterns] of Object.entries(manifest.zones)) {
        for (const pattern of patterns) {
            const re = globToRegExp(pattern);
            if (re.test(normalized)) return zoneName;
        }
    }
    return null;
}

// True if file matches `_generated` zone — produced by hook auto-rebuild,
// any agent can touch (no ownership).
export function isGeneratedZone(filePath) {
    return getZoneForFile(filePath) === '_generated';
}

// Given a list of paths, returns map: zoneName → paths[].
export function groupByZone(filePaths) {
    const out = new Map();
    for (const p of filePaths) {
        const zone = getZoneForFile(p) || '_unknown';
        if (!out.has(zone)) out.set(zone, []);
        out.get(zone).push(p);
    }
    return out;
}

// Returns true if all paths belong to one source zone (excluding _generated).
// Useful for "is this commit single-zone scoped?" check.
export function isSingleSourceZone(filePaths) {
    const sourceZones = new Set();
    for (const p of filePaths) {
        const zone = getZoneForFile(p);
        if (zone && zone !== '_generated') sourceZones.add(zone);
    }
    return sourceZones.size <= 1;
}
