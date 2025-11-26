# Промпт: Mobile UI приёмов пищи — Новая архитектура

**Дата создания**: 2025-11-26  
**Статус**: ✅ ВЫПОЛНЕНО  
**Время выполнения**: ~25 минут  
**Версия**: 2.7 (финальная)

---

## 📋 Проблема (решена)

CSS-хаки поверх `<table>` не работают для mobile:

- `nth-child()` ломается при скрытии элементов
- ~215 строк сломанного CSS удалено

**Решение**: Рендерить ОБА варианта (table + div), скрывать через CSS. ✅

---

## 🎯 Архитектура

```
MealCard
├── MealAddProduct (поиск)
├── <div overflowX>
│   └── <table> (скрыта на mobile через CSS)
├── <div mobile-products-list> (скрыт на desktop)  ← NEW
└── Время/Настроение/Стресс (оставить как есть)
```

---

## 📁 Ключевые файлы

| Файл                       | Строки     | Изменения                                                                           |
| -------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `apps/web/heys_day_v12.js` | после 1244 | Вставить mobile cards МЕЖДУ `)),` и `React.createElement('div',{className:'row'...` |
| `apps/web/styles/main.css` | 2013-2227  | УДАЛИТЬ сломанные хаки (внутри @media 640px), добавить `.mpc-*`                     |

---

## 🔴 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ v2.6 (после аудита)

### 1. Точное место вставки JS

```
Строка 1243:             )
Строка 1244:           )
Строка 1245:         )),                              ← ПОСЛЕ этого
                     ↓↓↓ ВСТАВИТЬ mobile cards ↓↓↓
Строка 1246:         React.createElement('div',{className:'row'...  ← ПЕРЕД этим
```

**Контекст строки 1245**: `)),` — закрывает `React.createElement('tbody'...)` и
`React.createElement('table'...)`.

### 2. CSS структура — ИСПРАВЛЕНО

**Промпт v2.5 указывал неверно!** Реальная структура:

- Строка 1167: `@media (max-width: 768px) {` ← закрывается на строке ~1255
- Строка 1861: `@media (max-width: 640px) {` ← содержит сломанный код 2013-2227
- Строки 2013-2227: блок MOBILE MEAL CARDS — **ВНУТРИ @media 640px**

**Вывод**: удаляемый блок внутри `@media (max-width: 640px)`, а новый CSS тоже
должен быть **ВНУТРИ** `@media (max-width: 640px)`.

### 3. Fallback querySelector найдёт mobile input

Логика фокуса (строки 685, 853):

```js
document.querySelector(
  `input[data-grams-input="true"][data-meal-index="${mi}"][data-item-id="${item.id}"]`,
);
```

Это найдёт **первый** matching input. На mobile (table скрыта через
`display: none`) это будет mobile карточка. ✅ Работает корректно.

### 4. Переменные в scope (НЕ переопределять):

- `per100` — функция строка 57
- `scale` — функция строка 65
- `totals` — вычисляется в `mTotals(meal)` на строке 1219
- `mi` — индекс из `.map((meal, mi))`
- `pIndex` — индекс продуктов

---

## ✅ Задачи

### Шаг 1: Добавить mobile cards в JS

**Файл**: `apps/web/heys_day_v12.js`  
**Место**: После строки 1245 (после `)),`), перед строкой 1246
(`React.createElement('div',{className:'row'...`)

**Контекст для вставки:**

```js
          )
        )),
        // === MOBILE PRODUCT CARDS === вставить здесь
        React.createElement('div',{className:'row',style:{justifyContent:'space-between'...
```

**Код для вставки:**

```js
        // MOBILE CARDS — видны только на <768px (desktop: display:none)
        React.createElement('div', { className: 'mobile-products-list' },
          (meal.items || []).map(it => {
            const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
            const G = +it.grams || 0;
            const per = per100(p);
            return React.createElement('div', { key: it.id, className: 'mpc' },
              React.createElement('div', { className: 'mpc-header' },
                React.createElement('span', { className: 'mpc-name' }, p.name),
                React.createElement('button', {
                  className: 'mpc-delete',
                  onClick: () => removeItem(mi, it.id),
                  'aria-label': 'Удалить ' + p.name
                }, '×')
              ),
              React.createElement('div', { className: 'mpc-row2' },
                React.createElement('input', {
                  type: 'number',
                  className: 'mpc-grams',
                  value: G,
                  onChange: e => setGrams(mi, it.id, e.target.value),
                  onFocus: e => e.target.select(),
                  onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); },
                  'data-grams-input': true,
                  'data-meal-index': mi,
                  'data-item-id': it.id,
                  inputMode: 'decimal',
                  placeholder: 'г'
                }),
                React.createElement('span', { className: 'mpc-kcal' },
                  Math.round(scale(per.kcal100, G)) + ' ккал'
                )
              ),
              React.createElement('div', { className: 'mpc-macros' },
                React.createElement('span', null, 'У ' + Math.round(scale(per.carbs100, G))),
                React.createElement('span', null, 'Б ' + Math.round(scale(per.prot100, G))),
                React.createElement('span', null, 'Ж ' + Math.round(scale(per.fat100, G)))
              )
            );
          }),
          (meal.items || []).length > 0 && React.createElement('div', { className: 'mpc-totals' },
            React.createElement('span', null, Math.round(totals.kcal) + ' ккал'),
            React.createElement('span', null, 'У ' + Math.round(totals.carbs)),
            React.createElement('span', null, 'Б ' + Math.round(totals.prot)),
            React.createElement('span', null, 'Ж ' + Math.round(totals.fat))
          )
        ),
```

### Изменения v2.5:

- ✅ `value: G` — **как в desktop** (не `G || ''`), консистентность
- ✅ `aria-label: 'Удалить ' + p.name` — descriptive для screenreaders
- ✅ Уточнён контекст: между `)),` и `React.createElement('div'...`)

---

### Шаг 2: Удалить сломанный CSS

**Файл**: `apps/web/styles/main.css`  
**Удалить**: Строки 2001-2227

**Точные границы:**

- Начало (строка 2001):
  `/* === Day view: meal tables - FULL cardification (Step 1b) === */`
- Конец (строка 2227): `}` после `overflow-x: visible !important;`
- НЕ трогать (строка 2229): `/* === ФИОЛЕТОВАЯ ТАБЛИЦА СТАТИСТИКИ ===`

**Важно:** Этот блок находится ВНУТРИ `@media (max-width: 640px)` {, которая
открыта на строке 1861. НЕ удалять закрывающую `}` media query!

Удаляется:

- Global mobile fixes (`* { box-sizing }`, `html,body overflow-x`)
- Все `td[data-cell="..."]` правила
- Все grid/flex хаки для tr
- `overflow-x: visible !important` для meal-card

**Всего ~227 строк.**

---

### Шаг 3: Добавить новый CSS

**Файл**: `apps/web/styles/main.css`  
**Место**: ВМЕСТО удалённого блока (строка 2001), оставаясь ВНУТРИ
`@media (max-width: 640px)`

**⚠️ Проверка: новый CSS должен быть ВНУТРИ @media 640px, НЕ снаружи!**

```css
/* === MOBILE MEAL CARDS (clean implementation v2.6) === */

/* Hide table on mobile, show cards */
.meals-table {
  display: none !important;
}

.mobile-products-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

/* Product card */
.mpc {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.mpc:active {
  background: #fafafa;
}

/* Header: name + delete */
.mpc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.mpc-name {
  font-weight: 600;
  font-size: 15px;
  line-height: 1.35;
  flex: 1;
  word-break: break-word;
  color: #1a1a1a;
}

.mpc-delete {
  min-width: 44px;
  min-height: 44px;
  margin: -8px -8px -8px 0;
  padding: 8px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 24px;
  font-weight: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition:
    color 0.15s,
    background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.mpc-delete:active {
  background: #fee2e2;
  color: #dc2626;
}

/* Row 2: grams input + kcal */
.mpc-row2 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.mpc-grams {
  width: 72px;
  height: 44px;
  padding: 8px 12px;
  font-size: 17px;
  font-weight: 500;
  text-align: center;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #f9fafb;
  color: #1a1a1a;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  -webkit-appearance: none;
  -moz-appearance: textfield;
}

.mpc-grams::-webkit-inner-spin-button,
.mpc-grams::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.mpc-grams:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  outline: none;
  background: #fff;
}

.mpc-kcal {
  font-weight: 700;
  font-size: 17px;
  color: #1a1a1a;
}

/* Macros row */
.mpc-macros {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #6b7280;
}

/* Meal totals */
.mpc-totals {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  background: #f0f9ff;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
}
```

**Desktop правило — В КОНЦЕ ФАЙЛА (после последней `}` закрывающей media
query):**

```css
/* Desktop: hide mobile cards */
@media (min-width: 641px) {
  .mobile-products-list {
    display: none !important;
  }
}
```

### Изменения v2.6:

- ✅ Исправлен breakpoint: `min-width: 641px` (инверсия 640px)
- ✅ Уточнено: mobile CSS **ВНУТРИ** `@media (max-width: 640px)` (НЕ 768px!)
- ✅ Desktop media query добавляется **В КОНЦЕ ФАЙЛА** — отдельным блоком

---

## 🧪 Тестирование

### Mobile (<640px — iPhone SE, 375px):

- [ ] Table скрыта (`display: none`)
- [ ] Карточки видны с gap 8px
- [ ] Input граммов: 44px height, числовая клавиатура, нет стрелок
- [ ] Focus ring синий при фокусе
- [ ] Кнопка × серая → красный фон на :active
- [ ] Totals голубой блок с суммой по приёму
- [ ] После добавления продукта — фокус на input граммов

### Desktop (≥641px):

- [ ] Table видна полностью
- [ ] `mobile-products-list` скрыт (`display: none !important`)
- [ ] Horizontal scroll работает

### Accessibility:

- [ ] `aria-label="Удалить {название}"` на кнопке
- [ ] Focus visible на input
- [ ] Enter → blur

### Edge cases:

- [ ] Пустой meal (0 products) — нет totals блока, только empty list
- [ ] Длинное название продукта — word-break работает
- [ ] Граммы = 0 — показывает "0" (как в desktop), placeholder при пустом

---

## 📐 Макет (v2.5)

```
┌─────────────────────────────────────────┐
│ Яйцо куриное варёное вкрутую        [×] │
│                                         │  ← word-break если длинное
├─────────────────────────────────────────┤
│ [ 65 ]                        302 ккал  │  ← input слева, ккал справа
├─────────────────────────────────────────┤
│ У 1       Б 13       Ж 11               │
└─────────────────────────────────────────┘
                   ↓ gap 8px
┌─────────────────────────────────────────┐
│ Творог 5%                           [×] │
...
└─────────────────────────────────────────┘
                   ↓ gap 8px
┌─────────────────────────────────────────┐
│ 450 ккал    У 15    Б 35    Ж 22        │  ← totals, голубой
└─────────────────────────────────────────┘
```

---

## ⚠️ Важно

1. **data-grams-input** — обязателен для auto-focus после добавления
2. **Удалить ~227 строк** сломанного CSS (2001-2227) из `@media 640px`
3. **НЕ трогать** Время/Настроение/Стресс — Phase 2
4. **Переменные в scope**: `per100`, `scale`, `totals`, `mi`, `pIndex` — не
   создавать заново
5. **CSS breakpoint**: mobile = 640px (не 768px!), desktop = 641px+

---

## 🔍 Результат аудита v2.6

### 🔴 Критические (исправлено)

- [x] **Неверный breakpoint**: промпт указывал 768px, реально 640px
- [x] **Неверные строки удаления**: 2013-2229 → 2001-2227
- [x] **Неверная структура media query**: новый CSS должен быть внутри @media
      640px

### 🟡 Важные (уточнено)

- [x] Desktop breakpoint: `min-width: 641px` (инверсия 640px)
- [x] Контекст строки вставки уточнён

### ✅ Проверено и ОК

- Логика querySelector работает корректно с обоими DOM
- Переменные `per100`, `scale`, `totals` в scope
- `data-grams-input` атрибут совместим

---

## ✨ Phase 2 рекомендации (современно, не оверкилл)

### UX улучшения:

| Фича                      | Сложность | Польза | Рекомендация   |
| ------------------------- | --------- | ------ | -------------- |
| Quick presets (50г, 100г) | Low       | High   | ✅ Добавить    |
| Swipe-to-delete           | Medium    | Medium | ⚠️ Опционально |
| Color-coded macros        | Low       | Medium | ✅ Добавить    |
| Emoji макросов 🍞🥩🧈     | Low       | Low    | ❓ A/B тест    |
| Long-press для edit       | Medium    | Low    | ❌ Не нужно    |

### Quick presets (рекомендую Phase 2):

```
┌─────────────────────────────────────────┐
│ [ 65 ]   [50] [100] [150]    302 ккал  │
└─────────────────────────────────────────┘
```

Кнопки устанавливают частые значения — экономит время на вводе.

### Color-coded macros:

```css
.mpc-carbs {
  color: #2563eb;
} /* синий */
.mpc-prot {
  color: #dc2626;
} /* красный */
.mpc-fat {
  color: #ca8a04;
} /* жёлтый */
```

---

## ❌ Вне scope

- Анимации появления/удаления
- Drag-to-reorder
- Haptic feedback (iOS не поддерживает)
- Pull-to-refresh

---

## Changelog

| Версия | Дата       | Изменения                                                                                                                                       |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7    | 2025-11-26 | **ВЫПОЛНЕНО:** компактные карточки, полные макросы (У/пр/сл, Б, Ж/вр/пол/тр, Клет, ГИ, Вред), промпт закрыт                                     |
| 2.6    | 2025-11-26 | **Глубокий аудит:** исправлен breakpoint 768→640px, уточнены строки CSS 2001-2227, desktop breakpoint 641px, добавлен раздел "Результат аудита" |
| 2.5    | 2025-11-26 | **Финал:** `value: G` как в desktop (не `G \|\| ''`), уточнена структура CSS (mobile внутри media query, desktop снаружи), убрана лишняя `}`    |
| 2.4    | 2025-11-26 | Точный контекст вставки, `aria-label` с названием, spin-button hide, `-webkit-tap-highlight-color`                                              |
| 2.3    | 2025-11-26 | Критические: использовать существующие `per100/scale/totals`, `inputMode: decimal`, Enter blur                                                  |
| 2.2    | 2025-11-26 | Точные line numbers, убран gradient, добавлен data-grams-input                                                                                  |
| 2.1    | 2025-11-26 | CSS-only подход, DRY calcProduct, touch targets 44px                                                                                            |
| 2.0    | 2025-11-26 | Отдельный React-рендер вместо CSS хаков                                                                                                         |

---

## ✅ Что реализовано

### JS (`apps/web/heys_day_v12.js`):

- Mobile карточки с полными данными: ккал, У (прост, сл), Б, Ж (вр, пол, тр),
  Клет, ГИ, Вред
- `data-grams-input` для автофокуса
- Кнопка удаления с `aria-label`

### CSS (`apps/web/styles/main.css`):

- Компактные карточки (padding 10px, font-size 12-15px)
- `.mpc-*` классы для всех элементов
- Desktop: `@media (min-width: 641px)` скрывает карточки
- Mobile: `@media (max-width: 640px)` скрывает таблицу
