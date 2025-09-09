/**
 * Number utility functions for HEYS reports
 */

/**
 * Rounds a number to 1 decimal place
 * @param {number} x - Number to round
 * @returns {number} Rounded number
 */
export function round1(x) {
  return Math.round((+x || 0) * 10) / 10;
}

/**
 * Converts value to number, returns 0 if not finite
 * @param {any} x - Value to convert
 * @returns {number} Converted number or 0
 */
export function toNum(x) {
  const v = +x;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Calculates percentage with 1 decimal place
 * @param {number} part - Part value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
