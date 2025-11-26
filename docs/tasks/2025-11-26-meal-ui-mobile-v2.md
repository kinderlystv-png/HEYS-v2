# Промпт: Mobile UI приёмов пищи — Новая архитектура

**Дата создания**: 2025-11-26  
**Приоритет**: 🔴 Высокий  
**Время выполнения**: ~25 минут  
**Версия**: 2.5 (финальный)

---

## 📋 Проблема

CSS-хаки поверх `<table>` не работают для mobile:

- `nth-child()` ломается при скрытии элементов
- 216 строк сломанного CSS (строки 2013-2229)

**Решение**: Рендерить ОБА варианта (table + div), скрывать через CSS.

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
| `apps/web/heys_day_v12.js` | после 1245 | Вставить mobile cards МЕЖДУ `)),` и `React.createElement('div',{className:'row'...` |
| `apps/web/styles/main.css` | 2013-2229  | УДАЛИТЬ сломанные хаки, добавить `.mpc-*`                                           |

---

## 🔴 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ v2.4

### 1. Точное место вставки

```
Строка 1243:             )
Строка 1244:           )
Строка 1245:         )),                              ← ПОСЛЕ этого
                     ↓↓↓ ВСТАВИТЬ mobile cards ↓↓↓
Строка 1246:         React.createElement('div',{className:'row'...  ← ПЕРЕД этим
```

### 2. `data-grams-input="true"` как строка

В desktop версии: `'data-grams-input': true` → React рендерит как
`data-grams-input="true"`  
В mobile тоже: `'data-grams-input': true` — **ОК, совместимо**

### 3. querySelector найдёт mobile input

Логика фокуса (строки 685, 853):

```js
document.querySelector(
  `input[data-grams-input="true"][data-meal-index="${mi}"][data-item-id="${newItem.id}"]`,
);
```

Это найдёт **первый** matching input — на mobile это будет карточка (table
скрыта), на desktop — table cell.  
✅ **Работает корректно** благодаря CSS `display: none`.

### 4. `pRow` — отдельная функция, НЕ используем

`pRow(it)` объявлена на строке 1157, но она возвращает `<tr>`. Для mobile cards
делаем inline map.

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
**Удалить**: Строки 2013-2227 (от `/* ========== MOBILE MEAL CARDS` до
`overflow-x: visible !important; }` включительно)

**Точные границы:**

- Начало (строка 2013):
  `/* ========== MOBILE MEAL CARDS (data-cell based) ==========`
- Конец (строка 2227): `}` после `overflow-x: visible !important;`
- НЕ трогать (строка 2229): `/* === ФИОЛЕТОВАЯ ТАБЛИЦА СТАТИСТИКИ ===`

**Всего ~215 строк.**

Удаляется:

- Все `td[data-cell="..."]` правила
- Все `td:nth-child(...)` правила
- Все grid/flex хаки для tr
- `overflow-x: visible !important` для meal-card

---

### Шаг 3: Добавить новый CSS

**Файл**: `apps/web/styles/main.css`  
**Место**: ВМЕСТО удалённого блока (перед `/* === ФИОЛЕТОВАЯ ТАБЛИЦА`)

**⚠️ Структура CSS файла:**

- Строка 1167: начало `@media (max-width: 768px) {`
- Строки 2013-2229: сломанный блок meal cards (ВНУТРИ media query)
- Новый CSS вставляется ВНУТРИ `@media (max-width: 768px)`, НЕ снаружи

```css
/* === MOBILE MEAL CARDS (clean implementation v2.5) === */

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

**Desktop правило — СНАРУЖИ media query (в конце файла или после закрывающей
`}`):**

```css
/* Desktop: hide mobile cards */
@media (min-width: 769px) {
  .mobile-products-list {
    display: none !important;
  }
}
```

### CSS исправления v2.5:

- ✅ Уточнено: mobile CSS **ВНУТРИ** `@media (max-width: 768px)`
- ✅ Desktop media query **СНАРУЖИ** — отдельным блоком
- ✅ Убрана лишняя закрывающая `}` из mobile блока

---

## 🧪 Тестирование

### Mobile (430px):

- [ ] Table скрыта (`display: none`)
- [ ] Карточки видны с gap 8px
- [ ] Input граммов: 44px height, числовая клавиатура, нет стрелок
- [ ] Focus ring синий при фокусе
- [ ] Кнопка × серая → красный фон на :active
- [ ] Totals голубой блок с суммой по приёму
- [ ] После добавления продукта — фокус на input граммов

### Desktop (>768px):

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
2. **Удалить ~216 строк** сломанного CSS (2013-2229)
3. **НЕ трогать** Время/Настроение/Стресс — Phase 2
4. **Переменные в scope**: `per100`, `scale`, `totals`, `mi`, `pIndex` — не
   создавать заново
5. **CSS media query**: desktop `.mobile-products-list { display: none }` —
   СНАРУЖИ `@media (max-width: 768px)`

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

| Версия | Дата       | Изменения                                                                                                                                    |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5    | 2025-11-26 | **Финал:** `value: G` как в desktop (не `G \|\| ''`), уточнена структура CSS (mobile внутри media query, desktop снаружи), убрана лишняя `}` |
| 2.4    | 2025-11-26 | Точный контекст вставки, `aria-label` с названием, spin-button hide, `-webkit-tap-highlight-color`                                           |
| 2.3    | 2025-11-26 | Критические: использовать существующие `per100/scale/totals`, `inputMode: decimal`, Enter blur                                               |
| 2.2    | 2025-11-26 | Точные line numbers, убран gradient, добавлен data-grams-input                                                                               |
| 2.1    | 2025-11-26 | CSS-only подход, DRY calcProduct, touch targets 44px                                                                                         |
| 2.0    | 2025-11-26 | Отдельный React-рендер вместо CSS хаков                                                                                                      |
