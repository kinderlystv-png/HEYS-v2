# 🚀 HEYS Project Scripts - Минималистичная версия

## 📂 Структура запуска

### ⭐⭐⭐⭐⭐ **Основные батники в корне:**

- **`start_panel.bat`** - Запуск основного HEYS приложения
- **`start_super_diagnostic.bat`** - Запуск супер диагностического центра

## 🚀 Быстрый старт:

### 📱 Основное приложение:

```bash
start_panel.bat
```

- Запускает HTTP сервер на порту 8000
- Открывает http://127.0.0.1:8000/index.html
- Главный интерфейс HEYS

### 🏥 Диагностический центр:

```bash
start_super_diagnostic.bat
```

- Запускает HTTP сервер на порту 8000
- Открывает http://127.0.0.1:8000/TESTS/super-diagnostic-center.html
- 27 структурных тестов системы
- Экспорт JSON отчетов
- Система логирования в реальном времени

## 🧪 tests/demos/

- **`test-smart-search-integration.html`** ⭐⭐⭐⭐ - Демо умного поиска

## 🔧 Другие инструменты в проекте:

- **`build-production.bat`** - В папке temp/ (если нужен)
- **`check-types.bat`** - В папке temp/ (если нужен)

## ✅ Что убрано:

❌ Сложный launcher с меню  
❌ Папка scripts/  
❌ 19 пустых файлов  
✅ **Только 2 нужных батника!**

## 🔍 Что было убрано:

❌ **19 пустых файлов** (0 bytes):

- Все файлы типа `start_*_demo.bat`
- Пустые `ЗАПУСК_*.bat`
- Пустые `test-*.html`

✅ **Оставлено только рабочее:** 6 файлов с реальным функционалом

<!-- ANCHOR_SCRIPTS_ORGANIZATION -->

**SCRIPTS ORGANIZATION:** Упорядоченная структура всех скриптов проекта

<!-- ANCHOR_SCRIPTS_LAUNCHERS -->

**LAUNCHERS:** Скрипты запуска приложений и сервисов

<!-- ANCHOR_SCRIPTS_BUILD -->

**BUILD TOOLS:** Инструменты сборки и проверки кода

<!-- ANCHOR_SCRIPTS_MASTER_LAUNCHER -->

**MASTER LAUNCHER:** Главный launch.bat со всеми опциями
