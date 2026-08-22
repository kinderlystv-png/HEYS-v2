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
    // Пустой день говорит словами, а не нулём (строка «волна · день без приёмов»).
    if (count === 0) return 'приёмов не было';
    if (count === 1) return '1 приём';
    if (count >= 2 && count <= 4) return `${count} приёма`;
    return `${count} приёмов`;
  }

  /** «1 стык» · «2 стыка» · «5 стыков» — счётчик справа в схеме 27. */
  function jointCountLabel(n) {
    const count = Math.max(0, Math.round(Number(n) || 0));
    if (!count) return null;
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 > 10 && mod100 < 20) return `${count} стыков`;
    if (mod10 === 1) return `${count} стык`;
    if (mod10 >= 2 && mod10 <= 4) return `${count} стыка`;
    return `${count} стыков`;
  }

  function overlapCountLabel(n) {
    const count = Math.max(0, Math.round(Number(n) || 0));
    if (count === 0) return null;
    // Подпись нахлёста называет факт, а не оценку (строка «волна · стык и
    // нахлёст»): «N волн наложились».
    if (count === 1) return '1 волна наложилась';
    if (count >= 2 && count <= 4) return `${count} волны наложились`;
    return `${count} волн наложились`;
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

  // ─── Схема волн 2×2 — раздел контракта «Инсулиновая волна» (22 августа) ──
  //
  // Волны стоят вплотную одна за другой в порядке приёмов и равной ширины: это
  // схема, а не таймлайн. Оси времени, пустых промежутков и метки «сейчас» тут
  // нет — их показывает вид «Полоса дня». Полоса 122 px делится на число волн;
  // слипшаяся фигура занимает столько слотов, сколько в ней волн.
  const SCHEME_X0 = 4;
  const SCHEME_X1 = 126;
  const SCHEME_SPAN = SCHEME_X1 - SCHEME_X0;
  // Больше восьми приёмов — рисуем восемь последних, счётчик остаётся полным.
  const SCHEME_MAX_FIGURES = 8;
  const SCHEME_MIN_SLOT = 12;
  // Амплитуда закрытой волны одинакова у всех: величины, от которой она могла
  // бы зависеть, контракт не называет, а разная высота вершин в кадре — рисунок.
  const SCHEME_PEAK_AMP = 24;
  // Провал между волнами одной фигуры — доля высоты соседней волны.
  const SCHEME_DIP_JOINT = 0.42;   // стык: началась ровно на конце предыдущей
  const SCHEME_DIP_OVERLAP = 0.68; // нахлёст: началась до конца предыдущей
  // Кривая: край↔вершина симметрично, вершина↔провал — несимметрично.
  const CP_EDGE = 0.557;
  const CP_PEAK = 0.6;
  const CP_DIP = 0.36;
  // Ширина полосы нахлёста и скобы под ней.
  const OVERLAP_BAND = 0.9;

  /**
   * Волны группируются в фигуры: подряд идущие склеиваются, если промежутка
   * между ними нет. Ноль — стык, отрицательный зазор — нахлёст.
   */
  function groupWavesIntoFigures(waves) {
    const list = Array.isArray(waves) ? waves : [];
    const figures = [];
    list.forEach((wave, index) => {
      const prev = index > 0 ? list[index - 1] : null;
      const gap = prev ? Number(wave.startMin) - Number(prev.endMin) : null;
      if (!figures.length || gap === null || !(gap <= 0)) {
        figures.push({ waves: [wave], links: [] });
        return;
      }
      const figure = figures[figures.length - 1];
      figure.waves.push(wave);
      figure.links.push(gap < 0 ? 'overlap' : 'joint');
    });
    return figures;
  }

  function cubic(x1, y1, x2, y2, x, y) {
    return `C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }

  /**
   * Путь фигуры: край → вершина (→ провал → вершина)* → край. Вершины стоят по
   * центрам своих слотов, поэтому фигура из двух волн имеет две вершины.
   */
  function figurePath(x0, slot, links, amp = SCHEME_PEAK_AMP) {
    const count = links.length + 1;
    const peakY = BASELINE_Y - amp;
    const half = slot / 2;
    const peakX = (i) => x0 + (i + 0.5) * slot;
    const parts = [`M${x0.toFixed(1)},${BASELINE_Y}`];

    parts.push(cubic(
      x0 + half * CP_EDGE, BASELINE_Y,
      peakX(0) - half * CP_EDGE, peakY,
      peakX(0), peakY
    ));

    for (let i = 1; i < count; i += 1) {
      const dipX = x0 + i * slot;
      const dipY = BASELINE_Y - amp * (links[i - 1] === 'overlap' ? SCHEME_DIP_OVERLAP : SCHEME_DIP_JOINT);
      const prevPeak = peakX(i - 1);
      const nextPeak = peakX(i);
      parts.push(cubic(
        prevPeak + half * CP_PEAK, peakY,
        dipX - half * CP_DIP, dipY,
        dipX, dipY
      ));
      parts.push(cubic(
        dipX + half * CP_DIP, dipY,
        nextPeak - half * CP_PEAK, peakY,
        nextPeak, peakY
      ));
    }

    const lastPeak = peakX(count - 1);
    const right = x0 + count * slot;
    parts.push(cubic(
      lastPeak + half * CP_EDGE, peakY,
      right - half * CP_EDGE, BASELINE_Y,
      right, BASELINE_Y
    ));
    parts.push('Z');
    return parts.join(' ');
  }

  /**
   * Схема дня: фигуры, риски-разделители, точки стыков и полосы нахлёстов.
   * Возвращает всё, что нужно отрисовать, — SVG собирает UI.
   */
  function buildWaveScheme(waves) {
    const all = Array.isArray(waves) ? waves : [];
    // Счётчик приёмов остаётся полным, даже когда фигур меньше.
    const shown = all.length > SCHEME_MAX_FIGURES ? all.slice(-SCHEME_MAX_FIGURES) : all;
    if (!shown.length) {
      return { figures: [], dividers: [], joints: [], overlaps: [], slot: 0, shownCount: 0 };
    }

    const slot = Math.max(SCHEME_MIN_SLOT, SCHEME_SPAN / shown.length);
    const groups = groupWavesIntoFigures(shown);
    const figures = [];
    const dividers = [];
    const joints = [];
    const overlaps = [];

    let index = 0;
    groups.forEach((group, groupIndex) => {
      const x0 = SCHEME_X0 + index * slot;
      const count = group.waves.length;
      const isCurrent = group.waves.some((wave) => wave.isActive);

      figures.push({
        id: group.waves[0]?.id || `fig_${groupIndex}`,
        d: figurePath(x0, slot, group.links),
        // Незакрытая волна заливается плотнее закрытых.
        opacity: isCurrent ? 0.8 : 0.45,
        isCurrent
      });

      group.links.forEach((link, i) => {
        const dipX = x0 + (i + 1) * slot;
        const dipY = BASELINE_Y - SCHEME_PEAK_AMP * (link === 'overlap' ? SCHEME_DIP_OVERLAP : SCHEME_DIP_JOINT);
        if (link === 'overlap') {
          const band = slot * OVERLAP_BAND;
          overlaps.push({
            clipId: `wov_${groupIndex}_${i}`,
            figureD: figures[figures.length - 1].d,
            x: dipX - band / 2,
            width: band,
            braceY: BASELINE_Y + 3
          });
        } else {
          // Стык подписи не имеет — только точка в провале.
          joints.push({ x: dipX, y: dipY });
        }
      });

      index += count;
      if (groupIndex < groups.length - 1) {
        // Риска по базовой линии: она разделяет фигуры и позволяет их считать.
        dividers.push(SCHEME_X0 + index * slot);
      }
    });

    return {
      figures,
      dividers,
      joints,
      overlaps,
      slot,
      shownCount: shown.length,
      overlapCount: overlaps.length,
      jointCount: joints.length
    };
  }

  // Виды «Текущая волна» и «Пересечения»: волна занимает всю высоту рисунка,
  // края у самого края плитки, вершина в 4–10 px от верха. Линии основания
  // здесь нет, поэтому нужен ещё и незамкнутый контур — только по кривой.
  const FULL_PEAK_Y = 7;

  function fullWavePath(peakY = FULL_PEAK_Y) {
    return bellPath(0, SVG_W, peakY);
  }

  /** Тот же силуэт без замыкания: обводка не идёт по низу. */
  function openWavePath(peakY = FULL_PEAK_Y) {
    return bellPath(0, SVG_W, peakY).replace(/s*Z$/, '');
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

    // В виде 29 две волны рисуются со сдвигом друг относительно друга, но
    // тоже во всю высоту: ось времени здесь не показывается.
    const overlapPairPaths = overlapPair.map((w, i) => ({
      id: w.id,
      pathD: bellPath(i === 0 ? 0 : SVG_W * 0.28, i === 0 ? SVG_W * 0.72 : SVG_W, FULL_PEAK_Y + i * 3),
      openD: bellPath(i === 0 ? 0 : SVG_W * 0.28, i === 0 ? SVG_W * 0.72 : SVG_W, FULL_PEAK_Y + i * 3).replace(/s*Z$/, '')
    }));

    // День без приёмов: силуэт не рисуется, счётчик и строка говорят прямо.
    // Данные прошлого дня не подставляются никуда.
    const hasMeals = history.length > 0;
    const scheme = buildWaveScheme(history);
    // Текущая волна — незакрытая: строка снизу называет время её конца.
    // Все закрыты — вместо неё покой.
    const currentWave = history.find((w) => w.isActive) || null;
    const underWaveLabel = currentWave
      ? `под волной ${formatHmShort(currentWave.endMin)}`
      : (hasMeals ? `покой ${formatDurationHm(calmWindowMinutes)}` : null);
    const emptyStateLabel = hasMeals
      ? null
      : `покой ${Math.max(0, Math.round((nowMin - DAY_START) / 60))} ч от подъёма`;

    return {
      hasMeals,
      scheme,
      // Кадр «Волна · стык и нахлёст»: справа стоит счётчик стыков, когда они
      // есть; иначе там строка состояния.
      jointCountLabel: jointCountLabel(scheme.jointCount),
      underWaveLabel,
      emptyStateLabel,
      // Счётчик считается по приёмам открытого дня и остаётся полным, даже
      // когда фигур на схеме меньше (строка «волна · сколько фигур»).
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
      // Силуэт вида 28 не привязан к оси времени: он занимает всю ширину.
      activeWavePath: hasMeals ? fullWavePath() : null,
      activeWaveOpenPath: hasMeals ? openWavePath() : null,
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
    buildWaveScheme,
    fullWavePath,
    openWavePath,
    groupWavesIntoFigures,
    figurePath,
    bellPath,
    minToX,
    formatDurationClock,
    formatDurationHm,
    mealCountLabel,
    jointCountLabel,
    overlapCountLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
