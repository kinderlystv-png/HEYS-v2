/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_reports_v12.ts (594 строки)                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 📘 ТИПЫ И ИНТЕРФЕЙСЫ (строки 1-100):                                                     │
│    ├── Импорты типов (3-13)                                                             │
│    ├── Global interface (15-21)                                                         │
│    ├── TimeData интерфейс (23-26)                                                       │
│    ├── CacheEntry<T> (28-31)                                                           │
│    ├── WeekData интерфейс (33-37)                                                       │
│    ├── ChartData интерфейс (39-49)                                                      │
│    └── Дополнительные типы отчетов (50-70)                                              │
│                                                                                           │
│ 🛠️ УТИЛИТЫ И КЕШИРОВАНИЕ (строки 101-200):                                              │
│    ├── Базовые утилиты: pad2, fmtDate, round1 (71-85)                                  │
│    ├── Функции времени: parseTime, sleepHours (86-105)                                  │
│    ├── Система кэширования с типами (106-130)                                           │
│    ├── invalidateCache() - типизированная очистка (131-150)                             │
│    └── clearAllCache() - полная очистка (151-170)                                       │
│                                                                                           │
│ 📊 СБОР И АГРЕГАЦИЯ ДАННЫХ (строки 201-350):                                             │
│    ├── collectDay() - типизированный сбор (171-220)                                     │
│    ├── buildProductIndex() - индексация (221-250)                                       │
│    ├── aggregateDay() - агрегация с типами (251-290)                                    │
│    ├── getDayData() - получение данных (291-320)                                        │
│    └── getWeekData() - недельные данные (321-350)                                       │
│                                                                                           │
│ 📈 СИСТЕМА ГРАФИКОВ CHART.JS (строки 351-500):                                           │
│    ├── loadChartJS() - ленивая загрузка (351-380)                                       │
│    ├── createWeightChart() - график веса (381-430)                                      │
│    ├── createSleepChart() - график сна (431-470)                                        │
│    ├── createActivityChart() - активность (471-490)                                     │
│    └── createNutritionChart() - питание (491-500)                                       │
│                                                                                           │
│ 🖼️ МОДАЛЬНЫЕ ОКНА И UI (строки 501-550):                                                │
│    ├── createModal() - типизированное создание (501-520)                                │
│    ├── showChartModal() - показ графиков (521-540)                                      │
│    ├── closeModal() - закрытие (541-545)                                                │
│    └── setupModalEvents() - обработчики (546-550)                                       │
│                                                                                           │
│ ⚛️ REACT КОМПОНЕНТ ReportsTab (строки 551-594):                                          │
│    ├── Типизированный конструктор (551-560)                                             │
│    ├── State с интерфейсами (561-570)                                                   │
│    ├── render() - основной рендер (571-590)                                             │
│    └── Экспорт с типами (591-594)                                                       │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Типы: WeekData (33), ChartData (39), CacheEntry (28)                              │
│    • Данные: collectDay() (171), aggregateDay() (251)                                   │
│    • Графики: loadChartJS() (351), createWeightChart() (381)                           │
│    • React: ReportsTab (551), render() (571)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_reports_v12.ts — Отчётность: таблицы за 4 недели + графики (TypeScript version)

import React from 'react';
import type {
  Product,
  DayRecord,
  UserProfile,
  HEYSGlobal,
  ReportTabProps,
  PulseZone,
  ReportRow,
  MealTotals,
} from './types/heys';

// Declare global types
declare global {
  interface Window {
    React: typeof React;
    HEYS: HEYSGlobal;
    ChartJS?: any; // Chart.js может быть загружен динамически
  }
}

// Report-specific types
interface TimeData {
  hh: number;
  mm: number;
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

interface WeekData {
  weekStart: string;
  days: ReportRow[];
  averages: Partial<ReportRow>;
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
  }>;
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const React = global.React;

  // ---------- Утилиты ----------
  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  function fmtDate(d: Date): string {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function round1(x: number): number {
    return Math.round((+x || 0) * 10) / 10;
  }

  function toNum(x: any): number {
    const v = +x;
    return Number.isFinite(v) ? v : 0;
  }

  function pct(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  // Функции для работы со временем сна
  function parseTime(timeStr: string): TimeData | null {
    if (!timeStr) return null;
    const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
    return m ? { hh: +m[1], mm: +m[2] } : null;
  }

  function sleepHours(startTime: string, endTime: string): number {
    const s = parseTime(startTime),
      e = parseTime(endTime);
    if (!s || !e) return 0;
    let sh = s.hh + s.mm / 60,
      eh = e.hh + e.mm / 60;
    let d = eh - sh;
    if (d < 0) d += 24;
    return round1(d);
  }

  // ---------- Кэширование вычислений ----------
  const dayCache = new Map<string, CacheEntry<ReportRow>>();
  const maxCacheSize = 200; // Увеличиваем размер кэша для хранения большего количества дней

  // Кэш для тяжелых вычислений недель
  const weekCache = new Map<string, CacheEntry<WeekData>>();
  const maxWeekCacheSize = 20;

  // Инвалидация кэша при изменении данных
  function invalidateCache(pattern?: string): void {
    const keysToDelete: string[] = [];
    for (const key of dayCache.keys()) {
      if (!pattern || key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => dayCache.delete(key));

    // Также очищаем кэш недель если изменились дни
    if (pattern) {
      weekCache.clear();
    }

    if (window.HEYS && window.HEYS.performance) {
      window.HEYS.performance.increment('cacheInvalidations');
    }
  }

  // Функция для полной очистки кэша (для отладки)
  function clearAllCache(): void {
    dayCache.clear();
    weekCache.clear();
    console.log('Кэш отчетов полностью очищен');
  }

  // Делаем функцию доступной глобально для отладки
  if (window.HEYS) {
    window.HEYS.clearReportsCache = clearAllCache;
  }

  // Подписка на изменения данных дней
  function setupCacheInvalidation(): void {
    if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.watch === 'function') {
      // Следим за изменениями дней
      const currentDate = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);
        const dateStr = fmtDate(date);

        window.HEYS.store.watch(`dayv2_${dateStr}`, () => {
          invalidateCache(dateStr);
        });
      }

      // Следим за изменениями продуктов и профиля
      window.HEYS.store.watch('products', () => {
        invalidateCache(); // Полная инвалидация при изменении продуктов
      });

      window.HEYS.store.watch('profile', () => {
        invalidateCache(); // Полная инвалидация при изменении профиля
      });

      window.HEYS.store.watch('hr_zones', () => {
        invalidateCache(); // Полная инвалидация при изменении зон
      });
    }
  }

  function getCacheKey(
    dateStr: string,
    products: Product[],
    profile: UserProfile,
    zones: PulseZone[]
  ): string {
    const productsHash = JSON.stringify(products).substring(0, 100); // Усеченный хэш для производительности
    const profileHash = JSON.stringify(profile);
    const zonesHash = JSON.stringify(zones);
    return `${dateStr}_${productsHash}_${profileHash}_${zonesHash}`;
  }

  // ---------- Основная функция расчета строки отчета ----------
  function buildReportRow(
    dateStr: string,
    products: Product[],
    profile: UserProfile,
    zones: PulseZone[]
  ): ReportRow {
    const start = performance.now();

    // Проверяем кэш
    const cacheKey = getCacheKey(dateStr, products, profile, zones);
    const cached = dayCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) {
      // Кэш на 1 минуту
      if (window.HEYS && window.HEYS.performance) {
        window.HEYS.performance.increment('cacheHits');
      }
      return cached.value;
    }

    const day: DayRecord = HEYS.lsGet(`dayv2_${dateStr}`) || { date: dateStr, meals: [] };
    const totals: MealTotals = HEYS.calculateTotalsFromMeals(day.meals, products);

    // BMR расчет
    const bmr = HEYS.calculateBMR ? HEYS.calculateBMR(profile) : 0;

    // Тренировки
    const trainings = day.trainings || [];
    let totalTrainHr = 0,
      totalZone2 = 0,
      totalZone3 = 0,
      totalZone4 = 0,
      totalZone5 = 0;
    let trainDuration = 0,
      trainCalories = 0;

    for (const t of trainings) {
      const dur = toNum(t.duration);
      const cal = toNum(t.calories);
      const hr = toNum(t.avgHr);
      trainDuration += dur;
      trainCalories += cal;
      if (hr > 0) totalTrainHr += hr;

      // Распределение по зонам (приближенно)
      if (zones.length >= 5) {
        if (hr >= zones[4].min) totalZone5 += dur;
        else if (hr >= zones[3].min) totalZone4 += dur;
        else if (hr >= zones[2].min) totalZone3 += dur;
        else if (hr >= zones[1].min) totalZone2 += dur;
      }
    }

    const avgTrainHr = trainings.length > 0 ? Math.round(totalTrainHr / trainings.length) : 0;

    // Сон
    const sleepH = sleepHours(day.sleepStart || '', day.sleepEnd || '');

    // Составляем строку отчета
    const row: ReportRow = {
      date: dateStr,
      kcal: round1(totals.kcal),
      protein: round1(totals.protein),
      fat: round1(totals.fat),
      carbs: round1(totals.carbs),
      weight: toNum(day.weight),
      bmr: round1(bmr),
      kcalBalance: round1(totals.kcal - bmr - trainCalories),
      trainDuration: round1(trainDuration),
      trainCalories: round1(trainCalories),
      avgTrainHr,
      zone2: round1(totalZone2),
      zone3: round1(totalZone3),
      zone4: round1(totalZone4),
      zone5: round1(totalZone5),
      sleepHours: sleepH,
      notes: day.notes || '',

      // Процентные соотношения БЖУ
      proteinPct: pct(totals.protein * 4, totals.kcal),
      fatPct: pct(totals.fat * 9, totals.kcal),
      carbsPct: pct(totals.carbs * 4, totals.kcal),
    };

    // Сохраняем в кэш
    if (dayCache.size >= maxCacheSize) {
      // Удаляем самые старые записи
      const oldestKey = dayCache.keys().next().value;
      if (oldestKey) dayCache.delete(oldestKey);
    }

    dayCache.set(cacheKey, { value: row, timestamp: Date.now() });

    if (window.HEYS && window.HEYS.performance) {
      window.HEYS.performance.increment('reportRowCalculations');
      window.HEYS.performance.timing('reportRowBuildTime', performance.now() - start);
    }

    return row;
  }

  // ---------- Вычисление данных за период ----------
  function generateReportData(daysCount: number = 28): ReportRow[] {
    const start = performance.now();

    const products: Product[] = HEYS.lsGet('products') || [];
    const profile: UserProfile = HEYS.lsGet('profile') || {};
    const zones: PulseZone[] = HEYS.lsGet('hr_zones') || [];

    const rows: ReportRow[] = [];
    const currentDate = new Date();

    for (let i = 0; i < daysCount; i++) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - i);
      const dateStr = fmtDate(date);

      const row = buildReportRow(dateStr, products, profile, zones);
      rows.push(row);
    }

    if (window.HEYS && window.HEYS.performance) {
      window.HEYS.performance.timing('generateReportData', performance.now() - start);
    }

    return rows.reverse(); // Возвращаем в хронологическом порядке
  }

  // ---------- Группировка по неделям ----------
  function groupByWeeks(rows: ReportRow[]): WeekData[] {
    const weeks: WeekData[] = [];
    let currentWeek: ReportRow[] = [];
    let currentWeekStart = '';

    for (const row of rows) {
      const date = new Date(row.date);
      const dayOfWeek = (date.getDay() + 6) % 7; // Понедельник = 0

      if (dayOfWeek === 0) {
        // Начало новой недели
        if (currentWeek.length > 0) {
          weeks.push({
            weekStart: currentWeekStart,
            days: [...currentWeek],
            averages: calculateWeekAverages(currentWeek),
          });
        }
        currentWeek = [row];
        currentWeekStart = row.date;
      } else {
        currentWeek.push(row);
      }
    }

    // Добавляем последнюю неделю
    if (currentWeek.length > 0) {
      weeks.push({
        weekStart: currentWeekStart,
        days: [...currentWeek],
        averages: calculateWeekAverages(currentWeek),
      });
    }

    return weeks;
  }

  // ---------- Вычисление средних значений за неделю ----------
  function calculateWeekAverages(days: ReportRow[]): Partial<ReportRow> {
    if (days.length === 0) return {};

    const totals = days.reduce(
      (acc, day) => {
        acc.kcal += day.kcal;
        acc.protein += day.protein;
        acc.fat += day.fat;
        acc.carbs += day.carbs;
        acc.weight += day.weight || 0;
        acc.trainDuration += day.trainDuration;
        acc.trainCalories += day.trainCalories;
        acc.sleepHours += day.sleepHours;
        acc.zone2 += day.zone2;
        acc.zone3 += day.zone3;
        acc.zone4 += day.zone4;
        acc.zone5 += day.zone5;
        return acc;
      },
      {
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        weight: 0,
        trainDuration: 0,
        trainCalories: 0,
        sleepHours: 0,
        zone2: 0,
        zone3: 0,
        zone4: 0,
        zone5: 0,
      }
    );

    const count = days.length;
    const weightCount = days.filter(d => d.weight > 0).length;

    return {
      kcal: round1(totals.kcal / count),
      protein: round1(totals.protein / count),
      fat: round1(totals.fat / count),
      carbs: round1(totals.carbs / count),
      weight: weightCount > 0 ? round1(totals.weight / weightCount) : 0,
      trainDuration: round1(totals.trainDuration / count),
      trainCalories: round1(totals.trainCalories / count),
      sleepHours: round1(totals.sleepHours / count),
      zone2: round1(totals.zone2 / count),
      zone3: round1(totals.zone3 / count),
      zone4: round1(totals.zone4 / count),
      zone5: round1(totals.zone5 / count),
    };
  }

  // ---------- Построение графиков ----------
  function prepareChartData(rows: ReportRow[], field: keyof ReportRow, label: string): ChartData {
    const last14Days = rows.slice(-14); // Последние 2 недели для графиков

    return {
      labels: last14Days.map(row => {
        const date = new Date(row.date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      }),
      datasets: [
        {
          label,
          data: last14Days.map(row => {
            const value = row[field];
            return typeof value === 'number' ? value : 0;
          }),
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true,
        },
      ],
    };
  }

  function renderChart(canvasId: string, data: ChartData, title: string): void {
    if (!window.ChartJS) {
      console.warn('Chart.js не загружен');
      return;
    }

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      console.warn(`Canvas ${canvasId} не найден`);
      return;
    }

    // Уничтожаем предыдущий график если есть
    const existingChart = (canvas as any).chart;
    if (existingChart) {
      existingChart.destroy();
    }

    const chart = new window.ChartJS(canvas.getContext('2d'), {
      type: 'line',
      data,
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
          },
        },
        scales: {
          y: {
            beginAtZero: false,
          },
        },
      },
    });

    // Сохраняем ссылку для последующего уничтожения
    (canvas as any).chart = chart;
  }

  // ---------- React компоненты ----------

  const ReportTable: React.FC<{ rows: ReportRow[]; averages?: Partial<ReportRow> }> = ({
    rows,
    averages,
  }) => {
    return React.createElement(
      'table',
      { className: 'report-table' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', null, 'Дата'),
          React.createElement('th', null, 'Ккал'),
          React.createElement('th', null, 'Б'),
          React.createElement('th', null, 'Ж'),
          React.createElement('th', null, 'У'),
          React.createElement('th', null, 'Вес'),
          React.createElement('th', null, 'Тренировка'),
          React.createElement('th', null, 'Сон')
        )
      ),
      React.createElement(
        'tbody',
        null,
        ...rows.map((row, i) =>
          React.createElement(
            'tr',
            { key: i, className: 'report-row' },
            React.createElement('td', null, row.date),
            React.createElement('td', null, row.kcal),
            React.createElement('td', null, row.protein),
            React.createElement('td', null, row.fat),
            React.createElement('td', null, row.carbs),
            React.createElement('td', null, row.weight || '-'),
            React.createElement('td', null, row.trainDuration ? `${row.trainDuration}мин` : '-'),
            React.createElement('td', null, row.sleepHours ? `${row.sleepHours}ч` : '-')
          )
        ),
        averages &&
          React.createElement(
            'tr',
            { className: 'average-row' },
            React.createElement('td', null, React.createElement('strong', null, 'Средние')),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, averages.kcal || '-')
            ),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, averages.protein || '-')
            ),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, averages.fat || '-')
            ),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, averages.carbs || '-')
            ),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, averages.weight || '-')
            ),
            React.createElement(
              'td',
              null,
              React.createElement(
                'strong',
                null,
                averages.trainDuration ? `${averages.trainDuration}мин` : '-'
              )
            ),
            React.createElement(
              'td',
              null,
              React.createElement(
                'strong',
                null,
                averages.sleepHours ? `${averages.sleepHours}ч` : '-'
              )
            )
          )
      )
    );
  };

  const WeeklyReport: React.FC<{ weeks: WeekData[] }> = ({ weeks }) => {
    return React.createElement(
      'div',
      { className: 'weekly-report' },
      React.createElement('h3', null, 'Отчет по неделям'),
      ...weeks.map((week, i) =>
        React.createElement(
          'div',
          { key: i, className: 'week-section' },
          React.createElement('h4', null, `Неделя с ${week.weekStart}`),
          React.createElement(ReportTable, {
            rows: week.days,
            averages: week.averages,
          })
        )
      )
    );
  };

  const ChartsSection: React.FC<{ rows: ReportRow[] }> = ({ rows }) => {
    React.useEffect(() => {
      // Рендерим графики после монтирования компонента
      const timeout = setTimeout(() => {
        renderChart('kcal-chart', prepareChartData(rows, 'kcal', 'Калории'), 'Калории по дням');
        renderChart('weight-chart', prepareChartData(rows, 'weight', 'Вес'), 'Изменение веса');
        renderChart('sleep-chart', prepareChartData(rows, 'sleepHours', 'Сон'), 'Часы сна');
        renderChart(
          'training-chart',
          prepareChartData(rows, 'trainDuration', 'Тренировки'),
          'Длительность тренировок (мин)'
        );
      }, 100);

      return () => clearTimeout(timeout);
    }, [rows]);

    return React.createElement(
      'div',
      { className: 'charts-section' },
      React.createElement('h3', null, 'Графики (последние 2 недели)'),
      React.createElement(
        'div',
        { className: 'charts-grid' },
        React.createElement(
          'div',
          { className: 'chart-container' },
          React.createElement('canvas', { id: 'kcal-chart', width: 400, height: 200 })
        ),
        React.createElement(
          'div',
          { className: 'chart-container' },
          React.createElement('canvas', { id: 'weight-chart', width: 400, height: 200 })
        ),
        React.createElement(
          'div',
          { className: 'chart-container' },
          React.createElement('canvas', { id: 'sleep-chart', width: 400, height: 200 })
        ),
        React.createElement(
          'div',
          { className: 'chart-container' },
          React.createElement('canvas', { id: 'training-chart', width: 400, height: 200 })
        )
      )
    );
  };

  // ---------- Главный компонент отчетов ----------
  const ReportTab: React.FC<ReportTabProps> = ({ products }) => {
    const [reportData, setReportData] = React.useState<ReportRow[]>([]);
    const [weeks, setWeeks] = React.useState<WeekData[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    const loadReportData = React.useCallback(async () => {
      setIsLoading(true);
      try {
        const start = performance.now();
        const rows = generateReportData(28);
        const weekData = groupByWeeks(rows);

        setReportData(rows);
        setWeeks(weekData);

        if (window.HEYS && window.HEYS.performance) {
          window.HEYS.performance.timing('reportTabLoad', performance.now() - start);
        }
      } catch (error) {
        console.error('Ошибка загрузки данных отчета:', error);
        if (window.HEYS && window.HEYS.analytics) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          window.HEYS.analytics.trackError('ReportTabLoadError', { error: errorMessage });
        }
      } finally {
        setIsLoading(false);
      }
    }, [products]);

    React.useEffect(() => {
      loadReportData();
    }, [loadReportData]);

    const refreshData = React.useCallback(() => {
      invalidateCache();
      loadReportData();
    }, [loadReportData]);

    if (isLoading) {
      return React.createElement('div', { className: 'loading' }, 'Загрузка отчета...');
    }

    return React.createElement(
      'div',
      { className: 'report-tab' },
      React.createElement(
        'div',
        { className: 'report-header' },
        React.createElement('h2', null, 'Отчеты за 4 недели'),
        React.createElement(
          'button',
          {
            onClick: refreshData,
            className: 'refresh-btn',
          },
          'Обновить данные'
        )
      ),

      React.createElement(
        'div',
        { className: 'report-summary' },
        React.createElement('p', null, `Всего дней в отчете: ${reportData.length}`),
        React.createElement('p', null, `Недель: ${weeks.length}`)
      ),

      React.createElement(ChartsSection, { rows: reportData }),
      React.createElement(WeeklyReport, { weeks })
    );
  };

  // ---------- Экспорт компонента ----------
  HEYS.ReportTab = ReportTab;

  // Настраиваем инвалидацию кэша при загрузке модуля
  setupCacheInvalidation();

  console.log('📊 HEYS Reports v12 (TypeScript) загружен');
})(window);
