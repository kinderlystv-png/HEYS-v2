import fs from 'node:fs';
import path from 'node:path';

/** @typedef {'builder'|'catalogNewExercise'|'proposal'|'supersetOnly'} StrengthModuleSet */

const moduleSourceCache = new Map();

export const STRENGTH_MODULE_SETS = Object.freeze({
  builder: [
    '_kernel/heys_kernel_strength_v1.js',
    'heys_exercise_catalog_v1.js',
    'strength/heys_strength_superset_ui_v1.js',
    'strength/heys_strength_catalog_ui_v1.js',
    'strength/heys_strength_finish_ui_v1.js',
    'strength/heys_strength_builder_ui_v1.js',
  ],
  catalogNewExercise: [
    'heys_exercise_catalog_v1.js',
    'strength/heys_strength_catalog_ui_v1.js',
  ],
  proposal: [
    '_kernel/heys_kernel_strength_v1.js',
    'strength/heys_strength_superset_ui_v1.js',
    'strength/heys_strength_proposal_ui_v1.js',
  ],
  supersetOnly: [
    '_kernel/heys_kernel_strength_v1.js',
    'strength/heys_strength_superset_ui_v1.js',
  ],
});

export function readWebFile(webDir, rel) {
  const key = `${webDir}\0${rel}`;
  if (!moduleSourceCache.has(key)) {
    moduleSourceCache.set(key, fs.readFileSync(path.join(webDir, rel), 'utf8'));
  }
  return moduleSourceCache.get(key);
}

/**
 * Eval legacy strength modules once per test file. Returns window.HEYS after load.
 * @param {string} webDir
 * @param {typeof import('react')} react
 * @param {readonly string[]} modules
 */
export function evalStrengthModules(webDir, react, modules) {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = {};
  globalThis.window.React = react;
  for (const rel of modules) {
    // eslint-disable-next-line no-eval
    eval(readWebFile(webDir, rel));
  }
  return globalThis.window.HEYS;
}

/**
 * @param {string} webDir
 * @param {StrengthModuleSet} setName
 * @param {typeof import('react')} react
 */
export function loadStrengthModuleSet(webDir, setName, react) {
  return evalStrengthModules(webDir, react, STRENGTH_MODULE_SETS[setName]);
}

/**
 * Memoize compiled CSS strings (per palette key).
 * @param {Record<string, string|null>} cache
 * @param {string} key
 * @param {() => string} compile
 */
export function compileCssCached(cache, key, compile) {
  if (!cache[key]) cache[key] = compile();
  return cache[key];
}

/**
 * Persistent <style> for a test file — swap textContent per palette, remove in afterAll.
 */
export function createStyleHost() {
  const el = document.createElement('style');
  document.head.appendChild(el);
  return {
    set(css) { el.textContent = css; },
    remove() { el.remove(); },
  };
}
