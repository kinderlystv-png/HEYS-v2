#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NUMERIC_FIELDS = new Set([
  'kcal100',
  'kcal100_legacy',
  'calories100',
  'carbs100',
  'fat100',
  'simple100',
  'complex100',
  'protein100',
  'badFat100',
  'badfat100',
  'goodFat100',
  'goodfat100',
  'trans100',
  'fiber100',
  'gi',
  'harm',
  'harmScore',
  'sodium100',
  'sodium',
  'omega3_100',
  'omega6_100',
  'nova_group',
  'novaGroup',
  'nutrient_density',
  'vitamin_a',
  'vitamin_c',
  'vitamin_d',
  'vitamin_e',
  'vitamin_k',
  'vitamin_b1',
  'vitamin_b2',
  'vitamin_b3',
  'vitamin_b6',
  'vitamin_b9',
  'vitamin_b12',
  'calcium',
  'iron',
  'magnesium',
  'phosphorus',
  'potassium',
  'zinc',
  'selenium',
  'iodine',
  'cholesterol',
  'cholesterol100',
  'folate',
]);

const BOOLEAN_FIELDS = new Set([
  'is_organic',
  'is_whole_grain',
  'is_fermented',
  'is_raw',
  '_custom',
  'in_my_list',
  'user_modified',
]);

const AI_SAFE_FIELDS = new Set([
  'badFat100',
  'goodFat100',
  'cholesterol100',
  'carbs100',
  'fat100',
  'kcal100',
]);

const JSON_WRITABLE_FIELDS = new Set([
  ...NUMERIC_FIELDS,
  ...BOOLEAN_FIELDS,
  'badFat100',
  'goodFat100',
  'cholesterol100',
  'carbs100',
  'fat100',
  'kcal100',
]);

const BRAND_RULES = [
  'Nestlé Хрутка',
  'Nestle Хрутка',
  'Простоквашино',
  'Кубанский молочник',
  'Ясно Солнышко',
  'Хрутка',
  'Bombbar',
  'Bootybar',
  'Bionova',
  'Chikalab',
  'PediaSure',
  'Planto',
  'SNAQ FABRIQ',
  'Levro',
  'Raffaello',
  'Savoiardi',
  'Индилайт',
].sort((a, b) => b.length - a.length);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/products/prepare-product-review-db-import.cjs \\',
    '    --original <cloud-export.json> \\',
    '    --applied <ai-applied.json> \\',
    '    --patches <ai-patches.json> \\',
    '    --validation <ai-validation.json> \\',
    '    --out-dir <output-dir>',
  ].join('\n');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function csvCell(value) {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${String(text).replace(/"/g, '""')}"`;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function roundTo(value, places = 3) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function roundMacro(value) {
  return roundTo(value, 1);
}

function sameNumber(a, b, tolerance = 0.15) {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return false;
  return Math.abs(na - nb) <= tolerance;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeFingerprintText(value) {
  return normalizeText(value).toLowerCase().replace(/ё/g, 'е');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeBrandFromName(name, brand) {
  const rawName = normalizeText(name);
  const rawBrand = normalizeText(brand);
  if (!rawName || !rawBrand) return rawName;
  const brandPattern = rawBrand.split(/\s+/).map(escapeRegExp).join('\\s+');
  const edgePattern = new RegExp(`(^|[\\s"«„“”'()\\[\\]{}.,;:–—-]+)(${brandPattern})(?=$|[\\s"»“”'()\\[\\]{}.,;:–—-]+)`, 'i');
  const cleaned = rawName
    .replace(edgePattern, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([([{«„])\s+/g, '$1')
    .replace(/\s+([)\]}»“”])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || rawName;
}

function detectBrand(name) {
  const rawName = normalizeText(name);
  if (!rawName) return null;
  for (const brand of BRAND_RULES) {
    const nextName = removeBrandFromName(rawName, brand);
    if (nextName && nextName !== rawName) {
      return {
        brand,
        name: nextName,
        status: /\s[0-9]+([,.][0-9]+)?$/.test(nextName) ? 'needs_review_numeric_tail' : 'candidate',
        method: 'deterministic_dictionary',
      };
    }
  }
  return null;
}

function nutrientParts(product) {
  return [
    product.simple100,
    product.complex100,
    product.protein100,
    product.badFat100 ?? product.badfat100,
    product.goodFat100 ?? product.goodfat100,
    product.trans100,
    product.fiber100,
    product.gi,
    product.harm,
  ].map((value) => String(roundMacro(toNumber(value) ?? 0))).join('|');
}

function computeProductFingerprint(product) {
  const namePart = normalizeFingerprintText(product.name);
  return crypto.createHash('sha256').update(`${namePart}::${nutrientParts(product)}`, 'utf8').digest('hex');
}

function computeProductBrandFingerprint(product) {
  const brandPart = normalizeFingerprintText(product.brand);
  if (!brandPart) return null;
  const namePart = normalizeFingerprintText(product.name);
  return crypto.createHash('sha256').update(`${namePart}::${brandPart}::${nutrientParts(product)}`, 'utf8').digest('hex');
}

function addChange(changes, field, current, suggested, kind, reason) {
  if (JSON.stringify(current) === JSON.stringify(suggested)) return;
  changes.push({ field, current, suggested, kind, reason });
}

function normalizeProductTypes(rawProduct, changes) {
  const product = clone(rawProduct || {});
  for (const field of Object.keys(product)) {
    const value = product[field];
    if (NUMERIC_FIELDS.has(field)) {
      if (value === '') {
        product[field] = null;
        addChange(changes, field, value, null, 'type_normalization', 'empty numeric field normalized to null');
      } else if (typeof value === 'string') {
        const number = toNumber(value);
        if (number !== null) {
          product[field] = number;
          addChange(changes, field, value, number, 'type_normalization', 'numeric string normalized to number');
        }
      }
    } else if (BOOLEAN_FIELDS.has(field) && typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      if (lowered === 'true' || lowered === 'false') {
        const boolValue = lowered === 'true';
        product[field] = boolValue;
        addChange(changes, field, value, boolValue, 'type_normalization', 'boolean string normalized to boolean');
      }
    }
  }
  return product;
}

function fieldValue(product, field) {
  if (hasOwn(product, field)) return product[field];
  return undefined;
}

function hasNumeric(product, field) {
  return hasOwn(product, field) && toNumber(product[field]) !== null;
}

function aliasMacroField(product, rawProduct, changes, fromField, toField) {
  if (!hasNumeric(product, fromField)) return;
  const source = roundTo(toNumber(product[fromField]));
  if (isBlank(fieldValue(rawProduct, toField))) {
    product[toField] = source;
    addChange(changes, toField, fieldValue(rawProduct, toField), source, 'safe_alias', `${fromField} copied to ${toField}`);
    return;
  }
  if (!sameNumber(product[toField], source)) {
    addChange(changes, toField, fieldValue(rawProduct, toField), product[toField], 'manual_conflict', `${toField} differs from ${fromField}`);
  }
}

function setDerivedAggregate(product, rawProduct, changes, conflicts, sourceMeta, field, computed, reason, tolerance = 0.2) {
  const rounded = roundMacro(computed);
  const currentRaw = fieldValue(rawProduct, field);
  const current = fieldValue(product, field);
  if (isBlank(currentRaw)) {
    product[field] = rounded;
    addChange(changes, field, currentRaw, rounded, 'safe_derived', reason);
    return true;
  }
  if (toNumber(current) === null) {
    conflicts.push(buildMacroConflict(sourceMeta, rawProduct, field, currentRaw, rounded, `${field} is not numeric`));
    return false;
  }
  if (Math.abs(toNumber(current) - rounded) > tolerance) {
    conflicts.push(buildMacroConflict(sourceMeta, rawProduct, field, currentRaw, rounded, reason));
    return false;
  }
  return true;
}

function buildMacroConflict(sourceMeta, rawProduct, field, current, computed, reason) {
  const currentNumber = toNumber(current);
  const computedNumber = toNumber(computed);
  const delta = currentNumber === null || computedNumber === null
    ? null
    : roundTo(currentNumber - computedNumber, 3);
  const absDelta = delta === null ? null : Math.abs(delta);
  let bucket = 'non_numeric';
  if (absDelta !== null) {
    bucket = absDelta <= 1 ? '<=1'
      : absDelta <= 2 ? '1-2'
      : absDelta <= 5 ? '2-5'
      : absDelta <= 10 ? '5-10'
      : absDelta <= 25 ? '10-25'
      : '>25';
  }
  const computedZeroButCurrentNonZero = computedNumber === 0 && currentNumber !== 0;
  let likelyReason = 'needs_label_review';
  let suggestedAction = 'review_package_or_source_before_editing';
  if (computedZeroButCurrentNonZero && (field === 'carbs100' || field === 'fat100')) {
    likelyReason = 'split_fields_missing_or_zero';
    suggestedAction = 'do_not_replace_total_with_zero; fill split fields from label if available';
  } else if (field === 'kcal100') {
    likelyReason = absDelta !== null && absDelta <= 10
      ? 'label_rounding_or_non_4_4_9_energy_method'
      : 'energy_or_macro_source_mismatch';
    suggestedAction = 'keep_label_kcal unless external source proves correction';
  } else if (absDelta !== null && absDelta <= 1) {
    likelyReason = 'rounding_delta';
    suggestedAction = 'keep_current_total';
  }
  return {
    type: 'macro_conflict',
    field,
    source_id: sourceMeta.source_id,
    export_id: sourceMeta.export_id,
    product_name: rawProduct.name || null,
    current,
    computed,
    delta,
    abs_delta: absDelta,
    delta_bucket: bucket,
    likely_reason: likelyReason,
    suggested_action: suggestedAction,
    reason,
  };
}

function prepareSafeProduct(sourceProduct, conflicts) {
  const rawProduct = sourceProduct.product || {};
  const changes = [];
  const product = normalizeProductTypes(rawProduct, changes);

  aliasMacroField(product, rawProduct, changes, 'badfat100', 'badFat100');
  aliasMacroField(product, rawProduct, changes, 'goodfat100', 'goodFat100');
  aliasMacroField(product, rawProduct, changes, 'cholesterol', 'cholesterol100');

  let carbsReliable = hasNumeric(product, 'carbs100');
  let fatReliable = hasNumeric(product, 'fat100');

  if (hasNumeric(product, 'simple100') && hasNumeric(product, 'complex100')) {
    const computed = toNumber(product.simple100) + toNumber(product.complex100);
    carbsReliable = setDerivedAggregate(
      product,
      rawProduct,
      changes,
      conflicts,
      sourceProduct,
      'carbs100',
      computed,
      'carbs100 derived from simple100 + complex100'
    );
  }

  if (hasNumeric(product, 'badFat100') && hasNumeric(product, 'goodFat100') && hasNumeric(product, 'trans100')) {
    const computed = toNumber(product.badFat100) + toNumber(product.goodFat100) + toNumber(product.trans100);
    fatReliable = setDerivedAggregate(
      product,
      rawProduct,
      changes,
      conflicts,
      sourceProduct,
      'fat100',
      computed,
      'fat100 derived from badFat100 + goodFat100 + trans100'
    );
  }

  if (hasNumeric(product, 'protein100') && carbsReliable && fatReliable && hasNumeric(product, 'carbs100') && hasNumeric(product, 'fat100')) {
    const computed = (toNumber(product.protein100) * 4) + (toNumber(product.carbs100) * 4) + (toNumber(product.fat100) * 9);
    setDerivedAggregate(
      product,
      rawProduct,
      changes,
      conflicts,
      sourceProduct,
      'kcal100',
      computed,
      'kcal100 derived from protein100*4 + carbs100*4 + fat100*9',
      2
    );
  }

  return { product, changes };
}

function patchFieldSet(patch) {
  return new Set(Object.keys(patch?.changes || {}));
}

function buildPatchIndexes(patchesFile) {
  const bySource = new Map();
  for (const patch of patchesFile.patches || []) {
    bySource.set(patch.source_id, patch);
  }
  const brandBySource = new Map();
  for (const brand of patchesFile.brand_name_suggestions || []) {
    brandBySource.set(brand.source_id, brand);
  }
  return { bySource, brandBySource };
}

function isSharedSource(presence) {
  return presence?.source === 'shared' && presence?.database === 'shared_products';
}

function isPendingSource(presence) {
  return presence?.source === 'pending' && presence?.database === 'shared_products_pending';
}

function isPersonalSource(presence) {
  return presence?.source === 'personal' && String(presence?.database || '').startsWith('client_kv_store:');
}

function operationForSource(sourceProduct, changes) {
  const presence = sourceProduct.presence || {};
  const writableChanges = changes.filter((change) => (
    change.kind !== 'manual_conflict'
    && JSON_WRITABLE_FIELDS.has(change.field)
  ));
  if (!writableChanges.length) return null;

  if (isSharedSource(presence)) {
    return null;
  }

  const set = {};
  const reasons = [];
  for (const change of writableChanges) {
    set[change.field] = change.suggested;
    reasons.push({
      field: change.field,
      kind: change.kind,
      reason: change.reason,
      current: change.current,
      suggested: change.suggested,
    });
  }
  if (!Object.keys(set).length) return null;

  const common = {
    source_id: sourceProduct.source_id,
    export_id: sourceProduct.export_id,
    target: null,
    preconditions: {
      row_id: presence.row_id || null,
      product_id: presence.product_id || sourceProduct.product?.id || null,
      expected_name: sourceProduct.product?.name || null,
      expected_fingerprint: sourceProduct.product?.fingerprint || null,
    },
    set,
    reasons,
  };

  if (isPendingSource(presence)) {
    common.target = {
      type: 'shared_products_pending.product_data',
      row_id: presence.row_id || null,
      product_id: presence.product_id || null,
      client_id: presence.client_id || null,
    };
    return common;
  }

  if (isPersonalSource(presence)) {
    common.target = {
      type: 'client_kv_store.product_array_item',
      client_id: presence.client_id || null,
      key: String(presence.database).replace(/^client_kv_store:/, ''),
      row_id: presence.row_id || null,
      product_id: presence.product_id || sourceProduct.product?.id || null,
    };
    return common;
  }

  return null;
}

function riskyAiChanges(originalSource, safeSource, patch) {
  const out = [];
  const originalProduct = originalSource?.product || {};
  const safeProduct = safeSource?.product || {};
  for (const [field, change] of Object.entries(patch?.changes || {})) {
    if (AI_SAFE_FIELDS.has(field)) continue;
    const current = fieldValue(originalProduct, field);
    const safe = fieldValue(safeProduct, field);
    out.push({
      field,
      current,
      ai_suggested: change.suggested,
      safe_value: safe,
      rejected: JSON.stringify(current) === JSON.stringify(safe),
      reason: change.rationale || patch.reason || null,
    });
  }
  return out;
}

function sourceLabel(presence) {
  if (!presence) return null;
  if (presence.label) return presence.label;
  if (presence.source === 'personal') return `client_kv_store:${presence.client_id || ''}:${presence.database || ''}`;
  return presence.database || presence.source || null;
}

function buildBrandCandidate(sourceProduct, aiBrandSuggestion) {
  const product = sourceProduct.product || {};
  if (normalizeText(product.brand)) return null;
  const detected = detectBrand(product.name);
  if (!detected && !aiBrandSuggestion) return null;
  const currentName = normalizeText(product.name);
  const deterministic = detected
    ? {
      suggested_brand: detected.brand,
      suggested_name: detected.name,
      status: detected.status,
      method: detected.method,
      suggested_fingerprint: computeProductFingerprint({ ...product, name: detected.name }),
      suggested_brand_fingerprint: computeProductBrandFingerprint({ ...product, name: detected.name, brand: detected.brand }),
    }
    : null;
  return {
    source_id: sourceProduct.source_id,
    export_id: sourceProduct.export_id,
    product_name: currentName,
    presence: sourceProduct.presence || null,
    deterministic,
    ai: aiBrandSuggestion
      ? {
        suggested_brand: aiBrandSuggestion.suggested_brand,
        suggested_name: aiBrandSuggestion.suggested_name,
        confidence: aiBrandSuggestion.confidence,
        reason: aiBrandSuggestion.reason || null,
      }
      : null,
    decision: deterministic
      ? 'review_before_apply'
      : 'ai_only_review_before_apply',
  };
}

function validatePackage(packageData, safeExport, originalSourceById, safeSourceById, patchesBySource) {
  const numericTypeIssues = [];
  const booleanTypeIssues = [];
  const missingRefs = [];
  const riskyAppliedIssues = [];
  let portionsCount = 0;

  const sourceIds = new Set(safeExport.sourceProducts.map((source) => source.source_id));
  for (const productGroup of safeExport.products || []) {
    for (const ref of productGroup.source_refs || []) {
      if (!sourceIds.has(ref)) missingRefs.push({ export_id: productGroup.export_id, source_ref: ref });
    }
  }

  for (const source of safeExport.sourceProducts || []) {
    const product = source.product || {};
    if (hasOwn(product, 'portions')) portionsCount += 1;
    for (const field of NUMERIC_FIELDS) {
      if (!hasOwn(product, field)) continue;
      const value = product[field];
      if (value !== null && value !== undefined && typeof value !== 'number') {
        numericTypeIssues.push({ source_id: source.source_id, field, value });
      }
    }
    for (const field of BOOLEAN_FIELDS) {
      if (!hasOwn(product, field)) continue;
      const value = product[field];
      if (value !== null && value !== undefined && typeof value !== 'boolean') {
        booleanTypeIssues.push({ source_id: source.source_id, field, value });
      }
    }
  }

  for (const [sourceId, patch] of patchesBySource.entries()) {
    const risky = riskyAiChanges(originalSourceById.get(sourceId), safeSourceById.get(sourceId), patch);
    for (const item of risky) {
      if (!item.rejected && JSON.stringify(item.safe_value) === JSON.stringify(item.ai_suggested)) {
        riskyAppliedIssues.push({ source_id: sourceId, ...item });
      }
    }
  }

  return {
    ok: (
      numericTypeIssues.length === 0
      && booleanTypeIssues.length === 0
      && missingRefs.length === 0
      && riskyAppliedIssues.length === 0
      && portionsCount === 0
    ),
    numeric_type_issues: {
      count: numericTypeIssues.length,
      sample: numericTypeIssues.slice(0, 10),
    },
    boolean_type_issues: {
      count: booleanTypeIssues.length,
      sample: booleanTypeIssues.slice(0, 10),
    },
    missing_source_refs: {
      count: missingRefs.length,
      sample: missingRefs.slice(0, 10),
    },
    rejected_risky_ai_changes_applied: {
      count: riskyAppliedIssues.length,
      sample: riskyAppliedIssues.slice(0, 10),
    },
    portions_in_safe_export: portionsCount,
    macro_conflicts: {
      count: packageData.manual_review.macro_conflicts.length,
      sample: packageData.manual_review.macro_conflicts.slice(0, 10),
    },
  };
}

function summarizeChanges(safeChangesByKind, operations) {
  const byTarget = {};
  for (const operation of operations) {
    const key = operation.target?.type || 'unknown';
    byTarget[key] = (byTarget[key] || 0) + 1;
  }
  return {
    safe_changes_by_kind: safeChangesByKind,
    db_operations_by_target: byTarget,
  };
}

function summarizeMacroConflicts(conflicts) {
  const byField = {};
  const byReason = {};
  const byBucket = {};
  for (const conflict of conflicts) {
    byField[conflict.field] = (byField[conflict.field] || 0) + 1;
    byReason[conflict.likely_reason] = (byReason[conflict.likely_reason] || 0) + 1;
    const bucketKey = `${conflict.field}:${conflict.delta_bucket}`;
    byBucket[bucketKey] = (byBucket[bucketKey] || 0) + 1;
  }
  return {
    total: conflicts.length,
    by_field: byField,
    by_likely_reason: byReason,
    by_field_delta_bucket: byBucket,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const originalPath = args.original;
  const appliedPath = args.applied;
  const patchesPath = args.patches;
  const validationPath = args.validation;
  if (!originalPath || !appliedPath || !patchesPath || !validationPath) {
    console.error(usage());
    process.exit(2);
  }

  const outDir = path.resolve(args.outDir || path.join(process.cwd(), 'reports/product-review-db-import', `safe-${new Date().toISOString().slice(0, 10)}`));
  fs.mkdirSync(outDir, { recursive: true });

  const original = readJson(originalPath);
  const applied = readJson(appliedPath);
  const patchesFile = readJson(patchesPath);
  const validationFile = readJson(validationPath);
  const { bySource: patchesBySource, brandBySource } = buildPatchIndexes(patchesFile);

  const manualMacroConflicts = [];
  const safeSourceProducts = [];
  const safeSourceById = new Map();
  const originalSourceById = new Map((original.sourceProducts || []).map((source) => [source.source_id, source]));
  const appliedSourceById = new Map((applied.sourceProducts || []).map((source) => [source.source_id, source]));
  const operations = [];
  const safeChangesByKind = {};
  const safeChangeRows = [];
  const rejectedAiPatches = [];
  const brandCandidates = [];

  for (const sourceProduct of original.sourceProducts || []) {
    const prepared = prepareSafeProduct(sourceProduct, manualMacroConflicts);
    const safeSource = {
      ...clone(sourceProduct),
      product: prepared.product,
    };
    safeSourceProducts.push(safeSource);
    safeSourceById.set(safeSource.source_id, safeSource);

    for (const change of prepared.changes) {
      safeChangesByKind[change.kind] = (safeChangesByKind[change.kind] || 0) + 1;
      if (change.kind !== 'manual_conflict') {
        safeChangeRows.push({
          source_id: sourceProduct.source_id,
          export_id: sourceProduct.export_id,
          product_name: sourceProduct.product?.name || null,
          target_label: sourceLabel(sourceProduct.presence),
          ...change,
        });
      }
    }

    const operation = operationForSource(sourceProduct, prepared.changes);
    if (operation) {
      operation.operation_id = `op_${String(operations.length + 1).padStart(5, '0')}`;
      operations.push(operation);
    }

    const patch = patchesBySource.get(sourceProduct.source_id);
    if (patch) {
      const risky = riskyAiChanges(sourceProduct, safeSource, patch);
      if (risky.length) {
        rejectedAiPatches.push({
          source_id: sourceProduct.source_id,
          export_id: sourceProduct.export_id,
          product_name: sourceProduct.product?.name || null,
          presence: sourceProduct.presence || null,
          rejected_changes: risky,
        });
      }
    }

    const brandCandidate = buildBrandCandidate(sourceProduct, brandBySource.get(sourceProduct.source_id));
    if (brandCandidate) brandCandidates.push(brandCandidate);
  }

  const safeExport = {
    ...clone(original),
    schema: `${original.schema || 'heys-products-cloud-export'}+safe-db-import-v1`,
    exportedAt: original.exportedAt,
    safePreparedAt: new Date().toISOString(),
    sourceProducts: safeSourceProducts,
  };

  const aiSafeFieldPatches = [];
  const aiRiskyFieldPatches = [];
  for (const patch of patchesFile.patches || []) {
    const fields = patchFieldSet(patch);
    const safeFields = [...fields].filter((field) => AI_SAFE_FIELDS.has(field));
    const riskyFields = [...fields].filter((field) => !AI_SAFE_FIELDS.has(field));
    if (safeFields.length) aiSafeFieldPatches.push({ source_id: patch.source_id, export_id: patch.export_id, fields: safeFields });
    if (riskyFields.length) aiRiskyFieldPatches.push({ source_id: patch.source_id, export_id: patch.export_id, fields: riskyFields });
  }

  const packageData = {
    ok: true,
    schema: 'heys-product-review-safe-db-import-package-v1',
    created_at: new Date().toISOString(),
    inputs: {
      original: { path: path.resolve(originalPath), sha256: sha256File(originalPath) },
      applied: { path: path.resolve(appliedPath), sha256: sha256File(appliedPath) },
      patches: { path: path.resolve(patchesPath), sha256: sha256File(patchesPath) },
      validation: { path: path.resolve(validationPath), sha256: sha256File(validationPath) },
    },
    policy: {
      safe_auto_apply: [
        'numeric/boolean type normalization for JSON product payloads',
        'badfat100 -> badFat100 alias copy',
        'goodfat100 -> goodFat100 alias copy',
        'cholesterol -> cholesterol100 alias copy',
        'carbs100/fat100/kcal100 formula fields only when source components are already present and consistent',
      ],
      review_before_apply: [
        'brand/name split',
        'category',
        'GI/harm/NOVA/additives/nutrient density',
        'vitamins/minerals/omega/sodium guessed by AI',
        'barcode changes',
        'macro conflicts',
      ],
      shared_products_note: 'Postgres NUMERIC values exported by node-postgres arrive as strings. Shared-table type normalization is not emitted as a DB operation because the database column is already numeric.',
    },
    input_summary: {
      original: original.summary || null,
      ai_patches: patchesFile.summary || null,
      ai_validation: validationFile.deterministic_checks_after_high_confidence_patches || null,
    },
    summary: {
      source_products: safeSourceProducts.length,
      products: Array.isArray(safeExport.products) ? safeExport.products.length : 0,
      safe_changes: safeChangeRows.length,
      db_operations: operations.length,
      brand_candidates: brandCandidates.length,
      rejected_ai_patch_groups: rejectedAiPatches.length,
      ai_safe_field_patch_groups: aiSafeFieldPatches.length,
      ai_risky_field_patch_groups: aiRiskyFieldPatches.length,
      ...summarizeChanges(safeChangesByKind, operations),
    },
    db_operations: operations,
    safe_changes: safeChangeRows,
    brand_candidates: brandCandidates,
    manual_review: {
      macro_conflict_summary: summarizeMacroConflicts(manualMacroConflicts),
      macro_conflicts: manualMacroConflicts,
      ai_needs_human_review: patchesFile.needs_human_review || [],
      rejected_ai_risky_changes: rejectedAiPatches,
    },
    ai_patch_classification: {
      safe_field_groups: aiSafeFieldPatches,
      risky_field_groups: aiRiskyFieldPatches,
    },
  };

  const validation = validatePackage(packageData, safeExport, originalSourceById, safeSourceById, patchesBySource);
  packageData.validation = validation;
  packageData.ok = validation.ok;

  const safeExportPath = path.join(outDir, 'safe_clean_export.json');
  const packagePath = path.join(outDir, 'safe_db_import_package.json');
  const operationsPath = path.join(outDir, 'safe_db_operations.json');
  const brandPath = path.join(outDir, 'brand_candidates_review.json');
  const manualPath = path.join(outDir, 'manual_review_queue.json');
  const validationOutPath = path.join(outDir, 'safe_validation_report.json');
  const safeChangesPath = path.join(outDir, 'safe_changes_audit.json');
  const operationsCsvPath = path.join(outDir, 'safe_db_operations.csv');
  const brandCsvPath = path.join(outDir, 'brand_candidates_review.csv');
  const macroCsvPath = path.join(outDir, 'macro_conflicts_review.csv');
  const readmePath = path.join(outDir, 'README.md');

  writeJson(safeExportPath, safeExport);
  writeJson(packagePath, packageData);
  writeJson(operationsPath, {
    schema: 'heys-product-review-safe-db-operations-v1',
    created_at: packageData.created_at,
    summary: packageData.summary,
    operations,
  });
  writeJson(brandPath, {
    schema: 'heys-product-brand-candidates-review-v1',
    created_at: packageData.created_at,
    summary: { count: brandCandidates.length },
    candidates: brandCandidates,
  });
  writeJson(manualPath, {
    schema: 'heys-product-review-manual-queue-v1',
    created_at: packageData.created_at,
    macro_conflict_summary: packageData.manual_review.macro_conflict_summary,
    macro_conflicts: manualMacroConflicts,
    ai_needs_human_review: patchesFile.needs_human_review || [],
    rejected_ai_risky_changes: rejectedAiPatches,
  });
  writeJson(validationOutPath, validation);
  writeJson(safeChangesPath, {
    schema: 'heys-product-review-safe-changes-audit-v1',
    created_at: packageData.created_at,
    summary: packageData.summary,
    changes: safeChangeRows,
  });

  writeCsv(operationsCsvPath, [
    'operation_id',
    'target_type',
    'client_id',
    'key',
    'row_id',
    'product_id',
    'source_id',
    'export_id',
    'expected_name',
    'set_fields',
    'set_json',
  ], operations.map((operation) => ({
    operation_id: operation.operation_id,
    target_type: operation.target?.type || '',
    client_id: operation.target?.client_id || '',
    key: operation.target?.key || '',
    row_id: operation.target?.row_id || '',
    product_id: operation.target?.product_id || '',
    source_id: operation.source_id,
    export_id: operation.export_id,
    expected_name: operation.preconditions?.expected_name || '',
    set_fields: Object.keys(operation.set || {}).join('|'),
    set_json: operation.set || {},
  })));

  writeCsv(brandCsvPath, [
    'source_id',
    'export_id',
    'target_source',
    'target_database',
    'row_id',
    'client_id',
    'current_name',
    'deterministic_brand',
    'deterministic_name',
    'ai_brand',
    'ai_name',
    'ai_confidence',
    'decision',
  ], brandCandidates.map((candidate) => ({
    source_id: candidate.source_id,
    export_id: candidate.export_id,
    target_source: candidate.presence?.source || '',
    target_database: candidate.presence?.database || '',
    row_id: candidate.presence?.row_id || '',
    client_id: candidate.presence?.client_id || '',
    current_name: candidate.product_name,
    deterministic_brand: candidate.deterministic?.suggested_brand || '',
    deterministic_name: candidate.deterministic?.suggested_name || '',
    ai_brand: candidate.ai?.suggested_brand || '',
    ai_name: candidate.ai?.suggested_name || '',
    ai_confidence: candidate.ai?.confidence || '',
    decision: candidate.decision,
  })));

  writeCsv(macroCsvPath, [
    'source_id',
    'export_id',
    'field',
    'product_name',
    'current',
    'computed',
    'delta',
    'abs_delta',
    'delta_bucket',
    'likely_reason',
    'suggested_action',
    'reason',
  ], manualMacroConflicts.map((conflict) => ({
    source_id: conflict.source_id,
    export_id: conflict.export_id,
    field: conflict.field,
    product_name: conflict.product_name,
    current: conflict.current,
    computed: conflict.computed,
    delta: conflict.delta,
    abs_delta: conflict.abs_delta,
    delta_bucket: conflict.delta_bucket,
    likely_reason: conflict.likely_reason,
    suggested_action: conflict.suggested_action,
    reason: conflict.reason,
  })));

  fs.writeFileSync(readmePath, [
    '# HEYS product review DB import package',
    '',
    'This package is generated from the AI review output, but keeps only deterministic DB-safe changes.',
    '',
    'Files:',
    '- safe_db_import_package.json: full package with policy, operations, validation, and review queues.',
    '- safe_db_operations.json: exact DB-targeted operations with preconditions.',
    '- safe_clean_export.json: original cloud export with safe type/alias/formula normalization only.',
    '- safe_changes_audit.json: flat audit log of every safe change.',
    '- brand_candidates_review.json: brand/name split candidates. Review before applying.',
    '- brand_candidates_review.csv: spreadsheet-friendly brand review.',
    '- manual_review_queue.json: macro conflicts and rejected AI risky changes.',
    '- macro_conflicts_review.csv: spreadsheet-friendly macro conflict review.',
    '- safe_db_operations.csv: spreadsheet-friendly safe operations list.',
    '- safe_validation_report.json: deterministic validation of this package.',
    '',
    'Apply policy:',
    '- Apply safe_db_operations.json only after checking preconditions against current DB rows.',
    '- Dry-run command: node scripts/products/apply-safe-product-db-operations.cjs --operations safe_db_operations.json',
    '- Apply command: node scripts/products/apply-safe-product-db-operations.cjs --operations safe_db_operations.json --apply',
    '- Do not apply brand_candidates_review.json automatically.',
    '- Do not apply manual_review_queue.json automatically.',
    '- Do not import the original AI applied file directly.',
    '',
    `Generated at: ${packageData.created_at}`,
    `Validation OK: ${validation.ok}`,
    '',
  ].join('\n'), 'utf8');

  console.log(JSON.stringify({
    ok: validation.ok,
    outDir,
    summary: packageData.summary,
    validation,
    files: {
      package: packagePath,
      operations: operationsPath,
      safeExport: safeExportPath,
      safeChanges: safeChangesPath,
      brandReview: brandPath,
      brandReviewCsv: brandCsvPath,
      manualReview: manualPath,
      macroConflictsCsv: macroCsvPath,
      validation: validationOutPath,
      operationsCsv: operationsCsvPath,
      readme: readmePath,
    },
  }, null, 2));
}

main();
