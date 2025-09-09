# 🏗️ Углубленный анализ структуры проекта

**Проект**: ! HEYS 2
**Дата анализа**: 2025-09-08
**Время анализа**: 19:35:27

## 📊 Общая информация

| Метрика | Значение | Статус |
|---------|----------|--------|
| Всего файлов | 590 | ✅ |
| Файлов требующих рефакторинга | 425 (72.0%) | 🔴 |
| Циклических зависимостей | 0 | 🟢 |
| Дублирование кода | 461.4% | 🔴 |
| Технический долг | 2253.7 часов | 🔴 |

## 🔄 Необходимость рефакторинга: ВЫСОКАЯ

### 🏗️ Архитектурные метрики

| Метрика | Значение | Рекомендуемое | Статус |
|---------|----------|---------------|--------|
| Связность модулей | 0.29 | > 0.70 | 🟡 |
| Связанность модулей | 0.67 | < 0.30 | 🔴 |
| Всего зависимостей | 91 | - | ℹ️ |

### 📈 Детальные метрики качества

| Категория | Количество файлов | Процент |
|-----------|-------------------|---------|
| Высокая сложность (>15) | 281 | 47.6% |
| Крупные файлы (>300 строк) | 186 | 31.5% |
| Низкая сопровождаемость (<65) | 392 | 66.4% |


## 🧠 Самообучение анализатора

### 📐 Обнаруженные паттерны проекта

- **Архитектурный паттерн**: React/Next.js
- **Распределение размеров файлов**:
  - Медиана: 179 строк
  - 75-й процентиль: 354 строк
  - 90-й процентиль: 567 строк
- **Распределение сложности**:
  - Медиана: 14
  - 75-й процентиль: 46
- **Распределение сопровождаемости**:
  - 25-й процентиль: 4.4
  - Медиана: 33.7

### 🛠️ Рекомендации по улучшению критериев анализа

- Текущие пороги оценки оптимальны для данного проекта

#### Предлагаемые дополнительные метрики

- **Анализ размера пропсов компонентов**: Выявление компонентов с избыточным количеством props (>8)
- **Расширенная когнитивная сложность**: Улучшенная оценка понятности кода с учетом архитектурных паттернов
- **Анализ технического долга по времени**: Оценка времени, необходимого для улучшения сопровождаемости

#### Специфичные для данного проекта правила

- **Правила для React-хуков**: Проверка корректности использования правила зависимостей в useEffect/useMemo/useCallback

## 🔥 Топ файлов требующих рефакторинга

### 1. index-D_ryMEPs.js

**Путь**: `test-results\assets\index-D_ryMEPs.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 57 | 🟢 |
| Цикломатическая сложность | 10320 | 🔴 |
| Когнитивная сложность | 147 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 16 | 🔴 |
| Количество функций | 19578 | ℹ️ |

**Причины для рефакторинга**:
- High cyclomatic complexity (10320)
- Low maintainability index (0.0)
- Deep nesting (16 levels)

### 2. index-14ea7095.js

**Путь**: `project-template\tests\reports\assets\index-14ea7095.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 32 | 🟢 |
| Цикломатическая сложность | 8277 | 🔴 |
| Когнитивная сложность | 92 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 10 | 🔴 |
| Количество функций | 16090 | ℹ️ |

**Причины для рефакторинга**:
- High cyclomatic complexity (8277)
- Low maintainability index (0.0)
- Deep nesting (10 levels)

### 3. heys_reports_v12.js

**Путь**: `apps\web\heys_reports_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 1016 | 🔴 |
| Цикломатическая сложность | 572 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 9 | 🔴 |
| Количество функций | 1023 | ℹ️ |

**Причины для рефакторинга**:
- Large file (1016 lines)
- High cyclomatic complexity (572)
- Low maintainability index (0.0)
- Deep nesting (9 levels)

### 4. heys_reports_v12.js

**Путь**: `archive\legacy-v12\misc\heys_reports_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 1016 | 🔴 |
| Цикломатическая сложность | 572 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 9 | 🔴 |
| Количество функций | 1023 | ℹ️ |

**Причины для рефакторинга**:
- Large file (1016 lines)
- High cyclomatic complexity (572)
- Low maintainability index (0.0)
- Deep nesting (9 levels)

### 5. heys_reports_v12.js

**Путь**: `packages\shared\src\misc\heys_reports_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 1016 | 🔴 |
| Цикломатическая сложность | 572 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 9 | 🔴 |
| Количество функций | 1023 | ℹ️ |

**Причины для рефакторинга**:
- Large file (1016 lines)
- High cyclomatic complexity (572)
- Low maintainability index (0.0)
- Deep nesting (9 levels)

### 6. heys_day_v12.js

**Путь**: `apps\web\heys_day_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 977 | 🔴 |
| Цикломатическая сложность | 446 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 8 | 🔴 |
| Количество функций | 1002 | ℹ️ |

**Причины для рефакторинга**:
- Large file (977 lines)
- High cyclomatic complexity (446)
- Low maintainability index (0.0)
- Deep nesting (8 levels)

### 7. heys_day_v12.js

**Путь**: `archive\legacy-v12\day\heys_day_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 977 | 🔴 |
| Цикломатическая сложность | 446 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 8 | 🔴 |
| Количество функций | 1002 | ℹ️ |

**Причины для рефакторинга**:
- Large file (977 lines)
- High cyclomatic complexity (446)
- Low maintainability index (0.0)
- Deep nesting (8 levels)

### 8. heys_day_v12.js

**Путь**: `packages\shared\src\day\heys_day_v12.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 977 | 🔴 |
| Цикломатическая сложность | 446 | 🔴 |
| Когнитивная сложность | 593 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 8 | 🔴 |
| Количество функций | 1002 | ℹ️ |

**Причины для рефакторинга**:
- Large file (977 lines)
- High cyclomatic complexity (446)
- Low maintainability index (0.0)
- Deep nesting (8 levels)

### 9. advanced-project-analyzer.js

**Путь**: `scripts\advanced-project-analyzer.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 973 | 🔴 |
| Цикломатическая сложность | 225 | 🔴 |
| Когнитивная сложность | 585 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 9 | 🔴 |
| Количество функций | 428 | ℹ️ |

**Причины для рефакторинга**:
- Large file (973 lines)
- High cyclomatic complexity (225)
- Low maintainability index (0.0)
- Deep nesting (9 levels)

### 10. project-detector.js

**Путь**: `project-template\emt-v3-stable-clean\project-detector.js`

| Метрика | Значение | Статус |
|---------|----------|--------|
| Строк кода | 1099 | 🔴 |
| Цикломатическая сложность | 207 | 🔴 |
| Когнитивная сложность | 346 | 🔴 |
| Индекс сопровождаемости | 0.0 | 🔴 |
| Глубина вложенности | 7 | 🔴 |
| Количество функций | 528 | ℹ️ |

**Причины для рефакторинга**:
- Large file (1099 lines)
- High cyclomatic complexity (207)
- Low maintainability index (0.0)
- Deep nesting (7 levels)


## 🌡️ Проблемные файлы (Hotspots)

### 1. index-D_ryMEPs.js
**Путь**: `test-results\assets\index-D_ryMEPs.js`
**Hotspot Score**: 103.27
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 10320
**Строк кода**: 57

### 2. index-14ea7095.js
**Путь**: `project-template\tests\reports\assets\index-14ea7095.js`
**Hotspot Score**: 82.83
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 8277
**Строк кода**: 32

### 3. heys_reports_v12.js
**Путь**: `apps\web\heys_reports_v12.js`
**Hotspot Score**: 6.17
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 572
**Строк кода**: 1016

### 4. heys_reports_v12.js
**Путь**: `archive\legacy-v12\misc\heys_reports_v12.js`
**Hotspot Score**: 6.17
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 572
**Строк кода**: 1016

### 5. heys_reports_v12.js
**Путь**: `packages\shared\src\misc\heys_reports_v12.js`
**Hotspot Score**: 6.17
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 572
**Строк кода**: 1016

### 6. heys_day_v12.js
**Путь**: `apps\web\heys_day_v12.js`
**Hotspot Score**: 4.89
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 446
**Строк кода**: 977

### 7. heys_day_v12.js
**Путь**: `archive\legacy-v12\day\heys_day_v12.js`
**Hotspot Score**: 4.89
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 446
**Строк кода**: 977

### 8. heys_day_v12.js
**Путь**: `packages\shared\src\day\heys_day_v12.js`
**Hotspot Score**: 4.89
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 446
**Строк кода**: 977

### 9. advanced-project-analyzer.js
**Путь**: `scripts\advanced-project-analyzer.js`
**Hotspot Score**: 2.68
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 225
**Строк кода**: 973

### 10. project-detector.js
**Путь**: `project-template\emt-v3-stable-clean\project-detector.js`
**Hotspot Score**: 2.55
**Коммитов**: 1
**Исправлений багов**: 1
**Сложность**: 207
**Строк кода**: 1099


## 📊 Тепловая карта директорий

| Директория | Файлов | Общ. строк | Ср. сложность | Статус |
|------------|--------|------------|---------------|--------|
| `test-results\assets` | 1 | 57 | 10320.0 | 🔴 |
| `project-template\tests\reports\assets` | 1 | 32 | 8277.0 | 🔴 |
| `archive\legacy-v12\day` | 2 | 1237 | 256.0 | 🔴 |
| `packages\shared\src\day` | 2 | 1237 | 256.0 | 🔴 |
| `emt-v3-stable-clean\utils` | 1 | 1078 | 207.0 | 🔴 |
| `project-template\emt-v3-stable-clean` | 1 | 1099 | 207.0 | 🔴 |
| `project-template\emt-v3-stable-clean\utils` | 1 | 1099 | 207.0 | 🔴 |
| `apps\web` | 14 | 5199 | 125.3 | 🔴 |
| `archive\legacy-v12\core` | 2 | 1033 | 122.5 | 🔴 |
| `emt-v3-stable-clean` | 2 | 1086 | 104.0 | 🔴 |
| `project-template\eap-analyzer\src\checkers` | 8 | 4318 | 97.4 | 🔴 |
| `archive\legacy-v12\misc` | 14 | 5428 | 89.4 | 🔴 |
| `packages\shared\src\misc` | 14 | 5428 | 89.4 | 🔴 |
| `packages\core\src\legacy` | 3 | 1083 | 82.3 | 🔴 |
| `archive\legacy-v12\storage` | 5 | 1646 | 79.6 | 🔴 |
| `packages\storage\src\legacy` | 5 | 1646 | 79.6 | 🔴 |
| `archive\legacy-v12\search` | 2 | 936 | 78.5 | 🔴 |
| `packages\search\src\legacy` | 2 | 936 | 78.5 | 🔴 |
| `TOOLS\tests` | 1 | 418 | 72.0 | 🔴 |
| `archive\legacy-v12\gaming` | 2 | 1390 | 71.0 | 🔴 |
| `packages\gaming\src\legacy` | 2 | 1390 | 71.0 | 🔴 |
| `testing-integration-package\utils` | 2 | 980 | 71.0 | 🔴 |
| `scripts\security` | 3 | 1748 | 66.0 | 🔴 |
| `packages\threat-detection\src\core` | 1 | 582 | 65.0 | 🔴 |
| `dist-scripts` | 1 | 254 | 61.0 | 🔴 |
| `packages\shared\src\performance\cli` | 1 | 464 | 60.0 | 🔴 |
| `packages\threat-detection\src\ml` | 2 | 849 | 59.0 | 🔴 |
| `archive\legacy-v12\integration` | 2 | 1011 | 57.0 | 🔴 |
| `packages\shared\src\integration` | 2 | 1011 | 57.0 | 🔴 |
| `project-template\src\lib\errorHandling` | 1 | 682 | 55.0 | 🔴 |
| `apps\web\public` | 1 | 289 | 54.0 | 🔴 |
| `docs\automation` | 3 | 832 | 50.0 | 🔴 |
| `packages\analytics-dashboard\src\utils` | 1 | 284 | 48.0 | 🔴 |
| `packages\storage\src` | 1 | 269 | 48.0 | 🔴 |
| `workers` | 4 | 1376 | 47.3 | 🔴 |
| `project-template\eap-analyzer\src\utils` | 1 | 410 | 47.0 | 🔴 |
| `apps\web\src\lib\supabase` | 5 | 1723 | 43.6 | 🔴 |
| `packages\shared\src\monitoring` | 11 | 4042 | 43.5 | 🔴 |
| `packages\search\src` | 2 | 610 | 43.0 | 🔴 |
| `packages\shared\src\performance` | 44 | 21553 | 42.3 | 🔴 |
| `project-template\src\lib\cache` | 4 | 1188 | 41.8 | 🔴 |
| `packages\shared\src\performance\configs` | 1 | 301 | 40.0 | 🔴 |
| `project-template\src\lib\logger\core` | 1 | 300 | 38.0 | 🔴 |
| `project-template\src\lib\logger\transports` | 1 | 246 | 38.0 | 🔴 |
| `project-template\src\lib\security` | 4 | 1332 | 37.8 | 🔴 |
| `apps\web\src\components\lazy` | 3 | 1255 | 37.7 | 🔴 |
| `archive\legacy-v12\user` | 2 | 450 | 37.5 | 🔴 |
| `packages\shared\src\user` | 2 | 450 | 37.5 | 🔴 |
| `project-template\src\lib\config` | 4 | 942 | 37.5 | 🔴 |
| `archive\legacy-v12\analytics` | 3 | 775 | 37.0 | 🔴 |
| `packages\analytics\src\legacy` | 3 | 775 | 37.0 | 🔴 |
| `packages\analytics-dashboard\src\core` | 4 | 1200 | 36.8 | 🔴 |
| `scripts` | 37 | 8218 | 35.0 | 🔴 |
| `TOOLS` | 17 | 5349 | 34.7 | 🔴 |
| `packages\shared\src\database` | 1 | 331 | 33.0 | 🔴 |
| `apps\web\src\hooks` | 5 | 1258 | 30.8 | 🔴 |
| `packages\shared\src\components` | 3 | 1335 | 30.7 | 🔴 |
| `packages\ui\src\security` | 1 | 318 | 30.0 | 🔴 |
| `apps\web\src\utils` | 7 | 1763 | 29.6 | 🔴 |
| `TESTS\suites` | 5 | 851 | 29.4 | 🔴 |
| `packages\analytics-dashboard\src\components` | 3 | 888 | 28.7 | 🔴 |
| `project-template\src\lib\migrations` | 6 | 1485 | 28.3 | 🔴 |
| `apps\web\src\middleware` | 3 | 769 | 28.0 | 🔴 |
| `packages\analytics-dashboard\src\providers` | 2 | 552 | 28.0 | 🔴 |
| `packages\shared\src\security` | 10 | 3106 | 26.9 | 🔴 |
| `project-template\src\lib\logger\security` | 1 | 183 | 24.0 | 🔴 |
| `project-template\src\lib\monitoring` | 4 | 1098 | 24.0 | 🔴 |
| `project-template\src\lib\logger\utils` | 1 | 256 | 23.0 | 🔴 |
| `project-template\src\lib\pwa` | 3 | 541 | 22.3 | 🔴 |
| `packages\shared\src\performance\components` | 2 | 366 | 22.0 | 🔴 |
| `apps\web\src\components\CuratorPanel\hooks` | 3 | 578 | 21.7 | 🔴 |
| `project-template\tests\e2e` | 3 | 439 | 20.0 | 🔴 |
| `project-template\testing-integration-package\utils` | 2 | 677 | 19.0 | 🔴 |
| `packages\logger\config` | 2 | 575 | 18.5 | 🔴 |
| `project-template\scripts` | 8 | 1301 | 17.6 | 🔴 |
| `project-template\src\lib\api` | 5 | 696 | 17.4 | 🔴 |
| `packages\logger\src` | 5 | 791 | 16.8 | 🔴 |
| `packages\threat-detection\src` | 3 | 421 | 16.3 | 🔴 |
| `packages\core\src` | 3 | 311 | 15.0 | 🟡 |
| `apps\web\src\components\OptimizedImage` | 3 | 383 | 14.7 | 🟡 |
| `project-template\src\test` | 3 | 413 | 14.3 | 🟡 |
| `project-template\eap-analyzer\src` | 5 | 535 | 13.8 | 🟡 |
| `project-template\src\lib\logger` | 3 | 609 | 12.7 | 🟡 |
| `.` | 17 | 2184 | 12.2 | 🟡 |
| `project-template\tests\performance` | 1 | 293 | 12.0 | 🟡 |
| `apps\web\src\components\loading` | 2 | 335 | 11.5 | 🟡 |
| `apps\web\src\components\LoadingStates` | 3 | 473 | 11.0 | 🟡 |
| `src` | 3 | 226 | 10.3 | 🟡 |
| `apps\web\src\components\CuratorPanel\context` | 1 | 93 | 10.0 | 🟢 |
| `testing-integration-package` | 1 | 41 | 10.0 | 🟢 |
| `project-template\src\lib\errors` | 3 | 295 | 9.3 | 🟢 |
| `apps\web\src\components\CuratorPanel\components` | 1 | 75 | 9.0 | 🟢 |
| `src\lib` | 1 | 99 | 9.0 | 🟢 |
| `src\lib\utils` | 1 | 44 | 7.0 | 🟢 |
| `apps\web\src` | 3 | 181 | 6.3 | 🟢 |
| `packages\analytics-dashboard\src\__tests__` | 4 | 833 | 6.3 | 🟢 |
| `apps\web\src\components\CuratorPanel\components\UsersTabPanel\components` | 6 | 580 | 6.0 | 🟢 |
| `apps\web\src\utils\__tests__` | 1 | 558 | 6.0 | 🟢 |
| `packages\analytics-dashboard\src\mock` | 1 | 166 | 6.0 | 🟢 |
| `project-template\src\lib\utils` | 1 | 77 | 6.0 | 🟢 |
| `TESTS\e2e` | 11 | 947 | 5.5 | 🟢 |
| `packages\shared\src\security\__tests__` | 2 | 602 | 5.5 | 🟢 |
| `apps\web\src\components\CuratorPanel\components\UsersTabPanel` | 1 | 99 | 5.0 | 🟢 |
| `apps\web\__tests__` | 1 | 76 | 5.0 | 🟢 |
| `packages\shared\src\__tests__` | 4 | 504 | 5.0 | 🟢 |
| `project-template\src\routes\health` | 1 | 41 | 5.0 | 🟢 |
| `TESTS\e2e\helpers` | 1 | 202 | 5.0 | 🟢 |
| `TESTS\integration` | 1 | 151 | 5.0 | 🟢 |
| `TESTS` | 6 | 815 | 4.5 | 🟢 |
| `packages\core\src\services` | 4 | 120 | 4.3 | 🟢 |
| `apps\web\src\components\CuratorPanel\utils` | 1 | 22 | 4.0 | 🟢 |
| `packages\analytics-dashboard\src\__tests__\__mocks__\@heys` | 1 | 86 | 4.0 | 🟢 |
| `packages\shared\src\monitoring\__tests__` | 1 | 379 | 4.0 | 🟢 |
| `project-template` | 10 | 590 | 4.0 | 🟢 |
| `project-template\src` | 1 | 35 | 4.0 | 🟢 |
| `project-template\tests\mocks` | 1 | 160 | 4.0 | 🟢 |
| `project-template\tests\visual` | 1 | 72 | 4.0 | 🟢 |
| `project-template\tests\unit` | 4 | 474 | 3.8 | 🟢 |
| `apps\web\src\components\CuratorPanel` | 2 | 70 | 3.5 | 🟢 |
| `apps\web\src\middleware\__tests__` | 2 | 600 | 3.5 | 🟢 |
| `project-template\tests\utils` | 4 | 352 | 3.3 | 🟢 |
| `packages\core\src\tests` | 1 | 220 | 3.0 | 🟢 |
| `packages\storage\src\__tests__` | 3 | 406 | 3.0 | 🟢 |
| `packages\ui\src\components\Button` | 1 | 59 | 3.0 | 🟢 |
| `project-template\src\lib\logger\types` | 2 | 344 | 3.0 | 🟢 |
| `project-template\src\lib` | 2 | 75 | 2.5 | 🟢 |
| `TOOLS\templates\test` | 4 | 375 | 2.5 | 🟢 |
| `apps\web\src\lib\supabase\__tests__` | 1 | 447 | 2.0 | 🟢 |
| `apps\web\src\routes` | 1 | 116 | 2.0 | 🟢 |
| `packages\analytics-dashboard` | 4 | 207 | 2.0 | 🟢 |
| `packages\core\src\models` | 4 | 158 | 2.0 | 🟢 |
| `packages\threat-detection\src\__tests__` | 2 | 198 | 2.0 | 🟢 |
| `project-template\tests\integration` | 1 | 40 | 2.0 | 🟢 |
| `TESTS\fixtures` | 1 | 26 | 2.0 | 🟢 |
| `packages\analytics\src\__tests__` | 2 | 171 | 1.5 | 🟢 |
| `packages\analytics-dashboard\src` | 4 | 226 | 1.5 | 🟢 |
| `packages\core\src\__tests__` | 9 | 797 | 1.3 | 🟢 |
| `project-template\tests` | 6 | 247 | 1.3 | 🟢 |
| `apps\web\src\components\CuratorPanel\demo` | 1 | 44 | 1.0 | 🟢 |
| `apps\web\src\components\CuratorPanel\types` | 1 | 121 | 1.0 | 🟢 |
| `apps\web\src\components\CuratorPanel\__tests__` | 1 | 131 | 1.0 | 🟢 |
| `apps\web\src\components\OptimizedImage\__tests__` | 1 | 133 | 1.0 | 🟢 |
| `apps\web\src\hooks\__tests__` | 1 | 220 | 1.0 | 🟢 |
| `apps\web\src\__tests__` | 1 | 6 | 1.0 | 🟢 |
| `docs\website` | 2 | 146 | 1.0 | 🟢 |
| `docs\website\src\components\HomepageFeatures` | 1 | 67 | 1.0 | 🟢 |
| `docs\website\src\pages` | 1 | 40 | 1.0 | 🟢 |
| `emt-v3-stable-clean\src\constants` | 1 | 20 | 1.0 | 🟢 |
| `emt-v3-stable-clean\tests` | 2 | 31 | 1.0 | 🟢 |
| `emt-v3-stable-clean\tests\fixtures` | 1 | 15 | 1.0 | 🟢 |
| `emt-v3-stable-clean\tests\utils` | 1 | 1 | 1.0 | 🟢 |
| `packages\analytics\src` | 1 | 1 | 1.0 | 🟢 |
| `packages\analytics` | 2 | 36 | 1.0 | 🟢 |
| `packages\analytics-dashboard\src\types` | 1 | 156 | 1.0 | 🟢 |
| `packages\analytics-dashboard\tests` | 1 | 103 | 1.0 | 🟢 |
| `packages\core\src\types` | 1 | 14 | 1.0 | 🟢 |
| `packages\core` | 2 | 48 | 1.0 | 🟢 |
| `packages\gaming\src` | 1 | 1 | 1.0 | 🟢 |
| `packages\gaming\src\__tests__` | 2 | 150 | 1.0 | 🟢 |
| `packages\gaming` | 2 | 36 | 1.0 | 🟢 |
| `packages\logger\tests` | 1 | 118 | 1.0 | 🟢 |
| `packages\search\src\__tests__` | 2 | 113 | 1.0 | 🟢 |
| `packages\search` | 2 | 36 | 1.0 | 🟢 |
| `packages\shared\src` | 1 | 6 | 1.0 | 🟢 |
| `packages\shared` | 2 | 43 | 1.0 | 🟢 |
| `packages\storage` | 2 | 36 | 1.0 | 🟢 |
| `packages\threat-detection\src\types` | 1 | 473 | 1.0 | 🟢 |
| `packages\threat-detection` | 1 | 8 | 1.0 | 🟢 |
| `packages\ui\src` | 2 | 7 | 1.0 | 🟢 |
| `packages\ui\src\__tests__` | 1 | 146 | 1.0 | 🟢 |
| `packages\ui` | 2 | 42 | 1.0 | 🟢 |
| `project-template\eap-analyzer\bin` | 1 | 6 | 1.0 | 🟢 |
| `project-template\eap-analyzer\src\types` | 1 | 222 | 1.0 | 🟢 |
| `project-template\src\constants` | 2 | 15 | 1.0 | 🟢 |
| `project-template\src\routes` | 2 | 116 | 1.0 | 🟢 |
| `project-template\src\stores` | 2 | 18 | 1.0 | 🟢 |
| `project-template\src\tests` | 1 | 285 | 1.0 | 🟢 |
| `project-template\src\types` | 1 | 61 | 1.0 | 🟢 |
| `project-template\tests\components` | 1 | 5 | 1.0 | 🟢 |
| `project-template\tests\fixtures` | 2 | 25 | 1.0 | 🟢 |
| `project-template\tests\pages` | 1 | 0 | 1.0 | 🟢 |
| `src\constants` | 1 | 15 | 1.0 | 🟢 |
| `src\lib\stores` | 1 | 20 | 1.0 | 🟢 |
| `src\routes` | 2 | 117 | 1.0 | 🟢 |
| `src\routes\dashboard` | 1 | 154 | 1.0 | 🟢 |
| `TESTS\utils` | 1 | 4 | 1.0 | 🟢 |
| `types` | 3 | 603 | 1.0 | 🟢 |

## 📋 Дублирование кода

**Общий процент дублирования**: 461.4%
**Дублированных строк**: 519455
**Найдено дубликатов**: 29623

### Топ дубликатов:

1. **20 строк** дублируется между:
   - `apps\web\heys_analytics_ui.js` (строка 1)
   - `archive\legacy-v12\analytics\heys_analytics_ui.js` (строка 1)

2. **20 строк** дублируется между:
   - `apps\web\heys_analytics_ui.js` (строка 2)
   - `archive\legacy-v12\analytics\heys_analytics_ui.js` (строка 2)

3. **20 строк** дублируется между:
   - `apps\web\heys_analytics_ui.js` (строка 3)
   - `archive\legacy-v12\analytics\heys_analytics_ui.js` (строка 3)

4. **20 строк** дублируется между:
   - `apps\web\heys_analytics_ui.js` (строка 4)
   - `archive\legacy-v12\analytics\heys_analytics_ui.js` (строка 4)

5. **20 строк** дублируется между:
   - `apps\web\heys_analytics_ui.js` (строка 5)
   - `archive\legacy-v12\analytics\heys_analytics_ui.js` (строка 5)


## 💡 Детальные рекомендации по рефакторингу

### 🎯 Стратегия рефакторинга

**Оценка трудозатрат**: 2253.7 часов

#### Фаза 1: Критические исправления (902 часов)
2. **Рефакторинг проблемных файлов (hotspots)**
   - `test-results\assets\index-D_ryMEPs.js` (score: 103.27, багфиксов: 1)
   - `project-template\tests\reports\assets\index-14ea7095.js` (score: 82.83, багфиксов: 1)
   - `apps\web\heys_reports_v12.js` (score: 6.17, багфиксов: 1)

#### Фаза 2: Структурные улучшения (902 часов)

1. **Декомпозиция сложных файлов**
   - `test-results\assets\index-D_ryMEPs.js` (сложность: 10320)
   - `project-template\tests\reports\assets\index-14ea7095.js` (сложность: 8277)
   - `apps\web\heys_reports_v12.js` (сложность: 572)

2. **Уменьшение размера файлов**
   - `apps\web\heys_reports_v12.js` (1016 строк)
   - `archive\legacy-v12\misc\heys_reports_v12.js` (1016 строк)
   - `packages\shared\src\misc\heys_reports_v12.js` (1016 строк)

3. **Устранение дублирования кода** (461.4%)
   - Создание переиспользуемых компонентов
   - Вынесение общей логики в утилиты
   - Применение паттернов проектирования

#### Фаза 3: Долгосрочные улучшения (451 часов)

1. **Повышение покрытия тестами**
   - Добавление unit-тестов для отрефакторенного кода
   - Создание интеграционных тестов

2. **Улучшение архитектуры**
   - Снижение связанности между модулями
   - Повышение связности внутри модулей
   - Документирование архитектурных решений

3. **Автоматизация контроля качества**
   - Настройка lint правил для предотвращения регрессии
   - Внедрение метрик качества в CI/CD


## 📋 Чек-лист для рефакторинга

### Перед началом рефакторинга:
- [ ] Убедитесь в наличии тестового покрытия для изменяемого кода
- [ ] Создайте отдельную ветку для рефакторинга
- [ ] Запланируйте небольшие итеративные изменения

### Во время рефакторинга:
- [ ] Применяйте принцип "красный-зеленый-рефакторинг"
- [ ] Делайте частые коммиты с описательными сообщениями
- [ ] Запускайте тесты после каждого изменения

### После рефакторинга:
- [ ] Проведите повторный анализ для проверки улучшений
- [ ] Обновите документацию при необходимости
- [ ] Проведите code review с командой

---

**Отчет сгенерирован**: 2025-09-08T19:35:27.094Z
**Анализатор**: Advanced Project Structure Analyzer v2.0 (с самообучением)
