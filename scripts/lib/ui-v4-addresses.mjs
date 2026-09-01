const SHORTHAND_ADDRESS = /\b[a-z_]{2,20}:\d+/g;
const FILE_EXTENSIONS = new Set(['js', 'mjs', 'ts', 'tsx', 'css', 'html', 'sql']);

/**
 * Counts unresolved aliases such as `ui:2513` without misclassifying the
 * `js:2513` suffix of a complete `apps/web/file.js:2513` address.
 */
export function countShorthandAddresses(evidence) {
  let count = 0;
  for (const match of String(evidence || '').matchAll(SHORTHAND_ADDRESS)) {
    const prefix = String(evidence || '').slice(0, match.index);
    const token = match[0].slice(0, match[0].indexOf(':'));
    if (prefix.endsWith('.') && FILE_EXTENSIONS.has(token)) continue;
    count += 1;
  }
  return count;
}
