# What's New Copy Guide

> **Временно выключено.** `apps/web/heys_release_features_v1.js` содержит
> `whatsNewEnabled: false`; обычные source-push не требуют и не создают
> release-entry. Этот guide и история сохранены для повторного включения по
> чек-листу в `docs/reference/systems/PWA_OFFLINE_PUSH.md`.

Короткий рабочий слой для релизных заметок HEYS. Полный тон продукта остаётся в
[`apps/landing/COPY_VOICE.md`](../landing/COPY_VOICE.md); этот файл нужен, чтобы
быстро написать один аккуратный entry для `apps/web/public/whats-new.json`.

## Правила

- Пишите результат для пользователя, а не внутреннюю реализацию.
- Не используйте технические слова: `sync`, `hot-sync`, `localStorage`, `RPC`,
  `bundle`, `hash`, `key`, `overlay`, `PIN`, `context_id`.
- Не обещайте абсолютную гарантию, если изменение является защитой от
  конкретного сценария. Лучше: «стало устойчивее», «помогает избежать»,
  «корректнее обновляется».
- Один релиз — один понятный результат. Не смешивайте несколько несвязанных
  исправлений в одном пункте.
- Заголовок: 4-8 слов, спокойно и конкретно.
- Описание: 1-2 предложения. Сначала что исправлено, затем когда пользователь
  это заметит.
- Если изменение техническое и пользователь его не увидит, используйте technical
  commit type (`chore`, `test`, `ci`, `docs`) вместо `fix/feat/perf`; тогда
  `What's New` не нужен.

## Шаблон

```json
{
  "type": "fix",
  "title": "Что теперь работает корректно",
  "description": "В каком пользовательском сценарии раньше возникала проблема. Что изменилось теперь, без деталей реализации."
}
```

## Релизный текст (integration-only)

> **Рядовые агенты whats-new не трогают** — они коммитят source-only (см.
> «Параллельная работа агентов» в корневом CLAUDE.md). Релизный текст
> формулирует **интегратор** для одного явно разрешённого integration/shipping
> прохода:
>
> ```bash
> pnpm agents:integrate --confirm-integration --branches=auto --yes \
>   --title="Синхронизация активностей стала устойчивее" \
>   --items='[{"type":"fix","title":"...","description":"..."}]'
> ```
>
> `coveredCommits` (какие user-facing коммиты покрыты) проставляется
> автоматически из push-range.

Пока флаг выключен, канонический push:

```bash
pnpm push:agent -- --confirm-push
```

`push:agent` проверяет source-only scope, secrets, static guards и релевантные
тесты, выполняет push, дожидается deploy и проверяет production
`build-meta.json` и hash-bundles. Release-файлы и seen-state он не меняет.

Получить готовый шаблон команды:

```bash
pnpm push:agent -- --print-command
```

Проверить состояние перед push:

```bash
pnpm push:agent -- --status
```

`pnpm push:safe` deprecated и не должен использоваться как shortcut: `HUSKY=0`
не является нормальным push-flow. `pnpm push:preflight -- --full` — явный
локальный полный suite. Расширенные warn-only diagnostics, например счётчик
`React.startTransition`, запускаются через
`pnpm push:preflight -- --diagnostics`.

Проверить без commit и push:

```bash
pnpm push:agent -- --dry-run --no-push
```

Для нестандартного remote или ветки:

```bash
pnpm push:agent -- --confirm-push --remote=origin --branch=main
```

Не ждать GitHub Actions после push можно только для технического отладочного
сценария:

```bash
pnpm push:agent -- --confirm-push --no-watch
```
