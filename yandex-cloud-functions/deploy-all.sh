#!/bin/bash
# 🚀 Centralized Deployment Script for Yandex Cloud Functions
# Reads secrets from .env file and deploys all functions with consistent configuration
# Usage: ./deploy-all.sh [function-name] [--skip-checks] [--skip-health] [--ci]
# v2.1 — adds CI mode for safe predeploy validation in GitHub Actions

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$SCRIPT_DIR/.env"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-env.sh"
HEALTH_SCRIPT="$SCRIPT_DIR/health-check.sh"
CHECKSUM_FILE="$SCRIPT_DIR/.env.checksum"

# Parse flags
TARGET_FUNC=""
SKIP_CHECKS=false
SKIP_HEALTH=false
CI_MODE=false
FORCE_DIRTY=false

for arg in "$@"; do
    case "$arg" in
        --skip-checks) SKIP_CHECKS=true ;;
        --skip-health) SKIP_HEALTH=true ;;
        --ci) CI_MODE=true ;;
        --force-dirty) FORCE_DIRTY=true ;;
        -*) echo -e "${RED}Unknown flag: $arg${NC}"; exit 1 ;;
        *) TARGET_FUNC="$arg" ;;
    esac
done

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo -e "${YELLOW}📝 Copy .env.example to .env and fill with actual values:${NC}"
    echo "   cp .env.example .env"
    exit 1
fi

# Run validation script if available
if [ "$SKIP_CHECKS" = true ]; then
    echo -e "${YELLOW}⏭️  Skipping .env validation (--skip-checks)${NC}"
elif [ -f "$VALIDATE_SCRIPT" ]; then
    echo -e "${BLUE}🔍 Running .env validation...${NC}"
    VALIDATE_ARGS=()
    if [ "$CI_MODE" = true ]; then
        VALIDATE_ARGS+=(--ci)
    fi

    if ! "$VALIDATE_SCRIPT" "${VALIDATE_ARGS[@]}"; then
        echo -e "${RED}❌ .env validation failed! Fix errors before deploying.${NC}"
        echo -e "${YELLOW}💡 Use --skip-checks to bypass (NOT recommended)${NC}"
        exit 1
    fi
    echo ""
fi

# Load environment variables from .env
echo -e "${BLUE}📥 Loading secrets from .env...${NC}"
source "$ENV_FILE"

# Validate required variables (fallback if validate-env.sh not found)
required_vars=("PG_HOST" "PG_PORT" "PG_DATABASE" "PG_USER" "PG_PASSWORD")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ ERROR: $var is not set in .env${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required variables loaded${NC}"
echo -e "${BLUE}🔐 PG_PASSWORD: ${PG_PASSWORD:0:4}...${PG_PASSWORD: -4}${NC}"

payments_env_ready() {
    [ -n "$YUKASSA_SHOP_ID" ] && [ -n "$YUKASSA_SECRET_KEY" ]
}

# Validate per-function secrets
validate_function_env() {
    local func_name=$1

    if [[ "$func_name" =~ (rpc|auth) ]]; then
        if [ -z "$JWT_SECRET" ]; then
            echo -e "${RED}❌ ERROR: JWT_SECRET is not set in .env (required for $func_name)${NC}"
            exit 1
        fi
    fi

    if [[ "$func_name" == "heys-api-auth" ]]; then
        if [ -z "$SESSION_SECRET" ]; then
            echo -e "${RED}❌ ERROR: SESSION_SECRET is not set in .env (required for $func_name)${NC}"
            exit 1
        fi
    fi

    # VAPID — для push/reminders/messages. yc CLI заменяет ВЕСЬ env на каждый
    # deploy (не merge), поэтому пустой VAPID_* молча wipes ключи из cloud
    # function и push notifications перестают доставляться. Fail fast, не дать
    # задеплоить функцию без обязательных push-ключей.
    if [[ "$func_name" =~ (push|reminders|messages) ]]; then
        local v missing=()
        for v in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
            if [ -z "${!v}" ]; then missing+=("$v"); fi
        done
        if [ ${#missing[@]} -gt 0 ]; then
            echo -e "${RED}❌ ERROR: VAPID env-vars missing for $func_name: ${missing[*]}${NC}"
            echo -e "${YELLOW}   yc CLI replaces full env on each deploy. Empty VAPID would wipe push keys.${NC}"
            echo -e "${YELLOW}   Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT to $ENV_FILE${NC}"
            exit 1
        fi
    fi
}

# Get function configuration
get_function_config() {
    local func_name=$1
    case "$func_name" in
        "heys-api-rpc")
            echo "nodejs18 index.handler 512m 30s" ;;
        "heys-api-rest")
            echo "nodejs18 index.handler 512m 30s" ;;
        "heys-api-auth")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-leads")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-sms")
            echo "nodejs18 index.handler 128m 10s" ;;
        "heys-api-health")
            echo "nodejs18 index.handler 128m 5s" ;;
        "heys-api-payments")
            echo "nodejs18 index.handler 256m 15s" ;;
        "heys-bot-client")
            echo "nodejs18 index.handler 256m 15s" ;;
        "heys-cron-trial-drip")
            echo "nodejs18 index.handler 256m 60s" ;;
        "heys-cron-security-alerts")
            echo "nodejs18 index.handler 256m 60s" ;;
        "heys-api-push")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-messages")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-api-photos")
            echo "nodejs18 index.handler 256m 30s" ;;
        "heys-cron-reminders")
            echo "nodejs18 index.handler 512m 120s" ;;
        "heys-cron-photo-cleanup")
            echo "nodejs18 index.handler 256m 600s" ;;
        "heys-client-daily-backup")
            echo "nodejs18 index.handler 256m 300s" ;;
        "heys-snapshot-demo")
            echo "nodejs18 index.handler 512m 300s" ;;
        "heys-maintenance")
            echo "nodejs18 index.handler 256m 30s" ;;
        *)
            echo "" ;;
    esac
}

# Build common environment flags
build_env_flags() {
    local func_name=$1
    local env_flags=""
    
    # Helpers (dynamic scope: append to outer env_flags).
    # _add: добавляет переменную только если её значение непустое (опциональные).
    # _add_required: добавляет всегда, даже если пусто (для required env-vars).
    _add() {
        local k=$1
        if [ -n "${!k}" ]; then env_flags+=" --environment $k=${!k}"; fi
    }
    _add_required() {
        local k=$1
        env_flags+=" --environment $k=${!k}"
    }

    # Lockbox secret IDs (constants).
    # heys-app-secrets: TELEGRAM_*, INTERNAL_CRON_TOKEN, APP_URL, JWT_SECRET,
    #                   SESSION_SECRET, HEYS_ENCRYPTION_KEY, VAPID_PRIVATE_KEY.
    # heys-database: PG_PASSWORD. heys-s3: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
    # SA aje85rjgpj4nk9m384ek (heys-function-invoker) имеет lockbox.payloadViewer
    # на все три секрета (granted 2026-05-22).
    local LOCKBOX_APP_ID="e6qrvefs3vn66jiamfk4"
    local LOCKBOX_DB_ID="e6q7gdshieo5udoet10f"
    local LOCKBOX_S3_ID="e6qnjm2ks2n1ubiaiki6"

    # PG + LOCKBOX_DB_SECRET_ID — для всех функций с БД (кроме health/sms)
    if [[ ! "$func_name" =~ (health|sms) ]]; then
        local k
        for k in PG_HOST PG_PORT PG_DATABASE PG_USER PG_PASSWORD PG_SSL; do
            _add_required "$k"
        done
        env_flags+=" --environment LOCKBOX_DB_SECRET_ID=$LOCKBOX_DB_ID"
    fi

    # LOCKBOX_APP_SECRET_ID — для всех функций кроме health (initSecrets
    # overlay'ит env любым ключом из heys-app-secrets при cold start).
    if [[ "$func_name" != "heys-api-health" ]]; then
        env_flags+=" --environment LOCKBOX_APP_SECRET_ID=$LOCKBOX_APP_ID"
    fi

    # Backup-функции (heys-client-daily-backup, heys-snapshot-demo) + photo-cleanup:
    # S3 + TG (env fallback пока .env активен — initSecrets overlay'ит Lockbox значениями)
    if [[ "$func_name" =~ (backup|snapshot-demo|photo-cleanup) ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
        local k
        for k in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
            _add "$k"
        done
    fi

    # heys-api-rpc: TG для real-time profile pollution alerts (2026-06-01 wave 2).
    # initSecrets через shared/secrets.js уже читает TELEGRAM_* из Lockbox; здесь
    # явный env-fallback на случай если Lockbox lag-нет на cold start.
    if [[ "$func_name" == "heys-api-rpc" ]]; then
        local k
        for k in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
            _add "$k"
        done
    fi

    # Photos функция: S3 credentials для signed URL генерации
    if [[ "$func_name" == "heys-api-photos" ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
        local k
        for k in S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
            _add "$k"
        done
    fi

    # heys-snapshot-demo: override S3_BUCKET (default bucket "heys-backups"
    # содержит client-daily; для demo нужен отдельный публичный bucket)
    if [[ "$func_name" == "heys-snapshot-demo" ]]; then
        env_flags+=" --environment S3_BUCKET=heys-public-snapshot"
    fi

    # SMS API key (heys-api-sms)
    if [[ "$func_name" == "heys-api-sms" ]]; then
        _add SMS_API_KEY
    fi

    # JWT_SECRET — для rpc, auth, push, messages, photos (curator-JWT identity resolution)
    if [[ "$func_name" =~ (rpc|auth) ]] || [[ "$func_name" == "heys-api-push" ]] || [[ "$func_name" == "heys-api-messages" ]] || [[ "$func_name" == "heys-api-photos" ]]; then
        _add_required JWT_SECRET
    fi

    # SESSION_SECRET — только auth
    if [[ "$func_name" == "heys-api-auth" ]]; then
        _add_required SESSION_SECRET
    fi

    # Payments: YUKASSA_* + INTERNAL_CRON_TOKEN (poll-фолбэк P0.4)
    if [[ "$func_name" == "heys-api-payments" ]]; then
        local k
        for k in YUKASSA_SHOP_ID YUKASSA_SECRET_KEY YUKASSA_WEBHOOK_SECRET INTERNAL_CRON_TOKEN; do
            _add "$k"
        done
    fi

    # Cron drip-уведомлений (Phase 1, P0.7)
    if [[ "$func_name" == "heys-cron-trial-drip" ]]; then
        local k
        for k in INTERNAL_CRON_TOKEN APP_URL; do
            _add "$k"
        done
    fi

    # Telegram bots: existing client PIN/notification bot + HEYS Start quiz bot.
    # Keep tokens separate: TELEGRAM_CLIENT_BOT_TOKEN serves /bot/webhook,
    # HEYS_START_BOT_TOKEN serves /start-bot/webhook.
    if [[ "$func_name" == "heys-bot-client" ]]; then
        local k
        for k in TELEGRAM_CLIENT_BOT_TOKEN HEYS_START_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET HEYS_START_WEBHOOK_SECRET INTERNAL_CRON_TOKEN APP_URL; do
            _add "$k"
        done
    fi

    # Web Push (VAPID) — api-push, cron-reminders, api-messages.
    # ВАЖНО: _add_required (не _add). yc CLI заменяет ВЕСЬ env на каждый deploy,
    # _add молча пропускает пустые vars → wipe'нет VAPID из cloud function →
    # push notifications перестают доставляться (FATAL: VAPID keys not configured).
    # validate_function_env выше гарантирует что переменные не пусты.
    if [[ "$func_name" =~ (push|reminders|messages) ]]; then
        local k
        for k in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
            _add_required "$k"
        done
    fi

    echo "$env_flags"
}

# Deploy a single function
deploy_function() {
    local func_name=$1
    local config=$(get_function_config "$func_name")
    
    if [ -z "$config" ]; then
        echo -e "${RED}❌ Unknown function: $func_name${NC}"
        return 1
    fi
    
    read -r runtime entrypoint memory timeout <<< "$config"

    # Guard: prevent deploy-before-commit drift.
    # Incident 2026-06-08: SEC-005 CSP added to 5 cloud functions, deployed to
    # YC via this script BEFORE source was committed. YC was 30+ min ahead of git
    # — any later CI deploy from clean source would have reverted the CSP silently.
    # This check refuses to deploy if the function's source dir has uncommitted
    # changes vs HEAD. Skip in CI (clean checkout by definition) or with
    # --force-dirty for genuine emergency hotpatches.
    if [ "$CI_MODE" != true ] && [ "$FORCE_DIRTY" != true ]; then
        # Run from repo root so git sees correct relative paths.
        REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
        if [ -n "$REPO_ROOT" ]; then
            REL_FUNC_DIR="yandex-cloud-functions/$func_name"
            DIRTY=$(git -C "$REPO_ROOT" status --porcelain -- "$REL_FUNC_DIR" 2>/dev/null | head -5)
            if [ -n "$DIRTY" ]; then
                echo ""
                echo -e "${RED}❌ Refuse to deploy: uncommitted changes in $REL_FUNC_DIR${NC}"
                echo -e "${YELLOW}   Source dirt:${NC}"
                echo "$DIRTY" | sed 's/^/      /'
                echo ""
                echo -e "${YELLOW}   Commit source first (so git = YC):${NC}"
                echo -e "      git add $REL_FUNC_DIR && pnpm ship \"chore(cloudfn): <what>\""
                echo -e "${YELLOW}   Or override (emergency hotpatch only — git stays behind):${NC}"
                echo -e "      ./deploy-all.sh $func_name --force-dirty"
                return 1
            fi
        fi
    fi

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🚀 Deploying $func_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    cd "$SCRIPT_DIR/$func_name"
    
    # Ensure .ycignore exists to prevent uploading node_modules and secrets
    if [ ! -f .ycignore ]; then
        echo -e "${BLUE}ℹ️  Copying .ycignore to $func_name...${NC}"
        cp "$SCRIPT_DIR/.ycignore" .
    fi

    # Ensure certs/root.crt exists for SSL to Yandex Postgres.
    # Top-level certs/ is the source of truth; per-function certs/ is gitignored
    # (https://github.com/.../.gitignore line 220: `yandex-cloud-functions/*/certs/`),
    # so свежий clone не имеет копии. Авто-копирование убирает шаг "ручная установка"
    # из onboarding. Пропускаем функции без БД (heys-api-health, heys-api-sms).
    if [[ ! "$func_name" =~ (health|sms) ]] && [ -f "$SCRIPT_DIR/certs/root.crt" ]; then
        if [ ! -f certs/root.crt ]; then
            echo -e "${BLUE}ℹ️  Copying certs/root.crt to $func_name (was missing locally)...${NC}"
            mkdir -p certs
            cp "$SCRIPT_DIR/certs/root.crt" certs/root.crt
        fi
    fi

    # 🔀 Sync shared sync-merge module before deploy (heys-api-rpc only).
    # Source of truth: apps/web/heys_sync_merge_v1.js (UMD; same file runs in browser).
    # Destination uses .cjs extension because Node treats .js as ESM here without it.
    if [[ "$func_name" == "heys-api-rpc" ]]; then
        ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
        SRC="$ROOT_DIR/apps/web/heys_sync_merge_v1.js"
        DST_DIR="$SCRIPT_DIR/$func_name/lib"
        DST="$DST_DIR/heys_sync_merge_v1.cjs"
        if [ -f "$SRC" ]; then
            mkdir -p "$DST_DIR"
            cp "$SRC" "$DST"
            echo -e "${BLUE}ℹ️  Synced merge module: lib/heys_sync_merge_v1.cjs${NC}"
        else
            echo -e "${RED}❌ ERROR: merge source not found at $SRC${NC}"
            exit 1
        fi
    fi

    # Validate required secrets for this function
    validate_function_env "$func_name"

    if [[ "$func_name" == "heys-api-payments" ]] && ! payments_env_ready; then
        if [ "$CI_MODE" = true ] && [ -z "$TARGET_FUNC" ]; then
            echo -e "${YELLOW}⏭️  Skipping $func_name in CI — YUKASSA secrets are not configured${NC}"
            cd "$SCRIPT_DIR"
            return 0
        fi

        echo -e "${RED}❌ ERROR: YUKASSA_SHOP_ID and YUKASSA_SECRET_KEY are required for $func_name${NC}"
        exit 1
    fi
    
    # Build environment flags
    env_flags=$(build_env_flags "$func_name")

    # Service account для чтения Lockbox. Прикрепляется ко ВСЕМ функциям кроме
    # heys-api-health (она ничего не читает из Lockbox).
    # SA heys-function-invoker имеет lockbox.payloadViewer на heys-app-secrets,
    # heys-database, heys-s3.
    sa_flag=""
    if [[ "$func_name" != "heys-api-health" ]]; then
        sa_flag="--service-account-id aje85rjgpj4nk9m384ek"
    fi

    # Concurrency: API-функции получают concurrency=2 — один контейнер
    # обслуживает до двух параллельных запросов, что уменьшает количество
    # cold start'ов под нагрузкой. Memory 512m / 2 = 256m на запрос (запас
    # есть), DB pool max=3 (см. shared/db-pool.js:96) — 2 concurrent fit'ам.
    # Кроны остаются на default=1 (триггер запускает по одной задаче за раз).
    local concurrency_flag=""
    if [[ "$func_name" =~ ^heys-api-(rpc|rest|auth|leads|push|messages|photos)$ ]]; then
        concurrency_flag="--concurrency 2"
    fi

    # Pre-build zip with explicit exclusions.
    # Раньше yc CLI 0.184.0 при `--source-path .` читал .ycignore и сам исключал
    # node_modules. Но для функций с большим node_modules (>4000 файлов, e.g.
    # heys-client-daily-backup с @aws-sdk) yc игнорирует .ycignore — видимо
    # таймаут на traversal. Чтобы поведение было предсказуемым для ВСЕХ функций,
    # упаковываем zip сами с теми же исключениями что в .ycignore и передаём как
    # --source-path. yc auto-устанавливает npm-deps из package.json на cold
    # start, поэтому node_modules в zip не нужен.
    DEPLOY_ZIP="/tmp/${func_name}-deploy-$$.zip"
    rm -f "$DEPLOY_ZIP"
    zip -qr "$DEPLOY_ZIP" . \
        -x 'node_modules/*' '*.zip' '.env' '.env.*' '*.log' \
           'coverage/*' '.git/*' '.DS_Store' 'docs/*' \
           'apply_*.js' 'check_*.js' 'test_*.js' 'deploy.sh' \
           '.ycignore' 'README.md'
    ZIP_SIZE=$(du -k "$DEPLOY_ZIP" | awk '{print $1}')
    echo -e "${BLUE}ℹ️  Packaged $func_name → ${ZIP_SIZE}KB${NC}"

    # Deploy function
    eval yc serverless function version create \
        --function-name "$func_name" \
        --runtime "$runtime" \
        --entrypoint "$entrypoint" \
        --memory "$memory" \
        --execution-timeout "$timeout" \
        $sa_flag \
        $concurrency_flag \
        --source-path "$DEPLOY_ZIP" \
        $env_flags
    YC_EXIT=$?
    rm -f "$DEPLOY_ZIP"
    # Restore original exit code so downstream check works.
    (exit $YC_EXIT)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $func_name deployed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to deploy $func_name${NC}"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# Main execution
if [ -n "$TARGET_FUNC" ]; then
    # Deploy single function
    deploy_function "$TARGET_FUNC"
else
    # Deploy all functions
    echo -e "${YELLOW}🚀 Deploying all functions...${NC}"
    # heys-api-sms удалён 2026-05-22 (см. apps/web/heys_consents_v1.js:53) — исключён
    # из auto-deploy чтобы CI не падал с "function not found"
    for func_name in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-health heys-api-payments; do
        deploy_function "$func_name"
    done
    
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ All functions deployed successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# ─── Post-deploy: health check ──────────────────────────────────────
if [ "$SKIP_HEALTH" = true ]; then
    echo -e "${YELLOW}⏭️  Skipping health check (--skip-health)${NC}"
else
    echo ""
    echo -e "${BLUE}⏳ Waiting 10s for function warmup...${NC}"
    sleep 10

    if [ -f "$HEALTH_SCRIPT" ]; then
        echo -e "${BLUE}🧪 Running post-deploy health check...${NC}"
        if "$HEALTH_SCRIPT"; then
            echo -e "${GREEN}✅ Post-deploy health check PASSED${NC}"
            
            # Save .env checksum on successful deploy + health check
            shasum -a 256 "$ENV_FILE" | cut -d' ' -f1 > "$CHECKSUM_FILE"
            echo -e "${GREEN}🔒 .env checksum saved (deploy verified)${NC}"
        else
            echo ""
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}⚠️  DEPLOY SUCCEEDED but HEALTH CHECK FAILED!${NC}"
            echo -e "${RED}   Functions deployed with current .env — verify manually.${NC}"
            echo -e "${YELLOW}   Run: ./health-check.sh --watch${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            # Do NOT save checksum — deploy is questionable
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  health-check.sh not found — skipping post-deploy verification${NC}"
    fi
fi
