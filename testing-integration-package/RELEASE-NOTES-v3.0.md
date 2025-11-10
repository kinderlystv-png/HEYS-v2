# v3.0 — Эталонная система тестирования

Дата: 2025-09-07

Основные изменения

- Интерактивный режим установки (-i/--interactive): MSW, Husky+lint-staged,
  GitHub Actions.
- Идемпотентная генерация: повторные прогоны безопасны, поддержка --dry-run и
  --force.
- Конфиги Vitest: покрытие (v8), производительность (pool/isolate), jsdom URL,
  watchExclude.
- Поддержка tsconfig paths: добавлен плагин vite-tsconfig-paths во все шаблоны.
- MSW (опционально): генерация tests/mocks/server.js и bootstrap в
  tests/setup.\*.
- Git hooks (опционально): Husky v9/v10-совместимые хуки без husky.sh,
  scripts.prepare="husky".
- GitHub Actions (опционально): workflow для тестов и артефактов покрытия.

Миграция

- Удалите строки с подключением husky.sh из существующих хуков и оставьте только
  команды (см. 1-STANDARD.md).
- Перенесите правила из .eslintignore в eslint.config.\* -> ignores (в проекте
  уже выполнено).
- Установите новые зависимости при необходимости: vite-tsconfig-paths, msw,
  husky, lint-staged.

Команды

- Сухой прогон: node testing-integration-package/utils/project-detector.js
  --dry-run
- Интерактивная установка: node project-detector.js -i

Известные моменты

- В монорепо/Workspaces запускать из корня конкретного пакета (улучшение для
  монорежима запланировано).
