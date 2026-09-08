#!/usr/bin/env node
/** Format computed-color suffix for verdict fact strings (sand + blue @375). */
export function formatComputedColorFact({ selector, cssRef, sand, blue, extra = '' }) {
  const parts = [`${selector}`, cssRef, `computed sand ${sand}`, `blue ${blue}`].filter(Boolean);
  return `${parts.join(' — ')}${extra ? ` ${extra}` : ''}`;
}

export function formatSharedMeasurementFact({ selector, neighborKey, cssRef, note = '' }) {
  const base = `тот же ${selector}, что на «${neighborKey}»`;
  const tail = cssRef ? ` — ${cssRef}; замер общий` : '; замер общий';
  return `${base}${tail}${note ? ` ${note}` : ''}`;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  console.log(formatComputedColorFact({
    selector: '.sb-period-outcome-val.is-ok',
    cssRef: '750-strength-builder.css:7701',
    sand: '#5c6a45',
    blue: '#5c6a45',
  }));
}
