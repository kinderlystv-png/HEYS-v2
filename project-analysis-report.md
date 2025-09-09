# Отчет о структуре проекта и необходимости рефакторинга

## 📊 Общая информация

| Метрика | Значение |
|---------|---------|
| Всего файлов | 590 |
| Всего строк кода | 177712 |
| Файлов требующих рефакторинга | 368 (62.4%) |
| Циклических зависимостей | 0 |

## 🔄 Необходимость рефакторинга: ВЫСОКАЯ

### 📁 Распределение файлов по типам

- **.js**: 189 файлов (32.0%)
- **.tsx**: 47 файлов (8.0%)
- **.ts**: 347 файлов (58.8%)
- **.jsx**: 1 файлов (0.2%)
- **.svelte**: 6 файлов (1.0%)

## 🔥 Топ файлов требующих рефакторинга

### 1. index-D_ryMEPs.js
**Путь**: `C:\! HEYS 2\test-results\assets\index-D_ryMEPs.js`
**Строк**: 59
**Сложность**: 5247
**Исправлений багов**: 0
**Причины для рефакторинга**:
- High complexity (5247 > 15)

### 2. index-14ea7095.js
**Путь**: `C:\! HEYS 2\project-template\tests\reports\assets\index-14ea7095.js`
**Строк**: 34
**Сложность**: 4323
**Исправлений багов**: 0
**Причины для рефакторинга**:
- High complexity (4323 > 15)

### 3. heys_reports_v12.js
**Путь**: `C:\! HEYS 2\apps\web\heys_reports_v12.js`
**Строк**: 1262
**Сложность**: 344
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1262 lines > 300)
- High complexity (344 > 15)

### 4. heys_reports_v12.js
**Путь**: `C:\! HEYS 2\archive\legacy-v12\misc\heys_reports_v12.js`
**Строк**: 1262
**Сложность**: 344
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1262 lines > 300)
- High complexity (344 > 15)

### 5. heys_reports_v12.js
**Путь**: `C:\! HEYS 2\packages\shared\src\misc\heys_reports_v12.js`
**Строк**: 1262
**Сложность**: 344
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1262 lines > 300)
- High complexity (344 > 15)

### 6. heys_day_v12.js
**Путь**: `C:\! HEYS 2\apps\web\heys_day_v12.js`
**Строк**: 1112
**Сложность**: 304
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1112 lines > 300)
- High complexity (304 > 15)

### 7. heys_day_v12.js
**Путь**: `C:\! HEYS 2\archive\legacy-v12\day\heys_day_v12.js`
**Строк**: 1112
**Сложность**: 304
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1112 lines > 300)
- High complexity (304 > 15)

### 8. heys_day_v12.js
**Путь**: `C:\! HEYS 2\packages\shared\src\day\heys_day_v12.js`
**Строк**: 1112
**Сложность**: 304
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1112 lines > 300)
- High complexity (304 > 15)

### 9. project-detector.js
**Путь**: `C:\! HEYS 2\emt-v3-stable-clean\project-detector.js`
**Строк**: 1400
**Сложность**: 196
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1400 lines > 300)
- High complexity (196 > 15)

### 10. project-detector-v3.0-stable.js
**Путь**: `C:\! HEYS 2\emt-v3-stable-clean\utils\project-detector-v3.0-stable.js`
**Строк**: 1400
**Сложность**: 196
**Исправлений багов**: 0
**Причины для рефакторинга**:
- Large file (1400 lines > 300)
- High complexity (196 > 15)


## 📊 Тепловая карта директорий

| Директория | Файлов | Строк кода | Средняя сложность | Статус |
|------------|--------|------------|-------------------|--------|
| `C:\! HEYS 2\test-results\assets` | 1 | 59 | 5247.0 | 🔴 |
| `C:\! HEYS 2\project-template\tests\reports\assets` | 1 | 34 | 4323.0 | 🔴 |
| `C:\! HEYS 2\emt-v3-stable-clean\utils` | 1 | 1400 | 196.0 | 🔴 |
| `C:\! HEYS 2\project-template\emt-v3-stable-clean` | 1 | 1420 | 184.0 | 🔴 |
| `C:\! HEYS 2\project-template\emt-v3-stable-clean\utils` | 1 | 1420 | 184.0 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\day` | 2 | 1428 | 179.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\day` | 2 | 1428 | 179.0 | 🔴 |
| `C:\! HEYS 2\emt-v3-stable-clean` | 2 | 1409 | 98.5 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\core` | 2 | 1174 | 98.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\database` | 1 | 387 | 86.0 | 🔴 |
| `C:\! HEYS 2\apps\web` | 14 | 6367 | 85.7 | 🔴 |
| `C:\! HEYS 2\testing-integration-package\utils` | 2 | 1189 | 81.0 | 🔴 |
| `C:\! HEYS 2\project-template\eap-analyzer\src\checkers` | 8 | 5031 | 80.5 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\search` | 2 | 1186 | 76.0 | 🔴 |
| `C:\! HEYS 2\packages\search\src\legacy` | 2 | 1186 | 76.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger\types` | 2 | 409 | 72.0 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\misc` | 14 | 6711 | 67.1 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\misc` | 14 | 6711 | 67.1 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\storage` | 5 | 2103 | 67.0 | 🔴 |
| `C:\! HEYS 2\packages\storage\src\legacy` | 5 | 2103 | 67.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\utils\__tests__` | 1 | 704 | 66.0 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\gaming` | 2 | 1894 | 66.0 | 🔴 |
| `C:\! HEYS 2\packages\gaming\src\legacy` | 2 | 1894 | 66.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\errorHandling` | 1 | 797 | 66.0 | 🔴 |
| `C:\! HEYS 2\TOOLS\tests` | 1 | 569 | 66.0 | 🔴 |
| `C:\! HEYS 2\packages\core\src\legacy` | 3 | 1250 | 65.7 | 🔴 |
| `C:\! HEYS 2\apps\web\public` | 1 | 396 | 65.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\monitoring` | 11 | 4906 | 61.4 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\utils` | 1 | 333 | 60.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\lib\supabase` | 5 | 2085 | 57.4 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\monitoring\__tests__` | 1 | 501 | 55.0 | 🔴 |
| `C:\! HEYS 2\workers` | 4 | 1753 | 54.5 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\performance\cli` | 1 | 564 | 54.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\lib\supabase\__tests__` | 1 | 556 | 53.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\performance\configs` | 1 | 386 | 53.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\performance` | 44 | 26169 | 52.3 | 🔴 |
| `C:\! HEYS 2\types` | 3 | 721 | 51.3 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\providers` | 2 | 709 | 51.0 | 🔴 |
| `C:\! HEYS 2\packages\ui\src\security` | 1 | 365 | 51.0 | 🔴 |
| `C:\! HEYS 2\scripts\security` | 3 | 2119 | 51.0 | 🔴 |
| `C:\! HEYS 2\packages\threat-detection\src\core` | 1 | 688 | 50.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\hooks` | 5 | 1622 | 48.6 | 🔴 |
| `C:\! HEYS 2\packages\search\src` | 2 | 784 | 47.0 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\integration` | 2 | 1286 | 46.5 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\integration` | 2 | 1286 | 46.5 | 🔴 |
| `C:\! HEYS 2\packages\storage\src` | 1 | 343 | 46.0 | 🔴 |
| `C:\! HEYS 2\packages\core\src\tests` | 1 | 273 | 45.0 | 🔴 |
| `C:\! HEYS 2\project-template\tests\performance` | 1 | 372 | 45.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\security\__tests__` | 2 | 759 | 44.0 | 🔴 |
| `C:\! HEYS 2\docs\automation` | 3 | 1137 | 43.3 | 🔴 |
| `C:\! HEYS 2\packages\threat-detection\src\ml` | 2 | 1023 | 43.0 | 🔴 |
| `C:\! HEYS 2\project-template\eap-analyzer\src\utils` | 1 | 467 | 43.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\utils` | 7 | 2248 | 41.7 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\cache` | 4 | 1483 | 41.5 | 🔴 |
| `C:\! HEYS 2\project-template\testing-integration-package\utils` | 2 | 837 | 39.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\performance\components` | 2 | 438 | 38.5 | 🔴 |
| `C:\! HEYS 2\apps\web\src\hooks\__tests__` | 1 | 311 | 38.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger\transports` | 1 | 319 | 37.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\security` | 10 | 3825 | 36.8 | 🔴 |
| `C:\! HEYS 2\scripts` | 37 | 10702 | 36.7 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\lazy` | 3 | 1442 | 36.7 | 🔴 |
| `C:\! HEYS 2\apps\web\src\middleware` | 3 | 959 | 35.7 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\security` | 4 | 1594 | 34.8 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger\core` | 1 | 352 | 34.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\middleware\__tests__` | 2 | 743 | 33.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\config` | 4 | 1136 | 33.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger\utils` | 1 | 280 | 32.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\migrations` | 6 | 1808 | 31.7 | 🔴 |
| `C:\! HEYS 2\dist-scripts` | 1 | 281 | 31.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\monitoring` | 4 | 1303 | 31.0 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\core` | 4 | 1428 | 30.8 | 🔴 |
| `C:\! HEYS 2\TOOLS` | 17 | 6829 | 30.1 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\user` | 2 | 523 | 30.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\user` | 2 | 522 | 30.0 | 🔴 |
| `C:\! HEYS 2\packages\threat-detection\src\types` | 1 | 510 | 30.0 | 🔴 |
| `C:\! HEYS 2\project-template\tests\e2e` | 3 | 619 | 30.0 | 🔴 |
| `C:\! HEYS 2\project-template\tests\unit` | 4 | 607 | 30.0 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\components` | 3 | 1486 | 29.3 | 🔴 |
| `C:\! HEYS 2\packages\ui\src\__tests__` | 1 | 195 | 29.0 | 🔴 |
| `C:\! HEYS 2\archive\legacy-v12\analytics` | 3 | 927 | 28.7 | 🔴 |
| `C:\! HEYS 2\packages\analytics\src\legacy` | 3 | 927 | 28.7 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\types` | 1 | 135 | 28.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\types` | 1 | 73 | 26.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\hooks` | 3 | 692 | 25.0 | 🔴 |
| `C:\! HEYS 2\packages\logger\tests` | 1 | 140 | 25.0 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\components` | 3 | 978 | 24.7 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\pwa` | 3 | 653 | 24.3 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger\security` | 1 | 230 | 24.0 | 🔴 |
| `C:\! HEYS 2\TOOLS\templates\test` | 4 | 535 | 24.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\logger` | 3 | 772 | 23.3 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\api` | 5 | 873 | 22.4 | 🔴 |
| `C:\! HEYS 2\packages\storage\src\__tests__` | 3 | 564 | 22.0 | 🔴 |
| `C:\! HEYS 2\TESTS\integration` | 1 | 190 | 22.0 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\__tests__` | 4 | 1037 | 21.8 | 🔴 |
| `C:\! HEYS 2\packages\logger\src` | 5 | 981 | 21.4 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\loading` | 2 | 383 | 20.0 | 🔴 |
| `C:\! HEYS 2\project-template\eap-analyzer\src\types` | 1 | 249 | 20.0 | 🔴 |
| `C:\! HEYS 2\project-template\scripts` | 8 | 1649 | 19.6 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\OptimizedImage` | 3 | 482 | 18.7 | 🔴 |
| `C:\! HEYS 2\packages\logger\config` | 2 | 707 | 18.5 | 🔴 |
| `C:\! HEYS 2\packages\shared\src\__tests__` | 4 | 660 | 18.3 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\__tests__` | 1 | 166 | 17.0 | 🔴 |
| `C:\! HEYS 2\project-template\eap-analyzer\src` | 5 | 712 | 16.8 | 🔴 |
| `C:\! HEYS 2\TESTS\suites` | 5 | 1088 | 16.8 | 🔴 |
| `C:\! HEYS 2\packages\analytics\src\__tests__` | 2 | 220 | 16.5 | 🔴 |
| `C:\! HEYS 2\project-template\src\test` | 3 | 496 | 16.3 | 🔴 |
| `C:\! HEYS 2\apps\web\__tests__` | 1 | 106 | 16.0 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\types` | 1 | 180 | 16.0 | 🔴 |
| `C:\! HEYS 2\packages\threat-detection\src` | 3 | 526 | 15.7 | 🔴 |
| `C:\! HEYS 2\TESTS\e2e` | 11 | 1546 | 15.5 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\LoadingStates` | 3 | 529 | 15.0 | 🔴 |
| `C:\! HEYS 2\TESTS` | 6 | 1026 | 14.0 | 🔴 |
| `C:\! HEYS 2\packages\gaming\src\__tests__` | 2 | 211 | 13.5 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\utils` | 1 | 30 | 13.0 | 🔴 |
| `C:\! HEYS 2\apps\web\src\components\OptimizedImage\__tests__` | 1 | 163 | 13.0 | 🔴 |
| `C:\! HEYS 2\packages\search\src\__tests__` | 2 | 155 | 13.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\utils` | 1 | 91 | 13.0 | 🔴 |
| `C:\! HEYS 2\project-template\tests\visual` | 1 | 86 | 13.0 | 🔴 |
| `C:\! HEYS 2\project-template\src\lib\errors` | 3 | 355 | 12.7 | 🔴 |
| `C:\! HEYS 2` | 17 | 2714 | 12.4 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\tests` | 1 | 123 | 12.0 | 🔴 |
| `C:\! HEYS 2\src\lib` | 1 | 143 | 12.0 | 🔴 |
| `C:\! HEYS 2\testing-integration-package` | 1 | 51 | 12.0 | 🔴 |
| `C:\! HEYS 2\packages\core\src` | 3 | 396 | 11.3 | 🔴 |
| `C:\! HEYS 2\packages\core\src\__tests__` | 9 | 967 | 11.2 | 🔴 |
| `C:\! HEYS 2\src` | 3 | 286 | 10.3 | 🔴 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\mock` | 1 | 187 | 10.0 | 🟡 |
| `C:\! HEYS 2\project-template\tests\integration` | 1 | 49 | 10.0 | 🟡 |
| `C:\! HEYS 2\project-template\tests\mocks` | 1 | 197 | 9.0 | 🟡 |
| `C:\! HEYS 2\project-template\tests` | 6 | 313 | 8.2 | 🟡 |
| `C:\! HEYS 2\project-template\tests\utils` | 4 | 420 | 8.0 | 🟡 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\components\UsersTabPanel\components` | 6 | 655 | 7.5 | 🟡 |
| `C:\! HEYS 2\packages\threat-detection\src\__tests__` | 2 | 237 | 7.5 | 🟡 |
| `C:\! HEYS 2\apps\web\src` | 3 | 214 | 7.3 | 🟡 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\components` | 1 | 86 | 7.0 | 🟡 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\context` | 1 | 105 | 7.0 | 🟡 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\__tests__\__mocks__\@heys` | 1 | 100 | 7.0 | 🟡 |
| `C:\! HEYS 2\src\lib\utils` | 1 | 53 | 7.0 | 🟡 |
| `C:\! HEYS 2\TESTS\e2e\helpers` | 1 | 256 | 6.0 | 🟡 |
| `C:\! HEYS 2\packages\core\src\services` | 4 | 153 | 5.3 | 🟡 |
| `C:\! HEYS 2\packages\ui\src\components\Button` | 1 | 66 | 5.0 | 🟢 |
| `C:\! HEYS 2\project-template\src` | 1 | 41 | 5.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\lib` | 2 | 119 | 5.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\tests` | 1 | 337 | 5.0 | 🟢 |
| `C:\! HEYS 2\apps\web\src\routes` | 1 | 153 | 4.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\routes\health` | 1 | 44 | 4.0 | 🟢 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\components\UsersTabPanel` | 1 | 111 | 3.0 | 🟢 |
| `C:\! HEYS 2\apps\web\src\__tests__` | 1 | 9 | 3.0 | 🟢 |
| `C:\! HEYS 2\docs\website\src\components\HomepageFeatures` | 1 | 72 | 3.0 | 🟢 |
| `C:\! HEYS 2\docs\website\src\pages` | 1 | 44 | 3.0 | 🟢 |
| `C:\! HEYS 2\emt-v3-stable-clean\tests` | 2 | 43 | 3.0 | 🟢 |
| `C:\! HEYS 2\src\lib\stores` | 1 | 31 | 3.0 | 🟢 |
| `C:\! HEYS 2\project-template` | 10 | 730 | 2.6 | 🟢 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel` | 2 | 94 | 2.5 | 🟢 |
| `C:\! HEYS 2\apps\web\src\components\CuratorPanel\demo` | 1 | 53 | 2.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics\src` | 1 | 3 | 2.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics-dashboard` | 4 | 247 | 2.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\components` | 1 | 7 | 2.0 | 🟢 |
| `C:\! HEYS 2\src\routes` | 2 | 132 | 2.0 | 🟢 |
| `C:\! HEYS 2\src\routes\dashboard` | 1 | 164 | 2.0 | 🟢 |
| `C:\! HEYS 2\TESTS\fixtures` | 1 | 30 | 2.0 | 🟢 |
| `C:\! HEYS 2\TESTS\utils` | 1 | 5 | 2.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics-dashboard\src` | 4 | 260 | 1.8 | 🟢 |
| `C:\! HEYS 2\packages\core\src\models` | 4 | 193 | 1.5 | 🟢 |
| `C:\! HEYS 2\project-template\src\routes` | 2 | 135 | 1.5 | 🟢 |
| `C:\! HEYS 2\docs\website` | 2 | 183 | 1.0 | 🟢 |
| `C:\! HEYS 2\emt-v3-stable-clean\src\constants` | 1 | 29 | 1.0 | 🟢 |
| `C:\! HEYS 2\emt-v3-stable-clean\tests\fixtures` | 1 | 17 | 1.0 | 🟢 |
| `C:\! HEYS 2\emt-v3-stable-clean\tests\utils` | 1 | 2 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics` | 2 | 40 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\core` | 2 | 53 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\core\src\types` | 1 | 17 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\gaming` | 2 | 40 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\gaming\src` | 1 | 3 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\search` | 2 | 40 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\shared` | 2 | 48 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\shared\src` | 1 | 10 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\storage` | 2 | 40 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\threat-detection` | 1 | 10 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\ui` | 2 | 46 | 1.0 | 🟢 |
| `C:\! HEYS 2\packages\ui\src` | 2 | 21 | 1.0 | 🟢 |
| `C:\! HEYS 2\project-template\eap-analyzer\bin` | 1 | 9 | 1.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\constants` | 2 | 25 | 1.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\stores` | 2 | 28 | 1.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\fixtures` | 2 | 30 | 1.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\pages` | 1 | 1 | 1.0 | 🟢 |
| `C:\! HEYS 2\src\constants` | 1 | 23 | 1.0 | 🟢 |
| `C:\! HEYS 2\.changeset` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.github` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.github\workflows` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.husky` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.husky\_` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.turbo\cookies` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.turbo\daemon` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\.vscode` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\apps` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\apps\web\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\apps\web\src\components` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\apps\web\src\lib` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\apps\web\styles` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\archive` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\archive\legacy-v12` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\archive\reports-20250902` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\bundle-analysis` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\database` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\database_fixes` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\anchors` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\archive` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\archive\legacy` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\archive\roadmaps` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\guides` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\metrics` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\plans` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\reports` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\sprints` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\ui` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\blog` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\blog\2021-08-26-welcome` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\docs` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\docs\tutorial-basics` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\docs\tutorial-extras` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\docs\tutorial-extras\img` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\src` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\src\components` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\src\css` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\static` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\docs\website\static\img` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\emt-v3-stable-clean\src` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\k8s` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics-dashboard\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\analytics-dashboard\src\__tests__\__mocks__` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\core\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\core\src\temp` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\gaming\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\logger` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\logger\src\config` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\logger\src\config\environments` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\search\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\shared\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\storage\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\threat-detection\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\ui\.turbo` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\packages\ui\src\components` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\performance-reports` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\.github` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\.github\workflows` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\.husky` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\.vscode` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\docker` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\docs` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\docs\api` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\eap-analyzer` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\eap-analyzer\docs` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\packages` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\packages\analytics-dashboard` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\packages\gaming` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\packages\storage` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\scripts\utils` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\src\app` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\static` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\testing-integration-package` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\reports` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\reports\e2e-html` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\project-template\tests\reports\e2e-html\data` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\reports` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\src\lib\components` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\styles` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\temp` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\test-results` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\test-results\data` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\TESTS\components` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\TESTS\demos` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\TESTS\DEPRECATED` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\TESTS\mocks` | 0 | 0 | 0.0 | 🟢 |
| `C:\! HEYS 2\TOOLS\templates` | 0 | 0 | 0.0 | 🟢 |

## 🧠 Самообучение анализатора

### 📐 Обнаруженные паттерны проекта

- **Архитектурный паттерн**: React/Next.js
- **Распределение размеров файлов**:
  - Медиана: 0 строк
  - 75-й процентиль: 298 строк
  - 90-й процентиль: 549 строк
- **Распределение сложности**:
  - Медиана: 41
  - 75-й процентиль: 62

### 🛠️ Рекомендации по улучшению критериев анализа

#### Корректировка порогов для текущего проекта

| Метрика | Текущий порог | Рекомендуемый | Причина |
|---------|---------------|---------------|---------|
| Цикломатическая сложность | 15 | 45 | Распределение сложности в проекте (медиана: 41) |

#### Предлагаемые дополнительные метрики

- **Анализ размера пропсов компонентов**: Выявление компонентов с избыточным количеством props (>8)
- **Когнитивная сложность**: Дополнение к цикломатической сложности, оценивающее понятность кода
- **Функциональная когезия**: Оценка, насколько функции в модуле связаны одной задачей

#### Специфичные для данного проекта правила

- **Правила для React-хуков**: Проверка корректности использования правила зависимостей в useEffect/useMemo/useCallback

## 💡 Рекомендации по рефакторингу

1. **Приоритеты рефакторинга**:
   - Сначала устраните циклические зависимости (0)
   - Разбейте крупные файлы на модули
   - Уменьшите сложность функций

2. **Разделение ответственности**:
   - Выделите бизнес-логику из компонентов UI
   - Создайте отдельные слои для данных, логики и представления

3. **Улучшение тестирования**:
   - Добавьте тесты перед рефакторингом сложных файлов
   - Следуйте принципу "красный-зеленый-рефакторинг"

4. **План действий**:
   - Рефакторинг `index-D_ryMEPs.js`: High complexity (5247 > 15)
   - Рефакторинг `index-14ea7095.js`: High complexity (4323 > 15)
   - Рефакторинг `heys_reports_v12.js`: Large file (1262 lines > 300)


---

Анализ выполнен: 2025-09-08T19:34:16.173Z
