/**
 * Test modularized reports components
 */

import { pad2, fmtDate, round1, toNum, pct, parseTime, sleepHours } from './utils/index.js';
import { invalidateCache, clearAllCache, getCachedDay, setCachedDay } from './cache/index.js';

// Test utilities
console.log('Testing utilities...');
console.log('pad2(5):', pad2(5)); // Should be "05"
console.log('fmtDate(new Date()):', fmtDate(new Date()));
console.log('round1(3.14159):', round1(3.14159)); // Should be 3.1
console.log('toNum("42"):', toNum("42")); // Should be 42
console.log('pct(25, 100):', pct(25, 100)); // Should be 25.0
console.log('parseTime("14:30"):', parseTime("14:30")); // Should be {hh: 14, mm: 30}
console.log('sleepHours("23:00", "07:00"):', sleepHours("23:00", "07:00")); // Should be 8.0

// Test cache
console.log('\nTesting cache...');
setCachedDay('test-day', { data: 'test' });
console.log('getCachedDay("test-day"):', getCachedDay('test-day'));
clearAllCache();
console.log('getCachedDay("test-day") after clear:', getCachedDay('test-day')); // Should be undefined

console.log('\n✅ Modularization test completed successfully!');
