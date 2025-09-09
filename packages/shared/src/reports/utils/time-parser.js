/**
 * Time parsing utilities for HEYS reports
 */

import { round1 } from './number-utils.js';

/**
 * Parses time string to hours and minutes object
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {Object|null} Object with hh and mm properties or null
 */
export function parseTime(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  return m ? { hh: +m[1], mm: +m[2] } : null;
}

/**
 * Calculates sleep duration in hours between start and end time
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format  
 * @returns {number} Sleep duration in hours
 */
export function sleepHours(startTime, endTime) {
  const s = parseTime(startTime);
  const e = parseTime(endTime);
  if (!s || !e) return 0;
  
  const sh = s.hh + s.mm / 60;
  const eh = e.hh + e.mm / 60;
  let d = eh - sh;
  
  if (d < 0) d += 24; // Handle overnight sleep
  
  return round1(d);
}
