/**
 * Date formatting utilities for HEYS reports
 */

/**
 * Pads a number with leading zeros to ensure 2 digits
 * @param {number} n - Number to pad
 * @returns {string} Padded string
 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Formats a date object to YYYY-MM-DD string
 * @param {Date} d - Date to format
 * @returns {string} Formatted date string
 */
export function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
