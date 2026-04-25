// heys_day_updated_dispatcher_v1.js — Foundation 1: priority dispatcher для heys:day-updated.
//
// Зачем: 13+ файлов подписаны на window.addEventListener('heys:day-updated'). При cascade-batch
// или sync-pull эвент диспатчится N раз → N × 13 синхронных колбэков на main thread.
// Только 2-3 из 13 действительно тяжелые (cascade card invalidation, leaderboard, EWS).
// Остальные — лёгкие cache.delete или setState.
//
// Решение: dispatcher подписывается на window event ОДИН раз и маршрутизирует подписчиков
// через приоритетные lane'ы с дедупликацией в окне. Старые window.addEventListener-подписчики
// продолжают работать БЕЗ изменений — dispatcher не интерцептит, не блокирует.
//
// Lane'ы:
//   • immediate   — синхронно (для critical UX, например cascade card визуальная корректность)
//   • next-frame  — через requestAnimationFrame (medium-cost обработчики)
//   • idle        — через requestIdleCallback (background work, EWS, gamification)
//
// API (только для НОВЫХ подписчиков; старые используют window.addEventListener):
//   const off = HEYS.events.dayUpdated.subscribe(handler, { priority: 'next-frame' })
//   off()                                                                  // отписаться
//   HEYS.events.dayUpdated.getStats()                                      // диагностика
//
// Дедупликация:
//   • Каждый lane имеет Map<dedupeKey, lastDetail>; повторный эвент в окне до flush
//     перезаписывает detail (последний выигрывает).
//   • dedupeKey = detail.dedupeKey || `${detail.date}|${detail.source}`
//
(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.events = HEYS.events || {};

  if (HEYS.events.dayUpdated && HEYS.events.dayUpdated.version) return; // re-load guard

  const handlers = {
    immediate: new Set(),
    'next-frame': new Set(),
    idle: new Set(),
  };

  const pending = {
    immediate: new Map(),
    'next-frame': new Map(),
    idle: new Map(),
  };
  let nextFrameScheduled = false;
  let idleScheduled = false;

  // Telemetry
  let totalDispatched = 0;
  let totalDeduped = 0;

  function getDedupeKey(detail) {
    if (!detail) return '';
    if (typeof detail.dedupeKey === 'string') return detail.dedupeKey;
    return [detail.date || detail.dateStr || '', detail.source || ''].join('|');
  }

  function flushLane(priority) {
    const queue = pending[priority];
    if (queue.size === 0) return;
    const items = Array.from(queue.values());
    queue.clear();
    const callbacks = Array.from(handlers[priority]);
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < callbacks.length; j++) {
        try { callbacks[j](items[i]); }
        catch (e) {
          if (typeof console !== 'undefined') {
            console.warn('[HEYS.events.dayUpdated] handler error in', priority, e);
          }
        }
      }
    }
  }

  function scheduleNextFrame() {
    if (nextFrameScheduled) return;
    nextFrameScheduled = true;
    const raf = global.requestAnimationFrame || ((cb) => global.setTimeout(cb, 16));
    raf(() => {
      nextFrameScheduled = false;
      flushLane('next-frame');
    });
  }

  function scheduleIdle() {
    if (idleScheduled) return;
    idleScheduled = true;
    const ric = global.requestIdleCallback || ((cb) => global.setTimeout(cb, 32));
    ric(() => {
      idleScheduled = false;
      flushLane('idle');
    }, { timeout: 1000 });
  }

  function enqueue(detail) {
    const key = getDedupeKey(detail);
    totalDispatched += 1;

    if (handlers.immediate.size > 0) {
      if (pending.immediate.has(key)) totalDeduped += 1;
      pending.immediate.set(key, detail);
      flushLane('immediate'); // immediate flushes synchronously
    }
    if (handlers['next-frame'].size > 0) {
      if (pending['next-frame'].has(key)) totalDeduped += 1;
      pending['next-frame'].set(key, detail);
      scheduleNextFrame();
    }
    if (handlers.idle.size > 0) {
      if (pending.idle.has(key)) totalDeduped += 1;
      pending.idle.set(key, detail);
      scheduleIdle();
    }
  }

  // Слушаем window event → маршрутизируем через lane'ы (для новых подписчиков).
  // Старые window.addEventListener-подписчики получают эвент напрямую от window — мы их не трогаем.
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('heys:day-updated', (e) => {
      enqueue((e && e.detail) || {});
    });
  }

  function subscribe(handler, opts) {
    if (typeof handler !== 'function') return () => {};
    const priority = (opts && opts.priority) || 'next-frame';
    const set = handlers[priority] || handlers['next-frame'];
    set.add(handler);
    return () => { set.delete(handler); };
  }

  function getStats() {
    return {
      handlerCounts: {
        immediate: handlers.immediate.size,
        'next-frame': handlers['next-frame'].size,
        idle: handlers.idle.size,
      },
      pendingCounts: {
        immediate: pending.immediate.size,
        'next-frame': pending['next-frame'].size,
        idle: pending.idle.size,
      },
      totalDispatched,
      totalDeduped,
    };
  }

  HEYS.events.dayUpdated = {
    subscribe,
    getStats,
    version: 1,
  };
})(typeof window !== 'undefined' ? window : globalThis);
