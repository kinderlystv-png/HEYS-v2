// heys_day_v12.ts — вкладка «День» (TypeScript version)

import React from 'react';
import type {
  Product,
  DayRecord,
  UserProfile,
  HEYSGlobal,
  Meal,
  MealItem,
  Training,
  ProductIndex,
  NutritionTotals,
  DayTabProps, // используем существующий тип
} from './types/heys';

// Declare global types
declare global {
  interface Window {
    React: typeof React;
    HEYS: HEYSGlobal;
  }
}

// Type definitions specific to day component - удаляем LocalDayTabProps

interface MealComponentProps {
  meal: Meal;
  mealIndex: number;
  products: Product[];
  productIndex: ProductIndex;
  onUpdateMeal: (mealIndex: number, meal: Meal) => void;
  onDeleteMeal: (mealIndex: number) => void;
}

interface MealItemComponentProps {
  item: MealItem;
  itemIndex: number;
  mealIndex: number;
  product: Product | null;
  onUpdateItem: (mealIndex: number, itemIndex: number, item: MealItem) => void;
  onDeleteItem: (mealIndex: number, itemIndex: number) => void;
}

interface MealAddProductProps {
  mealIndex: number;
  products: Product[];
  productIndex: ProductIndex;
  onAddProduct: (mealIndex: number, productName: string, grams: number) => void;
}

interface TrainingComponentProps {
  trainings: Training[];
  onUpdateTraining: (trainings: Training[]) => void;
}

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

  function fmtDate(d: Date): string {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(s: string): Date {
    const [y, m, d] = String(s || '')
      .split('-')
      .map(x => parseInt(x, 10));
    if (!y || !m || !d) return new Date();
    const dt = new Date(y, m - 1, d);
    dt.setHours(12);
    return dt;
  }

  function uid(p?: string): string {
    return (p || 'id') + Math.random().toString(36).slice(2, 8);
  }

  function lsGet(k: string, d: any): any {
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

  function lsSet(k: string, v: any): void {
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
      } catch (e) {}
      // Потом отправляем в облако (асинхронно)
      try {
        window.HEYS.saveClientKey(k, v);
      } catch (e) {}
    } catch (e) {}
  }

  function clamp(n: number, a: number, b: number): number {
    n = +n || 0;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  const r1 = (v: number): number => Math.round((+v || 0) * 10) / 10;

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

  function buildProductIndex(ps: readonly Product[]): ProductIndex {
    const products = Array.from(ps);
    return HEYS.models?.buildProductIndex
      ? HEYS.models.buildProductIndex(products)
      : {
          byId: new Map(),
          byName: new Map(),
        };
  }

  function mealTotals(meal: Meal, idx: ProductIndex): NutritionTotals {
    return HEYS.models?.mealTotals
      ? HEYS.models.mealTotals(meal, idx)
      : {
          kcal: 0,
          carbs: 0,
          simple: 0,
          complex: 0,
          prot: 0,
          protein: 0,
          fat: 0,
          bad: 0,
          good: 0,
          trans: 0,
          fiber: 0,
        };
  }

  // Main DayTab component
  function DayTab(props: DayTabProps): React.ReactElement {
    const { useState, useMemo, useEffect } = React;
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

    const pIndex = useMemo(() => buildProductIndex(products), [products]);

    // Подписка на события обновления продуктов
    useEffect(() => {
      const handleProductsUpdate = (event: CustomEvent<{ products: Product[] }>) => {
        if (event.detail?.products) {
          setProducts(event.detail.products);
        }
      };

      window.addEventListener('heysProductsUpdated', handleProductsUpdate as EventListener);
      return () =>
        window.removeEventListener('heysProductsUpdated', handleProductsUpdate as EventListener);
    }, []);

    // День данных
    const dayKey = `heys_dayv2_${date}`;
    const [day, setDay] = useState<DayRecord>(() => {
      const stored = lsGet(dayKey, null);
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
        const newDay = lsGet(dayKey, null);
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
      React.createElement('div', null, `Продуктов доступно: ${products.length}`)
    );
  }

  // Export to HEYS namespace
  HEYS.DayTab = DayTab;
})(window);
