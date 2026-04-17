# 🚀 HEYS v2

**Enterprise‑grade monorepo** — TypeScript/React ecosystem for nutrition
tracking, training management, and productivity enhancement.

[![Monorepo Version](https://img.shields.io/badge/monorepo-13.0.0-blue.svg)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](./.nvmrc)
[![PNPM](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.9.2-blue.svg)](./tsconfig.json)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](./apps/web/package.json)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![Tests](https://img.shields.io/badge/tests-✓_passing-brightgreen.svg)](#)
[![Quality](https://img.shields.io/badge/code_quality-A+-brightgreen.svg)](#)
[![Security](https://img.shields.io/badge/security-✓_hardened-brightgreen.svg)](./docs/SECURITY.md)
[![API](https://img.shields.io/badge/API-documented-blue.svg)](./docs/API_DOCUMENTATION.md)
[![Architecture](https://img.shields.io/badge/architecture-documented-blue.svg)](./docs/ARCHITECTURE.md)
[![Contributors](https://img.shields.io/badge/contributors-welcome-orange.svg)](./CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code_of_conduct-enforced-red.svg)](./CODE_OF_CONDUCT.md)

## 🎯 Quick Start

```bash
# Clone repository
git clone https://github.com/kinderlystv-png/HEYS-v2.git
cd HEYS-v2

# Install dependencies (using pnpm workspaces)
pnpm install

# Start development environment (Port 3001)
pnpm dev

# Or start specific applications
pnpm dev:web      # Main web app on port 3001
pnpm dev:landing  # Landing app on port 3003

# Web + IW config watcher (dev)
pnpm --dir apps/web run dev:full
pnpm dev:web:full

# Note: tg-mini/mobile scripts are currently not primary active entry points.
# See docs/ARCHITECTURE.md for current app status.

# Run tests
pnpm test         # All tests
pnpm test:web     # Web app tests
pnpm test:unit    # Unit tests only

# Build for production
pnpm build        # Build all packages
pnpm build:web    # Build web app only

# IW config sync (optional in dev)
pnpm --dir apps/web run dev:iw-config
# Version is auto-hashed from config content; do not edit inline block manually
```

---

## 🆕 Recent Updates

### v13.3.0 — Health Score Algorithm Fixes (February 13, 2026) 🎯

**Critical correctness fixes** in Health Score calculation algorithm.

#### 🐛 Bugs Fixed

1. **Weight sum error**: Deficit mode summed to 1.10 instead of 1.00
   - Fixed: `deficit.nutrition: 0.35 → 0.25`
   - Bonus: nutrition weight now truly lower than maintenance (as intended)

2. **Category mismatch**: 6 v6 patterns assigned to wrong categories
   - `antioxidant_defense`, `bone_health`, `electrolyte_homeostasis` →
     **recovery**
   - `b_complex_anemia`, `glycemic_load`, `added_sugar_dependency` →
     **metabolism**

#### ✅ Impact

- Health Score calculations now mathematically correct for all 3 goal modes
- UI Pattern Transparency modal shows patterns in correct categories
- Contribution percentages accurate across all 41 patterns

**Details**: [@heys/web Changelog](./apps/web/CHANGELOG.md)

---

### v4.8.8 — React State Sync Fix (February 12, 2026) 🛡️

**Major architectural fix** resolving critical namespacing conflict in React
state management.

#### 🐛 Problem Solved

React components displayed **42 products** with micronutrients instead of
**290**, blocking pattern activation:

- `micronutrient_radar` stuck at 0 (should be 100)
- `antioxidant_defense` at 21 (should be 79)
- Health Score: 66 (should be 71+)

#### ✅ Root Cause

**Namespacing conflict**: React read from unscoped localStorage key
(`heys_products`), while sync wrote to scoped key (`heys_{clientId}_products`).

#### 🔧 Solution

**Store API as Single Source of Truth** — React now ALWAYS reads via
`products.getAll()` (never direct localStorage):

```javascript
// ❌ OLD (broken — reads unscoped key)
const products = window.HEYS.utils.lsGet('heys_products', []);

// ✅ NEW v4.8.8 (correct — uses Store API)
const products = window.HEYS?.products?.getAll?.() || [];
```

#### 📊 Results

- ✅ Products with Fe: 42 → **290**
- ✅ Patterns activated: 27/41 (all micronutrient patterns now working)
- ✅ Health Score: 66 → **71**
- ✅ 100% effectiveness: 0 stale saves after fix

#### 📚 Documentation Updated

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Merged from TECHNICAL_ARCHITECTURE
  (v18.0.0), "Critical Architecture Evolution" section
- [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) — Added "Store API Best
  Practices" section
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Added "Critical Architecture
  Evolution" section
- [CHANGELOG.md](apps/web/CHANGELOG.md) — Full technical details

#### 🔗 Learn More

- [Store API Best Practices](docs/API_DOCUMENTATION.md#🛡️-store-api-best-practices-v488)
- [React State Sync Fix](docs/ARCHITECTURE.md#critical-architecture-evolution)
- [Architecture Evolution](docs/ARCHITECTURE.md#🛡️-critical-architecture-evolution)

---

## ✨ Features

- **🥗 Nutrition Tracking** — Smart calorie and macro management
- **🏋️ Training Plans** — Customizable workout routines
- **📊 Analytics** — Performance insights and progress tracking
- **🎮 Gamification** — Achievement system and progress rewards
- **🔍 Smart Search** — AI‑powered content discovery
- **📱 Multi‑Platform** — Web, mobile, and desktop applications
- **🔐 Security** — Enterprise‑grade data protection
- **☁️ Cloud Sync** — Real‑time synchronization across devices

## 🏗️ Architecture

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

### Onboarding

- **[Developer Onboarding](docs/dev/ONBOARDING.md)** — короткий старт и ссылки
  на ключевые доки

## 🔄 Migration from v12

The project has been migrated from legacy v12 structure to modern monorepo:

- **Legacy files** preserved in root for compatibility
- **New structure** in `packages/` and `apps/`
- **Migration scripts** available in `tools/scripts/`
- **Legacy ReportsTab** снят из UI; архив сохранён в `archive/legacy-v12/`,
  weekly‑отчёт теперь в Insights (`apps/web/heys_weekly_reports_v2.js`)

## 📚 Документация

> **Для разработчиков и ИИ:** Вся документация проекта организована в папке
> `docs/`
>
> 📖 **[Посмотреть полную документацию](docs/README.md)** - мастер-индекс со
> всеми руководствами, отчетами и anchor системой

## 🧹 Repository Hygiene (Root Folders)

Чтобы root оставался предсказуемым для поиска и агентной навигации, используем
простую классификацию top-level каталогов:

- **Active product code:** `apps/`, `packages/`, `yandex-cloud-functions/`,
  `scripts/`, `docs/`, `database/`.
- **Operational artifacts:** `reports/`, `security-reports/`, `TESTS/`.
- **Legacy/experimental snapshots** (не source-of-truth без явной задачи):
  `emt-v3-stable-clean/`, `testing-integration-package/`, `mini_app_logic`,
  `TOOLS/`.

Если добавляется новый top-level каталог, в PR фиксировать его статус (`active`,
`artifact`, `snapshot`) и владельца.

### 📌 Бриф продукта (актуально)

- **[HEYS Brief (Product v1)](docs/HEYS_BRIEF.md)** — Light-only, Widgets
  Dashboard + popup, Desktop Gate, PIN auth

### 📖 Основная документация

- 🏗️ **[Architecture Guide](docs/ARCHITECTURE.md)** - System architecture
  overview
- ✅ **[Quality Gate](docs/dev/QUALITY_GATE.md)** - Early error detection and
  blocking on commit
- 🧭 **[Autolimits for Legacy](docs/dev/AUTOLIMITS.md)** - Legacy module growth
  control (blocking on commit)
- 🧩 **[Module Architecture](docs/dev/MODULE_ARCHITECTURE.md)** - Modular
  structure rules and limits
- 🚀 **[API Documentation](docs/API_DOCUMENTATION.md)** - Comprehensive API
  reference
- 🛡️ **[Security Guide](SECURITY.md)** - Security implementation details
- 🤝 **[Contributing Guide](CONTRIBUTING.md)** - Development setup and
  guidelines
- 📜 **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community standards

### 📋 Development Guides

- 🔧 **[Setup Guide](docs/guides/SETUP.md)** - Development environment setup
- 🧪 **[Testing Guide](docs/guides/TESTING.md)** - Testing strategies and tools
- 🚀 **[Deployment Guide](docs/guides/DEPLOYMENT.md)** - Production deployment
- 🔍 **[Debugging Guide](docs/guides/DEBUGGING.md)** - Troubleshooting tips

## 🧩 Legacy v12 (архив)

Архивная структура и заметки перенесены в отдельный файл:

- 📄 **[Legacy README](docs/legacy/README_v12.md)**

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
