---
applyTo: "apps/web/heys_*.js"
description: Модель данных HEYS — dayTot, meals, products, формулы
---

# HEYS Data Model Skill

> Активируется при работе с данными, аналитикой, формулами

## Триггеры (keywords)
- dayTot, normAbs, optimum
- калории, БЖУ, макросы
- инсулиновая волна, советы
- продукт, приём пищи, meal

## Критические поля

### ⚠️ Частые ошибки
| Ошибка | Правильно |
|--------|-----------|
| `dayTot.protein` | `dayTot.prot` |
| `normAbs.protein` | `normAbs.prot` |
| `heys_day_` | `heys_dayv2_` (v2!) |
| `item.category` | `getProductFromItem(item, pIndex).category` |

### Структура DayRecord (localStorage: `heys_dayv2_{YYYY-MM-DD}`)
```javascript
{
  date: "2025-11-29",
  meals: [...],           // Приёмы пищи
  trainings: [...],       // До 3 тренировок
  waterMl: 1500,
  weightMorning: 75.5,
  sleepStart: "23:30",
  sleepEnd: "07:00",
  steps: 8500,
  cycleDay: null          // 1-7 или null
}
```

### Продукт (на 100г)
```javascript
{
  simple100, complex100,  // Углеводы
  protein100,             // Белок
  badFat100, goodFat100, trans100,  // Жиры
  fiber100, gi, harm      // Клетчатка, ГИ, вред
}
```

### Вычисляемые
- `carbs100 = simple100 + complex100`
- `fat100 = badFat100 + goodFat100 + trans100`
- `kcal100 = protein100*4 + carbs100*4 + fat100*9`

## Аналитика
- **182 совета** в `heys_advice_v1.js`
- **37 факторов** инсулиновой волны
- **Status Score** 0-100 (9 факторов)
