// heys_hunger_energy_calibration_v1.js - Offline outcome calibration for HungerEnergyStatus.
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const VERSION = 'hunger-energy-calibration-v1';
  const DELAY_ACTIONS = new Set(['observe', 'hydratePause', 'coffeePause', 'delayWithCheck', 'planNextMeal']);
  const FOOD_ACTIONS = new Set(['riskBrakeMeal', 'eatSnack', 'eatMeal', 'proteinFiberFirst', 'doNotDelay']);
  const WAIT_SUCCESS = new Set(['hunger_passed']);
  const FOOD_SUCCESS = new Set(['ate_calmly', 'hunger_lower']);
  const UNDER_SUPPORT = new Set(['hunger_grew', 'lost_control', 'lostControl', 'not_enough']);
  const OVER_SUPPORT = new Set(['overeating']);
  const MIN_REPORT_OUTCOMES = 12;
  const MIN_REPORT_DAYS = 5;
  const MIN_FAMILY_OUTCOMES = 6;
  const MIN_FAMILY_DAYS = 3;
  const MIN_FACTOR_OUTCOMES = 6;
  const MIN_FACTOR_DAYS = 3;

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function roundRate(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000;
  }

  function eventTime(row) {
    return Date.parse(row?.recordedAt || row?.createdAt || '');
  }

  function eventDay(row) {
    return String(row?.date || row?.recordedAt || row?.createdAt || '').slice(0, 10);
  }

  function getAction(row) {
    return row?.decisionSnapshot?.suggestedAction || row?.decision?.suggestedAction || row?.log?.decision?.suggestedAction || null;
  }

  function getDecision(row) {
    return row?.decisionSnapshot || row?.decision || row?.log?.decision || null;
  }

  function getExplicitOutcome(row) {
    const value = row?.outcomePlan?.userReported || row?.userReportedOutcome || row?.outcome;
    return value && value !== 'calculated' ? value : null;
  }

  function getHungerLevel(row) {
    const value = Number(row?.hungerLevel ?? row?.input?.hungerLevel);
    return Number.isFinite(value) ? value : null;
  }

  function getLastMealTime(row) {
    const raw = row?.context?.lastMealAt?.iso || row?.context?.lastMealAt?.raw || row?.context?.lastMealAt;
    const value = Date.parse(raw || '');
    return Number.isFinite(value) ? value : null;
  }

  function getTrace(row) {
    return safeArray(row?.decisionTrace || row?.log?.decisionTrace);
  }

  function actionFamily(action) {
    if (DELAY_ACTIONS.has(action)) return 'delay';
    if (FOOD_ACTIONS.has(action)) return 'food';
    return null;
  }

  function classifyOutcome(outcome, family) {
    if (!outcome || !family) return null;
    if ((family === 'delay' && WAIT_SUCCESS.has(outcome)) || (family === 'food' && FOOD_SUCCESS.has(outcome))) {
      return 'success';
    }
    if (UNDER_SUPPORT.has(outcome) || (family === 'delay' && OVER_SUPPORT.has(outcome))) return 'under_support';
    if (family === 'food' && OVER_SUPPORT.has(outcome)) return 'over_support';
    return null;
  }

  function inferOutcome(current, next, family) {
    const currentAt = eventTime(current);
    const nextAt = eventTime(next);
    const currentHunger = getHungerLevel(current);
    const nextHunger = getHungerLevel(next);
    if (!Number.isFinite(currentAt) || !Number.isFinite(nextAt) || nextAt <= currentAt) return null;
    const minutes = (nextAt - currentAt) / 60000;
    if (minutes < 15 || minutes > 360 || currentHunger == null || nextHunger == null) return null;

    const nextMealAt = getLastMealTime(next);
    const ateBetween = Number.isFinite(nextMealAt) && nextMealAt > currentAt && nextMealAt <= nextAt;
    const delta = nextHunger - currentHunger;
    if (family === 'delay' && !ateBetween) {
      if (delta <= -2) return 'hunger_passed';
      if (delta >= 2) return 'hunger_grew';
    }
    if (family === 'food' && ateBetween) {
      if (delta <= -2) return 'hunger_lower';
      if (delta >= 2) return 'not_enough';
    }
    return null;
  }

  function buildRatedRows(rows) {
    const decisions = safeArray(rows)
      .filter((row) => getDecision(row) && actionFamily(getAction(row)) && getAction(row) !== 'fastCarbSafety')
      .slice()
      .sort((a, b) => eventTime(a) - eventTime(b));
    const rated = [];
    decisions.forEach((row, index) => {
      const family = actionFamily(getAction(row));
      const explicit = getExplicitOutcome(row);
      const inferred = explicit ? null : inferOutcome(row, decisions[index + 1], family);
      const outcome = explicit || inferred;
      const classification = classifyOutcome(outcome, family);
      if (!classification) return;
      rated.push({
        row,
        family,
        action: getAction(row),
        outcome,
        outcomeSource: explicit ? 'explicit' : 'next_event',
        classification,
        day: eventDay(row)
      });
    });
    return { decisions, rated };
  }

  function summarizeFamily(entries) {
    const rows = safeArray(entries);
    const days = new Set(rows.map((entry) => entry.day).filter(Boolean));
    const success = rows.filter((entry) => entry.classification === 'success').length;
    const underSupport = rows.filter((entry) => entry.classification === 'under_support').length;
    const overSupport = rows.filter((entry) => entry.classification === 'over_support').length;
    const total = rows.length;
    return {
      sampleSize: total,
      days: days.size,
      success,
      underSupport,
      overSupport,
      successRate: total ? roundRate(success / total) : null,
      underSupportRate: total ? roundRate(underSupport / total) : null,
      overSupportRate: total ? roundRate(overSupport / total) : null
    };
  }

  function factorDiagnostics(entries) {
    const factors = new Map();
    safeArray(entries).forEach((entry) => {
      getTrace(entry.row).forEach((trace) => {
        if (!trace?.factor || trace.activeDriver === false) return;
        const riskDelta = Number(trace.riskDelta) || 0;
        const foodDelta = Number(trace.foodDelta) || 0;
        if (riskDelta <= 0 && foodDelta <= 0) return;
        const item = factors.get(trace.factor) || {
          factor: trace.factor,
          label: trace.label || trace.factor,
          sampleSize: 0,
          days: new Set(),
          overEvidence: 0,
          underEvidence: 0,
          supportedEvidence: 0,
          riskDeltaTotal: 0,
          foodDeltaTotal: 0
        };
        item.sampleSize += 1;
        if (entry.day) item.days.add(entry.day);
        item.riskDeltaTotal += riskDelta;
        item.foodDeltaTotal += foodDelta;
        if (entry.classification === 'under_support') item.underEvidence += 1;
        else if (entry.classification === 'over_support' ||
          (entry.classification === 'success' && entry.family === 'delay')) item.overEvidence += 1;
        else item.supportedEvidence += 1;
        factors.set(trace.factor, item);
      });
    });

    return Array.from(factors.values()).map((item) => {
      const days = item.days.size;
      const ready = item.sampleSize >= MIN_FACTOR_OUTCOMES && days >= MIN_FACTOR_DAYS;
      let direction = 'insufficient_data';
      if (ready && item.underEvidence >= item.overEvidence + 2 && item.underEvidence / item.sampleSize >= 0.5) {
        direction = 'underweighted';
      } else if (ready && item.overEvidence >= item.underEvidence + 2 && item.overEvidence / item.sampleSize >= 0.5) {
        direction = 'overweighted';
      } else if (ready) {
        direction = 'balanced';
      }
      return {
        factor: item.factor,
        label: item.label,
        sampleSize: item.sampleSize,
        days,
        direction,
        confidence: item.sampleSize >= 12 && days >= 5 ? 'high' : ready ? 'medium' : 'low',
        overEvidence: item.overEvidence,
        underEvidence: item.underEvidence,
        supportedEvidence: item.supportedEvidence,
        avgRiskDelta: roundRate(item.riskDeltaTotal / item.sampleSize),
        avgFoodDelta: roundRate(item.foodDeltaTotal / item.sampleSize)
      };
    }).sort((a, b) => b.sampleSize - a.sampleSize || a.factor.localeCompare(b.factor));
  }

  function buildFlags(delay, food, factors) {
    const flags = [];
    if (delay.sampleSize >= MIN_FAMILY_OUTCOMES && delay.days >= MIN_FAMILY_DAYS && delay.underSupportRate >= 0.4) {
      flags.push({ id: 'delay_threshold_too_permissive', scope: 'delay', direction: 'underweighted', rate: delay.underSupportRate, sampleSize: delay.sampleSize });
    }
    if (food.sampleSize >= MIN_FAMILY_OUTCOMES && food.days >= MIN_FAMILY_DAYS && food.overSupportRate >= 0.3) {
      flags.push({ id: 'food_support_too_strong', scope: 'food', direction: 'overweighted', rate: food.overSupportRate, sampleSize: food.sampleSize });
    }
    if (food.sampleSize >= MIN_FAMILY_OUTCOMES && food.days >= MIN_FAMILY_DAYS && food.underSupportRate >= 0.4) {
      flags.push({ id: 'food_support_too_weak', scope: 'food', direction: 'underweighted', rate: food.underSupportRate, sampleSize: food.sampleSize });
    }
    safeArray(factors).filter((item) => item.direction === 'overweighted' || item.direction === 'underweighted')
      .slice(0, 5)
      .forEach((item) => flags.push({
        id: 'factor_' + item.factor,
        scope: 'factor',
        factor: item.factor,
        label: item.label,
        direction: item.direction,
        sampleSize: item.sampleSize,
        confidence: item.confidence
      }));
    return flags;
  }

  function evaluate(rows) {
    const { decisions, rated } = buildRatedRows(rows);
    const days = new Set(rated.map((entry) => entry.day).filter(Boolean));
    const delay = summarizeFamily(rated.filter((entry) => entry.family === 'delay'));
    const food = summarizeFamily(rated.filter((entry) => entry.family === 'food'));
    const factors = factorDiagnostics(rated);
    const flags = buildFlags(delay, food, factors);
    const explicitOutcomeCount = rated.filter((entry) => entry.outcomeSource === 'explicit').length;
    const inferredOutcomeCount = rated.length - explicitOutcomeCount;
    const ready = rated.length >= MIN_REPORT_OUTCOMES && days.size >= MIN_REPORT_DAYS;
    return {
      version: VERSION,
      status: ready ? 'ready' : 'collecting',
      decisionCount: decisions.length,
      ratedOutcomeCount: rated.length,
      explicitOutcomeCount,
      inferredOutcomeCount,
      outcomeDays: days.size,
      coverage: decisions.length ? roundRate(rated.length / decisions.length) : 0,
      minimums: {
        reportOutcomes: MIN_REPORT_OUTCOMES,
        reportDays: MIN_REPORT_DAYS,
        familyOutcomes: MIN_FAMILY_OUTCOMES,
        familyDays: MIN_FAMILY_DAYS,
        factorOutcomes: MIN_FACTOR_OUTCOMES,
        factorDays: MIN_FACTOR_DAYS
      },
      actionFamilies: { delay, food },
      factorDiagnostics: factors.slice(0, 12),
      flags,
      autoAdjustmentAllowed: false
    };
  }

  HEYS.HungerEnergyCalibration = {
    VERSION,
    evaluate,
    classifyOutcome,
    inferOutcome
  };
})(typeof window !== 'undefined' ? window : globalThis);
