/**
 * heys_sync_merge_v1.js — Pure merge logic for HEYS day/scalar KV blobs.
 *
 * Used by:
 *   - Browser: HEYS.sync.mergeDayData (called from bootstrapClientSync during
 *     cloud→local pull and from save-time routing).
 *   - Server: yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.js
 *     (same file copied at deploy time; merges incoming with current cloud
 *     version inside a Postgres transaction).
 *
 * Pure functions — no side effects on window/global. Optional helpers passed
 * via options (logFn, hashFn, workoutLogHasTrackableContent).
 *
 * UMD wrapper so the same file works as <script> (registers HEYS.sync) and
 * as `require('./heys_sync_merge_v1.js')` from Node.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const api = factory();
    root.HEYS = root.HEYS || {};
    root.HEYS.sync = Object.assign(root.HEYS.sync || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Independent user-edit domains inside dayv2. Root day.updatedAt is also
  // advanced by background reconcile/autosave writes, so it cannot decide
  // whether a clear/decrease/toggle is newer than the value on another device.
  const DAY_USER_MUTATION_GROUPS = [
    { timestamp: 'stepsUpdatedAt', fields: ['steps'] },
    // waterEntries едет в группе вместе с waterMl, чтобы производное число и
    // журнал не разъезжались на откате guardExplicitMutationGroups. В самом
    // mergeDayData журнал сливается по id уже ПОСЛЕ этой группы и её результат
    // для воды перекрывает (см. mergeWaterJournal).
    { timestamp: 'waterUpdatedAt', fields: ['waterMl', 'lastWaterTime', 'waterEntries'] },
    { timestamp: 'weightUpdatedAt', fields: ['weightMorning'] },
    { timestamp: 'householdUpdatedAt', fields: ['householdActivities', 'householdMin', 'householdTime'] },
    { timestamp: 'cycleUpdatedAt', fields: ['cycleDay', 'cycleStatus', 'cycleAnsweredAt'] },
    { timestamp: 'sleepNoteUpdatedAt', fields: ['sleepNote'] },
    { timestamp: 'dayCommentUpdatedAt', fields: ['dayComment'] },
    { timestamp: 'dayScoreUpdatedAt', fields: ['dayScore', 'dayScoreManual'] },
    { timestamp: 'supplementsPlannedUpdatedAt', fields: ['supplementsPlanned'] },
    { timestamp: 'supplementsTakenUpdatedAt', fields: ['supplementsTaken', 'supplementsTakenAt', 'supplementsTakenMeta'] },
    { timestamp: 'deficitUpdatedAt', fields: ['deficitPct'] },
    { timestamp: 'dayStatusUpdatedAt', fields: ['isFastingDay', 'isIncomplete'] },
  ];

  function copyOwnFields(target, source, fields) {
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(source, field)) target[field] = source[field];
      else delete target[field];
    }
  }

  function applyExplicitMutationGroups(merged, local, remote) {
    for (const group of DAY_USER_MUTATION_GROUPS) {
      const localTs = Number(local[group.timestamp]) || 0;
      const remoteTs = Number(remote[group.timestamp]) || 0;
      if (localTs === 0 && remoteTs === 0) continue;
      if (localTs !== remoteTs) {
        copyOwnFields(merged, localTs > remoteTs ? local : remote, group.fields);
      }
      merged[group.timestamp] = Math.max(localTs, remoteTs);
    }
    return merged;
  }

  function guardExplicitMutationGroups(prevDay, nextDay) {
    const result = { ...nextDay };
    for (const group of DAY_USER_MUTATION_GROUPS) {
      const prevTs = Number(prevDay[group.timestamp]) || 0;
      const nextTs = Number(nextDay[group.timestamp]) || 0;
      if (prevTs > 0 && nextTs <= prevTs) {
        copyOwnFields(result, prevDay, group.fields);
        result[group.timestamp] = prevTs;
      }
    }
    return result;
  }

  // ─── Журнал воды (waterEntries) ──────────────────────────────────────────
  //
  // Контракт water-add.v4: «глоток пишет объём в миллилитрах и время в
  // waterEntries дня; сумма за день считается из записей». Журнал сливается по
  // id — так же, как приёмы еды, — поэтому глотки с двух устройств
  // складываются, а не берётся максимум двух чисел.
  //
  // day.waterMl остаётся производным полем: его продолжают читать десятки
  // потребителей (виджеты, инсайты, разбор, sparkline), и он всегда равен
  // сумме журнала после любой записи или слияния.
  //
  // Форма записи: { id, ml, ts } — ml < 0 у убавления. Отступление от строки
  // контракта «убавление удаляет последнюю запись, а не пишет отрицательную»
  // названо вслух: физическое удаление записи нельзя отличить при слиянии от
  // «её просто нет на этом устройстве», а на старом дне (одно число, журнала
  // нет) удалять нечего вовсе. Отрицательная запись аддитивна, поэтому слияние
  // по id остаётся независимым от порядка, и убавление не может пропасть.
  const WATER_SEED_ID = 'w-seed';

  function readWaterEntries(day) {
    const list = day && Array.isArray(day.waterEntries) ? day.waterEntries : [];
    return list.filter((e) => e && typeof e === 'object' && e.id != null && Number.isFinite(Number(e.ml)));
  }

  function sumWaterEntries(entries) {
    return (entries || []).reduce((sum, e) => sum + (Number(e && e.ml) || 0), 0);
  }

  // Материализует непрослеженный журналом остаток дня в одну seed-запись.
  // Это единственный мост к старым дням (waterMl без журнала) и к записям мимо
  // журнала (плитка Главной пишет waterMl напрямую). Запись помечена
  // kind:'legacy' и её ts может быть 0: время этой воды нам неизвестно, и
  // выдавать её за глоток в почасовом разборе нельзя.
  // Отсутствие журнала — незнание, а не «воды не было»: seed сохраняет число.
  function normalizeWaterEntries(day) {
    const entries = readWaterEntries(day);
    const tracked = sumWaterEntries(entries);
    const total = Math.max(0, Number(day && day.waterMl) || 0);
    const untracked = total - tracked;
    if (untracked <= 0) return entries.slice();
    const out = entries.slice();
    const seedIndex = out.findIndex((e) => e.id === WATER_SEED_ID);
    if (seedIndex >= 0) {
      out[seedIndex] = { ...out[seedIndex], ml: (Number(out[seedIndex].ml) || 0) + untracked };
    } else {
      out.unshift({
        id: WATER_SEED_ID,
        ml: untracked,
        ts: Number(day && day.lastWaterTime) || 0,
        kind: 'legacy',
      });
    }
    return out;
  }

  function resolveWaterMl(day) {
    return Math.max(0, sumWaterEntries(normalizeWaterEntries(day)));
  }

  // Добавляет запись в журнал дня и возвращает новое состояние воды.
  // Убавление ограничено текущей суммой: журнал не уходит в минус.
  function appendWaterEntry(day, ml, options) {
    const opts = options || {};
    const entries = normalizeWaterEntries(day);
    const base = Math.max(0, sumWaterEntries(entries));
    const delta = Number(ml) || 0;
    const applied = delta < 0 ? -Math.min(-delta, base) : delta;
    const ts = Number(opts.ts) || Date.now();
    const id = opts.id || ('w-' + ts.toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    return {
      waterEntries: applied === 0 ? entries : entries.concat([{ id: id, ml: applied, ts: ts }]),
      waterMl: Math.max(0, base + applied),
      appliedMl: applied,
      entryId: applied === 0 ? null : id,
    };
  }

  // Слияние двух журналов: объединение по id, ничего не удаляется.
  // Отсутствие записи на второй стороне не считается удалением — удаление
  // выражено отдельной отрицательной записью, у которой свой id.
  // Исключение — seed непрослеженного остатка: он у каждой стороны свой и
  // описывает одну и ту же воду, поэтому берётся больший. Это ровно прежнее
  // поведение max() для доджурнальных дней, то есть без регрессии.
  function mergeWaterJournal(local, remote) {
    const map = new Map();
    normalizeWaterEntries(remote).forEach((e) => map.set(e.id, e));
    normalizeWaterEntries(local).forEach((e) => {
      const existing = map.get(e.id);
      if (!existing) {
        map.set(e.id, e);
        return;
      }
      if (e.id === WATER_SEED_ID) {
        map.set(e.id, (Number(e.ml) || 0) >= (Number(existing.ml) || 0) ? e : existing);
      }
      // Обычная запись журнала неизменяема: тот же id — та же запись.
    });
    const waterEntries = Array.from(map.values())
      .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    return { waterEntries: waterEntries, waterMl: Math.max(0, sumWaterEntries(waterEntries)) };
  }

  // ─── mergeItemsById ──────────────────────────────────────────────────────
  function mergeItemsById(remoteItems = [], localItems = [], preferLocal = true, deletedItemIdsMap = null) {
    // Tombstone filter: item.updatedAt <= tombstone.ts → item is considered deleted.
    // Edit fresher than tombstone overrides deletion (item resurrected as new edit).
    const isTombstoned = (item) => {
      if (!deletedItemIdsMap || !item || item.id == null) return false;
      const tombstoneTs = Number(deletedItemIdsMap[item.id]) || 0;
      if (tombstoneTs <= 0) return false;
      const itemTs = Number(item.updatedAt) || 0;
      return tombstoneTs >= itemTs;
    };

    if (!preferLocal) {
      // preferRemote: only remote items survive — required for cross-device deletions on pull-refresh
      return remoteItems.filter((item) => item && item.id && !isTombstoned(item));
    }
    const itemsMap = new Map();
    remoteItems.forEach((item) => {
      if (!item || !item.id) return;
      if (isTombstoned(item)) return;
      itemsMap.set(item.id, item);
    });
    localItems.forEach((item) => {
      if (!item || !item.id) return;
      if (isTombstoned(item)) {
        itemsMap.delete(item.id);
        return;
      }
      const existing = itemsMap.get(item.id);
      if (!existing) {
        itemsMap.set(item.id, item);
        return;
      }
      const localTs = Number(item.updatedAt) || 0;
      const remoteTs = Number(existing.updatedAt) || 0;
      // Item-level timestamp is the only reliable signal for same-product edits
      // such as grams. Legacy rows without item.updatedAt keep the old
      // preferLocal behavior for backward compatibility.
      if (localTs > 0 || remoteTs > 0) {
        itemsMap.set(item.id, localTs >= remoteTs ? item : existing);
      } else {
        itemsMap.set(item.id, item);
      }
    });
    return Array.from(itemsMap.values());
  }

  // ─── unionMaxTimestamp ────────────────────────────────────────────────
  // Merge two { id: timestamp } maps, keeping max timestamp per id.
  // Used for meal tombstones (deletedMealIds) — both sides may have
  // independent deletion records; merge keeps the latest deletion per id.
  function unionMaxTimestamp(localMap, remoteMap) {
    const out = { ...(remoteMap || {}) };
    if (localMap) {
      for (const id of Object.keys(localMap)) {
        out[id] = Math.max(out[id] || 0, localMap[id] || 0);
      }
    }
    return out;
  }

  // Merge two { field: { at, value } } maps of curator authorship marks,
  // keeping the later mark per field. Marks carry the value the curator wrote,
  // so they expire on their own once the client overwrites the field — no
  // tombstone is needed (and none would survive a union anyway).
  function unionCuratorEdits(localMap, remoteMap) {
    const out = { ...(remoteMap || {}) };
    if (localMap) {
      for (const field of Object.keys(localMap)) {
        const mine = localMap[field];
        const theirs = out[field];
        if (!theirs || (mine && (mine.at || 0) >= (theirs.at || 0))) out[field] = mine;
      }
    }
    return out;
  }

  function trainingDeletionSignature(training) {
    if (!training || typeof training !== 'object') return '';
    const id = training.id == null ? '' : String(training.id).trim();
    if (id) return 'id:' + id;
    const identity = [
      training.type,
      training.activityLabel,
      training.source,
      training.time,
      training.hobbySubtype,
    ].map((value) => String(value == null ? '' : value).trim().toLowerCase());
    if (identity.some(Boolean)) return 'fields:' + identity.join('|');
    const zones = Array.isArray(training.z) ? training.z.map((value) => Number(value) || 0) : [];
    return zones.some((value) => value > 0) ? 'zones:' + zones.join('|') : '';
  }

  function mergeTrainingTombstones(localList, remoteList) {
    const byId = new Map();
    const add = (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const deletedAt = Number(raw.deletedAt) || 0;
      const signature = String(raw.signature || '').trim();
      if (!deletedAt || !signature) return;
      const tombstoneId = String(raw.tombstoneId || (signature + ':' + deletedAt));
      const previous = byId.get(tombstoneId);
      if (!previous || deletedAt >= (Number(previous.deletedAt) || 0)) {
        byId.set(tombstoneId, {
          tombstoneId,
          signature,
          deletedAt,
          index: Number.isInteger(raw.index) ? raw.index : undefined,
        });
      }
    };
    (Array.isArray(remoteList) ? remoteList : []).forEach(add);
    (Array.isArray(localList) ? localList : []).forEach(add);
    return Array.from(byId.values())
      .sort((left, right) => (Number(right.deletedAt) || 0) - (Number(left.deletedAt) || 0))
      .slice(0, 50);
  }

  function matchingTrainingDeletionTs(training, tombstones) {
    const signature = trainingDeletionSignature(training);
    if (!signature) return 0;
    const trainingTs = Number(training && training.updatedAt) || 0;
    let deletedAt = 0;
    for (const tombstone of (Array.isArray(tombstones) ? tombstones : [])) {
      const tombstoneTs = Number(tombstone && tombstone.deletedAt) || 0;
      if (tombstone && tombstone.signature === signature && tombstoneTs >= trainingTs) {
        deletedAt = Math.max(deletedAt, tombstoneTs);
      }
    }
    return deletedAt;
  }

  function mergeChronoTombstones(incoming, current) {
    const byKey = new Map();
    const add = (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const type = String(raw.type || 'activity');
      const id = String(raw.id || '').trim();
      if (!id) return;
      const deletedAt = Number(raw.deletedAt) || 0;
      const key = type + ':' + id;
      const prev = byKey.get(key);
      if (!prev || deletedAt >= (Number(prev.deletedAt) || 0)) {
        byKey.set(key, {
          type,
          id,
          deletedAt: deletedAt || Date.now(),
          source: raw.source ? String(raw.source) : undefined,
        });
      }
    };
    (Array.isArray(current) ? current : []).forEach(add);
    (Array.isArray(incoming) ? incoming : []).forEach(add);
    return Array.from(byKey.values())
      .sort((left, right) => (Number(right.deletedAt) || 0) - (Number(left.deletedAt) || 0))
      .slice(0, 500);
  }

  function mergePlanningRecords(incoming, current) {
    const byId = new Map();
    const recency = (item) => {
      const raw = item && (item.updatedAt || item.deletedAt || item.createdAt || item.at);
      if (raw == null) return 0;
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const absorb = (items, incomingWinsTie) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item || item.id == null) return;
        const id = String(item.id);
        const previous = byId.get(id);
        if (!previous || recency(item) > recency(previous)
            || (incomingWinsTie && recency(item) === recency(previous))) {
          byId.set(id, item);
        }
      });
    };
    absorb(current, false);
    absorb(incoming, true);
    return Array.from(byId.values()).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }

  // Hunger assessments are an append/update event log shared by tabs and
  // devices. Whole-array LWW is unsafe here: a stale snapshot can erase events
  // that were recorded elsewhere. There is no user-facing delete action, so
  // absence from one side is not a tombstone.
  function mergeHungerStatusEvents(incoming, current, options = {}) {
    const maxEvents = Math.max(1, Number(options.maxEvents) || 120);
    const maxBytes = Math.max(1024, Number(options.maxBytes) || (38 * 1024));
    const byId = new Map();

    const parseTimestamp = (value) => {
      if (value == null || value === '') return 0;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const revisionTs = (row) => {
      const mutationTs = Math.max(
        parseTimestamp(row?.updatedAt),
        parseTimestamp(row?.outcomeAt),
        parseTimestamp(row?.outcomePlan?.userReportedAt),
        parseTimestamp(row?.outcomePlan?.supersededAt),
        parseTimestamp(row?.outcomePlan?.shownAt),
        parseTimestamp(row?.outcomePlan?.dismissedAt)
      );
      return mutationTs || Math.max(
        parseTimestamp(row?.recordedAt),
        parseTimestamp(row?.createdAt)
      );
    };
    const outcomeStateRank = (row) => {
      const plan = row?.outcomePlan || {};
      if (plan.userReported || plan.status === 'answered') return 3;
      if (['expired', 'not_requested', 'superseded', 'dismissed_after_snoozes'].includes(plan.status)) return 2;
      if (['waiting_for_meal', 'pending', 'shown'].includes(plan.status)) return 1;
      return 0;
    };
    const chronologyTs = (row) => (
      parseTimestamp(row?.recordedAt)
      || parseTimestamp(row?.createdAt)
      || revisionTs(row)
    );
    const stableValueRank = (row) => {
      try {
        const json = JSON.stringify(row);
        return [json.length, json];
      } catch (_) {
        return [0, ''];
      }
    };
    const eventKey = (row) => {
      if (row?.id != null && String(row.id).trim()) return 'id:' + String(row.id);
      return [
        'legacy',
        row?.eventType || '',
        row?.recordedAt || '',
        row?.createdAt || '',
        row?.source || '',
      ].join(':');
    };
    const choose = (left, right) => {
      if (!left) return right;
      if (!right) return left;
      const leftStateRank = outcomeStateRank(left);
      const rightStateRank = outcomeStateRank(right);
      if (leftStateRank !== rightStateRank) return rightStateRank > leftStateRank ? right : left;
      const leftTs = revisionTs(left);
      const rightTs = revisionTs(right);
      if (leftTs !== rightTs) return rightTs > leftTs ? right : left;
      const leftRank = stableValueRank(left);
      const rightRank = stableValueRank(right);
      if (leftRank[0] !== rightRank[0]) return rightRank[0] > leftRank[0] ? right : left;
      return rightRank[1] > leftRank[1] ? right : left;
    };
    const absorb = (rows) => {
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const key = eventKey(row);
        byId.set(key, choose(byId.get(key), row));
      });
    };

    absorb(current);
    absorb(incoming);
    const merged = Array.from(byId.values()).sort((left, right) => {
      const timeDiff = chronologyTs(left) - chronologyTs(right);
      if (timeDiff !== 0) return timeDiff;
      return eventKey(left).localeCompare(eventKey(right));
    }).slice(-maxEvents);

    while (merged.length > 1) {
      try {
        if (JSON.stringify(merged).length <= maxBytes) break;
      } catch (_) {
        // Drop the oldest malformed row and continue with the recoverable tail.
      }
      merged.shift();
    }
    return merged;
  }

  // Recommendation feedback is also a bounded append/update log. Different
  // tabs can hold disjoint 30-row windows, so replacing the whole array loses
  // both new recommendations and later outcome/reminder edits.
  function mergeInsightsFeedback(incoming, current, options = {}) {
    const maxRecords = Math.max(1, Number(options.maxRecords) || 30);
    const byId = new Map();
    const parseTimestamp = (value) => {
      if (value == null || value === '') return 0;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const revisionTs = (row) => {
      const reminderTimes = row?.reminders && typeof row.reminders === 'object'
        ? Object.values(row.reminders).map((reminder) => parseTimestamp(reminder?.shownAt))
        : [];
      return Math.max(
        parseTimestamp(row?.timestamp),
        parseTimestamp(row?.followedAt),
        parseTimestamp(row?.outcome?.submittedAt),
        ...reminderTimes,
      );
    };
    const stableRank = (row) => {
      try {
        const json = JSON.stringify(row);
        return [json.length, json];
      } catch (_) {
        return [0, ''];
      }
    };
    const choose = (left, right) => {
      if (!left) return right;
      const leftTs = revisionTs(left);
      const rightTs = revisionTs(right);
      if (leftTs !== rightTs) return rightTs > leftTs ? right : left;
      const leftRank = stableRank(left);
      const rightRank = stableRank(right);
      if (leftRank[0] !== rightRank[0]) return rightRank[0] > leftRank[0] ? right : left;
      return rightRank[1] > leftRank[1] ? right : left;
    };
    const absorb = (rows) => {
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row || typeof row !== 'object' || row.id == null || !String(row.id).trim()) return;
        const id = String(row.id);
        byId.set(id, choose(byId.get(id), row));
      });
    };

    absorb(current);
    absorb(incoming);
    return Array.from(byId.values())
      .sort((left, right) => {
        const timeDiff = parseTimestamp(left?.timestamp) - parseTimestamp(right?.timestamp);
        if (timeDiff !== 0) return timeDiff;
        return String(left.id).localeCompare(String(right.id));
      })
      .slice(-maxRecords);
  }

  /**
   * savedEaten* — кэш калорий/БЖУ для отображения, читается вместо пересчёта
   * из meals (календарь, cascade-карточка, пороги аналитики, расчёт CEB).
   * `merged` собирается как `{ ...remote }`, а объединение приёмов идёт с
   * обеих сторон — значит после конфликтного merge кэш от remote может не
   * соответствовать итоговому списку позиций. Тот же промах, что был в
   * MCP-коннекторе (heys-mcp/lib/day.js, savedEatenCache): формула здесь
   * зеркальная, чтобы у клиента и коннектора не разошлись два разных числа.
   *
   * `savedDisplayOptimum` не трогаем: он от TDEE и накопленного долга по
   * калориям, у merge этих входов нет.
   */
  function recalculateSavedEatenFromMeals(meals) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const meal of meals || []) {
      for (const item of (meal && meal.items) || []) {
        const grams = (Number(item.grams) || 0) / 100;
        const kcal100 = Number(item.kcal100) || 0;
        totals.kcal += kcal100 * grams;
        totals.protein += (Number(item.protein100) || 0) * grams;
        const carbs = Number(item.carbs100) || ((Number(item.simple100) || 0) + (Number(item.complex100) || 0));
        totals.carbs += carbs * grams;
        const fat = Number(item.fat100) || ((Number(item.badFat100) || 0) + (Number(item.goodFat100) || 0) + (Number(item.trans100) || 0));
        totals.fat += fat * grams;
        totals.fiber += (Number(item.fiber100) || 0) * grams;
      }
    }
    return {
      savedEatenKcal: totals.kcal,
      savedEatenProt: totals.protein,
      savedEatenCarbs: totals.carbs,
      savedEatenFat: totals.fat,
      savedEatenFiber: Math.round(totals.fiber * 10) / 10,
    };
  }

  // ─── stripStaleSavedDisplayNutrientsIfEmptyDiary ─────────────────────────
  // Removes cached display nutrients when meals/items are empty (same invariant
  // as dayMealsIntegrity).
  function stripStaleSavedDisplayNutrientsIfEmptyDiary(dayObj) {
    if (!dayObj || typeof dayObj !== 'object') return dayObj;
    const meals = Array.isArray(dayObj.meals) ? dayObj.meals : [];
    const hasItems = meals.some((m) => Array.isArray(m && m.items) && m.items.length > 0);
    if (hasItems) return dayObj;
    const next = { ...dayObj };
    delete next.savedEatenKcal;
    delete next.savedDisplayOptimum;
    delete next.savedEatenProt;
    delete next.savedEatenCarbs;
    delete next.savedEatenFat;
    delete next.savedEatenFiber;
    return next;
  }

  // Day-level subjective fields are filled by check-in flows and are easy to
  // lose when an older day snapshot is re-saved after a meal/water patch.
  const SUBJECTIVE_DAY_FIELDS = [
    'sleepStart',
    'sleepEnd',
    'sleepHours',
    'daySleepMinutes',
    'sleepQuality',
    'sleepNote',
    'moodMorning',
    'wellbeingMorning',
    'stressMorning',
    'morningActivation',
  ];

  const hasSubjectiveValue = (value) => {
    if (value === undefined || value === null || value === '') return false;
    // 0 — «не задано» для шкал 1–10 (mood/wellbeing/stress/sleepQuality) и для
    // daySleepMinutes. Иначе stale PWA с moodMorning:0 проходит noConflict
    // fast-path и затирает реальное значение в облаке (кейс heys/4546fb 06.08).
    if (typeof value === 'number' && value === 0) return false;
    if (value === '0') return false;
    if (typeof value === 'object' && !Array.isArray(value)) return Object.keys(value).length > 0;
    return true;
  };

  function hasSubjectiveFieldDrop(incoming, current) {
    if (!incoming || !current || typeof incoming !== 'object' || typeof current !== 'object') return false;
    const missingField = SUBJECTIVE_DAY_FIELDS.some((field) =>
      hasSubjectiveValue(current[field]) && !hasSubjectiveValue(incoming[field])
    );
    return missingField || hasMorningActivationRegression(incoming.morningActivation, current.morningActivation);
  }

  function firstSubjectiveValue() {
    for (let i = 0; i < arguments.length; i += 1) {
      if (hasSubjectiveValue(arguments[i])) return arguments[i];
    }
    return arguments.length ? arguments[arguments.length - 1] : undefined;
  }

  function terminalMorningActivation(ma) {
    return ma && (ma.status === 'done' || ma.status === 'missed');
  }

  function morningActivationDecisionTs(ma) {
    if (!ma || typeof ma !== 'object') return 0;
    return Number(ma.decidedAt || ma.updatedAt || ma.savedAt || 0) || 0;
  }

  function morningActivationRevisionTs(ma) {
    if (!ma || typeof ma !== 'object') return 0;
    return Math.max(
      morningActivationDecisionTs(ma),
      Number(ma.skipReasonCapturedAt) || 0,
    );
  }

  function clearedMorningActivation(ma) {
    return !!(ma && (ma.clearedByUser === true || Number(ma.clearedAt) > 0));
  }

  function reopenedMorningActivation(ma) {
    if (!ma || ma.status !== 'pending') return false;
    return Object.prototype.hasOwnProperty.call(ma, 'clearedByUser')
      && Object.prototype.hasOwnProperty.call(ma, 'clearedAt')
      && ma.clearedByUser === null
      && ma.clearedAt === null;
  }

  function morningActivationRichness(ma) {
    if (!ma || typeof ma !== 'object') return 0;
    return Object.keys(ma).reduce((score, key) => {
      const value = ma[key];
      if (value === undefined || value === null || value === '') return score;
      if (typeof value === 'object') return score + Math.max(1, Object.keys(value).length);
      return score + 1;
    }, 0);
  }

  /**
   * Merge one morning-activation state with a fallback without letting a
   * freshly re-stamped partial snapshot erase a completed user decision.
   * Explicit clear is an action too and wins when its clearedAt is newer.
   */
  function mergeMorningActivationState(preferred, fallback) {
    const preferredMA = preferred && typeof preferred === 'object' ? preferred : null;
    const fallbackMA = fallback && typeof fallback === 'object' ? fallback : null;
    if (!preferredMA) return fallbackMA;
    if (!fallbackMA) return preferredMA;

    const preferredTerminal = terminalMorningActivation(preferredMA);
    const fallbackTerminal = terminalMorningActivation(fallbackMA);
    const preferredCleared = clearedMorningActivation(preferredMA);
    const fallbackCleared = clearedMorningActivation(fallbackMA);
    const preferredReopened = reopenedMorningActivation(preferredMA);
    const fallbackReopened = reopenedMorningActivation(fallbackMA);
    const preferredDecisionTs = morningActivationDecisionTs(preferredMA);
    const fallbackDecisionTs = morningActivationDecisionTs(fallbackMA);
    const differentTerminalDecisions = preferredTerminal && fallbackTerminal
      && preferredDecisionTs !== fallbackDecisionTs;
    let winner = preferredMA;
    let loser = fallbackMA;

    if (preferredReopened || (fallbackReopened && !preferredTerminal && !preferredCleared)) {
      if (!preferredReopened) {
        winner = fallbackMA;
        loser = preferredMA;
      }
    } else if (preferredCleared || fallbackCleared) {
      const preferredActionTs = preferredCleared ? Number(preferredMA.clearedAt) || 0 : preferredDecisionTs;
      const fallbackActionTs = fallbackCleared ? Number(fallbackMA.clearedAt) || 0 : fallbackDecisionTs;
      if (fallbackActionTs > preferredActionTs) {
        winner = fallbackMA;
        loser = preferredMA;
      }
    } else if (preferredTerminal || fallbackTerminal) {
      if (!preferredTerminal || (fallbackTerminal && fallbackDecisionTs > preferredDecisionTs)) {
        winner = fallbackMA;
        loser = preferredMA;
      } else if (preferredTerminal && fallbackTerminal && preferredDecisionTs === fallbackDecisionTs) {
        const preferredRevisionTs = morningActivationRevisionTs(preferredMA);
        const fallbackRevisionTs = morningActivationRevisionTs(fallbackMA);
        if (fallbackRevisionTs > preferredRevisionTs
            || (fallbackRevisionTs === preferredRevisionTs
              && morningActivationRichness(fallbackMA) > morningActivationRichness(preferredMA))) {
          winner = fallbackMA;
          loser = preferredMA;
        }
      }
    }

    if (clearedMorningActivation(winner) || clearedMorningActivation(loser)
        || reopenedMorningActivation(winner) || reopenedMorningActivation(loser)
        || differentTerminalDecisions) {
      return { ...winner };
    }
    return { ...loser, ...winner };
  }

  function hasMorningActivationRegression(incoming, current) {
    if (!current || typeof current !== 'object') return false;
    const merged = mergeMorningActivationState(incoming, current);
    const incomingMA = incoming && typeof incoming === 'object' ? incoming : null;
    if (!incomingMA) return !!merged;
    return Object.keys(merged || {}).some((key) => {
      try {
        return JSON.stringify(merged[key]) !== JSON.stringify(incomingMA[key]);
      } catch (_) {
        return merged[key] !== incomingMA[key];
      }
    });
  }

  // ─── mergeDayData ────────────────────────────────────────────────────────
  //
  // Options:
  //   forceKeepAll: bool — pull-to-refresh mode, keep ALL meals (no deletion detection)
  //   preferRemote: bool — pull-to-refresh, remote wins for items/meals
  //   logFn: function — optional logger (defaults to no-op)
  //   hashFn: function(day) → string — optional content hash to skip identical merges
  //   workoutLogHasTrackableContent: function(workoutLog) → bool — optional richness check
  //
  function mergeDayData(local, remote, options) {
    options = options || {};
    const forceKeepAll = !!options.forceKeepAll;
    // Момент, на который клиент последний раз видел облачную версию дня.
    // Передаётся только серверным путём (heys-api-rpc); клиентский merge его
    // не знает и остаётся как был.
    const lastSeenUpdatedAt = Number(options.lastSeenUpdatedAt) || 0;
    const preferRemote = !!options.preferRemote;
    const logFn = typeof options.logFn === 'function' ? options.logFn : function () {};
    const hashFn = typeof options.hashFn === 'function' ? options.hashFn : null;
    const workoutLogHasTrackableContent =
      typeof options.workoutLogHasTrackableContent === 'function'
        ? options.workoutLogHasTrackableContent
        : null;

    // Normalize trainings (quality/feelAfter → mood/wellbeing/stress)
    const normalizeTrainings = (trainings) =>
      (trainings || []).map((t) => {
        t = t || {};
        if (t.quality !== undefined || t.feelAfter !== undefined) {
          const { quality, feelAfter, ...rest } = t;
          return {
            ...rest,
            mood: rest.mood !== undefined ? rest.mood : (quality !== undefined ? quality : 5),
            wellbeing:
              rest.wellbeing !== undefined ? rest.wellbeing : (feelAfter !== undefined ? feelAfter : 5),
            stress: rest.stress !== undefined ? rest.stress : 5,
          };
        }
        return t;
      });

    if (!local || !remote) return null;

    // 🛡️ Cross-client merge guard (Strategy B, 2026-06-01 incident).
    // Если у обеих сторон есть _writerCid и они РАЗНЫЕ — это cross-client merge
    // (как Алексин cycleDay/MA утекал в Poplanton через mergeDayData с remote от
    // чужого клиента). Возвращаем local untouched — отказываемся принять чужие
    // данные. Backward compat: row'и без _writerCid (старые) skip — guard работает
    // только когда оба тега есть, постепенный ramp-up по мере записей.
    if (local._writerCid && remote._writerCid && local._writerCid !== remote._writerCid) {
      try {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[heys.sync.merge] 🛡️ CROSS_CLIENT_MERGE_BLOCKED', {
            date: local.date || remote.date,
            localCid: String(local._writerCid).slice(0, 8),
            remoteCid: String(remote._writerCid).slice(0, 8),
          });
        }
        const g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : null);
        if (g && g.HEYS) {
          g.HEYS._crossClientMergeBlockedCount = (g.HEYS._crossClientMergeBlockedCount || 0) + 1;
        }
      } catch (_) { /* noop */ }
      return { ...local }; // safe fallback — keep local untouched, reject remote
    }

    local = { ...local, trainings: normalizeTrainings(local && local.trainings) };
    remote = { ...remote, trainings: normalizeTrainings(remote && remote.trainings) };

    // Skip if content-identical
    if (hashFn) {
      const localHash = hashFn(local);
      const remoteHash = hashFn(remote);
      if (localHash === remoteHash) return null;
    } else {
      const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
      const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
      if (localJson === remoteJson) return null;
    }

    const merged = {
      ...remote,
      date: remote.date || local.date,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
      _mergedAt: Date.now(),
    };

    // Steps are manually editable in both directions. New clients stamp the
    // explicit edit so a later decrease can win, while unrelated day writes
    // cannot resurrect an older count. If neither side has the stamp, retain
    // the legacy monotonic-max behaviour for existing stored days.
    const localStepsTs = Number(local.stepsUpdatedAt) || 0;
    const remoteStepsTs = Number(remote.stepsUpdatedAt) || 0;
    if (localStepsTs > 0 || remoteStepsTs > 0) {
      if (localStepsTs === remoteStepsTs) {
        merged.steps = Math.max(Number(local.steps) || 0, Number(remote.steps) || 0);
      } else {
        merged.steps = localStepsTs > remoteStepsTs
          ? (Number(local.steps) || 0)
          : (Number(remote.steps) || 0);
      }
      merged.stepsUpdatedAt = Math.max(localStepsTs, remoteStepsTs);
    } else {
      merged.steps = Math.max(Number(local.steps) || 0, Number(remote.steps) || 0);
    }

    // Legacy fallback for days written before per-action timestamps existed.
    merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);

    if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.householdMin = local.householdMin != null ? local.householdMin : (remote.householdMin != null ? remote.householdMin : 0);
      merged.householdTime = local.householdTime != null ? local.householdTime : (remote.householdTime != null ? remote.householdTime : '');
      merged.householdActivities = local.householdActivities || remote.householdActivities || undefined;
    } else {
      merged.householdMin = remote.householdMin != null ? remote.householdMin : (local.householdMin != null ? local.householdMin : 0);
      merged.householdTime = remote.householdTime != null ? remote.householdTime : (local.householdTime != null ? local.householdTime : '');
      merged.householdActivities = remote.householdActivities || local.householdActivities || undefined;
    }

    // Morning weight: prefer non-zero, prefer freshest if both set
    if (local.weightMorning && remote.weightMorning) {
      merged.weightMorning =
        (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local.weightMorning : remote.weightMorning;
    } else {
      merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
    }

    // Check-in subjective fields: incoming side wins when present, otherwise
    // fill from the other side. Missing fields are not treated as deletes.
    // Known tradeoff: explicit clear has no tombstone in the current model, so
    // an older non-empty value from the other side may be restored.
    merged.sleepStart = firstSubjectiveValue(local.sleepStart, remote.sleepStart, '');
    merged.sleepEnd = firstSubjectiveValue(local.sleepEnd, remote.sleepEnd, '');
    merged.sleepHours = firstSubjectiveValue(local.sleepHours, remote.sleepHours, '');
    merged.daySleepMinutes = firstSubjectiveValue(local.daySleepMinutes, remote.daySleepMinutes, 0);
    merged.sleepQuality = firstSubjectiveValue(local.sleepQuality, remote.sleepQuality, '');
    merged.sleepNote = firstSubjectiveValue(local.sleepNote, remote.sleepNote, '');
    merged.moodMorning = firstSubjectiveValue(local.moodMorning, remote.moodMorning, '');
    merged.wellbeingMorning = firstSubjectiveValue(local.wellbeingMorning, remote.wellbeingMorning, '');
    merged.stressMorning = firstSubjectiveValue(local.stressMorning, remote.stressMorning, '');

    // Day score: manual override wins
    if (local.dayScoreManual) {
      merged.dayScore = local.dayScore;
      merged.dayScoreManual = true;
    } else if (remote.dayScoreManual) {
      merged.dayScore = remote.dayScore;
      merged.dayScoreManual = true;
    } else {
      merged.dayScore = local.dayScore || remote.dayScore || '';
    }
    merged.dayComment = local.dayComment || remote.dayComment || '';

    // Cycle: explicit null reset preserved if it came from the fresher side
    if (local.cycleDay === null && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.cycleDay = null;
    } else if (remote.cycleDay === null && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      merged.cycleDay = null;
    } else {
      merged.cycleDay = local.cycleDay || remote.cycleDay || null;
    }

    // Explicit action timestamps override the legacy field-specific fallbacks
    // above. Exact property copying is intentional: 0, '', false, [] and a
    // missing property are all valid outcomes of a newer user action.
    applyExplicitMutationGroups(merged, local, remote);

    // ─── Вода: журнал сливается по id, waterMl — производное ───────────────
    // Калитка сознательная: журнальный путь включается только когда хотя бы у
    // одной стороны журнал реально есть. День, который обе стороны писали
    // старым способом (одно число), проходит прежней дорогой — группа
    // waterUpdatedAt плюс max() выше, — и его поведение не меняется.
    if (Array.isArray(local.waterEntries) || Array.isArray(remote.waterEntries)) {
      const water = mergeWaterJournal(local, remote);
      if (water.waterEntries.length > 0) merged.waterEntries = water.waterEntries;
      else delete merged.waterEntries;
      merged.waterMl = water.waterMl;
    }

    // ─── Meals: merge by id with deletion detection ────────────────────────
    const localMeals = local.meals || [];
    const remoteMeals = remote.meals || [];
    const mealsMap = new Map();
    const localMealIds = new Set(localMeals.filter((m) => m && m.id).map((m) => m.id));
    const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    // Tombstone-aware deletion handling. Applied ALWAYS (even when forceKeepAll/preferRemote)
    // because tombstones are explicit user actions — flags only control implicit deletion heuristic.
    const localDeletedMealIds = (local.deletedMealIds && typeof local.deletedMealIds === 'object' && !Array.isArray(local.deletedMealIds)) ? local.deletedMealIds : {};
    const remoteDeletedMealIds = (remote.deletedMealIds && typeof remote.deletedMealIds === 'object' && !Array.isArray(remote.deletedMealIds)) ? remote.deletedMealIds : {};
    const mergedDeletedMealIds = unionMaxTimestamp(localDeletedMealIds, remoteDeletedMealIds);

    // Item-level tombstones (Phase B1, 2026-06-04): like deletedMealIds but per item.
    // Auto-emitted by central stamper when items disappear between prev/next dayv2 LS state.
    const localDeletedItemIds = (local.deletedItemIds && typeof local.deletedItemIds === 'object' && !Array.isArray(local.deletedItemIds)) ? local.deletedItemIds : {};
    const remoteDeletedItemIds = (remote.deletedItemIds && typeof remote.deletedItemIds === 'object' && !Array.isArray(remote.deletedItemIds)) ? remote.deletedItemIds : {};
    const mergedDeletedItemIds = unionMaxTimestamp(localDeletedItemIds, remoteDeletedItemIds);

    // Curator authorship marks (2026-08-02): base is `remote`, so a mark written
    // by the connector would vanish here without an explicit union.
    const localCuratorEdits = (local._curatorEdits && typeof local._curatorEdits === 'object' && !Array.isArray(local._curatorEdits)) ? local._curatorEdits : {};
    const remoteCuratorEdits = (remote._curatorEdits && typeof remote._curatorEdits === 'object' && !Array.isArray(remote._curatorEdits)) ? remote._curatorEdits : {};
    const mergedCuratorEdits = unionCuratorEdits(localCuratorEdits, remoteCuratorEdits);
    const dayLocalTs = local.updatedAt || 0;
    const dayRemoteTs = remote.updatedAt || 0;

    // morningActivation: terminal decision and explicit clear are semantic
    // actions; root day.updatedAt alone must not decide between them.
    {
      const localMA = local.morningActivation || null;
      const remoteMA = remote.morningActivation || null;
      merged.morningActivation = localIsNewer
        ? mergeMorningActivationState(localMA, remoteMA)
        : mergeMorningActivationState(remoteMA, localMA);
    }

    {
      const localLog = Array.isArray(local.recipe_backfill_log) ? local.recipe_backfill_log : [];
      const remoteLog = Array.isArray(remote.recipe_backfill_log) ? remote.recipe_backfill_log : [];
      const seen = new Set();
      const mergedLog = [];
      for (const entry of localLog.concat(remoteLog)) {
        if (!entry || typeof entry !== 'object') continue;
        const key = `${entry.at}|${entry.product_id}|${entry.items_count}|${entry.kcal_delta}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mergedLog.push(entry);
      }
      if (mergedLog.length) merged.recipe_backfill_log = mergedLog;
    }

    // Apply item-tombstones to a single meal's items (used when meal exists only on one side).
    const filterItemTombstones = (meal) => {
      if (!meal || !Array.isArray(meal.items)) return meal;
      const filtered = meal.items.filter((item) => {
        if (!item || item.id == null) return true;
        const tombTs = Number(mergedDeletedItemIds[item.id]) || 0;
        if (tombTs <= 0) return true;
        const itemTs = Number(item.updatedAt) || 0;
        return tombTs < itemTs; // tombstone older than item edit → item resurrected
      });
      return filtered === meal.items ? meal : { ...meal, items: filtered };
    };

    // Remote meals first (will be overwritten by local if collision)
    remoteMeals.forEach((meal) => {
      if (!meal || !meal.id) return;
      // Tombstone check: if explicit deletion is newer than this meal's last edit, skip it
      const tombstoneTs = mergedDeletedMealIds[meal.id];
      const mealTs = meal.updatedAt || dayRemoteTs;
      if (tombstoneTs && tombstoneTs >= mealTs) {
        logFn(`🪦 [MERGE] Meal ${meal.id} tombstoned (${tombstoneTs} >= ${mealTs}), skipping from remote`);
        return;
      }
      if (!forceKeepAll && !preferRemote && localIsNewer && !localMealIds.has(meal.id)) {
        // Local is fresher and this meal isn't in local → deleted by user
        logFn(`🗑️ [MERGE] Meal ${meal.id} deleted locally, skipping from remote`);
        return;
      }
      mealsMap.set(meal.id, filterItemTombstones(meal));
    });

    // Local meals: merge items if both sides have the meal
    localMeals.forEach((meal) => {
      if (!meal || !meal.id) return;
      // Tombstone check: if remote (other device) has newer deletion mark, skip local meal too
      const tombstoneTs = mergedDeletedMealIds[meal.id];
      const mealTs = meal.updatedAt || dayLocalTs;
      if (tombstoneTs && tombstoneTs >= mealTs) {
        logFn(`🪦 [MERGE] Meal ${meal.id} tombstoned (${tombstoneTs} >= ${mealTs}), skipping from local`);
        return;
      }
      const existing = mealsMap.get(meal.id);
      if (!existing) {
        mealsMap.set(meal.id, filterItemTombstones(meal));
      } else {
        // ─── meal-level merge ────────────────────────────────────────────
        // Use meal.updatedAt for finer-grained "who edited THIS meal more recently"
        // (Phase 2). Falls back to day.updatedAt for legacy data without meal.updatedAt.
        const localMealTs = meal.updatedAt || local.updatedAt || 0;
        const remoteMealTs = existing.updatedAt || remote.updatedAt || 0;
        const mealLocalIsNewer = localMealTs >= remoteMealTs;
        // 🛡️ Lost-add fix (incident 2026-06-06): NEVER infer item deletion from a
        // newer remote meal timestamp. In normal background merge (pollOnce /
        // live-refresh / server-merge / upload) we ALWAYS union items — a local-only
        // item (just added, not yet in a stale remote copy) must survive even when the
        // remote meal carries a fresher updatedAt (any of the ~22 day re-saves/30s can
        // re-stamp a stale snapshot, then mergeItemsById's "only remote survives" branch
        // silently dropped the just-added item). Same-id conflicts (grams) are still
        // resolved by item-level updatedAt inside mergeItemsById; deletion propagates
        // ONLY via an explicit deletedItemIds tombstone (day/_meals.js removeItem),
        // never from absence. "Only remote survives" stays reserved for explicit
        // pull-to-refresh (preferRemote).
        const preferLocal = !preferRemote;

        const mergedItems = mergeItemsById(existing.items || [], meal.items || [], preferLocal, mergedDeletedItemIds);

        const mergedMeal = preferRemote
          ? { ...meal, ...existing, items: mergedItems }
          : mealLocalIsNewer
            ? { ...existing, ...meal, items: mergedItems }
            : { ...meal, ...existing, items: mergedItems };
        // Preserve the freshest meal-level updatedAt
        mergedMeal.updatedAt = Math.max(localMealTs, remoteMealTs) || undefined;
        mealsMap.set(meal.id, mergedMeal);
      }
    });

    merged.meals = Array.from(mealsMap.values()).sort((a, b) =>
      (a.time || '').localeCompare(b.time || '')
    );
    merged.deletedMealIds = mergedDeletedMealIds;
    if (Object.keys(mergedDeletedItemIds).length > 0) {
      merged.deletedItemIds = mergedDeletedItemIds;
    }
    if (Object.keys(mergedCuratorEdits).length > 0) {
      merged._curatorEdits = mergedCuratorEdits;
    }

    // ─── Trainings: position-indexed merge ────────────────────────────────
    const localTrainings = local.trainings || [];
    const remoteTrainings = remote.trainings || [];
    const mergedDeletedTrainings = mergeTrainingTombstones(local.deletedTrainings, remote.deletedTrainings);
    merged.trainings = [];
    const isMorningActivationTrainingRow = (t) => {
      if (!t || typeof t !== 'object') return false;
      if (t.source === 'morning_activation') return true;
      const lab = String(t.activityLabel || '').trim().toLowerCase();
      return lab === 'зарядка';
    };
    const localMaStatusForTrainings = local.morningActivation && local.morningActivation.status;
    const protectLocalMorningActivationRow =
      localMaStatusForTrainings === 'done' || localMaStatusForTrainings === 'missed';

    const workoutLogRichness = (t) => {
      if (!t || !t.workoutLog || typeof t.workoutLog !== 'object') return 0;
      const wl = t.workoutLog;
      const n = Array.isArray(wl.exercises) ? wl.exercises.length : 0;
      let score = n * 10;
      if (n > 1) score += 5;
      if (Array.isArray(wl.zoneMinutes) && wl.zoneMinutes.some((m) => +m > 0)) score += 100;
      try {
        if (workoutLogHasTrackableContent && workoutLogHasTrackableContent(wl)) score += 1000;
      } catch (e) {
        /* noop */
      }
      return score;
    };

    const maxTrainings = Math.max(localTrainings.length, remoteTrainings.length, 3);
    for (let i = 0; i < maxTrainings; i++) {
      const rawLt = localTrainings[i] || { z: [0, 0, 0, 0] };
      const rawRt = remoteTrainings[i] || { z: [0, 0, 0, 0] };
      const localDeletedAt = matchingTrainingDeletionTs(rawLt, mergedDeletedTrainings);
      const remoteDeletedAt = matchingTrainingDeletionTs(rawRt, mergedDeletedTrainings);
      const lt = localDeletedAt ? { z: [0, 0, 0, 0], updatedAt: localDeletedAt } : rawLt;
      const rt = remoteDeletedAt ? { z: [0, 0, 0, 0], updatedAt: remoteDeletedAt } : rawRt;
      const ltSum = (lt.z || []).reduce((a, b) => a + (b || 0), 0);
      const rtSum = (rt.z || []).reduce((a, b) => a + (b || 0), 0);
      const localTrainingTs = lt.updatedAt || local.updatedAt || 0;
      const remoteTrainingTs = rt.updatedAt || remote.updatedAt || 0;
      const localTrainingIsNewer = localTrainingTs >= remoteTrainingTs;

      // Программа куратора, слой 5 (точечное правило, не переписывание merge):
      // запись с планом, который клиент уже начал/закончил/пропустил, не
      // проигрывает записи, где план ещё только «назначен» — ни по свежести,
      // ни по richness. Без этого куратор, надиктовавший план офлайн-клиенту
      // через MCP в момент, когда remote ещё не увидел клиентский «started»,
      // стирал бы уже отмеченные подходы (CURATOR_TRAINING_PROGRAM_PROTOCOL,
      // риск 2.5). Статусы вне этой карты (или отсутствие plan) не участвуют —
      // обычные тренировки без программы куратора мержатся как раньше.
      const PLAN_STATUS_PRIORITY = { assigned: 0, started: 1, done: 1, skipped: 1, moved: 1 };
      const planPriority = (t) => {
        const status = t && t.plan && t.plan.status;
        return status && Object.prototype.hasOwnProperty.call(PLAN_STATUS_PRIORITY, status)
          ? PLAN_STATUS_PRIORITY[status]
          : -1;
      };
      const lPlanPriority = planPriority(lt);
      const rPlanPriority = planPriority(rt);

      // Клиент не может отменить правку, которой не видел. Приложение при
      // сохранении дня штампует изменённую строку свежим mutationTs (stamper
      // ниже по файлу), поэтому stale React-снимок со старыми зонами приходит
      // с меткой новее кураторской и выигрывает по свежести: 19.08 так трижды
      // откатились зоны «Барабаны» [47,73] → [0,120] (heys/9cb568). Если
      // облачная строка изменена ПОСЛЕ last-seen клиента и содержимое
      // расходится, этой правки клиент не видел — отменять ему было нечего.
      const remoteRowEditedUnseen = lastSeenUpdatedAt > 0
        && remoteTrainingTs > lastSeenUpdatedAt
        && !isDayMutationContentEqual(lt, rt);

      let winner;
      if (lPlanPriority !== rPlanPriority && (lPlanPriority >= 0 || rPlanPriority >= 0)) {
        winner = lPlanPriority > rPlanPriority ? lt : rt;
      } else if (remoteRowEditedUnseen) {
        winner = rt;
      } else if (localTrainingIsNewer) {
        winner = lt;
      } else if (ltSum === 0 && rtSum > 0) {
        winner = rt;
      } else if (rtSum === 0 && ltSum > 0) {
        winner = lt;
      } else if (ltSum === 0 && rtSum === 0) {
        const lRich = workoutLogRichness(lt);
        const rRich = workoutLogRichness(rt);
        if (lRich > rRich) winner = lt;
        else if (rRich > lRich) winner = rt;
        else if (lRich > 0 && rRich > 0) winner = lt;
        else if (
          protectLocalMorningActivationRow &&
          isMorningActivationTrainingRow(lt) &&
          !isMorningActivationTrainingRow(rt)
        ) {
          winner = lt;
        } else {
          winner = rt;
        }
      } else {
        if (
          protectLocalMorningActivationRow &&
          isMorningActivationTrainingRow(lt) &&
          !isMorningActivationTrainingRow(rt)
        ) {
          winner = lt;
        } else {
          winner = rt;
        }
      }
      const loser = winner === lt ? rt : lt;

      const getMergedRating = (field) => {
        const wVal = winner[field];
        const lVal = loser[field];
        if (wVal !== undefined) return wVal;
        if (lVal !== undefined) return lVal;
        return undefined;
      };

      winner = {
        ...winner,
        mood: getMergedRating('mood'),
        wellbeing: getMergedRating('wellbeing'),
        stress: getMergedRating('stress'),
        quality: undefined,
        feelAfter: undefined,
        updatedAt: Math.max(localTrainingTs, remoteTrainingTs) || undefined,
      };

      merged.trainings.push(winner);
    }
    if (mergedDeletedTrainings.length > 0) {
      merged.deletedTrainings = mergedDeletedTrainings;
    }

    logFn('🔀 [MERGE] Result:', {
      meals: merged.meals.length,
      steps: merged.steps,
      water: merged.waterMl,
      trainings: merged.trainings.filter((t) => t.z && t.z.some((z) => z > 0)).length,
    });

    const mergedHasItems = merged.meals.some((m) => Array.isArray(m && m.items) && m.items.length > 0);
    if (mergedHasItems) {
      Object.assign(merged, recalculateSavedEatenFromMeals(merged.meals));
    }
    return stripStaleSavedDisplayNutrientsIfEmptyDiary(merged);
  }

  // ─── mergeMorningCheckinProgress ─────────────────────────────────────────
  // A daily check-in is one logical flow shared by several shells. Generic
  // whole-object LWW can lose a step saved by another shell, so merge rows
  // independently and keep the first cloud flowId as the daily identity.
  const MORNING_PROGRESS_STATUS_RANK = {
    missing: 0,
    planned: 1,
    editing: 2,
    failed_sync: 3,
    open: 3,
    closed: 4,
    data_present: 5,
    skipped: 5,
    saved_local: 6,
    synced: 7,
  };
  const MORNING_PROGRESS_TERMINAL_STATUSES = new Set([
    'data_present',
    'skipped',
    'saved_local',
    'synced',
  ]);
  const MORNING_PROGRESS_RESET_STATUSES = new Set([
    'missing',
    'planned',
    'editing',
    'open',
    'closed',
  ]);

  function morningProgressRowTimestamp(row) {
    if (!row || typeof row !== 'object') return 0;
    return Math.max(
      Number(row.updatedAt) || 0,
      Number(row.replannedAt) || 0,
      Number(row.reopenedAt) || 0,
      Number(row.closedAt) || 0,
      Number(row.savedAt) || 0,
      Number(row.syncedAt) || 0
    );
  }

  function chooseMorningProgressRowSource(incomingRow, currentRow) {
    if (!incomingRow || typeof incomingRow !== 'object') return 'current';
    if (!currentRow || typeof currentRow !== 'object') return 'incoming';
    const incomingAttempt = Number(incomingRow.attempt) || 0;
    const currentAttempt = Number(currentRow.attempt) || 0;
    const incomingTs = morningProgressRowTimestamp(incomingRow);
    const currentTs = morningProgressRowTimestamp(currentRow);
    const incomingRank = MORNING_PROGRESS_STATUS_RANK[incomingRow.status] || 0;
    const currentRank = MORNING_PROGRESS_STATUS_RANK[currentRow.status] || 0;
    let incomingWins;
    if (incomingAttempt !== currentAttempt) {
      incomingWins = incomingAttempt > currentAttempt;
    } else if (MORNING_PROGRESS_TERMINAL_STATUSES.has(currentRow.status)
      && MORNING_PROGRESS_RESET_STATUSES.has(incomingRow.status)) {
      incomingWins = false;
    } else if (MORNING_PROGRESS_TERMINAL_STATUSES.has(incomingRow.status)
      && MORNING_PROGRESS_RESET_STATUSES.has(currentRow.status)) {
      incomingWins = true;
    } else if (MORNING_PROGRESS_TERMINAL_STATUSES.has(incomingRow.status)
      && MORNING_PROGRESS_TERMINAL_STATUSES.has(currentRow.status)
      && incomingRank !== currentRank) {
      // Within one attempt terminal progress is monotonic. A device with a
      // skewed clock must not turn cloud-confirmed `synced` back into
      // `saved_local`; a higher attempt remains the explicit reopen mechanism.
      incomingWins = incomingRank > currentRank;
    } else {
      incomingWins = incomingTs > currentTs
        || (incomingTs === currentTs && incomingRank >= currentRank);
    }
    return incomingWins ? 'incoming' : 'current';
  }

  function mergeMorningProgressRow(incomingRow, currentRow) {
    if (!incomingRow || typeof incomingRow !== 'object') return currentRow;
    if (!currentRow || typeof currentRow !== 'object') return incomingRow;
    const incomingWins = chooseMorningProgressRowSource(incomingRow, currentRow) === 'incoming';
    const older = incomingWins ? currentRow : incomingRow;
    const newer = incomingWins ? incomingRow : currentRow;
    return { ...older, ...newer };
  }

  function hasMorningCheckinProgressConflict(incoming, current) {
    if (!incoming || !current || typeof incoming !== 'object' || typeof current !== 'object'
      || Array.isArray(incoming) || Array.isArray(current)) {
      return false;
    }
    if (incoming.flowId && current.flowId && incoming.flowId !== current.flowId) return true;

    const incomingPlan = new Set(Array.isArray(incoming.plannedStepIds) ? incoming.plannedStepIds : []);
    const currentPlan = Array.isArray(current.plannedStepIds) ? current.plannedStepIds : [];
    if (currentPlan.some((id) => !incomingPlan.has(id))) return true;

    return Object.entries(current.steps || {}).some(([id, currentRow]) => {
      const incomingRow = incoming.steps?.[id];
      if (!incomingRow || typeof incomingRow !== 'object') return true;
      const sameLifecycle = incomingRow.status === currentRow?.status
        && (Number(incomingRow.attempt) || 0) === (Number(currentRow?.attempt) || 0)
        && morningProgressRowTimestamp(incomingRow) === morningProgressRowTimestamp(currentRow);
      if (sameLifecycle) return false;
      return chooseMorningProgressRowSource(incomingRow, currentRow) === 'current';
    });
  }

  function mergeMorningCheckinProgress(incoming, current, options = {}) {
    if (incoming == null) return current;
    if (current == null) return incoming;
    if (typeof incoming !== 'object' || typeof current !== 'object'
      || Array.isArray(incoming) || Array.isArray(current)) {
      return incoming;
    }

    const incomingTs = Number(incoming.updatedAt) || 0;
    const currentTs = Number(current.updatedAt) || 0;
    const incomingIsNewer = incomingTs >= currentTs;
    const base = incomingIsNewer ? current : incoming;
    const overlay = incomingIsNewer ? incoming : current;
    const merged = { ...base, ...overlay };
    const currentPlan = Array.isArray(current.plannedStepIds) ? current.plannedStepIds : [];
    const incomingPlan = Array.isArray(incoming.plannedStepIds) ? incoming.plannedStepIds : [];
    merged.version = Math.max(Number(current.version) || 1, Number(incoming.version) || 1);
    merged.clientId = current.clientId || incoming.clientId || null;
    merged.dateKey = current.dateKey || incoming.dateKey || null;
    merged.flowId = current.flowId || incoming.flowId || null;
    merged.plannedStepIds = Array.from(new Set([...currentPlan, ...incomingPlan]));
    merged.steps = {};
    const stepIds = new Set([
      ...Object.keys(current.steps || {}),
      ...Object.keys(incoming.steps || {}),
    ]);
    stepIds.forEach((id) => {
      merged.steps[id] = mergeMorningProgressRow(incoming.steps?.[id], current.steps?.[id]);
    });
    // Merge is idempotent: merely reading the same ledger from cloud must not
    // manufacture a fresher value and echo it back through hot-sync.
    const mergedStepTs = Object.values(merged.steps).reduce(
      (maxTs, row) => Math.max(maxTs, morningProgressRowTimestamp(row)),
      0
    );
    merged.updatedAt = Math.max(incomingTs, currentTs, mergedStepTs);
    return merged;
  }

  // ─── mergeScalarKv ───────────────────────────────────────────────────────
  // Generic shallow merge for KV blobs like heys_norms, heys_profile.
  // Each top-level field's "winner" is decided by parent-level updatedAt:
  //   - Object values: deep-merge (newer overlay on older, retains both halves)
  //   - Scalar/array values: pick from whichever side has fresher updatedAt
  //
  // Both sides must have `updatedAt` at the root (caller's responsibility).
  // For backward compat: if a side has no `updatedAt`, treats it as 0 (so the
  // other side always wins).
  function mergeScalarKv(incoming, current) {
    if (incoming == null) return current;
    if (current == null) return incoming;
    if (typeof incoming !== 'object' || typeof current !== 'object') {
      // Non-object → newer wins
      const incomingTs = (incoming && incoming.updatedAt) || 0;
      const currentTs = (current && current.updatedAt) || 0;
      return incomingTs >= currentTs ? incoming : current;
    }
    if (Array.isArray(incoming) || Array.isArray(current)) {
      // Arrays → fresher wins atomically (no positional merging)
      const incomingTs = (incoming && incoming.updatedAt) || 0;
      const currentTs = (current && current.updatedAt) || 0;
      return incomingTs >= currentTs ? incoming : current;
    }

    const incomingTs = incoming.updatedAt || 0;
    const currentTs = current.updatedAt || 0;
    const incomingIsNewer = incomingTs >= currentTs;

    // Start from the older side, then overlay fresher fields.
    const base = incomingIsNewer ? current : incoming;
    const overlay = incomingIsNewer ? incoming : current;
    const merged = { ...base };

    Object.keys(overlay).forEach((key) => {
      if (key === '_meta' || key === '_sourceId') return; // skip metadata on root
      const overlayVal = overlay[key];
      const baseVal = base[key];
      if (
        overlayVal &&
        baseVal &&
        typeof overlayVal === 'object' &&
        typeof baseVal === 'object' &&
        !Array.isArray(overlayVal) &&
        !Array.isArray(baseVal)
      ) {
        // Nested object → shallow merge. 🛡️ FIX 2026-05-23: ранее использовался
        // прямой `{ ...baseVal, ...overlayVal }` — overlay затирал nested
        // `_meta`/`_sourceId` который должен быть locally-controlled (как и
        // на root-level). Теперь стартуем с base (все его поля включая
        // metadata), оверлеем только non-metadata keys из overlay.
        // Это симметрично с root-level skip на строке 377.
        const nestedMerged = { ...baseVal };
        Object.keys(overlayVal).forEach((nk) => {
          if (nk === '_meta' || nk === '_sourceId') return;
          nestedMerged[nk] = overlayVal[nk];
        });
        merged[key] = nestedMerged;
      } else {
        // Scalar / array → take from overlay (fresher side)
        merged[key] = overlayVal;
      }
    });

    merged.updatedAt = Math.max(incomingTs, currentTs, Date.now());
    return merged;
  }

  function mergeScalarKvWithOutcome(key, incoming, current) {
    const incomingTs = Number(incoming && incoming.updatedAt) || 0;
    const currentTs = Number(current && current.updatedAt) || 0;
    if (key === 'heys_game' && incomingTs > 0 && currentTs > incomingTs) {
      return { value: current, outcome: 'stale_write_blocked' };
    }
    return { value: mergeScalarKv(incoming, current), outcome: 'scalar_merged' };
  }

  // ─── Pure dayv2 stamping helpers ─────────────────────────────────────────
  // Используются HEYS.storage interceptor'ом для централизованного штампа
  // изменённых meals/items/trainings. deletedItemIds tombstones НЕ выводятся из
  // diff (это делало бы phantom-удаления на sync-writeback) — они только
  // passthrough из prev + explicit из caller'a (removeItem handler).
  // Чистые функции — без global state, тестируются через CJS-копию.

  function stripDayMutationStamps(value) {
    if (Array.isArray(value)) return value.map(stripDayMutationStamps);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).forEach((key) => {
      if (key === 'updatedAt' || key === '_mergedAt' || key === '_sourceId') return;
      out[key] = stripDayMutationStamps(value[key]);
    });
    return out;
  }

  function isDayMutationContentEqual(left, right) {
    try {
      return JSON.stringify(stripDayMutationStamps(left)) === JSON.stringify(stripDayMutationStamps(right));
    } catch (_) {
      return false;
    }
  }

  function mapByIdOrIndex(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const id = item.id != null ? String(item.id) : `#${index}`;
      map.set(id, item);
    });
    return map;
  }

  function resolveDayMutationTs(nextDay, prevDay) {
    const nextTs = Number(nextDay && nextDay.updatedAt) || 0;
    if (nextTs > 0) return nextTs;
    // HMR-safe: caller passed value без updatedAt. НЕ инжектим ни Date.now()
    // (clock-skew инфляция блокирует pull-сторонний guard), ни prev+1
    // (interceptor-path стампит ДО HMR-guard в saveClientKey; авто-стамп
    // выпустил бы HMR-write в LS + upload). Возвращаем 0 → stamper вообще
    // не модифицирует day/items/trainings и не эмитит tombstones. Реальная
    // user-mutation всегда приходит с day.updatedAt из handler'a (например
    // `markUndoWindow(3000)` в day/_meals.js setGrams).
    void prevDay; // resolved param kept for API compat
    return 0;
  }


  function stampDayv2ChangedEntities(prevDay, nextDay) {
    if (!nextDay || typeof nextDay !== 'object') return nextDay;
    const mutationTs = resolveDayMutationTs(nextDay, prevDay);
    // HMR / suspect write: nextDay не имеет updatedAt. Stamper НЕ модифицирует
    // ничего — это вернёт payload как есть. HMR-guard на saveClientKey срежет
    // upload, а interceptor-path (без guard'a) запишет в LS только то, что
    // прислал caller, без авто-инжекта TS и tombstones.
    if (mutationTs === 0) return nextDay;
    if (!prevDay || typeof prevDay !== 'object') {
      const meals = Array.isArray(nextDay.meals)
        ? nextDay.meals.map((meal) => {
          if (!meal || typeof meal !== 'object') return meal;
          return {
            ...meal,
            updatedAt: Number(meal.updatedAt) || mutationTs,
            items: Array.isArray(meal.items)
              ? meal.items.map((item) => item && typeof item === 'object'
                ? { ...item, updatedAt: Number(item.updatedAt) || mutationTs }
                : item)
              : meal.items,
          };
        })
        : nextDay.meals;
      const trainings = Array.isArray(nextDay.trainings)
        ? nextDay.trainings.map((training) => training && typeof training === 'object'
          ? { ...training, updatedAt: Number(training.updatedAt) || mutationTs }
          : training)
        : nextDay.trainings;
      return { ...nextDay, meals, trainings, updatedAt: Number(nextDay.updatedAt) || mutationTs };
    }

    let dayChanged = !isDayMutationContentEqual(nextDay, prevDay);
    const prevDeletedItemIds = (prevDay.deletedItemIds && typeof prevDay.deletedItemIds === 'object' && !Array.isArray(prevDay.deletedItemIds))
      ? prevDay.deletedItemIds
      : null;
    const prevMealsById = mapByIdOrIndex(prevDay.meals);
    const meals = Array.isArray(nextDay.meals)
      ? nextDay.meals.map((meal, mealIndex) => {
        if (!meal || typeof meal !== 'object') return meal;
        const mealKey = meal.id != null ? String(meal.id) : `#${mealIndex}`;
        const prevMeal = prevMealsById.get(mealKey);
        const prevItemsById = mapByIdOrIndex(prevMeal && prevMeal.items);
        let mealChanged = !prevMeal || !isDayMutationContentEqual(
          { ...meal, items: [] },
          { ...(prevMeal || {}), items: [] },
        );
        let mealStamp = Number(meal.updatedAt) || Number(prevMeal && prevMeal.updatedAt) || 0;

        const items = Array.isArray(meal.items)
          ? meal.items.map((item, itemIndex) => {
            if (!item || typeof item !== 'object') return item;
            const itemKey = item.id != null ? String(item.id) : `#${itemIndex}`;
            const prevItem = prevItemsById.get(itemKey);
            const itemChanged = !prevItem || !isDayMutationContentEqual(item, prevItem);
            if (!itemChanged) {
              return {
                ...item,
                updatedAt: Number(item.updatedAt) || Number(prevItem && prevItem.updatedAt) || undefined,
              };
            }
            // Tombstone-aware promotion guard: если id уже в prev.deletedItemIds,
            // НЕ повышаем item.updatedAt до mutationTs. Stale React-стейт пишет
            // удалённый item обратно с свежим day.updatedAt → без guard'a stamper
            // выставил бы item.updatedAt = mutationTs > tombstoneTs → mergeDayData
            // воскресил бы удалённый продукт. Оставляем incoming-stamp как есть;
            // mergeItemsById tombstone-фильтр срежет stale item на upload.
            // Истинное re-добавление с тем же id безопасно: caller выставит
            // item.updatedAt = Date.now() > tombstoneTs → фильтр пропустит.
            const tombstoneTs = (prevDeletedItemIds && item.id != null)
              ? Number(prevDeletedItemIds[item.id]) || 0
              : 0;
            const prevItemTs = Number(prevItem && prevItem.updatedAt) || 0;
            let itemTs;
            if (tombstoneTs > 0) {
              // Preserve incoming stamp; do NOT auto-promote.
              itemTs = Number(item.updatedAt) || 0;
            } else {
              itemTs = mutationTs >= prevItemTs
                ? mutationTs
                : (Number(item.updatedAt) || mutationTs);
            }
            mealChanged = true;
            mealStamp = Math.max(mealStamp, itemTs);
            return { ...item, updatedAt: itemTs || undefined };
          })
          : meal.items;

        if (mealChanged && mutationTs > 0) mealStamp = Math.max(mealStamp, mutationTs);
        return { ...meal, items, updatedAt: mealStamp || undefined };
      })
      : nextDay.meals;

    const mergedDeletedTrainings = mergeTrainingTombstones(
      prevDay && prevDay.deletedTrainings,
      nextDay.deletedTrainings,
    );
    const prevTrainingsById = mapByIdOrIndex(prevDay.trainings);
    const trainings = Array.isArray(nextDay.trainings)
      ? nextDay.trainings.map((training, index) => {
        if (!training || typeof training !== 'object') return training;
        const trainingKey = training.id != null ? String(training.id) : `#${index}`;
        const prevTraining = prevTrainingsById.get(trainingKey);
        const trainingChanged = !prevTraining || !isDayMutationContentEqual(training, prevTraining);
        if (!trainingChanged) {
          return {
            ...training,
            updatedAt: Number(training.updatedAt) || Number(prevTraining && prevTraining.updatedAt) || undefined,
          };
        }
        dayChanged = true;
        const prevTrainingTs = Number(prevTraining && prevTraining.updatedAt) || 0;
        const explicitTrainingTs = Number(training.updatedAt) || 0;
        // A stale React snapshot can re-introduce a deleted training while carrying
        // a fresh day.updatedAt from reconcile/autosave. Do not turn that root stamp
        // into a newer entity stamp: the tombstone must still win. A genuine user
        // re-add/edit supplies its own training.updatedAt > deletedAt.
        const tombstoneTs = matchingTrainingDeletionTs(training, mergedDeletedTrainings);
        // Метка строки принадлежит тому, кто её правил. Автоповышение до
        // mutationTs (метки всей записи дня) выдавало stale React-снимку
        // свежесть, которой у него нет: снимок со старыми зонами приходил
        // «новее» кураторской правки и откатывал её (heys/9cb568, три отката
        // подряд 19.08). Настоящая правка приносит свою метку сама —
        // и пикер тренировки, и patchTraining ставят training.updatedAt.
        // Своей метки нет только у новой строки: ей и достаётся mutationTs.
        const trainingTs = tombstoneTs > 0
          ? explicitTrainingTs
          : (explicitTrainingTs || mutationTs);
        void prevTrainingTs;
        return { ...training, updatedAt: trainingTs || undefined };
      })
      : nextDay.trainings;

    // deletedItemIds: pass through existing tombstones (from prev) + any EXPLICIT
    // tombstone the caller already put on `next` (e.g. the removeItem handler).
    // We deliberately do NOT auto-emit tombstones from a prev→next item diff:
    // this stamper also runs on sync-writeback writes (pollOnce / live-refresh /
    // merge result, via the patched setItem). A merge that legitimately drops an
    // item would otherwise be turned into a PERMANENT deletion — a phantom
    // tombstone (incident 2026-06-05: it_pnqmnh "Молоко" tombstoned by pollOnce).
    // Deletion must be an explicit user action, not inferred from any diff.
    let mergedDeletedItemIds = (prevDay && prevDay.deletedItemIds && typeof prevDay.deletedItemIds === 'object' && !Array.isArray(prevDay.deletedItemIds))
      ? { ...prevDay.deletedItemIds }
      : undefined;
    if (nextDay.deletedItemIds && typeof nextDay.deletedItemIds === 'object' && !Array.isArray(nextDay.deletedItemIds)) {
      mergedDeletedItemIds = mergedDeletedItemIds || {};
      Object.keys(nextDay.deletedItemIds).forEach((id) => {
        const incomingTs = Number(nextDay.deletedItemIds[id]) || 0;
        const existingTs = Number(mergedDeletedItemIds[id]) || 0;
        if (incomingTs > existingTs) mergedDeletedItemIds[id] = incomingTs;
      });
    }
    // HMR-safe: при mutationTs=0 (нет источника TS) не выставляем явный day.updatedAt,
    // оставляем nextDay-значение как есть. Иначе на dayChanged-path мы бы получали 0,
    // что хоть и блокируется HMR-guard, но создаёт false signal для downstream debug.
    const resolvedDayTs = dayChanged && mutationTs > 0
      ? Math.max(Number(nextDay.updatedAt) || 0, mutationTs)
      : nextDay.updatedAt;
    const result = guardExplicitMutationGroups(prevDay, {
      ...nextDay,
      meals,
      trainings,
      updatedAt: resolvedDayTs,
    });
    if (mergedDeletedItemIds && Object.keys(mergedDeletedItemIds).length > 0) {
      result.deletedItemIds = mergedDeletedItemIds;
    }
    if (mergedDeletedTrainings.length > 0) {
      result.deletedTrainings = mergedDeletedTrainings;
    }
    return result;
  }

  // ─── cycleDay feature-gate (incident 2026-06-05 #3) ───────────────────────
  // Pure helpers used by the HEYS.storage interceptor chokepoint
  // (stampDayv2ValueForLocalMutation) to drop stale / cross-injected cycleDay for
  // users without cycle tracking. cycleDay валиден ТОЛЬКО когда у владельца дня
  // `cycleTrackingEnabled === true` — та же калитка, что гейтит UI cycle-шаг
  // (shouldShowCycleStep, heys_steps_v1.js). Без гейта stale cycleDay переживал
  // запись через carry-forward (yesterday-verify/checkin) и переотравлял облако.

  // Извлечь clientId владельца из scoped day-ключа; null для unscoped/legacy.
  function ownerClientIdFromDayKey(key) {
    const m = /^heys_([0-9a-f-]{36})_dayv2_\d{4}-\d{2}-\d{2}/i.exec(String(key || ''));
    return (m && m[1]) || null;
  }

  // Занулить cycleDay, если трекинг владельца ПОЛОЖИТЕЛЬНО выключен.
  // trackingEnabled: true (оставить), false (занулить), null/undefined
  // (неизвестно → оставить, чтобы не снести легит-данные при boot-race).
  // null (а не delete) — чтобы выиграть merge (`local.cycleDay === null`) и
  // протолкнуть очистку в облако. Возвращает тот же ref когда менять нечего.
  function gateCycleDayForOwner(day, trackingEnabled) {
    if (!day || typeof day !== 'object' || day.cycleDay == null) return day;
    if (trackingEnabled === false) {
      return Object.assign({}, day, { cycleDay: null });
    }
    return day;
  }

  // Optional health features gate — cycle/measurements/supplements stripped when
  // respective profile flags are off (same contract as storage interceptor).
  function gateHealthFieldsForOwner(day, profile) {
    const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    const hf = g.HEYS && g.HEYS.healthFeatures;
    if (hf && typeof hf.gateHealthFieldsForOwner === 'function') {
      return hf.gateHealthFieldsForOwner(day, profile);
    }
    if (!day || typeof day !== 'object' || !profile || typeof profile !== 'object') return day;
    let next = day;
    if (!(profile.gender === 'Женский' && profile.cycleTrackingEnabled === true)) {
      next = gateCycleDayForOwner(next, false);
      if (next.cycleStatus != null || next.cycleAnsweredAt != null || next.cycleUpdatedAt != null) {
        next = Object.assign({}, next, {
          cycleStatus: null,
          cycleAnsweredAt: null,
          cycleUpdatedAt: null,
        });
      }
    }
    if (profile.measurementsTrackingEnabled !== true && next.measurements != null) {
      next = Object.assign({}, next, { measurements: null });
    }
    if (profile.supplementsTrackingEnabled !== true) {
      const patch = {};
      ['supplementsPlanned', 'supplementsPlannedUpdatedAt', 'supplementsTaken',
        'supplementsTakenAt', 'supplementsTakenMeta', 'supplementsTakenUpdatedAt'].forEach((key) => {
        if (next[key] != null) patch[key] = null;
      });
      if (Object.keys(patch).length) next = Object.assign({}, next, patch);
    }
    return next;
  }

  return {
    mergeDayData,
    hasSubjectiveFieldDrop,
    hasMorningActivationRegression,
    mergeMorningActivationState,
    mergeChronoTombstones,
    mergeTrainingTombstones,
    trainingDeletionSignature,
    mergePlanningRecords,
    mergeHungerStatusEvents,
    mergeInsightsFeedback,
    mergeItemsById,
    // Журнал воды: чистые помощники, общие для записи (day handlers) и слияния.
    readWaterEntries,
    sumWaterEntries,
    normalizeWaterEntries,
    resolveWaterMl,
    appendWaterEntry,
    mergeWaterJournal,
    WATER_SEED_ID,
    mergeScalarKv,
    mergeScalarKvWithOutcome,
    mergeMorningCheckinProgress,
    hasMorningCheckinProgressConflict,
    stripStaleSavedDisplayNutrientsIfEmptyDiary,
    recalculateSavedEatenFromMeals,
    // Pure dayv2 stamping helpers (used by HEYS.storage interceptor + tests):
    stampDayv2ChangedEntities,
    stripDayMutationStamps,
    isDayMutationContentEqual,
    resolveDayMutationTs,
    // Pure cycleDay feature-gate helpers (used by interceptor chokepoint + tests):
    ownerClientIdFromDayKey,
    gateCycleDayForOwner,
    gateHealthFieldsForOwner,
  };
});
