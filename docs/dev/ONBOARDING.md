# 🧭 Developer Onboarding (HEYS)

Короткий старт для macOS/Linux/Windows.

## ✅ Пререквизиты

- Node.js ≥ 18 (см. `.nvmrc`)
- pnpm ≥ 8
- Git

## 🚀 Быстрый старт

```bash
pnpm install
pnpm dev:local   # API :4001 + web :3001 — всегда оба; web без API не работает
```

Открыть: http://localhost:3001/

## 🧪 Тесты (локально)

- Web: `pnpm test:web`
- Unit: `pnpm test:unit`
- Редкие пользовательские стыки (несколько шагов, роли, таймеры, фильтры) агент
  проверяет **смоук-симуляцией**, а не просит владельца воспроизвести в
  приложении. Правило: `AGENTS.md` / `CLAUDE.md`, раздел «Smoke-симуляция».

## 🧪 Тестовый центр (legacy demo)

Windows:

```cmd
start_modern_heys_demo.bat
```

macOS/Linux:

```bash
./start_modern_heys_demo.sh
```

## 📚 Документация

- Архитектура: `docs/ARCHITECTURE.md`
- Стиль кода: `docs/dev/CODE_STYLE.md`
- Хранилище: `docs/dev/STORAGE_PATTERNS.md`
- Безопасность: `docs/SECURITY_RUNBOOK.md`

## 🧩 Legacy

Архивные материалы: `docs/legacy/README_v12.md`.
