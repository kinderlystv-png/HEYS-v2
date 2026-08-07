# Аудит MCP-дневника: быстрый ввод (вкл. фото + адресация)

Дата: 2026-08-07 · heys/b235ea + слой «мне»  
Статус: **код слоя адресации готов** — ждёт commit + deploy `heys-mcp`.

## Вердикт

Цель: **быстро заносить данные клиента, умнее уточняя только где надо.**  
Узкое место после P0–P3: не еда, а **«кто такой мне»** — 5–8 вызовов до записи,
сама запись потом 2. Корень: предпочтение есть в `preferences.md`, но
`мне`/`себе` ∈ `TOPIC_STOP_WORDS` → `tasks_context` не поднимает запись в text →
модель идёт в `list_clients` + grep.

## Happy path после deploy

| Сценарий                 | Вызовы                                                    |
| ------------------------ | --------------------------------------------------------- |
| «запиши мне X»           | `log_meal(client=мне)` — **1** (без list_clients)         |
| Текст: известный продукт | `log_meal` — **1**                                        |
| Правка приёма            | `get_day` → `update` — **2**                              |
| Этикетка в чате Cursor   | _(vision)_ → search(штрихкод) или create → log — **2–3**  |
| Этикетка из мессенджера  | list_messages → get_photo → search/create → log — **3–4** |
| Тарелка без этикетки     | фото → search → **один вопрос про граммы** → log          |
| Черри←помидор            | get_day → create(from_product_id) → update — **3**        |

## Закрыто

- tombstone + server-truth + ids/outcome/norm/checkin в text
- кандидаты/clients/portions в error text; presets; авто-порция; from_product_id
- list_messages photo paths; barcode search; photo-first 8в
- **адресация:** `clientAddressMap` из preferences; `resolveTarget(«мне»)`;
  алиасы в instructions на initialize; `list_clients` печатает алиасы;
  `preferenceHitsRawTopic` / `knownPreference` по алиасу (в обход stop-words)

## Стоп-линия

| Идея                              | Почему не сейчас                     |
| --------------------------------- | ------------------------------------ |
| Server OCR / `suggest_from_photo` | Новая архитектура + ПДн; R&D отложен |
| Вшивать все фото в list_messages  | Съедает контекст (правило 21а)       |
| Угадывать граммы с тарелки        | Против политики messenger §23        |
| Убрать «мне» из TOPIC_STOP_WORDS  | Сломает разбор фраз задачника        |
| Авто-log без confirm              | `маркетинг/38` запрещает             |

Дальше ценность = **deploy + smoke «запиши мне …» без list_clients**.

## Тесты

891+ (curator/tasks покрывают алиасы).
