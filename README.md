# 🥗 HEYS - Nutrition & Training Management System

> **Monorepo Architecture** - Modern TypeScript/React application for nutrition
> tracking and training management

[![Version](https://img.shields.io/badge/version-13.0.0-blue.svg)](./CHANGELOG.md)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](./.nvmrc)
[![PNPM](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## 🎯 Quick Start

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Start web app only
pnpm dev:web

# Run tests
pnpm test

# Build all packages
pnpm build
```

## � Project Structure

```
packages/
├── core/          # 🧠 Business logic & models
├── ui/            # 🎨 React UI components
├── search/        # 🔍 Smart search engine
├── storage/       # 💾 Data persistence layer
├── gaming/        # 🎮 Gamification system
├── analytics/     # 📊 Analytics & metrics
└── shared/        # 🔧 Shared utilities

apps/
├── web/           # 🌐 Main web application
├── mobile/        # 📱 React Native app
└── desktop/       # 🖥️ Electron app

tools/
├── scripts/       # 🛠️ Build & utility scripts
├── cli/           # ⌨️ Command line tools
└── devtools/      # 🔧 Development tools
```

## 🚀 Features

- **📊 Nutrition Tracking** - Comprehensive food diary with macro calculations
- **🏋️ Training Management** - Workout planning and progress tracking
- **🔍 Smart Search** - Typo-tolerant search with phonetic matching
- **🎮 Gamification** - Achievement system and progress rewards
- **📈 Analytics** - Detailed insights and reporting
- **💾 Multi-Storage** - IndexedDB, Supabase, and cloud sync
- **🌐 PWA Ready** - Offline support and native app experience

## 🛠️ Development

### Prerequisites

- **Node.js** ≥ 18.0.0 (use `.nvmrc`)
- **PNPM** ≥ 8.0.0 (recommended package manager)
- **Git** for version control

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/heys.git
cd heys

# Install dependencies (automatically installs all workspaces)
pnpm install

# Setup development environment
pnpm setup:dev
```

## 🔄 Migration from v12

The project has been migrated from legacy v12 structure to modern monorepo:

- **Legacy files** preserved in root for compatibility
- **New structure** in `packages/` and `apps/`
- **Migration scripts** available in `tools/scripts/`

## 📚 Документация

> **Для разработчиков и ИИ:** Вся документация проекта организована в папке
> `docs/`
>
> 📖 **[Посмотреть полную документацию](docs/README.md)** - мастер-индекс со
> всеми руководствами, отчетами и anchor системой

## 🎯 Основные возможности

- 📊 **Отслеживание данных** - вес, питание, сон, активность
- 🔍 **Умный поиск** с исправлением опечаток и синонимами
- 📈 **Аналитика и отчеты** с интерактивными графиками
- 🏥 **Диагностические центры** для мониторинга системы
- 💾 **Современное хранение** - IndexedDB, Service Workers
- ⚡ **Высокая производительность** с Web Workers

## 🔧 Диагностические инструменты

### 🏥 Основной диагностический центр

- **`TESTS/super-diagnostic-center.html`** - главный инструмент диагностики
  - 27 структурных тестов системы
  - 8 функциональных тестов операций
  - Красивая визуализация процесса
  - Экспорт отчетов в JSON

### 🧪 Специализированные тесты

- `TESTS/functional-tests.html` - отдельные функциональные тесты
- `TESTS/advanced-features-demo.html` - демо продвинутых возможностей
- `TESTS/module-test.html` - тестирование модулей
- `TESTS/comparison-demo.html` - сравнение версий

## 📁 Структура проекта

```
HEYS/
├── 📄 Основные файлы системы
│   ├── heys_core_v12.js - ядро системы
│   ├── heys_day_v12.js - управление дневными данными
│   ├── heys_user_v12.js - система пользователей
│   └── heys_reports_v12.js - отчеты и аналитика
├── 🧠 Умные возможности
│   ├── heys_smart_search_with_typos_v1.js - умный поиск
│   ├── heys_analytics_ui.js - интерфейс аналитики
│   └── heys_performance_monitor.js - мониторинг производительности
├── 💾 Современные технологии
│   ├── heys_storage_indexeddb_v1.js - IndexedDB хранилище
│   ├── heys_worker_manager_v1.js - менеджер Web Workers
│   └── heys_integration_layer_v1.js - слой интеграции
├── 🎨 Интерфейс
│   ├── index.html - главная страница
│   └── styles/ - стили CSS
└── 🧪 Тестирование
    └── TESTS/ - диагностические инструменты
```

## 🚀 Быстрый старт

1. **Откройте главную страницу:**

   ```
   index.html
   ```

2. **Запустите диагностику:**

   ```
   TESTS/super-diagnostic-center.html
   ```

3. **Проверьте функциональность:**
   - Добавьте продукты
   - Воспользуйтесь поиском
   - Просмотрите отчеты

## 🛠️ Инструменты разработчика

### 🗺️ Умная навигационная система

**Проблема традиционных карт**: номера строк сдвигаются при изменении кода.

**Решение - якорная навигация**:

- ⚓ **Якорные метки**: `@ANCHOR:ИМЯ_СЕКЦИИ` - устойчивы к изменениям
- 🔍 **Умный поиск**: по именам функций/классов вместо номеров строк
- 📋 **Стабильные ссылки**: используют уникальные комментарии и названия

**Как пользоваться**:

1. `Ctrl+F` + имя функции/класса (например: `SuperHEYSDiagnosticCenter`)
2. Поиск якорных меток: `@ANCHOR:CSS_STYLES`, `@ANCHOR:MAIN_CLASS`
3. Поиск комментариев-меток: `/* CSS СТИЛИ */`, `/* ОСНОВНОЙ КЛАСС */`

**Файлы с умной навигацией**:

- ✅ `super-diagnostic-center.html` - полная якорная система
- ⚡ Автоматические инструменты: `dynamic-navigation-mapper.js`,
  `anchor-navigation.js`

### 🔧 Утилиты

- `TOOLS/code-mapper.js` - генератор навигационных карт
- `TOOLS/Create-NavigationMaps.ps1` - PowerShell скрипт анализа
- `NAVIGATION_MAPS_README.md` - документация по картам

## 📊 Системные требования

- Современный браузер с поддержкой ES6+
- IndexedDB, Web Workers, Service Workers
- Рекомендуется Chrome/Edge/Firefox последних версий

## 🎯 Особенности

- ⚡ **Быстрая работа** - оптимизированный код, кэширование
- 🔍 **Умный поиск** - исправление опечаток, синонимы
- 📱 **Адаптивность** - работает на мобильных устройствах
- 🛡️ **Надежность** - система отслеживания ошибок
- 📈 **Масштабируемость** - модульная архитектура

## 📋 Планы развития

- [ ] PWA функциональность
- [ ] Синхронизация между устройствами
- [ ] Машинное обучение для рекомендаций
- [ ] Интеграция с фитнес-трекерами
- [ ] Расширенная аналитика

## 🔗 Дополнительно

- **Функциональные тесты:** `АНАЛИЗ_ТЕСТИРОВАНИЯ_vs_РЕАЛЬНОСТЬ.md`
- **История изменений:** `TYPESCRIPT_MIGRATION_FINAL_REPORT.md`
- **Отчеты о производстве:** `PRODUCTION_FINAL_REPORT.md`

---

💡 **Совет:** Начните с `super-diagnostic-center.html` для полной диагностики
системы!
