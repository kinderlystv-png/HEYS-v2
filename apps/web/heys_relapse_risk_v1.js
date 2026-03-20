(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const MODULE = '[HEYS.relapseRisk]';

  const CONFIG = {
    VERSION: '1.1.0',
    DEFAULT_PROFILE_KEY: 'v1_1',
    LEVELS: {
      low: { min: 0, max: 19 },
      guarded: { min: 20, max: 39 },
      elevated: { min: 40, max: 59 },
      high: { min: 60, max: 79 },
      critical: { min: 80, max: 100 },
    },
    WEIGHTS: {
      stressLoad: 0.24,
      sleepDebt: 0.18,
      restrictionPressure: 0.22,
      rewardExposure: 0.16,
      timingContext: 0.10,
      emotionalVulnerability: 0.10,
    },
    WINDOWS: {
      next3h: {
        stressLoad: 0.35,
        restrictionPressure: 0.25,
        rewardExposure: 0.20,
        timingContext: 0.20,
        protectiveBuffer: 0.40,
      },
      tonight: {
        stressLoad: 0.22,
        sleepDebt: 0.18,
        restrictionPressure: 0.25,
        rewardExposure: 0.18,
        timingContext: 0.12,
        emotionalVulnerability: 0.05,
        protectiveBuffer: 0.50,
      },
      next24h: {
        stressLoad: 0.20,
        sleepDebt: 0.20,
        restrictionPressure: 0.25,
        rewardExposure: 0.12,
        timingContext: 0.08,
        emotionalVulnerability: 0.15,
        protectiveBuffer: 0.35,
      },
    },
    THRESHOLDS: {
      lowStress: 3,
      highStress: 6,
      strongStress: 8,
      weekendDays: [0, 5, 6],
      hydrationGoodMl: 1800,
      mealStructureCount: 3,
      protectiveBufferCap: 30,
      historyMinForTrend: 3,
    },
    PROFILES: {
      baseline: {
        key: 'baseline',
        label: 'Baseline v1.0',
        description: 'Исходные веса без дополнительного тюнинга.',
        weights: {
          stressLoad: 0.24,
          sleepDebt: 0.18,
          restrictionPressure: 0.22,
          rewardExposure: 0.16,
          timingContext: 0.10,
          emotionalVulnerability: 0.10,
        },
      },
      v1_1: {
        key: 'v1_1',
        label: 'Tuned v1.1',
        description: 'Чуть мягче к структурному дефициту и чуть чувствительнее к recovery debt.',
        weights: {
          stressLoad: 0.22,
          sleepDebt: 0.20,
          restrictionPressure: 0.21,
          rewardExposure: 0.15,
          timingContext: 0.09,
          emotionalVulnerability: 0.13,
        },
      },
      recovery_sensitive: {
        key: 'recovery_sensitive',
        label: 'Recovery-sensitive',
        description: 'Сильнее наказывает недосып и эмоциональное истощение.',
        weights: {
          stressLoad: 0.21,
          sleepDebt: 0.23,
          restrictionPressure: 0.19,
          rewardExposure: 0.14,
          timingContext: 0.08,
          emotionalVulnerability: 0.15,
        },
      },
      restriction_sensitive: {
        key: 'restriction_sensitive',
        label: 'Restriction-sensitive',
        description: 'Чувствительнее к дефициту, gaps и aggressive cut паттерну.',
        weights: {
          stressLoad: 0.20,
          sleepDebt: 0.17,
          restrictionPressure: 0.28,
          rewardExposure: 0.14,
          timingContext: 0.09,
          emotionalVulnerability: 0.12,
        },
      },
    },
  };

  function getRiskProfileConfig(profileKey) {
    const requestedKey = typeof profileKey === 'string' && profileKey.trim()
      ? profileKey.trim()
      : CONFIG.DEFAULT_PROFILE_KEY;
    const profile = CONFIG.PROFILES[requestedKey] || CONFIG.PROFILES[CONFIG.DEFAULT_PROFILE_KEY] || CONFIG.PROFILES.baseline;
    return {
      key: profile.key,
      label: profile.label,
      description: profile.description,
      weights: profile.weights || CONFIG.WEIGHTS,
    };
  }

  function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    if (numeric < min) return min;
    if (numeric > max) return max;
    return numeric;
  }

  function clamp100(value) {
    return clamp(Math.round(value * 10) / 10, 0, 100);
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function hasOwnValue(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== undefined && obj[key] !== '';
  }

  function getNowDate(now) {
    const date = now ? new Date(now) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function getCurrentHour(now) {
    return getNowDate(now).getHours();
  }

  function getCurrentDay(now) {
    return getNowDate(now).getDay();
  }

  function getExpectedDailyCoverageByHour(hour) {
    const numericHour = toNumber(hour, 12);
    const activeWindowStart = 7;
    const activeWindowEnd = 22;
    const ratio = (numericHour - activeWindowStart) / (activeWindowEnd - activeWindowStart);
    return clamp(ratio, 0.15, 1);
  }

  function getCurrentMinutes(now, dayData) {
    const date = getNowDate(now);
    const iso = date.toISOString().slice(0, 10);
    if (dayData?.date && dayData.date !== iso) {
      return 23 * 60 + 59;
    }
    return date.getHours() * 60 + date.getMinutes();
  }

  function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function getDaySleepHours(dayData) {
    if (!dayData || typeof dayData !== 'object') return 0;

    const totalSleepHours = HEYS.dayUtils?.getTotalSleepHours?.(dayData);
    if (Number.isFinite(totalSleepHours) && totalSleepHours > 0) {
      return totalSleepHours;
    }

    const storedSleepHours = Number(dayData.sleepHours);
    if (Number.isFinite(storedSleepHours) && storedSleepHours > 0) {
      return storedSleepHours;
    }

    const fallbackSleepHours = HEYS.dayUtils?.sleepHours?.(dayData.sleepStart, dayData.sleepEnd);
    return Number.isFinite(fallbackSleepHours) && fallbackSleepHours > 0
      ? fallbackSleepHours
      : 0;
  }

  function getMeals(dayData) {
    return Array.isArray(dayData?.meals) ? dayData.meals : [];
  }

  function getHoursSinceLastMeal(dayData, now) {
    const meals = getMeals(dayData)
      .map(meal => parseTimeToMinutes(meal?.time))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (meals.length === 0) {
      // No meals logged today — return hours since midnight (more realistic than 24h fast)
      const currentMinutes = getCurrentMinutes(now, dayData);
      return Math.max(0, Math.round((currentMinutes / 60) * 10) / 10);
    }

    const currentMinutes = getCurrentMinutes(now, dayData);
    const validMeals = meals.filter(minutes => minutes <= currentMinutes);
    const lastMealMinutes = validMeals.length > 0 ? validMeals[validMeals.length - 1] : null;

    if (lastMealMinutes === null) {
      return Math.round((currentMinutes / 60) * 10) / 10;
    }

    return Math.round(((currentMinutes - lastMealMinutes) / 60) * 10) / 10;
  }

  // ── Exercise momentum helpers ──────────────────────────────────────────
  // Positive behavioral cascade (Bandura self-efficacy, Blundell acute
  // appetite suppression, identity consistency) — exercise today reduces
  // relapse risk independently of its caloric cost.

  function getTrainings(dayData) {
    const raw = Array.isArray(dayData?.trainings) ? dayData.trainings : [];
    return raw.filter(t => t && Array.isArray(t.z) && t.z.some(m => +m > 0));
  }

  function calcTrainingKcal(trainings, weight) {
    if (trainings.length === 0) return 0;
    const calcFn = HEYS.IW?.utils?.calculateTrainingKcal;
    let total = 0;
    trainings.forEach(t => {
      if (typeof calcFn === 'function') {
        total += calcFn(t, weight) || 0;
      } else {
        // Fallback: simplified MET formula (same as heys_iw_constants)
        const mets = [2.5, 6, 8, 10];
        total += t.z.reduce((sum, min, i) => sum + (+min || 0) * (mets[i] * 3.5 * (weight || 70) / 200), 0);
      }
    });
    return Math.round(total);
  }

  function getKcalTarget(normAbs, profile) {
    return Math.max(1, toNumber(normAbs?.kcal, toNumber(profile?.optimum, 0)) || 1);
  }

  function getProtTarget(normAbs, profile) {
    return Math.max(1, toNumber(normAbs?.prot, toNumber(profile?.protTarget, 0)) || 1);
  }

  function getKcalEaten(dayTot, dayData) {
    return Math.max(0, toNumber(dayTot?.kcal, toNumber(dayData?.savedEatenKcal, toNumber(dayData?.totKcal, 0))));
  }

  function getProtEaten(dayTot, dayData) {
    return Math.max(0, toNumber(dayTot?.prot, toNumber(dayData?.savedEatenProt, 0)));
  }

  function getHistoryKcalRatio(day, fallbackTarget) {
    if (!day || typeof day !== 'object') return 0;
    if (Number.isFinite(day.ratio) && day.ratio > 0) return day.ratio;

    const kcal = toNumber(
      day?.dayTot?.kcal,
      toNumber(day?.kcal, toNumber(day?.savedEatenKcal, toNumber(day?.totKcal, 0)))
    );
    const target = toNumber(
      day?.target,
      toNumber(day?.targetKcal, toNumber(day?.optimum, toNumber(day?.normAbs?.kcal, fallbackTarget)))
    );

    if (!target || target <= 0) return 0;
    return kcal / target;
  }

  function getHistoryStress(day) {
    return toNumber(day?.stressAvg, 0);
  }

  function getHistorySleepHours(day) {
    return getDaySleepHours(day);
  }

  function getRecentMean(historyDays, selector) {
    const values = (Array.isArray(historyDays) ? historyDays : [])
      .map(selector)
      .filter(value => Number.isFinite(value) && value > 0);

    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function getExpectedProteinCoverageByHour(hour) {
    const dailyCoverage = getExpectedDailyCoverageByHour(hour);
    return clamp(dailyCoverage - 0.08, 0.2, 1);
  }

  function getHistoryQualityBreakdown(historyDays, ctx = {}) {
    const days = Array.isArray(historyDays) ? historyDays : [];
    let daysWithEnergy = 0;
    let daysWithProtein = 0;
    let daysWithSleep = 0;
    let daysWithStress = 0;
    let completeDays = 0;

    days.forEach((day) => {
      const hasEnergy = getHistoryKcalRatio(day, ctx.kcalTarget) > 0
        || hasOwnValue(day?.dayTot, 'kcal')
        || hasOwnValue(day, 'kcal')
        || hasOwnValue(day, 'savedEatenKcal')
        || hasOwnValue(day, 'totKcal');
      const hasProtein = hasOwnValue(day?.dayTot, 'prot') || hasOwnValue(day, 'savedEatenProt');
      const hasSleep = getHistorySleepHours(day) > 0 || hasOwnValue(day, 'sleepHours');
      const hasStress = hasOwnValue(day, 'stressAvg');
      const signals = [hasEnergy, hasProtein, hasSleep, hasStress].filter(Boolean).length;

      if (hasEnergy) daysWithEnergy += 1;
      if (hasProtein) daysWithProtein += 1;
      if (hasSleep) daysWithSleep += 1;
      if (hasStress) daysWithStress += 1;
      if (signals >= 3) completeDays += 1;
    });

    const qualityRatio = days.length > 0 ? completeDays / days.length : 0;

    return {
      totalDays: days.length,
      completeDays,
      daysWithEnergy,
      daysWithProtein,
      daysWithSleep,
      daysWithStress,
      qualityRatio: Math.round(qualityRatio * 100) / 100,
    };
  }

  function mapStressBase(stressAvg) {
    if (stressAvg <= 2) return 5;
    if (stressAvg <= 4) return 20 + (stressAvg - 2) * 10;
    if (stressAvg <= 6) return 40 + (stressAvg - 4) * 15;
    if (stressAvg <= 8) return 70 + (stressAvg - 6) * 10;
    return 95;
  }

  function calcStressLoad(ctx) {
    const stressBase = clamp100(mapStressBase(ctx.stressAvg));
    const recentStressMean = getRecentMean(ctx.historyDays, getHistoryStress);
    const stressTrendBonus = recentStressMean >= 6.5 ? 15 : recentStressMean >= 5 ? 8 : 0;
    return clamp100(stressBase + stressTrendBonus);
  }

  function calcSleepDebt(ctx) {
    // If sleep is not logged today (0), use recent history average to avoid false-positive max debt
    let effectiveSleepHours = ctx.sleepHours;
    if (effectiveSleepHours === 0) {
      const historyAvg = getRecentMean(ctx.historyDays, getHistorySleepHours);
      if (historyAvg > 0) {
        effectiveSleepHours = historyAvg;
      } else {
        // No sleep data anywhere — can't assess, return neutral baseline
        return 20;
      }
    }
    const debt = Math.max(0, ctx.sleepNorm - effectiveSleepHours);
    const debtBase = clamp100(
      debt <= 0.5 ? 0
        : debt <= 1.0 ? 15
          : debt <= 2.0 ? 35 + (debt - 1) * 20
            : debt <= 3.0 ? 60 + (debt - 2) * 20
              : 90
    );

    const qualityPenalty = ctx.sleepQuality > 0 && ctx.sleepQuality <= 2 ? 20
      : ctx.sleepQuality > 0 && ctx.sleepQuality <= 3 ? 10
        : 0;

    const recentSleepDebtDays = ctx.historyDays.filter(day => {
      const hours = getHistorySleepHours(day);
      return hours > 0 && hours < ctx.sleepNorm - 1;
    }).length;

    const sleepStreakPenalty = recentSleepDebtDays >= 3 ? 15 : recentSleepDebtDays >= 2 ? 8 : 0;
    return clamp100(debtBase + qualityPenalty + sleepStreakPenalty);
  }

  function getRestrictionPressureBreakdown(ctx) {
    // If no food is logged at all today, we cannot infer restriction from today's data alone.
    // Skip today-data penalties and rely only on history and gap.
    const noFoodData = ctx.kcalEaten === 0 && ctx.meals.length === 0;
    const expectedCoverage = getExpectedDailyCoverageByHour(ctx.hour);
    const expectedProteinCoverage = getExpectedProteinCoverageByHour(ctx.hour);
    const coverageLag = Math.max(0, expectedCoverage - ctx.kcalPct);
    const proteinLag = Math.max(0, expectedProteinCoverage - ctx.protPct);
    const structuredDay = ctx.meals.length >= 3 && ctx.gapHours < 4;

    // Time-normalize: compare intake to expected progress for this hour.
    // At noon (expected ~33%), 35% eaten → pacing 1.06 → on track.
    // At 9 PM (expected ~93%), 40% eaten → pacing 0.43 → behind.
    // Skip normalization when expected < 20% (very early / midnight edge case).
    const kcalPacingRatio = expectedCoverage >= 0.20
      ? Math.min(ctx.kcalPct / expectedCoverage, 1.0) : ctx.kcalPct;
    const effectiveKcalPct = Math.max(ctx.kcalPct, kcalPacingRatio);
    const protPacingRatio = expectedProteinCoverage >= 0.20
      ? Math.min(ctx.protPct / expectedProteinCoverage, 1.0) : ctx.protPct;
    const effectiveProtPct = Math.max(ctx.protPct, protPacingRatio);

    const baseUndereating = noFoodData ? 0
      : effectiveKcalPct >= 0.9 ? 0
        : effectiveKcalPct >= 0.8 ? 10
          : effectiveKcalPct >= 0.7 ? 25
            : effectiveKcalPct >= 0.6 ? 45
              : effectiveKcalPct >= 0.5 ? 65
                : 85;

    // Evening bonus uses raw kcalPct — by evening, expected ≈ raw.
    const eveningUndereatingBonus = noFoodData ? 0
      : ctx.hour >= 18 && ctx.kcalPct < 0.7 ? 18
        : ctx.hour >= 17 && ctx.kcalPct < 0.5 ? 10
          : 0;

    const proteinPenalty = noFoodData ? 0
      : effectiveProtPct >= 0.9 ? 0
        : effectiveProtPct >= 0.75 ? 8
          : effectiveProtPct >= 0.6 ? 18
            : 30;

    const lateProteinPenalty = noFoodData ? 0
      : ctx.hour >= 19 && proteinLag > 0.22 ? 8
        : ctx.hour >= 17 && proteinLag > 0.3 ? 4
          : 0;

    // If the day is structured and current intake is close to what we'd expect by this hour,
    // soften the pressure a bit: the person still has time to catch up without true restriction.
    const progressAlignmentRelief = noFoodData ? 0
      : ctx.hour < 18 && structuredDay && coverageLag <= 0.18 ? 8
        : ctx.hour < 15 && ctx.meals.length >= 2 && ctx.gapHours < 4 && coverageLag <= 0.1 ? 5
          : 0;

    // Protein often catches up later in the day; don't max-penalize it too early if meals are regular.
    const proteinCatchupRelief = noFoodData ? 0
      : ctx.hour < 18 && structuredDay && proteinLag <= 0.14 ? 6
        : ctx.hour < 15 && ctx.meals.length >= 2 && ctx.protPct >= 0.4 ? 4
          : 0;

    // Exercise-driven deficit relief: caloric deficit from intentional exercise
    // is psychologically different from deficit via food restriction/avoidance.
    // An exerciser who burned 700 kcal is in a different mental state than someone
    // skipping meals. Cap at 6 to preserve physiological deficit warning.
    const exerciseDeficitRelief = noFoodData ? 0
      : ctx.trainingKcal >= 600 ? 6
        : ctx.trainingKcal >= 300 ? 4
          : ctx.trainingKcal >= 150 ? 2
            : 0;

    const controlledDeficitRelief = noFoodData ? 0
      : ctx.hour < 18 && structuredDay && ctx.dayScore >= 7 && ctx.stressAvg <= 2 && coverageLag <= 0.1 ? 4
        : 0;

    const chronicLowDays = ctx.historyDays.filter(day => {
      const ratio = getHistoryKcalRatio(day, ctx.kcalTarget);
      return ratio > 0 && ratio < 0.8;
    }).length;

    const chronicRestrictionBonus = chronicLowDays >= 5 ? 20 : chronicLowDays >= 3 ? 10 : 0;
    const longGapPenalty = ctx.gapHours >= 7 ? 18 : ctx.gapHours >= 5 ? 12 : 0;
    const controlledDeficit = !noFoodData
      && structuredDay
      && ctx.stressAvg <= 2
      && ctx.dayScore >= 7
      && coverageLag <= 0.18
      && proteinLag <= 0.16;
    const aggressiveCut = !noFoodData
      && (
        (effectiveKcalPct < 0.45 && proteinLag > 0.2)
        || chronicLowDays >= 5
        || (ctx.hour >= 18 && ctx.gapHours >= 5 && effectiveProtPct < 0.45)
      );
    const aggressiveCutBonus = aggressiveCut ? (ctx.hour >= 18 ? 8 : 4) : 0;
    const cutPattern = aggressiveCut
      ? 'aggressive_cut'
      : controlledDeficit
        ? 'controlled_deficit'
        : 'neutral';

    const score = clamp100(
      baseUndereating +
      eveningUndereatingBonus +
      proteinPenalty +
      lateProteinPenalty +
      chronicRestrictionBonus +
      aggressiveCutBonus +
      longGapPenalty -
      progressAlignmentRelief -
      proteinCatchupRelief -
      controlledDeficitRelief -
      exerciseDeficitRelief
    );

    return {
      noFoodData,
      structuredDay,
      cutPattern,
      expectedCoverage: Math.round(expectedCoverage * 100) / 100,
      expectedProteinCoverage: Math.round(expectedProteinCoverage * 100) / 100,
      coverageLag: Math.round(coverageLag * 100) / 100,
      proteinLag: Math.round(proteinLag * 100) / 100,
      chronicLowDays,
      baseUndereating,
      eveningUndereatingBonus,
      proteinPenalty,
      lateProteinPenalty,
      chronicRestrictionBonus,
      aggressiveCutBonus,
      longGapPenalty,
      progressAlignmentRelief,
      proteinCatchupRelief,
      controlledDeficitRelief,
      exerciseDeficitRelief,
      score,
    };
  }

  function calcRestrictionPressure(ctx) {
    return getRestrictionPressureBreakdown(ctx).score;
  }

  function calcRewardExposure(ctx) {
    const harmPenalty = ctx.harm <= 2 ? 0
      : ctx.harm <= 4 ? 10
        : ctx.harm <= 6 ? 25
          : ctx.harm <= 8 ? 45
            : 65;

    const simplePenalty = ctx.simple <= 25 ? 0
      : ctx.simple <= 40 ? 10
        : ctx.simple <= 60 ? 25
          : ctx.simple <= 90 ? 45
            : 60;

    const eveningRewardBonus = ctx.hour >= 21 && (ctx.simple >= 35 || ctx.harm >= 5) ? 20
      : ctx.hour >= 18 && (ctx.simple >= 50 || ctx.harm >= 6) ? 15
        : 0;

    const comboBonus = ctx.harm >= 5 && ctx.simple >= 45 ? 15 : 0;

    return clamp100(harmPenalty + simplePenalty + eveningRewardBonus + comboBonus);
  }

  function calcTimingContext(ctx) {
    const eveningPenalty = ctx.hour >= 22 ? 35
      : ctx.hour >= 20 ? 20
        : ctx.hour >= 18 ? 10
          : 0;

    const weekendPenalty = CONFIG.THRESHOLDS.weekendDays.includes(ctx.dayOfWeek) ? 10 : 0;
    const lateGapComboBonus = ctx.hour >= 18 && ctx.gapHours >= 5 ? 18 : 0;

    return clamp100(eveningPenalty + weekendPenalty + lateGapComboBonus);
  }

  function calcEmotionalVulnerability(ctx) {
    const dayScorePenalty = ctx.dayScore <= 0 ? 0
      : ctx.dayScore <= 3 ? 40
        : ctx.dayScore <= 5 ? 25
          : ctx.dayScore <= 7 ? 10
            : 0;

    const moodPenalty = ctx.moodAvg > 0 && ctx.moodAvg < 4 ? 18
      : ctx.moodAvg > 0 && ctx.moodAvg < 6 ? 8
        : 0;

    const wellbeingPenalty = ctx.wellbeingAvg > 0 && ctx.wellbeingAvg < 4 ? 18
      : ctx.wellbeingAvg > 0 && ctx.wellbeingAvg < 6 ? 8
        : 0;

    const mismatchBonus = ctx.stressAvg >= 6 && ctx.kcalPct < 0.7 ? 18
      : ctx.stressAvg >= 5 && ctx.dayScore > 0 && ctx.dayScore <= 5 ? 10
        : 0;

    return clamp100(dayScorePenalty + moodPenalty + wellbeingPenalty + mismatchBonus);
  }

  function calcProtectiveBuffer(ctx) {
    const bonuses = [];

    if (ctx.stressAvg > 0 && ctx.stressAvg <= CONFIG.THRESHOLDS.lowStress) {
      bonuses.push({ id: 'low_stress', label: 'Низкий стресс', impact: -8, explanation: 'Низкий стресс снижает риск эмоционального переедания.' });
    }
    if (ctx.sleepHours >= ctx.sleepNorm * 0.95) {
      bonuses.push({ id: 'good_sleep', label: 'Нормальный сон', impact: -8, explanation: 'Сон улучшает контроль аппетита и снижает тягу к reward-food.' });
    }
    if (ctx.hour >= 18 && ctx.kcalPct >= 0.8) {
      bonuses.push({ id: 'enough_calories', label: 'Достаточно энергии к вечеру', impact: -8, explanation: 'Когда к вечеру есть энергия, риск резкого срыва ниже.' });
    }
    if (ctx.protPct >= 0.9) {
      bonuses.push({ id: 'enough_protein', label: 'Нормальный белок', impact: -6, explanation: 'Белок поддерживает насыщение и уменьшает тягу к быстрым калориям.' });
    }
    if (ctx.meals.length >= CONFIG.THRESHOLDS.mealStructureCount) {
      bonuses.push({ id: 'meal_structure', label: 'Структурированные приёмы пищи', impact: -5, explanation: 'Регулярные приёмы пищи снижают вероятность компенсационного переедания.' });
    }
    if (ctx.waterMl >= CONFIG.THRESHOLDS.hydrationGoodMl) {
      bonuses.push({ id: 'hydration', label: 'Нормальная гидратация', impact: -4, explanation: 'Гидратация помогает лучше распознавать сигналы голода и сытости.' });
    }

    // Exercise momentum (positive behavioral cascade)
    // Science: self-efficacy boost (Bandura), acute appetite suppression
    // (ghrelin ↓ / PYY ↑), identity consistency, mood buffer.
    if (ctx.trainingKcal >= 600) {
      bonuses.push({ id: 'exercise_momentum', label: 'Сильная тренировка', impact: -7, explanation: 'Интенсивная тренировка повышает самоконтроль и снижает тягу к reward-food (positive behavioral cascade).' });
    } else if (ctx.trainingKcal >= 300) {
      bonuses.push({ id: 'exercise_momentum', label: 'Тренировка сегодня', impact: -5, explanation: 'Физическая активность повышает self-efficacy и снижает тягу к срыву.' });
    } else if (ctx.trainingKcal >= 150) {
      bonuses.push({ id: 'exercise_momentum', label: 'Лёгкая активность', impact: -3, explanation: 'Даже лёгкая активность поддерживает позитивный behavioral momentum.' });
    }

    const total = bonuses.reduce((sum, item) => sum + Math.abs(item.impact), 0);

    return {
      score: Math.min(CONFIG.THRESHOLDS.protectiveBufferCap, total),
      factors: bonuses,
    };
  }

  function composeWeightedRisk(components, ctx, profileConfig) {
    const weights = profileConfig?.weights || CONFIG.WEIGHTS;
    const weightedScore = (
      components.stressLoad * weights.stressLoad +
      components.sleepDebt * weights.sleepDebt +
      components.restrictionPressure * weights.restrictionPressure +
      components.rewardExposure * weights.rewardExposure +
      components.timingContext * weights.timingContext +
      components.emotionalVulnerability * weights.emotionalVulnerability
    );

    let score = clamp100(weightedScore - components.protectiveBuffer);

    // Subjective distress should not dominate the model,
    // but a very low emotional state should still surface at least a guarded baseline.
    if (components.emotionalVulnerability >= 70 && score < 22) {
      score = 22;
    }

    // Avoid a misleading absolute zero when meaningful active drivers are present,
    // especially in compensated evening / recovery scenarios.
    if (
      score < 6
      && components.sleepDebt >= 45
      && (
        components.timingContext >= 15
        || components.restrictionPressure >= 25
        || components.stressLoad >= 15
      )
    ) {
      score = 6;
    }

    if (ctx && ctx.hour >= 18 && components.restrictionPressure >= 70 && score < 30) {
      score = 30;
    }

    return score;
  }

  function calcRiskWindows(components) {
    const next3h = clamp100(
      components.stressLoad * CONFIG.WINDOWS.next3h.stressLoad +
      components.restrictionPressure * CONFIG.WINDOWS.next3h.restrictionPressure +
      components.rewardExposure * CONFIG.WINDOWS.next3h.rewardExposure +
      components.timingContext * CONFIG.WINDOWS.next3h.timingContext -
      components.protectiveBuffer * CONFIG.WINDOWS.next3h.protectiveBuffer
    );

    const tonight = clamp100(
      components.stressLoad * CONFIG.WINDOWS.tonight.stressLoad +
      components.sleepDebt * CONFIG.WINDOWS.tonight.sleepDebt +
      components.restrictionPressure * CONFIG.WINDOWS.tonight.restrictionPressure +
      components.rewardExposure * CONFIG.WINDOWS.tonight.rewardExposure +
      components.timingContext * CONFIG.WINDOWS.tonight.timingContext +
      components.emotionalVulnerability * CONFIG.WINDOWS.tonight.emotionalVulnerability -
      components.protectiveBuffer * CONFIG.WINDOWS.tonight.protectiveBuffer
    );

    const next24h = clamp100(
      components.stressLoad * CONFIG.WINDOWS.next24h.stressLoad +
      components.sleepDebt * CONFIG.WINDOWS.next24h.sleepDebt +
      components.restrictionPressure * CONFIG.WINDOWS.next24h.restrictionPressure +
      components.rewardExposure * CONFIG.WINDOWS.next24h.rewardExposure +
      components.timingContext * CONFIG.WINDOWS.next24h.timingContext +
      components.emotionalVulnerability * CONFIG.WINDOWS.next24h.emotionalVulnerability -
      components.protectiveBuffer * CONFIG.WINDOWS.next24h.protectiveBuffer
    );

    return { next3h, tonight, next24h };
  }

  function getConfidenceBreakdown(ctx) {
    let confidencePoints = 0;
    const historyQuality = getHistoryQualityBreakdown(ctx.historyDays, ctx);
    const signals = {
      stressInput: 0,
      sleepInput: 0,
      energyInput: 0,
      proteinInput: 0,
      mealStructureInput: 0,
      historyInput: 0,
      rewardInput: 0,
      subjectiveInput: 0,
    };

    if (ctx.hasStressInput) {
      signals.stressInput = 18;
      confidencePoints += signals.stressInput;
    }

    if (ctx.hasSleepInput) {
      signals.sleepInput = 18;
      confidencePoints += signals.sleepInput;
    } else if (getRecentMean(ctx.historyDays, getHistorySleepHours) > 0) {
      signals.sleepInput = 10;
      confidencePoints += signals.sleepInput;
    }

    if (ctx.hasKcalInput && ctx.kcalTarget > 0) {
      signals.energyInput = 18;
      confidencePoints += signals.energyInput;
    }

    if (ctx.hasProteinInput && ctx.protTarget > 0) {
      signals.proteinInput = 12;
      confidencePoints += signals.proteinInput;
    }

    if (ctx.meals.length > 0) {
      signals.mealStructureInput = 10;
      confidencePoints += signals.mealStructureInput;
    }

    if (historyQuality.completeDays >= 7 && historyQuality.qualityRatio >= 0.5) {
      signals.historyInput = 10;
      confidencePoints += signals.historyInput;
    } else if (historyQuality.completeDays >= 4 && historyQuality.qualityRatio >= 0.35) {
      signals.historyInput = 7;
      confidencePoints += signals.historyInput;
    } else if (historyQuality.completeDays >= CONFIG.THRESHOLDS.historyMinForTrend) {
      signals.historyInput = 4;
      confidencePoints += signals.historyInput;
    }

    if (ctx.hasRewardInput) {
      signals.rewardInput = 8;
      confidencePoints += signals.rewardInput;
    }

    if (ctx.hasSubjectiveInput) {
      signals.subjectiveInput = 6;
      confidencePoints += signals.subjectiveInput;
    }

    return {
      score: clamp100(confidencePoints),
      signals,
      historyQuality,
    };
  }

  function calcConfidence(ctx) {
    return getConfidenceBreakdown(ctx).score;
  }

  function getLevel(score) {
    if (score >= CONFIG.LEVELS.critical.min) return 'critical';
    if (score >= CONFIG.LEVELS.high.min) return 'high';
    if (score >= CONFIG.LEVELS.elevated.min) return 'elevated';
    if (score >= CONFIG.LEVELS.guarded.min) return 'guarded';
    return 'low';
  }

  function getComponentDrivers(components, profileConfig) {
    const weights = profileConfig?.weights || CONFIG.WEIGHTS;
    return [
      {
        id: 'stress_load',
        label: 'Стрессовая нагрузка',
        impact: Math.round(components.stressLoad * weights.stressLoad),
        direction: 'up',
        explanation: 'Высокий текущий или накопленный стресс усиливает риск эмоционального eating.',
      },
      {
        id: 'sleep_debt',
        label: 'Недосып',
        impact: Math.round(components.sleepDebt * weights.sleepDebt),
        direction: 'up',
        explanation: 'Недосып усиливает hunger drive и reward-seeking поведение.',
      },
      {
        id: 'restriction_pressure',
        label: 'Давление дефицита',
        impact: Math.round(components.restrictionPressure * weights.restrictionPressure),
        direction: 'up',
        explanation: 'Сильный недобор калорий и длинные окна без еды повышают риск компенсационного переедания.',
      },
      {
        id: 'reward_exposure',
        label: 'Reward-food exposure',
        impact: Math.round(components.rewardExposure * weights.rewardExposure),
        direction: 'up',
        explanation: 'Высокий harm/simple today повышает вероятность продолжения hyperpalatable eating.',
      },
      {
        id: 'timing_context',
        label: 'Контекст времени',
        impact: Math.round(components.timingContext * weights.timingContext),
        direction: 'up',
        explanation: 'Вечер, выходные и длинный gap усиливают уязвимость.',
      },
      {
        id: 'emotional_vulnerability',
        label: 'Эмоциональная уязвимость',
        impact: Math.round(components.emotionalVulnerability * weights.emotionalVulnerability),
        direction: 'up',
        explanation: 'Низкое субъективное состояние усиливает риск, но не должно доминировать над поведенческими факторами.',
      },
    ];
  }

  function extractPrimaryDrivers(components, profileConfig) {
    return getComponentDrivers(components, profileConfig)
      .filter(item => item.impact > 0)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);
  }

  function extractProtectiveFactors(protective) {
    return protective.factors.slice(0, 3);
  }

  function buildRecommendations(result) {
    const topDriver = result.primaryDrivers[0]?.id;
    const recommendations = [];

    if (topDriver === 'restriction_pressure') {
      recommendations.push({ id: 'safe_meal', text: 'Сейчас лучше сделать safe structured meal и не дожимать дефицит.', priority: 1, type: 'nutrition' });
      recommendations.push({ id: 'protein_first', text: 'Ставка на белок + клетчатку сначала, а не на быстрые калории.', priority: 2, type: 'nutrition' });
    }

    if (topDriver === 'stress_load') {
      recommendations.push({ id: 'stress_pause', text: 'Сделай короткую anti-stress паузу перед выбором еды.', priority: 1, type: 'regulation' });
      recommendations.push({ id: 'reduce_friction', text: 'Заранее выбери безопасный вариант еды, чтобы убрать импульсивность.', priority: 2, type: 'planning' });
    }

    if (topDriver === 'reward_exposure') {
      recommendations.push({ id: 'stop_escalation', text: 'Не продолжай цепочку reward-food: добавь нормальный приём пищи вместо сладкого доедания.', priority: 1, type: 'nutrition' });
    }

    if (topDriver === 'sleep_debt') {
      recommendations.push({ id: 'sleep_protect', text: 'Сегодня не стоит строить жёсткий дефицит — лучше уйти в recovery mode.', priority: 1, type: 'recovery' });
    }

    if (recommendations.length === 0) {
      recommendations.push({ id: 'steady', text: 'Риск невысокий: держи структуру питания и не создавай лишний дефицит к вечеру.', priority: 1, type: 'maintenance' });
    }

    return recommendations.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }

  function buildDebugPayload(ctx, components, windows, protectiveBuffer, extras = {}) {
    return {
      inputs: {
        stressAvg: ctx.stressAvg,
        sleepHours: ctx.sleepHours,
        sleepQuality: ctx.sleepQuality,
        kcalPct: Math.round(ctx.kcalPct * 100) / 100,
        protPct: Math.round(ctx.protPct * 100) / 100,
        harm: ctx.harm,
        simpleCarbs: ctx.simple,
        gapHours: ctx.gapHours,
        currentHour: ctx.hour,
        dayScore: ctx.dayScore,
        waterMl: ctx.waterMl,
        trainingKcal: ctx.trainingKcal,
        historyDaysCount: ctx.historyDays.length,
      },
      components,
      profile: extras.profile || null,
      confidenceSignals: extras.confidenceSignals || null,
      historyQuality: extras.historyQuality || null,
      restrictionPressure: extras.restrictionPressure || null,
      windows,
      protectiveFactors: protectiveBuffer.factors,
    };
  }

  function normalizeInputs(options = {}) {
    const dayData = options.dayData || {};
    const dayTot = options.dayTot || {};
    const normAbs = options.normAbs || {};
    const profile = options.profile || {};
    const historyDays = Array.isArray(options.historyDays) ? options.historyDays : [];
    const now = options.now;
    const meals = getMeals(dayData);

    const kcalTarget = getKcalTarget(normAbs, profile);
    const kcalEaten = getKcalEaten(dayTot, dayData);
    const protTarget = getProtTarget(normAbs, profile);
    const protEaten = getProtEaten(dayTot, dayData);
    const trainings = getTrainings(dayData);
    const weight = toNumber(dayData.weightMorning, toNumber(profile.weight, 70));
    const trainingKcal = calcTrainingKcal(trainings, weight);

    return {
      dayData,
      dayTot,
      normAbs,
      profile,
      historyDays,
      now,
      meals,
      trainings,
      trainingKcal,
      hasTrainingInput: trainings.length > 0,
      stressAvg: toNumber(dayData.stressAvg, 0),
      moodAvg: toNumber(dayData.moodAvg, 0),
      wellbeingAvg: toNumber(dayData.wellbeingAvg, 0),
      dayScore: toNumber(dayData.dayScore, 0),
      hasStressInput: hasOwnValue(dayData, 'stressAvg'),
      hasSubjectiveInput: hasOwnValue(dayData, 'dayScore') || hasOwnValue(dayData, 'moodAvg') || hasOwnValue(dayData, 'wellbeingAvg'),
      sleepHours: getDaySleepHours(dayData),
      sleepQuality: toNumber(dayData.sleepQuality, 0),
      hasSleepInput: getDaySleepHours(dayData) > 0 || hasOwnValue(dayData, 'sleepHours') || (typeof dayData.sleepStart === 'string' && typeof dayData.sleepEnd === 'string'),
      sleepNorm: Math.max(1, toNumber(profile.sleepHours, 8)),
      kcalTarget,
      kcalEaten,
      hasKcalInput: meals.length > 0 || hasOwnValue(dayTot, 'kcal') || hasOwnValue(dayData, 'savedEatenKcal') || hasOwnValue(dayData, 'totKcal'),
      kcalPct: kcalTarget > 0 ? kcalEaten / kcalTarget : 0,
      protTarget,
      protEaten,
      hasProteinInput: meals.length > 0 || hasOwnValue(dayTot, 'prot') || hasOwnValue(dayData, 'savedEatenProt'),
      protPct: protTarget > 0 ? protEaten / protTarget : 0,
      harm: Math.max(0, toNumber(dayTot.harm, 0)),
      simple: Math.max(0, toNumber(dayTot.simple, 0)),
      hasRewardInput: meals.length > 0 || hasOwnValue(dayTot, 'harm') || hasOwnValue(dayTot, 'simple'),
      waterMl: Math.max(0, toNumber(dayData.waterMl, 0)),
      gapHours: getHoursSinceLastMeal(dayData, now),
      hour: getCurrentHour(now),
      dayOfWeek: getCurrentDay(now),
    };
  }

  function calculate(options = {}) {
    const ctx = normalizeInputs(options);
    const profileConfig = getRiskProfileConfig(options.weightProfileKey || options.riskProfileKey || options.tuningProfile);

    console.info(MODULE + ' calculate:start', {
      profileKey: profileConfig.key,
      historyDays: ctx.historyDays.length,
      kcalPct: Math.round(ctx.kcalPct * 100),
      trainingKcal: ctx.trainingKcal,
      stressAvg: ctx.stressAvg,
      hour: ctx.hour,
    });

    const stressLoad = calcStressLoad(ctx);
    const sleepDebt = calcSleepDebt(ctx);
    const restrictionPressureState = getRestrictionPressureBreakdown(ctx);
    const restrictionPressure = restrictionPressureState.score;
    const rewardExposure = calcRewardExposure(ctx);
    const timingContext = calcTimingContext(ctx);
    const emotionalVulnerability = calcEmotionalVulnerability(ctx);
    const protectiveBufferState = calcProtectiveBuffer(ctx);
    const confidenceState = getConfidenceBreakdown(ctx);

    const components = {
      stressLoad,
      sleepDebt,
      restrictionPressure,
      rewardExposure,
      timingContext,
      emotionalVulnerability,
      protectiveBuffer: protectiveBufferState.score,
    };

    const score = composeWeightedRisk(components, ctx, profileConfig);
    const windows = calcRiskWindows(components);
    const confidence = confidenceState.score;
    const level = getLevel(score);
    const primaryDrivers = extractPrimaryDrivers(components, profileConfig);
    const protectiveFactors = extractProtectiveFactors(protectiveBufferState);

    const result = {
      profile: {
        key: profileConfig.key,
        label: profileConfig.label,
        description: profileConfig.description,
      },
      score,
      level,
      confidence,
      primaryDrivers,
      protectiveFactors,
      windows,
      recommendations: [],
      debug: buildDebugPayload(ctx, components, windows, protectiveBufferState, {
        confidenceSignals: confidenceState.signals,
        historyQuality: confidenceState.historyQuality,
        restrictionPressure: restrictionPressureState,
        profile: profileConfig,
      }),
    };

    result.recommendations = buildRecommendations(result);

    console.info(MODULE + ' calculate:result', {
      profileKey: profileConfig.key,
      score: result.score,
      level: result.level,
      tonight: result.windows.tonight,
      confidence: result.confidence,
    });

    return result;
  }

  function compareProfiles(options = {}) {
    const profileKeys = Array.isArray(options.profileKeys) && options.profileKeys.length
      ? options.profileKeys
      : Object.keys(CONFIG.PROFILES);
    const comparisons = profileKeys
      .map((profileKey) => {
        const result = calculate({ ...options, weightProfileKey: profileKey });
        return {
          profileKey,
          label: result?.profile?.label || profileKey,
          score: Math.round(toNumber(result?.score)),
          level: result?.level || 'low',
          confidence: Math.round(toNumber(result?.confidence)),
          topDriver: result?.primaryDrivers?.[0]?.id || null,
          result,
        };
      })
      .sort((a, b) => b.score - a.score);

    const baseline = comparisons.find((item) => item.profileKey === 'baseline') || comparisons[0] || null;

    return {
      defaultProfileKey: CONFIG.DEFAULT_PROFILE_KEY,
      selectedProfileKey: options.weightProfileKey || options.riskProfileKey || options.tuningProfile || CONFIG.DEFAULT_PROFILE_KEY,
      comparisons: comparisons.map((item) => ({
        profileKey: item.profileKey,
        label: item.label,
        score: item.score,
        level: item.level,
        confidence: item.confidence,
        topDriver: item.topDriver,
        deltaVsBaseline: baseline ? item.score - baseline.score : 0,
      })),
      baselineProfileKey: baseline?.profileKey || null,
    };
  }

  /**
   * forecast() — project RRS for a future date using history patterns.
   * Unlike calculate(), this does NOT use today's real-time data.
   * It builds a synthetic context from averaged history to estimate
   * what risk might look like on `targetDate`.
   *
   * Returns the same shape as calculate() plus { type: 'forecast' }.
   */
  function forecast(options = {}) {
    const profile = options.profile || {};
    const historyDays = Array.isArray(options.historyDays) ? options.historyDays : [];
    const targetDate = options.targetDate; // ISO string e.g. "2026-03-20"

    console.info(MODULE + ' forecast:start', {
      targetDate,
      historyDays: historyDays.length,
    });

    if (historyDays.length < 2) {
      console.info(MODULE + ' forecast:skip — not enough history');
      return {
        score: 0, level: 'low', confidence: 0, type: 'forecast',
        primaryDrivers: [], protectiveFactors: [],
        windows: { next3h: 0, tonight: 0, next24h: 0 },
        recommendations: [{ id: 'no_data', text: 'Недостаточно данных для прогноза.', priority: 1, type: 'info' }],
        debug: { forecastInputs: { historyDays: historyDays.length } },
      };
    }

    // Determine target day-of-week for weekend bonus
    const targetDow = targetDate
      ? new Date(targetDate + 'T12:00:00').getDay()
      : (new Date().getDay() + 1) % 7;

    // Build averaged "synthetic" inputs from recent history
    const recentN = Math.min(historyDays.length, 7);
    const recent = historyDays.slice(0, recentN);

    const avgStress = getRecentMean(recent, getHistoryStress);
    const avgSleep = getRecentMean(recent, getHistorySleepHours);
    const avgKcalRatio = getRecentMean(recent, (d) => getHistoryKcalRatio(d, toNumber(profile.optimum, 2000)));

    // Check for chronic deficit streak — strong predictor of tomorrow's risk
    const deficitDays = recent.filter(d => {
      const ratio = getHistoryKcalRatio(d, toNumber(profile.optimum, 2000));
      return ratio > 0 && ratio < 0.8;
    }).length;

    // Build synthetic context (mid-day projection, no real-time data)
    const sleepNorm = Math.max(1, toNumber(profile.sleepHours, 8));
    const syntheticCtx = {
      stressAvg: avgStress,
      moodAvg: 0,
      wellbeingAvg: 0,
      dayScore: 0,
      sleepHours: avgSleep,
      sleepQuality: 0,
      sleepNorm,
      kcalTarget: Math.max(1, toNumber(profile.optimum, 2000)),
      kcalEaten: 0,
      kcalPct: avgKcalRatio, // use history average as expected coverage
      protTarget: toNumber(profile.protTarget, 100),
      protEaten: 0,
      protPct: avgKcalRatio * 0.9, // rough proxy
      harm: 0,
      simple: 0,
      waterMl: 0,
      gapHours: 0,
      meals: [],
      hour: 14, // project at mid-afternoon — a neutral reference point
      dayOfWeek: targetDow,
      historyDays: historyDays,
      now: null,
      dayData: {},
      dayTot: {},
      normAbs: {},
      profile,
      hasStressInput: avgStress > 0,
      hasSleepInput: avgSleep > 0,
      hasKcalInput: avgKcalRatio > 0,
      hasProteinInput: false,
      hasRewardInput: false,
      hasSubjectiveInput: false,
      noFoodData: true,
    };

    // Compute components using the same functions as calculate()
    const stressLoad = calcStressLoad(syntheticCtx);
    const sleepDebt = calcSleepDebt(syntheticCtx);
    const restrictionPressure = (() => {
      // For forecast: use chronic deficit + history-based undereating as main signal
      const chronicBonus = deficitDays >= 5 ? 35 : deficitDays >= 3 ? 20 : deficitDays >= 2 ? 10 : 0;
      const avgUndereating = avgKcalRatio < 0.7 ? 30 : avgKcalRatio < 0.8 ? 15 : avgKcalRatio < 0.9 ? 5 : 0;
      return clamp100(chronicBonus + avgUndereating);
    })();
    const rewardExposure = calcRewardExposure(syntheticCtx); // usually low without today's data
    const timingContext = calcTimingContext(syntheticCtx);
    const emotionalVulnerability = calcEmotionalVulnerability(syntheticCtx);
    const protectiveBufferState = calcProtectiveBuffer(syntheticCtx);

    const components = {
      stressLoad,
      sleepDebt,
      restrictionPressure,
      rewardExposure,
      timingContext,
      emotionalVulnerability,
      protectiveBuffer: protectiveBufferState.score,
    };

    const profileConfig = getRiskProfileConfig(options.weightProfileKey || options.riskProfileKey || options.tuningProfile);
    const score = composeWeightedRisk(components, syntheticCtx, profileConfig);
    const windows = calcRiskWindows(components);
    const level = getLevel(score);
    const primaryDrivers = extractPrimaryDrivers(components, profileConfig);
    const protectiveFactors = extractProtectiveFactors(protectiveBufferState);

    // Confidence is inherently lower for forecasts
    const baseConfidence = historyDays.length >= 7 ? 55 : historyDays.length >= 4 ? 40 : 25;
    const confidence = Math.min(65, baseConfidence + (avgStress > 0 ? 5 : 0) + (avgSleep > 0 ? 5 : 0));

    const result = {
      score,
      level,
      confidence,
      profile: {
        key: profileConfig.key,
        label: profileConfig.label,
        description: profileConfig.description,
      },
      type: 'forecast',
      primaryDrivers,
      protectiveFactors,
      windows,
      recommendations: [],
      debug: {
        forecastInputs: {
          profileKey: profileConfig.key,
          avgStress: Math.round(avgStress * 10) / 10,
          avgSleep: Math.round(avgSleep * 10) / 10,
          avgKcalRatio: Math.round(avgKcalRatio * 100),
          deficitDays,
          targetDow,
          historyDays: historyDays.length,
        },
        components,
        protectiveFactors: protectiveBufferState.factors,
      },
    };

    result.recommendations = buildRecommendations(result);

    console.info(MODULE + ' forecast:result', {
      score: result.score,
      level: result.level,
      confidence: result.confidence,
      targetDate,
    });

    return result;
  }

  // ─── Shared data helpers (used by getCurrentSnapshot / getForecastSnapshot) ───

  // TTL cache for getCurrentSnapshot — ensures all consumers within the same
  // time window (widget tab → insights tab switch) see identical numbers.
  const SNAPSHOT_TTL_MS = 5000; // 5 seconds
  let _snapshotCache = null;
  let _snapshotCacheTs = 0;

  // Invalidate cache on data changes
  if (typeof window !== 'undefined') {
    ['heys:day-updated', 'day-updated', 'heys-sync-complete', 'day-saved'].forEach(function (evt) {
      window.addEventListener(evt, function () {
        _snapshotCache = null;
        _snapshotCacheTs = 0;
      });
    });
  }

  function resolveStorage() {
    const U = global.HEYS?.utils;
    return typeof U?.lsGet === 'function'
      ? U.lsGet.bind(U)
      : function (key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  }

  function collectHistoryDays(lsGet, daysBack) {
    const days = [];
    for (let i = 1; i <= daysBack; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = 'heys_dayv2_' + d.toISOString().split('T')[0];
      const day = lsGet(key, null);
      if (day && typeof day === 'object') days.push(day);
    }
    return days;
  }

  function getTopWindowLabel(windows) {
    const w = windows || {};
    const candidates = [
      { label: 'сегодня вечером', score: toNumber(w.tonight) },
      { label: 'в ближайшие 3ч', score: toNumber(w.next3h) },
      { label: 'в ближайшие 24ч', score: toNumber(w.next24h) },
    ].sort(function (a, b) { return b.score - a.score; });
    return candidates[0]?.label || 'сейчас';
  }

  /**
   * getCurrentSnapshot() — единый source of truth для текущего риска.
   * Собирает данные ровно так же, как виджет, вызывает calculate(),
   * и возвращает нормализованный snapshot-объект.
   * Потребители: виджет, Insights «Сейчас», модальное окно и т.д.
   */
  function getCurrentSnapshot(options = {}) {
    // Return cached result if fresh (< 5s) — guarantees identical numbers
    // across widget, Insights, and any other consumer within the same window.
    const now = Date.now();
    if (_snapshotCache && (now - _snapshotCacheTs) < SNAPSHOT_TTL_MS) {
      return _snapshotCache;
    }

    if (!HEYS.RelapseRisk?.calculate) {
      return { hasData: false, score: 0, level: 'low', message: 'Engine not loaded' };
    }
    const lsGet = resolveStorage();
    const todayStr = HEYS.dayUtils?.todayISO?.() || new Date().toISOString().split('T')[0];

    // dayData: prefer reactive source, fall back to localStorage
    const dayData = HEYS.DayData?.getCurrentDay?.() || lsGet('heys_dayv2_' + todayStr, {});

    const profile = lsGet('heys_profile', {});
    const pIndex = profile?.pIndex || 0;

    // dayTot: prefer reactive source, fall back to computed from dayData
    const dayTot = HEYS.DayData?.getDayTot?.(dayData)
      || (typeof HEYS.dayCalculations?.calculateDayTotals === 'function'
        ? HEYS.dayCalculations.calculateDayTotals(dayData)
        : {});

    // normAbs: prefer norms module, fall back to TDEE-based estimation
    let normAbs = HEYS.norms?.getNormAbs?.(profile, pIndex) || {};
    if ((!normAbs.kcal || normAbs.kcal <= 0) && typeof HEYS.TDEE?.calculate === 'function') {
      var tdee = HEYS.TDEE.calculate(profile);
      if (tdee && tdee.optimum > 0) {
        var weight = toNumber(profile.weight, toNumber(profile.baseWeight, 70));
        normAbs = { kcal: tdee.optimum, prot: Math.round(weight * 1.6) };
      }
    }

    const historyDays = collectHistoryDays(lsGet, 14);

    const selectedProfileKey = options.weightProfileKey || options.riskProfileKey || options.tuningProfile || null;

    const result = calculate({
      dayData, profile, dayTot, normAbs, historyDays,
      weightProfileKey: selectedProfileKey,
      now: new Date().toISOString(),
    });
    const compare = typeof HEYS.RelapseRisk?.compareProfiles === 'function'
      ? HEYS.RelapseRisk.compareProfiles({
        dayData, profile, dayTot, normAbs, historyDays,
        weightProfileKey: selectedProfileKey,
        now: new Date().toISOString(),
      })
      : null;

    const score = Math.round(toNumber(result?.score));
    const confidence = Math.round(toNumber(result?.confidence));
    const drivers = Array.isArray(result?.primaryDrivers) ? result.primaryDrivers : [];
    const protective = Array.isArray(result?.protectiveFactors) ? result.protectiveFactors : [];
    const recommendations = Array.isArray(result?.recommendations) ? result.recommendations : [];
    const windows = result?.windows || {};

    _snapshotCache = {
      hasData: true,
      type: 'realtime',
      profile: result?.profile || null,
      selectedProfileKey: result?.profile?.key || selectedProfileKey,
      score,
      level: result?.level || getLevel(score),
      confidence,
      windows,
      topWindowLabel: getTopWindowLabel(windows),
      topWindowScore: Math.round(Math.max(
        toNumber(windows.tonight), toNumber(windows.next3h), toNumber(windows.next24h)
      )),
      primaryDriver: drivers[0] || null,
      primaryDrivers: drivers.slice(0, 3),
      protectiveFactors: protective.slice(0, 3),
      recommendation: recommendations[0] || null,
      recommendations,
      compare,
      raw: result,
    };
    _snapshotCacheTs = now;
    return _snapshotCache;
  }

  /**
   * getForecastSnapshot(targetDate?) — прогноз на завтра (или указанную дату).
   * Вызывает forecast() с собранной историей.
   */
  function getForecastSnapshot(targetDate) {
    if (!forecast) {
      return { hasData: false, score: 0, level: 'low', type: 'forecast', message: 'Engine not loaded' };
    }
    const lsGet = resolveStorage();
    const profile = lsGet('heys_profile', {});
    const historyDays = collectHistoryDays(lsGet, 14);

    const targetOptions = typeof targetDate === 'object' && targetDate !== null ? targetDate : {};
    const resolvedTargetDate = typeof targetDate === 'string' ? targetDate : targetOptions.targetDate;

    const tomorrow = resolvedTargetDate || (function () {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const result = forecast({
      profile,
      historyDays,
      targetDate: tomorrow,
      weightProfileKey: targetOptions.weightProfileKey || targetOptions.riskProfileKey || targetOptions.tuningProfile,
    });
    if (!result) {
      return { hasData: false, score: 0, level: 'low', type: 'forecast' };
    }

    const score = Math.round(toNumber(result.score));
    const drivers = Array.isArray(result.primaryDrivers) ? result.primaryDrivers : [];
    const protective = Array.isArray(result.protectiveFactors) ? result.protectiveFactors : [];

    return {
      hasData: true,
      type: 'forecast',
      profile: result?.profile || null,
      score,
      level: result.level || getLevel(score),
      confidence: Math.round(toNumber(result.confidence)),
      windows: result.windows || {},
      primaryDriver: drivers[0] || null,
      primaryDrivers: drivers.slice(0, 3),
      protectiveFactors: protective.slice(0, 3),
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      raw: result,
    };
  }

  HEYS.RelapseRisk = {
    CONFIG,
    calculate,
    calculateRelapseRisk: calculate,
    compareProfiles,
    forecast,
    getCurrentSnapshot,
    getForecastSnapshot,
    invalidateSnapshot: function () { _snapshotCache = null; _snapshotCacheTs = 0; },
    getLevel,
    getRecommendations: buildRecommendations,
    getDrivers: extractPrimaryDrivers,
    __private: {
      normalizeInputs,
      getHoursSinceLastMeal,
      getHistoryKcalRatio,
      getRiskProfileConfig,
      getRestrictionPressureBreakdown,
      getHistoryQualityBreakdown,
      getExpectedProteinCoverageByHour,
      getConfidenceBreakdown,
      calcStressLoad,
      calcSleepDebt,
      calcRestrictionPressure,
      getExpectedDailyCoverageByHour,
      calcRewardExposure,
      calcTimingContext,
      calcEmotionalVulnerability,
      calcProtectiveBuffer,
      composeWeightedRisk,
      calcRiskWindows,
      calcConfidence,
    },
    VERSION: CONFIG.VERSION,
  };

  console.info(MODULE + ' module loaded', { version: CONFIG.VERSION });

  // Notify widgets to refresh their data now that the engine is available
  setTimeout(function () {
    if (typeof HEYS.Widgets?.emit === 'function') {
      HEYS.Widgets.emit('data:updated', { source: 'relapseRisk:ready' });
    } else if (typeof HEYS.events?.emit === 'function') {
      HEYS.events.emit('data:updated', { source: 'relapseRisk:ready' });
    }
  }, 0);

})(typeof window !== 'undefined' ? window : global);
