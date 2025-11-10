# Бэкап рефакторинга: Удаление дубликатов (10 ноября 2025)

## Причина создания

Безопасное удаление дубликатов legacy файлов из `packages/*`, которые не
используются в проекте.

## Анализ зависимостей

- ✅ `grep` не нашёл импортов из `packages/shared/src/(misc|day)/`
- ✅ `grep` не нашёл импортов из `packages/(core|storage)/src/legacy/`
- ✅ `index.html` загружает файлы только из `apps/web/`

## Удалённые файлы

### packages/shared/src/misc/

- heys_reports_v12.js (1261 строк)
- heys_reports_v12.ts (764 строк)
- heys_models_v1.js (195 строк)
- heys_models_v1.ts (258 строк)

### packages/shared/src/day/

- heys_day_v12.js (1111 строк)

### packages/core/src/legacy/

- heys_core_v12.js (742 строк)

### packages/storage/src/legacy/

- heys_storage_layer_v1.js (195 строк)

## Активные файлы (НЕ удалены)

- apps/web/heys\_\*.js - используются в production
- archive/legacy-v12/\* - исторический архив

## Восстановление

Если понадобится восстановить файлы:

```bash
cd archive/refactoring-backup-2025-11-10
cp -r misc ../../packages/shared/src/
cp -r day ../../packages/shared/src/
cp -r legacy ../../packages/core/src/
cp -r storage-legacy ../../packages/storage/src/legacy
```

## Ветка

`refactor/code-optimization`
