// heys_day_v12.ts — вкладка «День» (TypeScript version)

import React from 'react';

import type {
  DayRecord,
  DayTabProps,
  HEYSGlobal,
  Product,
  UserProfile,
} from './types/heys';

// Declare global types
declare global {
  interface Window {
    React: typeof React;
    HEYS: HEYSGlobal;
  }
}

// Type definitions specific to day component - удаляем LocalDayTabProps
type SafeEventListener = (event: Event) => void;

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const React = global.React;

  // Utility functions
  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  function todayISO(): string {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function uid(p?: string): string {
    return (p || 'id') + Math.random().toString(36).slice(2, 8);
  }

  function lsGet(k: string, d: unknown): unknown {
    try {
      if (HEYS.store && typeof HEYS.store.get === 'function') {
        const result = HEYS.store.get(k, d);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
        return result;
      }
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }

  function lsSet(k: string, v: unknown): void {
    try {
      if (HEYS.store && typeof HEYS.store.set === 'function') {
        HEYS.store.set(k, v);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
        return;
      }
      // Сначала пишем в localStorage для мгновенной доступности другим вкладкам
      try {
        localStorage.setItem(k, JSON.stringify(v));
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
      } catch (e) {
        void e;
      }
      // Потом отправляем в облако (асинхронно)
      try {
        window.HEYS.saveClientKey(k, v);
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
    }
  }

  // Используем общие модели вместо локальных дубликатов
  function ensureDay(d: Partial<DayRecord> | null, prof?: UserProfile): DayRecord {
    const dayData = d || {};
    if (HEYS.models?.ensureDay) {
      return HEYS.models.ensureDay(dayData, prof);
    }
    return {
      date: todayISO(),
      sleepStart: '',
      sleepEnd: '',
      sleepNote: '',
      sleepQuality: '',
      weightMorning: '',
      deficitPct: '',
      steps: 0,
      householdMin: 0,
      trainings: [{ z: [0, 0, 0, 0] }, { z: [0, 0, 0, 0] }],
      dayScore: '',
      moodAvg: '',
      wellbeingAvg: '',
      stressAvg: '',
      dayComment: '',
      meals: [
        {
          id: uid(),
          name: 'Приём пищи',
          time: '',
          mood: '',
          wellbeing: '',
          stress: '',
          items: [],
        },
      ],
      ...dayData,
    } as DayRecord;
  }

  // Main DayTab component
  function DayTab(props: DayTabProps): React.ReactElement {
    const { useState, useEffect } = React;
    const { products: initialProducts = [] } = props;
    const date = todayISO(); // используем сегодняшнюю дату как дефолт

    // Трекинг просмотра дня
    useEffect(() => {
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('day-viewed');
      }
    }, []);

    const [products, setProducts] = useState<Product[]>(() => {
      // Приоритет: переданные props, затем стандартная логика загрузки
      if (initialProducts.length > 0) {
        return initialProducts;
      }

      // Используем HEYS.store.get для получения продуктов с учетом client_id
      if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
        const stored = window.HEYS.store.get('heys_products', []);
        if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
          window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
        }
        return Array.isArray(stored) ? stored : [];
      } else if (
        window.HEYS &&
        window.HEYS.products &&
        typeof window.HEYS.products.getAll === 'function'
      ) {
        // Fallback к products API
        const stored = window.HEYS.products.getAll();
        if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
          window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
        }
        return stored;
      } else {
        // Последний fallback к localStorage (может не работать с client_id)
        const stored = window.HEYS.utils.lsGet('heys_products', []);
        if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
          window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
        }
        return Array.isArray(stored) ? stored : [];
      }
    });

    // Подписка на события обновления продуктов
    useEffect(() => {
      const handleProductsUpdate = (event: CustomEvent<{ products: Product[] }>) => {
        if (event.detail?.products) {
          setProducts(event.detail.products);
        }
      };

      window.addEventListener('heysProductsUpdated', handleProductsUpdate as SafeEventListener);
      return () =>
        window.removeEventListener(
          'heysProductsUpdated',
          handleProductsUpdate as SafeEventListener,
        );
    }, []);

    // День данных
    const dayKey = `heys_dayv2_${date}`;
    const [day, setDay] = useState<DayRecord>(() => {
      const stored = lsGet(dayKey, null) as Partial<DayRecord> | null;
      return ensureDay(stored);
    });

    // Автосохранение дня
    useEffect(() => {
      lsSet(dayKey, day);
    }, [JSON.stringify(day)]);

    // Синхронизация при смене клиента
    useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;

      const reloadData = () => {
        if (cancelled) return;
        const newDay = lsGet(dayKey, null) as Partial<DayRecord> | null;
        setDay(ensureDay(newDay));
      };

      if (clientId && cloud && cloud.bootstrapClientSync) {
        cloud.bootstrapClientSync(clientId).then(() => {
          setTimeout(reloadData, 150);
        });
      }

      return () => {
        cancelled = true;
      };
    }, [window.HEYS && window.HEYS.currentClientId]);

    // Render basic structure for now
    return React.createElement(
      'div',
      { className: 'day-tab' },
      React.createElement('h2', null, `День: ${date}`),
      React.createElement('div', null, `Приёмов пищи: ${day.meals?.length || 0}`),
      React.createElement('div', null, `Продуктов доступно: ${products.length}`),
    );
  }

  // Export to HEYS namespace
  HEYS.DayTab = DayTab;
})(window);
