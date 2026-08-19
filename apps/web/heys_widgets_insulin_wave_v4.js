/**
 * heys_widgets_insulin_wave_v4.js
 * Данные и SVG-геометрия для 5 видов виджета «Инсулиновая волна» (канвас v4).
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  const DAY_START = 7 * 60 + 10;
  const DAY_END = 23 * 60;
  const DAY_SPAN = DAY_END - DAY_START;
  const SVG_W = 130;
  const BASELINE_Y = 46;

  function clampDayMin(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m)) return DAY_START;
    return Math.max(DAY_START, Math.min(DAY_END, m));
  }

  function minToX(minutes) {
    return ((clampDayMin(minutes) - DAY_START) / DAY_SPAN) * SVG_W;
  }

  function formatHmShort(minutes) {
    const total = Math.round(Number(minutes) || 0);
    const h = Math.floor(total / 60) % 24;
    const m = Math.abs(total % 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  function formatDurationHm(totalMin) {
    const total = Math.max(0, Math.round(Number(totalMin) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return String(m);
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  function formatDurationClock(totalMin) {
    const total = Math.max(0, Math.round(Number(totalMin) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return `${m} мин`;
    if (m === 0) return `${h}:${String(m).padStart(2, '0')}`;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  function mealCountLabel(n) {
    const count = Math.max(0, Math.round(Number(n) || 0));
    if (count === 1) return '1 приём';
    if (count >= 2 && count <= 4) return `${count} приёма`;
    return `${count} приёмов`;
  }

  function overlapCountLabel(n) {
    const count = Math.max(0, Math.round(Number(n) || 0));
    if (count === 0) return null;
    if (count === 1) return '1 волна слиплась';
    if (count >= 2 && count <= 4) return `${count} волны слиплись`;
    return `${count} волн слиплось`;
  }

  function bellPath(x0, x1, peakY = 28) {
    const left = Math.max(0, Math.min(SVG_W, x0));
    const right = Math.max(left + 8, Math.min(SVG_W, x1));
    const w = right - left;
    const mid = left + w / 2;
    const py = Math.max(8, Math.min(BASELINE_Y - 4, peakY));
    return [
      `M${left.toFixed(1)},${BASELINE_Y}`,
      `C${(left + w * 0.25).toFixed(1)},${BASELINE_Y}`,
      `${(left + w * 0.25).toFixed(1)},${py}`,
      `${mid.toFixed(1)},${py}`,
      `C${(left + w * 0.75).toFixed(1)},${py}`,
      `${(left + w * 0.75).toFixed(1)},${BASELINE_Y}`,
      `${right.toFixed(1)},${BASELINE_Y}`,
      'Z'
    ].join(' ');
  }

  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const sorted = intervals
      .map(([s, e]) => [clampDayMin(s), clampDayMin(e)])
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);
    if (!sorted.length) return [];
    const out = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const last = out[out.length - 1];
      if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else out.push(cur.slice());
    }
    return out;
  }

  function computeElevatedMinutes(intervals) {
    return mergeIntervals(intervals).reduce((sum, [s, e]) => sum + (e - s), 0);
  }

  function computeCalmWindow(history) {
    if (!Array.isArray(history) || !history.length) return DAY_SPAN;
    let maxGap = Math.max(0, history[0].startMin - DAY_START);
    for (let i = 0; i < history.length - 1; i++) {
      const gap = history[i + 1].startMin - history[i].endMin;
      if (gap > maxGap) maxGap = gap;
    }
    const last = history[history.length - 1];
    maxGap = Math.max(maxGap, DAY_END - last.endMin);
    return Math.max(0, maxGap);
  }

  function buildDayBarSegments(intervals, nowMin) {
    const merged = mergeIntervals(intervals);
    const segments = [];
    let cursor = DAY_START;
    const push = (from, to, elevated) => {
      if (to <= from) return;
      segments.push({ flex: to - from, elevated });
    };
    merged.forEach(([s, e]) => {
      push(cursor, s, false);
      push(s, e, true);
      cursor = Math.max(cursor, e);
    });
    push(cursor, DAY_END, false);
    return {
      segments,
      nowMin: clampDayMin(nowMin),
      dayStartLabel: formatHmShort(DAY_START),
      dayEndLabel: formatHmShort(DAY_END),
      nowLabel: 'сейчас'
    };
  }

  function findOverlapWaves(history, overlap) {
    if (!overlap || !history.length) return [];
    const fromKey = overlap.from || overlap.fromDisplay;
    const toKey = overlap.to || overlap.toDisplay;
    const matched = history.filter((w) => {
      const t = w.time || w.timeDisplay;
      return t === fromKey || t === toKey
        || w.timeDisplay === fromKey || w.timeDisplay === toKey;
    });
    if (matched.length >= 2) return matched.slice(0, 2);
    if (matched.length === 1 && history.length >= 2) {
      const idx = history.indexOf(matched[0]);
      return idx >= 0 ? history.slice(idx, idx + 2) : history.slice(-2);
    }
    return history.slice(-2);
  }

  function buildV4FromWave(wave, nowMinutes) {
    const history = Array.isArray(wave?.waveHistory) ? wave.waveHistory : [];
    const overlaps = Array.isArray(wave?.overlaps) ? wave.overlaps : [];
    const nowMin = Number.isFinite(Number(nowMinutes))
      ? Number(nowMinutes)
      : (new Date().getHours() * 60 + new Date().getMinutes());

    const intervals = history.map((w) => [w.startMin, w.endMin]);
    const elevatedMinutes = computeElevatedMinutes(intervals);
    const calmWindowMinutes = computeCalmWindow(history);
    const worst = wave?.worstOverlap || overlaps[0] || null;
    const overlapMinutes = Math.max(0, Math.round(Number(worst?.overlapMinutes) || 0));
    const overlapHoursLabel = overlapMinutes >= 60
      ? `${Math.floor(overlapMinutes / 60)} ч`
      : `${overlapMinutes} мин`;

    const activeWave = history.find((w) => w.isActive)
      || (wave?.status === 'settling' ? history[history.length - 1] : null)
      || null;

    const mealName = (activeWave?.mealName || 'приём').toLowerCase();
    const currentMealMeta = activeWave
      ? `${mealName} ${activeWave.timeDisplay || activeWave.time || ''}`.trim()
      : (wave?.lastMealTimeDisplay || '');

    const dayWaves = history.map((w) => ({
      id: w.id,
      pathD: bellPath(minToX(w.startMin), minToX(w.endMin), w.isActive ? 16 : 28),
      isActive: !!w.isActive
    }));

    const overlapPair = findOverlapWaves(history, worst);

    let overlapSpan = null;
    if (overlapPair.length >= 2) {
      const overlapStart = Math.max(overlapPair[0].startMin, overlapPair[1].startMin);
      const overlapEnd = Math.min(overlapPair[0].endMin, overlapPair[1].endMin);
      if (overlapEnd > overlapStart) {
        overlapSpan = {
          x0: minToX(overlapStart),
          x1: minToX(overlapEnd)
        };
      }
    }

    const overlapPairPaths = overlapPair.map((w) => ({
      id: w.id,
      pathD: bellPath(minToX(w.startMin), minToX(w.endMin), 20)
    }));

    return {
      mealCount: history.length,
      mealCountLabel: mealCountLabel(history.length),
      overlapCount: overlaps.length,
      overlapCountLabel: overlapCountLabel(overlaps.length),
      elevatedMinutes,
      elevatedLabel: formatDurationClock(elevatedMinutes),
      elevatedMeta: `${formatDurationClock(elevatedMinutes)} из ${formatDurationClock(DAY_SPAN)}`,
      calmWindowMinutes,
      calmWindowLabel: formatDurationHm(calmWindowMinutes),
      overlapMinutes,
      overlapHoursLabel,
      overlapTimeLabel: worst?.toDisplay || worst?.to || '',
      currentMealMeta,
      nowX: minToX(nowMin),
      dayWaves,
      dayBar: buildDayBarSegments(intervals, nowMin),
      activeWavePath: activeWave
        ? bellPath(minToX(activeWave.startMin), minToX(activeWave.endMin), 16)
        : (dayWaves.length ? dayWaves[dayWaves.length - 1].pathD : null),
      activeNowX: minToX(nowMin),
      activePeakY: 16,
      overlapPair: overlapPairPaths,
      overlapSpan
    };
  }

  HEYS.Widgets.InsulinWaveV4 = {
    DAY_START,
    DAY_END,
    SVG_W,
    BASELINE_Y,
    buildV4FromWave,
    bellPath,
    minToX,
    formatDurationClock,
    formatDurationHm,
    mealCountLabel,
    overlapCountLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
