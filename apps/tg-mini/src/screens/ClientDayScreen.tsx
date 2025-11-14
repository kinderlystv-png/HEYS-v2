import React from 'react';

import { NutritionService } from '@heys/core';

import { useClientDay, type MealDraft } from '../hooks/useClientDay';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import type { ClientDayData, CuratorClient } from '../types/api';

const MEAL_TYPE_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус'
} as const;

interface MealFormValues {
  type: keyof typeof MEAL_TYPE_LABELS;
  time: string;
  productName: string;
  weight: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface ClientDayScreenProps {
  clientId: string;
  client?: CuratorClient | null;
  onBack(): void;
}

export function ClientDayScreen({ clientId, client, onBack }: ClientDayScreenProps) {
  const { webApp } = useTelegramWebApp();
  const {
    client: loadedClient,
    dayData,
    date,
    isLoading,
    isError,
    errorMessage,
    setDate,
    goToPrevDay,
    goToNextDay,
    reload,
    addMeal,
    updateMeal,
    removeMeal
  } = useClientDay(clientId);

  const currentClient = loadedClient ?? client ?? null;
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingMealId, setEditingMealId] = React.useState<string | null>(null);
  const [formValues, setFormValues] = React.useState<MealFormValues>(() => getDefaultFormValues());

  React.useEffect(() => {
    if (!webApp) {
      return;
    }

    const handleBack = () => {
      onBack();
      webApp.HapticFeedback?.selectionChanged();
    };

    webApp.BackButton.show();
    webApp.BackButton.onClick(handleBack);

    return () => {
      webApp.BackButton.offClick(handleBack);
      webApp.BackButton.hide();
    };
  }, [onBack, webApp]);

  const openCreateForm = () => {
    setFormValues(getDefaultFormValues());
    setEditingMealId(null);
    setIsFormOpen(true);
  };

  const openEditForm = (mealId: string, meal: CuratorClientMeal) => {
    if (!mealId.startsWith('local-')) {
      alert('Редактирование доступно только для записей, созданных в mini-app (id начинается с local-).');
      return;
    }

    const aggregated = aggregateMealProducts(meal);
    setFormValues({
      type: meal.type,
      time: meal.time,
      productName: aggregated.name,
      weight: String(aggregated.weight ?? 0),
      calories: String(aggregated.calories ?? 0),
      protein: String(aggregated.protein ?? 0),
      carbs: String(aggregated.carbs ?? 0),
      fat: String(aggregated.fat ?? 0)
    });
    setEditingMealId(mealId);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingMealId(null);
    setFormValues(getDefaultFormValues());
  };

  const handleFormChange = (field: keyof MealFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const draft: MealDraft = {
      type: formValues.type,
      time: formValues.time || '00:00',
      product: {
        name: formValues.productName.trim() || 'Продукт',
        weight: Number(formValues.weight) || 0,
        calories: Number(formValues.calories) || 0,
        protein: Number(formValues.protein) || 0,
        carbs: Number(formValues.carbs) || 0,
        fat: Number(formValues.fat) || 0
      }
    };

    if (editingMealId) {
      updateMeal(editingMealId, draft);
    } else {
      addMeal(draft);
    }

    closeForm();
  };

  const handleDeleteMeal = (mealId: string) => {
    if (!mealId.startsWith('local-')) {
      alert('Удаление доступно только для записей, созданных в mini-app (id начинается с local-).');
      return;
    }

    removeMeal(mealId);
  };

  const renderState = () => {
    if (isLoading) {
      return (
        <p style={{ textAlign: 'center', color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '32px' }}>
          Загружаем данные дня...
        </p>
      );
    }

    if (isError) {
      return (
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <p style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginBottom: '12px' }}>{errorMessage}</p>
          <button type="button" onClick={reload} style={primaryButtonStyle}>
            Повторить
          </button>
        </div>
      );
    }

    if (!dayData || dayData.meals.length === 0) {
      return (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          borderRadius: '12px',
          border: '1px dashed var(--tg-theme-secondary-bg-color, #d0d0d0)',
          color: 'var(--tg-theme-hint-color, #6b6b6b)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0 }}>За этот день пока нет данных. Нажмите «Добавить приём пищи», чтобы внести запись.</p>
        </div>
      );
    }

    return (
      <div>
        {!dayData.meals.every((meal) => meal.id.startsWith('local-')) && (
          <p style={{
            marginBottom: '12px',
            fontSize: '12px',
            color: 'var(--tg-theme-hint-color, #6b6b6b)'
          }}>
            Редактирование и удаление доступны только для записей, созданных в mini-app (id начинается с <code>local-</code>).
          </p>
        )}
        {dayData.meals.map((meal) => {
          const canModify = meal.id.startsWith('local-');
          return (
            <div
              key={meal.id}
              style={{
                border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '12px',
                background: 'var(--tg-theme-bg-color, #ffffff)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{MEAL_TYPE_LABELS[meal.type]}</div>
                  <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>{meal.time}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={!canModify}
                    onClick={() => openEditForm(meal.id, meal)}
                    style={{ ...linkButtonStyle, opacity: canModify ? 1 : 0.4, cursor: canModify ? 'pointer' : 'not-allowed' }}
                    title={canModify ? 'Редактировать' : 'Доступно только для локальных записей'}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    disabled={!canModify}
                    onClick={() => handleDeleteMeal(meal.id)}
                    style={{ ...linkButtonStyle, opacity: canModify ? 1 : 0.4, cursor: canModify ? 'pointer' : 'not-allowed' }}
                    title={canModify ? 'Удалить' : 'Доступно только для локальных записей'}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div style={{ borderRadius: '10px', background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)', padding: '12px' }}>
                {meal.products.map((product, index) => (
                  <div key={`${product.name}-${index}`} style={{ marginBottom: index === meal.products.length - 1 ? 0 : '10px' }}>
                    <div style={{ fontWeight: 600 }}>{product.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
                      {product.weight} г · {product.calories} ккал · Б {product.protein} | Ж {product.fat} | У {product.carbs}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const totals = dayData?.totals;
  const targetCalories = loadedClient?.targetCalories;

  return (
    <div style={{ padding: '20px', paddingBottom: '40px' }}>
      <button type="button" onClick={onBack} style={backButtonStyle}>
        ← Назад к списку
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0 }}>{currentClient?.name ?? 'День клиента'}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>ID клиента: {clientId}</p>
          {currentClient?.status && (
            <p style={{ margin: '4px 0 0', color: 'var(--tg-theme-hint-color, #6b6b6b)', fontSize: '13px' }}>
              Статус: {statusLabel(currentClient.status)}
            </p>
          )}
        </div>

        <button type="button" onClick={openCreateForm} style={primaryButtonStyle}>
          + Добавить приём пищи
        </button>
      </div>

      <div style={{
        marginTop: '16px',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
        background: 'var(--tg-theme-bg-color, #ffffff)',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <button type="button" onClick={goToPrevDay} style={secondaryButtonStyle}>
          ◀︎
        </button>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid var(--tg-theme-secondary-bg-color, #dcdcdc)',
            background: 'var(--tg-theme-bg-color, #ffffff)',
            fontSize: '14px'
          }}
        />
        <button type="button" onClick={goToNextDay} style={secondaryButtonStyle}>
          ▶︎
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
        <SummaryCard label="Калории" value={totals ? `${totals.calories} ккал` : '—'} hint={targetCalories ? `Цель: ${targetCalories} ккал` : undefined} />
        <SummaryCard label="Белки" value={totals ? `${totals.protein} г` : '—'} />
        <SummaryCard label="Жиры" value={totals ? `${totals.fat} г` : '—'} />
        <SummaryCard label="Углеводы" value={totals ? `${totals.carbs} г` : '—'} />
      </div>

      {totals && (
        <DayIndicators totals={totals} targetCalories={targetCalories} />
      )}

      {isFormOpen && (
        <form onSubmit={handleFormSubmit} style={formContainerStyle}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <label style={labelStyle}>
              Тип приёма
              <select
                value={formValues.type}
                onChange={(event) => handleFormChange('type', event.target.value)}
                style={inputStyle}
              >
                {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Время
              <input
                type="time"
                value={formValues.time}
                onChange={(event) => handleFormChange('time', event.target.value)}
                style={inputStyle}
                required
              />
            </label>

            <label style={{ ...labelStyle, flex: '1 1 200px' }}>
              Название продукта
              <input
                type="text"
                value={formValues.productName}
                onChange={(event) => handleFormChange('productName', event.target.value)}
                style={inputStyle}
                placeholder="Например, творог 5%"
                required
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
            {([['weight', 'Вес (г)'], ['calories', 'Калории'], ['protein', 'Белки (г)'], ['fat', 'Жиры (г)'], ['carbs', 'Углеводы (г)']] as const).map(([field, label]) => (
              <label key={field} style={labelStyle}>
                {label}
                <input
                  type="number"
                  step="0.1"
                  value={formValues[field as keyof MealFormValues]}
                  onChange={(event) => handleFormChange(field as keyof MealFormValues, event.target.value)}
                  style={inputStyle}
                  min="0"
                />
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button type="button" onClick={closeForm} style={secondaryButtonStyle}>
              Отмена
            </button>
            <button type="submit" style={primaryButtonStyle}>
              {editingMealId ? 'Сохранить изменения' : 'Добавить приём'}
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: '24px' }}>{renderState()}</div>
    </div>
  );
}

interface DayIndicatorsProps {
  totals: ClientDayData['totals'];
  targetCalories?: number | null | undefined;
}

function DayIndicators({ totals, targetCalories }: DayIndicatorsProps) {
  const macros = React.useMemo(() => {
    return NutritionService.calculateMacroRatio({
      proteins: totals.protein,
      carbs: totals.carbs,
      fats: totals.fat
    });
  }, [totals.protein, totals.carbs, totals.fat]);

  const calorieStatus = React.useMemo(() => buildCalorieStatus(totals.calories, targetCalories), [totals.calories, targetCalories]);

  const macroItems = [
    { label: 'Белки', percent: macros.proteinsPercent, grams: totals.protein },
    { label: 'Жиры', percent: macros.fatsPercent, grams: totals.fat },
    { label: 'Углеводы', percent: macros.carbsPercent, grams: totals.carbs }
  ];

  return (
    <div style={indicatorContainerStyle}>
      <div style={indicatorCardStyle}>
        <div style={indicatorTitleStyle}>Баланс калорий</div>
        <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '6px' }}>{calorieStatus.badge}</div>
        <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '4px', color: calorieStatus.color }}>{calorieStatus.label}</div>
        <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '6px' }}>{calorieStatus.description}</div>
      </div>

      <div style={indicatorCardStyle}>
        <div style={indicatorTitleStyle}>Баланс БЖУ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
          {macroItems.map((macro) => (
            <span key={macro.label} style={macroChipStyle}>
              {macro.label}: {macro.percent}%
              <span style={{ color: 'var(--tg-theme-hint-color, #6b6b6b)', marginLeft: '4px', fontWeight: 500 }}>({macro.grams} г)</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)', marginTop: '12px' }}>
          Всего: {totals.calories} ккал
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div style={{
      flex: '1 1 140px',
      minWidth: '120px',
      borderRadius: '12px',
      padding: '14px',
      background: 'var(--tg-theme-secondary-bg-color, #f7f7f7)'
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>{value}</div>
      {hint && <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #6b6b6b)' }}>{hint}</div>}
    </div>
  );
}

function buildCalorieStatus(calories: number, targetCalories?: number | null | undefined) {
  if (!targetCalories || targetCalories <= 0) {
    return {
      badge: `${calories} ккал`,
      label: 'Цель не задана',
      color: 'var(--tg-theme-hint-color, #6b6b6b)',
      description: 'Добавьте целевые калории в профиле клиента, чтобы отслеживать прогресс.'
    };
  }

  const percent = Math.round((calories / targetCalories) * 100);
  const diff = calories - targetCalories;
  let label = 'В пределах коридора';
  let color = '#1f9d6a';

  if (percent < 90) {
    label = 'Недобор калорий';
    color = '#c97a00';
  } else if (percent > 110) {
    label = 'Перебор калорий';
    color = '#d63c3c';
  }

  const diffText = diff === 0 ? 'идеально по цели' : `${diff > 0 ? '+' : ''}${diff} ккал к цели`;

  return {
    badge: `${percent}%`,
    label,
    color,
    description: `${diffText} (цель ${targetCalories} ккал)`
  };
}

function statusLabel(status: CuratorClient['status']) {
  switch (status) {
    case 'active':
      return 'активный';
    case 'paused':
      return 'на паузе';
    case 'archived':
      return 'архив';
    default:
      return status;
  }
}

const backButtonStyle: React.CSSProperties = {
  marginBottom: '16px',
  border: 'none',
  background: 'transparent',
  color: 'var(--tg-theme-link-color, #2481cc)',
  fontSize: '14px',
  cursor: 'pointer'
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '10px',
  border: 'none',
  background: 'var(--tg-theme-button-color, #2481cc)',
  color: 'var(--tg-theme-button-text-color, #ffffff)',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer'
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid var(--tg-theme-secondary-bg-color, #dcdcdc)',
  background: 'var(--tg-theme-bg-color, #ffffff)',
  fontSize: '14px',
  cursor: 'pointer'
};

const linkButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--tg-theme-link-color, #2481cc)',
  fontSize: '12px',
  cursor: 'pointer'
};

const indicatorContainerStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
  background: 'var(--tg-theme-bg-color, #ffffff)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '16px'
};

const indicatorCardStyle: React.CSSProperties = {
  flex: '1 1 240px',
  minWidth: '200px',
  borderRadius: '12px',
  padding: '14px',
  background: 'var(--tg-theme-secondary-bg-color, #f7f7f7)'
};

const indicatorTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--tg-theme-hint-color, #6b6b6b)'
};

const macroChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--tg-theme-bg-color, #ffffff)',
  border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
  fontSize: '12px',
  fontWeight: 600
};

const formContainerStyle: React.CSSProperties = {
  marginTop: '20px',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
  background: 'var(--tg-theme-bg-color, #ffffff)'
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: '12px',
  color: 'var(--tg-theme-hint-color, #6b6b6b)',
  minWidth: '140px'
};

const inputStyle: React.CSSProperties = {
  marginTop: '4px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--tg-theme-secondary-bg-color, #dcdcdc)',
  background: 'var(--tg-theme-bg-color, #ffffff)',
  fontSize: '14px'
};

type CuratorClientMeal = ClientDayData['meals'][number];

function aggregateMealProducts(meal: CuratorClientMeal) {
  return meal.products.reduce(
    (acc, product, index) => {
      acc.weight += product.weight;
      acc.calories += product.calories;
      acc.protein += product.protein;
      acc.carbs += product.carbs;
      acc.fat += product.fat;
      if (index === 0) {
        acc.name = product.name;
      }
      return acc;
    },
    { name: meal.products[0]?.name ?? 'Продукт', weight: 0, calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function getDefaultFormValues(): MealFormValues {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    type: 'breakfast',
    time,
    productName: '',
    weight: '100',
    calories: '0',
    protein: '0',
    carbs: '0',
    fat: '0'
  };
}
