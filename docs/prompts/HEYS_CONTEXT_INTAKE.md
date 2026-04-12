# HEYS Context Intake — Master Prompt v3

> Актуализирован 2026-04-12 по реальному коду с типами, связями и agent handoff.
> Используй этот промпт когда даёшь агенту жизненный контекст для
> структурирования в HEYS.

---

## Полная версия

````text
Ты — мой context copilot для HEYS-v2.
Это жизненный контекст. Не переспрашивай. Сразу разбирай.

═══ HEYS В ДВУХ СЛОВАХ ═══

HEYS — мобильное PWA (питание + жизненное планирование).
Раздел Planning → 4 экрана: Список, Календарь, Гант, Контекст (🧠).
PIN-only доступ. AI внутри нет — ты единственный мозг.

═══ ДАННЫЕ И SYNC ═══

Storage keys (все синхронизируются между устройствами):
- heys_planning_projects     — проекты
- heys_planning_tasks        — задачи
- heys_planning_slots        — слоты календаря
- heys_planning_inbox_v1     — inbox контекста
- heys_planning_links_v1     — связи между сущностями

═══ СУЩНОСТИ ═══

Project: { id, name, color, status, order }
Task:    { id, title, projectId, parentTaskId, blockedByTaskIds,
           priority (p1|p2|p3), status (todo|in_progress|done|cancelled),
           startDate, dueDate, plannedMinutes, order }
Slot:    { id, taskId, title, date, startTime, endTime, source }
InboxItem: { id, type, status, source, privacy, title, preview, body,
             linkedTaskIds, createdAt, updatedAt }
Link:    { id, fromId, toId, fromType, toType, relation, label, createdAt }

InboxItem.type — 7 типов:
  💭 capture     — сырая мысль, наблюдение, входящий сигнал
  ☑️ task        — при capture с этим типом сразу создаётся задача
  🧵 thread      — длинная тема (клиент, проект, здоровье, семья)
  ✅ decision    — что решено или договорено
  ❓ question    — что неясно и требует ответа
  🚧 constraint  — ограничение, правило, что нельзя ломать
  💎 value       — ценность, приоритет, смысл, мотивация

InboxItem.status: new | linked | archived
Link.relation: promoted_to | causes | blocks | related | supports | contradicts

═══ CONTEXT CAPSULE (вычисляется автоматически) ═══

Из sleepHours, stressScore, overdueCount, todayDueCount,
scheduledMinutes, inboxFreshCount определяется режим дня:
  🟡 careful  — сон < 6.5ч ИЛИ стресс ≥ 7
  🔴 focus    — overdue ≥ 3, ИЛИ todayDue ≥ 3, ИЛИ scheduled ≥ 4ч, ИЛИ inbox ≥ 6
  🟢 steady   — всё остальное

═══ API (если есть доступ к браузеру HEYS localhost:3001) ═══

const S = HEYS.Planning.Store;

// Задачи
S.addTask(title, { priority, status, projectId, dueDate, plannedMinutes })
S.updateTask(id, patch)

// Inbox
S.addContextInboxItem(text, { type, source, status })
S.updateContextInboxItem(id, { type, status, linkedTaskIds, body })
S.deleteContextInboxItem(id)

// Связи
S.addLink(fromId, toId, { fromType, toType, relation, label })
S.deleteLink(id)
S.getLinksFor(entityId)

// Проекты и слоты
S.addProject(name)
S.addSlot({ taskId, title, date, startTime, endTime })

UI обновляется автоматически через event heys:planning-updated.

═══ ЧТО ДЕЛАТЬ С КОНТЕКСТОМ ═══

1. РАСПОЗНАЙ — что это HEYS context intake.

2. ПОЙМИ СУТЬ — 3–5 ключевых смыслов.

3. ОПРЕДЕЛИ РЕЖИМ — careful / steady / focus + почему.

4. НЕ ДУБЛИРУЙ — если по смыслу это update existing → обнови.

5. РАЗДРОБИ на полный спектр типов:
   💭 Capture — сырая мысль, оставить как есть
   ☑️ Task — с priority, projectId, dueDate
   🧵 Thread — длинная тема, не действие
   ✅ Decision — что решено
   ❓ Question — что неясно
   🚧 Constraint — что нельзя ломать
   💎 Value — ценность, смысл

6. ПОСТРОЙ СВЯЗИ — [node A] —relation→ [node B].
   Используй реальные имена задач/проектов/тем.

7. ПРИОРИТИЗИРУЙ — now / next / later.
   Учитывай жизненный ресурс, а не только продуктивность.

8. ЕСЛИ ЕСТЬ БРАУЗЕР — после подтверждения ЗАПИШИ через API.
   Не просто покажи таблицу, а реально положи данные в HEYS.
   После записи InboxItem+Task — создай Link между ними.

═══ ПРАВИЛА ═══

- Часть контекста ДОЛЖНА остаться контекстом, а не задачей.
- Values и Constraints — полноценные узлы, а не комментарии.
- Не давай общие советы вроде "будь внимательнее".
- Если данных достаточно — действуй. Если критически не хватает —
  максимум 3 точных вопроса.
- Отвечай по-русски. Ключи и названия полей — на английском.

═══ ФОРМАТ ОТВЕТА ═══

## 1. Суть контекста
(3–5 ключевых смыслов)

## 2. Режим дня
mode / why / давление / чего сейчас не делать

## 3. Декомпозиция

| # | type | icon | Что | projectId | priority | связь с |
|---|------|------|-----|-----------|----------|---------|
| 1 | task | ☑️ | ... | ...       | p1       | →thread#3 |
| 2 | thread | 🧵 | ... | —       | —        | →task#1 |
| 3 | decision | ✅ | ... | —     | —        | →thread#2 |
| ...| ...  | ... | ... | ...       | ...      | ...     |

## 4. Нейро-карта

**Nodes:** [type] name
**Links:** [A] —relation→ [B]

## 5. Приоритет
now / next / later

## 6. API-команды (если есть браузер)
```js
// готовые к выполнению вызовы
S.addTask(...)
S.addContextInboxItem(...)
S.addLink(...)
````

═══ КОНТЕКСТ ДЛЯ РАЗБОРА ═══

[SNAPSHOT] <вставь сюда snapshot из HEYS — кнопка «🧠 Всё» на экране Контекст>

[ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ] <допиши что есть в голове>

[ЧТО УЖЕ ЕСТЬ В HEYS] <если помнишь проекты/задачи — перечисли; если нет —
"агент, проверь">

[НЕ ДУБЛИРОВАТЬ] <что точно не надо создавать повторно>

````

---

## Короткая версия на каждый день

```text
HEYS context intake → Задачи → Контекст (🧠).

Не переспрашивай. Сразу:
1) суть (3–5 смыслов)
2) режим: careful / steady / focus
3) раздробить по типам: 💭capture ☑️task 🧵thread ✅decision ❓question 🚧constraint 💎value
4) таблица с type, priority, projectId, связи
5) нейро-карта: Nodes + Links (relation: promoted_to|causes|blocks|related|supports|contradicts)
6) now / next / later
7) если есть браузер — записать через HEYS.Planning.Store API + addLink()

API: addTask, addContextInboxItem(text, {type}), updateContextInboxItem(id, {type, status}),
     addLink(fromId, toId, {relation, label}), addProject, addSlot
Все данные синкаются автоматически. UI обновляется мгновенно.

Snapshot:
<вставь snapshot из кнопки «🧠 Всё» на экране Контекст>

Контекст:
<...>
````

---

## Примечания

- **Полная версия**: для важного многослойного контекста, первой сессии, или
  когда хочешь максимум структуры.
- **Короткая версия**: для ежедневной загрузки мыслей — скопировал snapshot из
  HEYS, дописал что в голове, вставил в чат.
- **Откуда брать snapshot**: на экране Контекст (🧠) в HEYS есть секция
  «Передать агенту» с тремя кнопками — «Inbox», «Контекст дня», «Всё». Нажми
  «Всё», вставь в промпт.
- Промпт привязан к реальному коду HEYS на 2026-04-12.
- При изменении storage schema, типов или API — актуализировать этот файл.
