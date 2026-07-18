// heys_overlay_shard_codec_v1.js
// Versioned manifest codec for atomic heys_products_overlay_v2 chunk publication.

; (function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.HEYS = root.HEYS || {};
    root.HEYS.OverlayShardCodec = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const FORMAT = 'heys-overlay-manifest-v1';

  function createGeneration(now, random) {
    const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const entropy = typeof random === 'string' && random
      ? random
      : Math.random().toString(36).slice(2, 10);
    return `${timestamp.toString(36)}-${entropy}`;
  }

  function hashRows(rows) {
    let input;
    try {
      const seen = new Set();
      const canonicalize = (value, inArray) => {
        if (value === null) return null;
        if (typeof value !== 'object') {
          if (typeof value === 'number' && !Number.isFinite(value)) return null;
          if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
            return inArray ? null : undefined;
          }
          return value;
        }
        if (seen.has(value)) throw new TypeError('circular_value');
        seen.add(value);
        let normalized;
        if (Array.isArray(value)) {
          normalized = value.map((item) => canonicalize(item, true));
        } else if (typeof value.toJSON === 'function') {
          normalized = canonicalize(value.toJSON(), inArray);
        } else {
          normalized = {};
          Object.keys(value).sort().forEach((key) => {
            const item = canonicalize(value[key], false);
            if (item !== undefined) normalized[key] = item;
          });
        }
        seen.delete(value);
        return normalized;
      };
      input = JSON.stringify(canonicalize(rows, false));
    } catch (_) {
      return null;
    }
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `${input.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function isManifest(value) {
    return !!(
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.format === FORMAT
      && typeof value.generation === 'string'
      && value.generation.length > 0
      && Number.isInteger(value.count)
      && value.count > 0
      && Number.isInteger(value.rowCount)
      && value.rowCount >= 0
      && value.state === 'committed'
      && Array.isArray(value.hashes)
      && value.hashes.length === value.count
      && value.hashes.every((hash) => typeof hash === 'string' && hash.length > 0)
    );
  }

  function buildManifest(shards, generation, state) {
    const hashes = shards.map(hashRows);
    if (hashes.some((hash) => !hash)) return null;
    return {
      format: FORMAT,
      generation,
      state,
      count: shards.length,
      rowCount: shards.reduce((sum, shard) => sum + shard.length, 0),
      hashes,
    };
  }

  function splitRows(rows, options) {
    if (!Array.isArray(rows)) return { ok: false, reason: 'rows_not_array', shards: [] };
    const opts = options || {};
    const targetBytes = Math.max(1024, Number(opts.targetBytes) || (42 * 1024));
    const maxShards = Math.max(1, Number(opts.maxShards) || 17);
    const generation = opts.generation || createGeneration(opts.now, opts.random);
    const shards = [];
    let current = [];
    let currentBytes = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      let rowBytes;
      try {
        rowBytes = Math.max(1, JSON.stringify(row).length + 1);
      } catch (_) {
        return { ok: false, reason: 'row_not_serializable', shards: [] };
      }
      if (current.length > 0 && currentBytes + rowBytes > targetBytes) {
        shards.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(row);
      currentBytes += rowBytes;
    }
    if (current.length > 0 || rows.length === 0) shards.push(current);
    if (shards.length > maxShards) {
      return { ok: false, reason: 'too_many_shards', shards: [], requiredShards: shards.length };
    }
    const manifest = buildManifest(shards, generation, 'committed');
    if (!manifest) return { ok: false, reason: 'rows_not_serializable', shards: [] };
    return {
      ok: true,
      generation,
      shards,
      manifest,
    };
  }

  function createSingle(rows, options) {
    if (!Array.isArray(rows)) return { ok: false, reason: 'rows_not_array', shards: [] };
    const opts = options || {};
    const generation = opts.generation || createGeneration(opts.now, opts.random);
    const shards = [rows];
    const manifest = buildManifest(shards, generation, 'committed');
    if (!manifest) return { ok: false, reason: 'rows_not_serializable', shards: [] };
    return {
      ok: true,
      generation,
      shards,
      manifest,
    };
  }

  function assemble(mainValue, tailValues, manifest) {
    const tails = Array.isArray(tailValues) ? tailValues : [];

    if (!isManifest(manifest)) {
      const legacyTails = tails.filter(Array.isArray);
      if (!Array.isArray(mainValue) && legacyTails.length === 0) {
        return { ok: false, status: 'missing', rows: null };
      }
      return {
        ok: true,
        status: 'legacy',
        rows: [...(Array.isArray(mainValue) ? mainValue : []), ...legacyTails.flat()],
      };
    }

    const shards = [mainValue, ...tails.slice(0, Math.max(0, manifest.count - 1))];
    if (shards.length !== manifest.count || shards.some((shard) => !Array.isArray(shard))) {
      return {
        ok: false,
        status: 'incomplete',
        rows: null,
        generation: manifest.generation,
        expectedShards: manifest.count,
        receivedShards: shards.filter(Array.isArray).length,
      };
    }
    for (let index = 0; index < shards.length; index += 1) {
      if (hashRows(shards[index]) !== manifest.hashes[index]) {
        return {
          ok: false,
          status: 'generation_mismatch',
          rows: null,
          generation: manifest.generation,
          shardIndex: index,
        };
      }
    }
    const rows = shards.flat();
    if (rows.length !== manifest.rowCount) {
      return { ok: false, status: 'row_count_mismatch', rows: null };
    }
    return {
      ok: true,
      status: 'complete',
      rows,
      generation: manifest.generation,
      shardCount: manifest.count,
    };
  }

  return {
    FORMAT,
    createGeneration,
    hashRows,
    isManifest,
    createSingle,
    splitRows,
    assemble,
  };
});
