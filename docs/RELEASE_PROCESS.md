# HEYS — Release Process / Регламент пуша и деплоя

> Этот документ описывает правила и инструменты для безопасного push/deploy.

## Проблема, которую решаем

Каждый push в `main` запускает два CI workflow:

1. **What's New Guard** — проверяет, что `apps/web/public/whats-new.json`
   содержит актуальную запись для текущего HEAD коммита.
2. **Deploy to Yandex Cloud** — сначала делает ту же проверку, потом собирает и
   деплоит.

Если `whats-new.json` не содержит entry для текущего хеша — **оба workflow
падают**. Это именно то, что произошло, когда push был сделан через `HUSKY=0`
(обход хуков), минуя pre-push валидацию.

---

## Три способа пушить

### 1. `git push` (стандартный, интерактивный)

Pre-push hook (`husky`) автоматически:

- проверяет What's New (`prepare-release --check`)
- если не готов — предлагает запустить `pnpm push:ready`
- прогоняет критические тесты
- блокирует push при ошибке

**Когда использовать:** ручная работа в терминале.

### 2. `pnpm push:safe` (автоматический, non-interactive) ⭐

```bash
pnpm push:safe                  # Полный пайплайн
pnpm push:safe -- --skip-tests  # Без тестов (быстрый)
pnpm push:safe -- --dry-run     # Показать что будет, не делать
```

Скрипт `scripts/push-safe.mjs` выполняет:

1. `prepare-release --check` — если OK, идёт дальше
2. Если What's New не готов:
    - для **technical** изменений → `prepare-release --auto` (авто-генерация из
       git diff)
    - для **user-facing / UI / runtime** изменений → остановка и требование
       ручного `pnpm push:ready`
3. Stage + commit follow-up
4. Критические тесты (если не `--skip-tests`)
5. `git push origin main`

**Когда использовать:** AI-агенты, CI, скрипты, любой non-interactive контекст
для technical-изменений.

**Важно:** если правка пользовательская, визуальная или runtime-sensitive,
`push:safe` специально **не будет** молча генерировать релиз сам. Он остановит
push и отправит в `pnpm push:ready`, чтобы вручную подтвердить смысл релиза,
описания и скриншоты.

### 3. `pnpm push:ready` + `git push` (двухшаговый, интерактивный)

```bash
pnpm push:ready   # Интерактивно подтвердить/отредактировать текст + скрины
git push           # Pre-push hook только проверит и пропустит
```

**Когда использовать:** когда нужно вручную написать красивые тексты и добавить
скриншоты.

---

## Правило: НИКОГДА не `HUSKY=0 git push`

`HUSKY=0` обходит ВСЕ проверки. Если нужно обойти интерактивный hook — использовать `pnpm push:safe`, который выполняет те же проверки non-interactively.

---

## Авто-генерация What's New

```bash
node scripts/prepare-release.mjs --auto                   # Авто из git diff
node scripts/prepare-release.mjs --auto --title="My fix"  # С кастомным заголовком
node scripts/prepare-release.mjs --auto --items='[...]'   # С кастомными записями
```

Скрипт автоматически:

- определяет тип релиза (user-facing vs technical)
- выбирает профиль (sync/storage, backend, infra, etc.)
- генерирует title + items из шаблонов
- сохраняет в `whats-new.json`

По умолчанию этот режим разрешён только для **technical** релизов. Для
user-facing изменений нужен явный интерактивный review. Технически можно
включить override через `--allow-user-facing-auto`, но это аварийный режим, а не
основной workflow.

---

## Проверка и превью

```bash
pnpm prepare-release:check   # Валидация: exit 0 = OK, exit 1 = нужен update
pnpm prepare-release          # Интерактивный редактор
node scripts/prepare-release.mjs --preview   # Превью без сохранения
```

---

## Чеклист перед push

- [ ] Код закоммичен (`git status` чисто)
- [ ] Legacy bundles обновлены (если менялся `apps/web/heys_*.js`)
- [ ] What's New актуален (`pnpm prepare-release:check` → exit 0)
- [ ] Тесты проходят

При использовании `pnpm push:safe` все пункты, кроме первого, проверяются
автоматически.

---

## Flowchart

```
Код готов → git commit
     │
     ├─ Ручной push:
     │    git push → pre-push hook → check → tests → push
     │
     ├─ Агент/скрипт:
     │    pnpm push:safe → check → auto-generate → commit → tests → push
     │
     └─ Красивый релиз:
          pnpm push:ready → интерактивный editor → commit
          git push → pre-push hook → check OK → tests → push
```

---

## Для AI-агентов

**Обязательное правило:** агент НИКОГДА не должен использовать `HUSKY=0 git push`.

### Рекомендуемый flow:

1. Сделать все изменения и коммиты
2. Если изменение technical → запустить `pnpm push:safe` (или
   `pnpm push:safe -- --skip-tests` если тесты не релевантны)
3. Если изменение user-facing / UI / runtime → сначала `pnpm push:ready`,
   подтвердить тексты и скрины, затем обычный `git push`
4. Если нужен кастомный текст What's New:
   ```bash
   node scripts/prepare-release.mjs --auto --title="Описание" --items='[{"type":"fix","title":"...","description":"..."}]'
   git add apps/web/public/whats-new.json
   git commit -m "chore: add what's-new entry for $(git rev-parse --short=8 HEAD)"
   pnpm push:safe -- --skip-tests
   ```

### Fallback (если `push:safe` недоступен):

1. Для technical: `node scripts/prepare-release.mjs --auto`
2. Для user-facing: `pnpm prepare-release`
3. `git add apps/web/public/whats-new.json`
4. `git commit -m "chore: add what's-new entry for <hash>"`
5. `node scripts/prepare-release.mjs --check` → убедиться exit 0
6. `git push origin main` (hooks пройдут, т.к. check уже OK)
