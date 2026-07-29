import type { GameState } from './types.js';

export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function mulberry32Once(seed: number): number {
  let value = (seed + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function deterministicFloat(campaignSeed: string, seedKey: string, occurrence: number): number {
  return mulberry32Once(fnv1a32(`${campaignSeed}:${seedKey}:${occurrence}`));
}

export function drawInt(state: GameState, seedKey: string, min: number, max: number): number {
  const occurrence = state.rng.occurrences[seedKey] ?? 0;
  const value = min + Math.floor(deterministicFloat(state.rng.seed, seedKey, occurrence) * (max - min + 1));
  state.rng.occurrences[seedKey] = occurrence + 1;
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number is not canonical');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const codePoints = (text: string) => Array.from(text, (item) => item.codePointAt(0)!);
    const compareKeys = (left: string, right: string) => { const a=codePoints(left),b=codePoints(right),length=Math.min(a.length,b.length);for(let index=0;index<length;index++)if(a[index]!==b[index])return a[index]!-b[index]!;return a.length-b.length; };
    return `{${Object.keys(record).sort(compareKeys).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string { return canonical(value); }

export function fnv1a64(value: string): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (const byte of new TextEncoder().encode(value)) {
    lo = (lo ^ byte) >>> 0;
    const product = lo * 0x1b3;
    const carry = Math.floor(product / 0x100000000);
    hi = (Math.imul(hi, 0x1b3) + Math.imul(lo, 0x100) + carry) >>> 0;
    lo = product >>> 0;
  }
  return `${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
}

export function stateHash(state: GameState): string { return fnv1a64(canonicalJson(state)); }
