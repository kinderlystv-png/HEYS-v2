# What's New Copy Guide

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

Для одиночного technical/ручного пуша с явной командой на push и явным релизным
текстом:

```bash
pnpm push:agent -- --confirm-push --title="Синхронизация активностей стала устойчивее" \
  --item-title="Удалённые круги активностей больше не возвращаются из старой копии" \
  --item-description="Если круг активности удалён на одном устройстве, приложение защищает эту правку от старых данных, которые могли прийти во время синхронизации."
```

`push:agent` проверит `What's New`, при необходимости добавит entry и follow-up
commit с автоматическим `coveredCommits`, запустит `pnpm push:preflight` перед
`git push`, выполнит push с активными pre-push guards и дождётся зелёного
`Deploy to Yandex Cloud` для свежего `HEAD`. Если в staging уже лежат не-release
файлы, команда остановится, чтобы случайно не включить их в follow-up commit для
`What's New`.

Получить готовый шаблон команды:

```bash
pnpm push:agent -- --print-command
```

Проверить состояние перед push:

```bash
pnpm push:agent -- --status
```

`pnpm push:safe` deprecated и не должен использоваться как shortcut: `HUSKY=0`
не является нормальным push-flow. `pnpm push:preflight` можно запускать отдельно
только как диагностику локальных blockers.

Проверить без commit и push:

```bash
pnpm push:agent -- --dry-run --no-push --title="..." \
  --item-title="..." \
  --item-description="..."
```

Для нестандартного remote или ветки:

```bash
pnpm push:agent -- --confirm-push --remote=origin --branch=main --title="..." \
  --item-title="..." \
  --item-description="..."
```

Не ждать GitHub Actions после push можно только для технического отладочного
сценария:

```bash
pnpm push:agent -- --confirm-push --no-watch --title="..." \
  --item-title="..." \
  --item-description="..."
```
