import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchClientDayData, fetchClientDetails } from '../api/clientDay';
import type { ClientDayData, ClientDetails } from '../types/api';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface UseClientDayResult {
  client?: ClientDetails | null;
  dayData?: ClientDayData | null;
  date: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  setDate(date: string): void;
  goToPrevDay(): void;
  goToNextDay(): void;
  reload(): void;
  addMeal(draft: MealDraft): void;
  updateMeal(mealId: string, draft: MealDraft): void;
  removeMeal(mealId: string): void;
}

export interface MealDraft {
  type: ClientDayData['meals'][number]['type'];
  time: string;
  product: MealProductDraft;
}

export interface MealProductDraft {
  name: string;
  weight: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function useClientDay(clientId: string | null): UseClientDayResult {
  const [client, setClient] = useState<ClientDetails | null>(null);
  const [dayData, setDayData] = useState<ClientDayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [date, setDate] = useState(() => formatDate(new Date()));

  const loadData = useCallback(async () => {
    if (!clientId) {
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setErrorMessage(null);

    try {
      const [details, day] = await Promise.all([
        fetchClientDetails(clientId),
        fetchClientDayData(clientId, date)
      ]);

      setClient(details);
      setDayData(day);
    } catch (error) {
      setIsError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goToPrevDay = useCallback(() => {
    setDate((prev) => formatDate(new Date(new Date(prev).getTime() - ONE_DAY_MS)));
  }, []);

  const goToNextDay = useCallback(() => {
    setDate((prev) => formatDate(new Date(new Date(prev).getTime() + ONE_DAY_MS)));
  }, []);

  const memoizedDayData = useMemo(() => dayData, [dayData]);
  const memoizedClient = useMemo(() => client, [client]);

  const applyMealsUpdate = useCallback((updater: (current: ClientDayData) => ClientDayData) => {
    setDayData((current) => {
      const base = current ?? createEmptyDay(clientId ?? 'unknown', date);
      return updater(base);
    });
  }, [clientId, date]);

  const addMeal = useCallback((draft: MealDraft) => {
    applyMealsUpdate((current) => {
      const newMeal = draftToMeal(draft);
      const meals = [...current.meals, newMeal].sort(sortMeals);
      return {
        ...current,
        meals,
        totals: recalcTotals(meals)
      };
    });
  }, [applyMealsUpdate]);

  const updateMeal = useCallback((mealId: string, draft: MealDraft) => {
    applyMealsUpdate((current) => {
      const meals = current.meals.map((meal) =>
        meal.id === mealId ? { ...draftToMeal(draft, mealId) } : meal
      ).sort(sortMeals);
      return {
        ...current,
        meals,
        totals: recalcTotals(meals)
      };
    });
  }, [applyMealsUpdate]);

  const removeMeal = useCallback((mealId: string) => {
    applyMealsUpdate((current) => {
      const meals = current.meals.filter((meal) => meal.id !== mealId);
      return {
        ...current,
        meals,
        totals: recalcTotals(meals)
      };
    });
  }, [applyMealsUpdate]);

  return {
    client: memoizedClient,
    dayData: memoizedDayData,
    date,
    isLoading,
    isError,
    errorMessage,
    setDate,
    goToPrevDay,
    goToNextDay,
    reload: loadData,
    addMeal,
    updateMeal,
    removeMeal
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createEmptyDay(clientId: string, date: string): ClientDayData {
  return {
    clientId,
    date,
    meals: [],
    totals: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    }
  };
}

function draftToMeal(draft: MealDraft, forcedId?: string): ClientDayData['meals'][number] {
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `local-${crypto.randomUUID()}`;
    }
    return `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  };

  return {
    id: forcedId ?? generateId(),
    type: draft.type,
    time: draft.time || '00:00',
    products: [
      {
        name: draft.product.name || 'Продукт',
        weight: Number.isFinite(draft.product.weight) ? draft.product.weight : 0,
        calories: Number.isFinite(draft.product.calories) ? draft.product.calories : 0,
        protein: Number.isFinite(draft.product.protein) ? draft.product.protein : 0,
        carbs: Number.isFinite(draft.product.carbs) ? draft.product.carbs : 0,
        fat: Number.isFinite(draft.product.fat) ? draft.product.fat : 0
      }
    ]
  };
}

function recalcTotals(meals: ClientDayData['meals']): ClientDayData['totals'] {
  return meals.reduce<ClientDayData['totals']>((acc, meal) => {
    meal.products.forEach((product) => {
      acc.calories += product.calories;
      acc.protein += product.protein;
      acc.carbs += product.carbs;
      acc.fat += product.fat;
    });
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function sortMeals(a: ClientDayData['meals'][number], b: ClientDayData['meals'][number]) {
  return a.time.localeCompare(b.time);
}
