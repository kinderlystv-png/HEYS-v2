#!/bin/bash
# 🚀 Centralized Deployment Script for Yandex Cloud Functions
# Reads secrets from .env file and deploys all functions with consistent configuration
# Usage: ./deploy-all.sh [function-name] [--group api|automations|all] [--dry-run] [--skip-checks] [--skip-health] [--ci]
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
TEST_SCRIPT="$SCRIPT_DIR/test-functions.sh"
CHECKSUM_FILE="$SCRIPT_DIR/.env.checksum"

# Parse flags
TARGET_FUNC=""
DEPLOY_GROUP="all"
SKIP_CHECKS=false
SKIP_HEALTH=false
CI_MODE=false
FORCE_DIRTY=false
DRY_RUN=false

while [ $# -gt 0 ]; do
    arg="$1"
    case "$arg" in
        --skip-checks) SKIP_CHECKS=true ;;
        --skip-health) SKIP_HEALTH=true ;;
        --ci) CI_MODE=true ;;
        --force-dirty) FORCE_DIRTY=true ;;
        --dry-run) DRY_RUN=true ;;
        --group)
            shift
            if [ $# -eq 0 ]; then
                echo -e "${RED}--group requires one of: api, automations, all${NC}"
                exit 1
            fi
            DEPLOY_GROUP="$1"
            ;;
        --group=*)
            DEPLOY_GROUP="${arg#--group=}"
            ;;
        -*) echo -e "${RED}Unknown flag: $arg${NC}"; exit 1 ;;
        *) TARGET_FUNC="$arg" ;;
    esac
    shift
done

case "$DEPLOY_GROUP" in
    api|automations|all) ;;
    *) echo -e "${RED}Unknown group: $DEPLOY_GROUP (expected api, automations, all)${NC}"; exit 1 ;;
esac

if [ -n "$TARGET_FUNC" ] && [ "$DEPLOY_GROUP" != "all" ]; then
    echo -e "${RED}Use either a single function name or --group, not both.${NC}"
    exit 1
fi

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
API_GATEWAY_ID="${API_GATEWAY_ID:-d5d7939njvjp27ofsok0}"
API_GATEWAY_SPEC="${API_GATEWAY_SPEC:-$SCRIPT_DIR/api-gateway-spec.yaml}"

# Validate required variables (fallback if validate-env.sh not found)
required_vars=("PG_HOST" "PG_PORT" "PG_DATABASE" "PG_USER" "PG_PASSWORD")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ ERROR: $var is not set in .env${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required variables loaded${NC}"
echo -e "${BLUE}🔐 PG_PASSWORD: configured${NC}"

payments_env_ready() {
    [ -n "$YUKASSA_SHOP_ID" ] &&
        [ -n "$YUKASSA_SECRET_KEY" ] &&
        [ -n "$YUKASSA_WEBHOOK_SECRET" ]
}

API_FUNCTIONS=(
    heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-health
    heys-api-payments heys-api-push heys-api-messages heys-api-photos
    heys-cron-speechkit-transcribe
)

AUTOMATION_FUNCTIONS=(
    heys-bot-client heys-maintenance heys-client-daily-backup
    heys-cron-security-alerts heys-cron-reminders heys-cron-trial-drip
    heys-cron-photo-cleanup heys-snapshot-demo
)

selected_functions() {
    if [ -n "$TARGET_FUNC" ]; then
        echo "$TARGET_FUNC"
        return
    fi

    case "$DEPLOY_GROUP" in
        api)
            printf '%s\n' "${API_FUNCTIONS[@]}"
            ;;
        automations)
            printf '%s\n' "${AUTOMATION_FUNCTIONS[@]}"
            ;;
        all)
            printf '%s\n' "${API_FUNCTIONS[@]}" "${AUTOMATION_FUNCTIONS[@]}"
            ;;
    esac
}

current_git_commit() {
    git -C "$SCRIPT_DIR" rev-parse --short=12 HEAD 2>/dev/null || echo "unknown"
}

function_source_commit() {
    local func_name="${1:-}"
    local repo_root commit
    if [ -n "$func_name" ]; then
        repo_root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
        commit="$(git -C "${repo_root:-$SCRIPT_DIR}" log --format=%h --max-count=1 -- "yandex-cloud-functions/$func_name" 2>/dev/null || true)"
        if [ -n "$commit" ]; then
            echo "$commit"
        else
            current_git_commit
        fi
        return
    fi
    current_git_commit
}

current_deployed_at() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

sql_quote() {
    local value="${1:-}"
    value="${value//\'/}"
    printf "'%s'" "$value"
}

record_deploy_receipt() {
    local status="${1:-ok}"
    local canary_ok="${2:-null}"
    local psql_script="$SCRIPT_DIR/../scripts/db/psql.sh"
    local commit actor
    commit="$(current_git_commit)"
    actor="${USER:-agent}"

    if [ ! -x "$psql_script" ]; then
        echo -e "${YELLOW}⚠️  deploy receipt skipped: scripts/db/psql.sh not found${NC}"
        return 0
    fi

    if "$psql_script" -X -q -c "SELECT public.record_ops_deploy_receipt($(sql_quote "$DEPLOY_GROUP"), $(sql_quote "$commit"), $(sql_quote "$status"), $canary_ok, $(sql_quote "$actor"), jsonb_build_object('source', 'deploy-all', 'group', $(sql_quote "$DEPLOY_GROUP")))" >/dev/null; then
        echo -e "${GREEN}🧾 Deploy receipt recorded: group=$DEPLOY_GROUP commit=$commit status=$status canary=$canary_ok${NC}"
    else
        echo -e "${YELLOW}⚠️  deploy receipt write failed (deploy already completed)${NC}"
    fi
}

env_key_names() {
    local flags="$1"
    printf '%s\n' "$flags" | tr ' ' '\n' | awk '/^--environment$/ { next } /^[-_A-Za-z0-9]+=/{ sub(/=.*/, "", $0); print }' | sort -u
}

assert_env_flags_no_plaintext_secrets() {
    local func_name=$1
    local flags="$2"
    local key value violations=()

    while IFS= read -r item; do
        key="${item%%=*}"
        value="${item#*=}"
        if [[ "$key" =~ (TOKEN|SECRET|PASSWORD|PRIVATE_KEY)$ || "$key" =~ (TOKEN|SECRET|PASSWORD|PRIVATE_KEY)_ ]]; then
            case "$key" in
                *_SHA256|LOCKBOX_*_SECRET_ID|HEYS_DEPLOY_COMMIT|HEYS_DEPLOYED_AT|HEYS_DEPLOY_GROUP)
                    continue
                    ;;
            esac
            if [[ "$value" == __IN_LOCKBOX__* ]]; then
                continue
            fi
            violations+=("$key")
        fi
    done < <(printf '%s\n' "$flags" | tr ' ' '\n' | grep -E '^[-_A-Za-z0-9]+=' || true)

    if [ ${#violations[@]} -gt 0 ]; then
        echo -e "${RED}❌ Refuse to deploy $func_name: plaintext secret env detected: ${violations[*]}${NC}"
        echo -e "${YELLOW}   Put these values in Lockbox and deploy only placeholders/hashes.${NC}"
        exit 1
    fi
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

    # VAPID — для push/reminders/messages. Public key и subject не являются
    # секретами, но старый CI мог не иметь их в GitHub Secrets. В таком случае
    # безопасно подхватываем только эти два значения из текущей $latest-версии.
    # Private key всегда приходит из Lockbox и в env не копируется.
    if [[ "$func_name" =~ (push|reminders|messages) ]]; then
        local v missing=()
        for v in VAPID_PUBLIC_KEY VAPID_SUBJECT; do
            if [ -z "${!v}" ] && command -v yc >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
                local existing_value
                existing_value="$(yc serverless function version list \
                    --function-name "$func_name" --format json 2>/dev/null \
                    | jq -r --arg key "$v" '.[0].environment[$key] // empty')"
                if [ -n "$existing_value" ]; then
                    printf -v "$v" '%s' "$existing_value"
                    export "$v"
                    echo -e "${BLUE}ℹ️  Restored $v from current $func_name configuration${NC}"
                fi
            fi
            if [ -z "${!v}" ]; then missing+=("$v"); fi
        done
        if [ ${#missing[@]} -gt 0 ]; then
            echo -e "${RED}❌ ERROR: VAPID env-vars missing for $func_name: ${missing[*]}${NC}"
            echo -e "${YELLOW}   yc CLI replaces full env on each deploy. Empty VAPID config would break push delivery.${NC}"
            echo -e "${YELLOW}   Add VAPID_PUBLIC_KEY and VAPID_SUBJECT to $ENV_FILE or deploy once from an existing configured function.${NC}"
            exit 1
        fi
    fi
}

# Get function configuration
get_function_config() {
    local func_name=$1
    case "$func_name" in
        "heys-api-rpc")
            echo "nodejs22 index.handler 512m 30s" ;;
        "heys-api-rest")
            echo "nodejs22 index.handler 512m 30s" ;;
        "heys-api-auth")
            echo "nodejs22 index.handler 256m 30s" ;;
        "heys-api-leads")
            echo "nodejs22 index.handler 256m 30s" ;;
        "heys-api-sms")
            echo "nodejs22 index.handler 128m 10s" ;;
        "heys-api-health")
            echo "nodejs22 index.handler 128m 5s" ;;
        "heys-api-payments")
            echo "nodejs22 index.handler 256m 15s" ;;
        "heys-bot-client")
            echo "nodejs22 index.handler 256m 60s" ;;
        "heys-cron-trial-drip")
            echo "nodejs22 index.handler 256m 60s" ;;
        "heys-cron-security-alerts")
            echo "nodejs22 index.handler 256m 60s" ;;
        "heys-cron-speechkit-transcribe")
            echo "nodejs22 index.handler 256m 120s" ;;
        "heys-api-push")
            echo "nodejs22 index.handler 256m 30s" ;;
        "heys-api-messages")
            echo "nodejs22 index.handler 256m 30s" ;;
        "heys-api-photos")
            echo "nodejs22 index.handler 256m 30s" ;;
        "heys-cron-reminders")
            echo "nodejs22 index.handler 512m 120s" ;;
        "heys-cron-photo-cleanup")
            echo "nodejs22 index.handler 256m 600s" ;;
        "heys-client-daily-backup")
            echo "nodejs22 index.handler 256m 300s" ;;
        "heys-snapshot-demo")
            echo "nodejs22 index.handler 512m 300s" ;;
        "heys-maintenance")
            echo "nodejs22 index.handler 256m 30s" ;;
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
    # Secret values are loaded by shared/secrets.js from Lockbox at cold start.
    # The placeholder keeps startup guards/module initialization compatible
    # without copying the actual secret into Cloud Functions environment vars.
    _add_lockbox_secret() {
        local k=$1
        env_flags+=" --environment $k=__IN_LOCKBOX__${k}__"
    }
    _add_optional_lockbox_secret() {
        local k=$1
        if [ -n "${!k}" ]; then _add_lockbox_secret "$k"; fi
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
        for k in PG_HOST PG_PORT PG_DATABASE PG_USER PG_SSL; do
            _add_required "$k"
        done
        _add_lockbox_secret PG_PASSWORD
        env_flags+=" --environment LOCKBOX_DB_SECRET_ID=$LOCKBOX_DB_ID"
    fi

    # LOCKBOX_APP_SECRET_ID — для всех функций кроме health (initSecrets
    # overlay'ит env любым ключом из heys-app-secrets при cold start).
    if [[ "$func_name" != "heys-api-health" ]]; then
        env_flags+=" --environment LOCKBOX_APP_SECRET_ID=$LOCKBOX_APP_ID"
    fi

    # Backup-функции (heys-client-daily-backup, heys-snapshot-demo) + photo-cleanup:
    # S3 + TG приходят из Lockbox; env содержит только безопасные placeholders/config.
    if [[ "$func_name" =~ (backup|snapshot-demo|photo-cleanup) ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
        _add_optional_lockbox_secret TELEGRAM_BOT_TOKEN
        _add TELEGRAM_CHAT_ID
        _add_optional_lockbox_secret S3_ACCESS_KEY_ID
        _add_optional_lockbox_secret S3_SECRET_ACCESS_KEY
    fi

    # SpeechKit transcription worker: DB + App Lockbox, optional SpeechKit env
    # fallback for pilot controls/pricing. Auth key may arrive from Lockbox app
    # secret via initSecrets(), or from explicit env.
    if [[ "$func_name" == "heys-cron-speechkit-transcribe" ]]; then
        local k
        for k in SPEECHKIT_API_KEY YC_SPEECHKIT_KEY SPEECHKIT_IAM_TOKEN YC_IAM_TOKEN \
                 SPEECHKIT_FOLDER_ID YC_FOLDER_ID SPEECHKIT_MODEL \
                 SPEECHKIT_PILOT_MONTHLY_CAP_RUB SPEECHKIT_ASYNC_PRICE_PER_15S_RUB \
                 SPEECHKIT_WORKER_LIMIT SPEECHKIT_START_MAX_ATTEMPTS \
                 SPEECHKIT_PROCESSING_LEASE_SECONDS SPEECHKIT_OPERATION_TIMEOUT_MINUTES \
                 SPEECHKIT_FETCH_TIMEOUT_MS S3_PHOTOS_BUCKET; do
            _add "$k"
        done
    fi

    # heys-api-rpc: TG для real-time profile pollution alerts (2026-06-01 wave 2).
    # initSecrets через shared/secrets.js читает TELEGRAM_* из Lockbox.
    if [[ "$func_name" == "heys-api-rpc" ]]; then
        _add_optional_lockbox_secret TELEGRAM_BOT_TOKEN
        _add TELEGRAM_CHAT_ID
    fi

    # Photos функция: S3 credentials для signed URL генерации
    if [[ "$func_name" == "heys-api-photos" ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
        _add_optional_lockbox_secret S3_ACCESS_KEY_ID
        _add_optional_lockbox_secret S3_SECRET_ACCESS_KEY
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
    # SEC-024 v2 (2026-06-14): добавлен heys-api-rest для curator-JWT verify в
    # enforceClientKvAuthForGet middleware (cross-client read detection для кураторов).
    if [[ "$func_name" =~ (rpc|auth) ]] || [[ "$func_name" == "heys-api-push" ]] || [[ "$func_name" == "heys-api-messages" ]] || [[ "$func_name" == "heys-api-photos" ]] || [[ "$func_name" == "heys-api-rest" ]]; then
        _add_lockbox_secret JWT_SECRET
    fi

    # SESSION_SECRET — только auth
    if [[ "$func_name" == "heys-api-auth" ]]; then
        _add_lockbox_secret SESSION_SECRET
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
        _add_optional_lockbox_secret INTERNAL_CRON_TOKEN
        _add APP_URL
    fi

    # Telegram bots: existing client PIN/notification bot + HEYS Start quiz bot.
    # Keep tokens separate: TELEGRAM_CLIENT_BOT_TOKEN serves /bot/webhook,
    # HEYS_START_BOT_TOKEN serves /start-bot/webhook.
    # Strict ops default: tokens and raw cron/webhook secrets come from Lockbox
    # only. Runtime env may carry only non-secret config and webhook secret hashes.
    if [[ "$func_name" == "heys-bot-client" ]]; then
        local k
        for k in TELEGRAM_WEBHOOK_SECRET_SHA256 HEYS_START_WEBHOOK_SECRET_SHA256 APP_URL; do
            _add "$k"
        done
    fi

    # Web Push (VAPID) — api-push, cron-reminders, api-messages.
    # ВАЖНО: _add_required (не _add). yc CLI заменяет ВЕСЬ env на каждый deploy,
    # _add молча пропускает пустые vars → wipe'нет VAPID из cloud function →
    # push notifications перестают доставляться (FATAL: VAPID keys not configured).
    # validate_function_env выше гарантирует что переменные не пусты.
    if [[ "$func_name" =~ (push|reminders|messages) ]]; then
        _add_required VAPID_PUBLIC_KEY
        _add_lockbox_secret VAPID_PRIVATE_KEY
        _add_required VAPID_SUBJECT
    fi

    # SEC-023 hot-fix 2026-06-14: heys-api-rest в STRICT-mode для write-context.
    # POST на /rest/client_kv_store без row.context_id → 400 context_required.
    # Безопасно: 0 real REST writes без context_id за 7 дней audit'a (1 событие
    # = моя SEC-L3 проба). heys-api-rpc остаётся в warn-mode до 2026-06-21
    # (SEC-004 monitoring — там 3 события session_phase_b за 12h = реальные клиенты).
    if [[ "$func_name" == "heys-api-rest" ]]; then
        env_flags+=" --environment HEYS_WRITE_CONTEXT_STRICT=1"
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
    if [ "$CI_MODE" != true ] && [ "$FORCE_DIRTY" != true ] && [ "$DRY_RUN" != true ]; then
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

    # Validate required secrets for this function
    validate_function_env "$func_name"

    if [[ "$func_name" == "heys-api-payments" ]] && ! payments_env_ready; then
        if [ "$CI_MODE" = true ] && [ -z "$TARGET_FUNC" ]; then
            echo -e "${YELLOW}⏭️  Skipping $func_name in CI — YUKASSA secrets are not configured${NC}"
            return 0
        fi

        echo -e "${RED}❌ ERROR: YUKASSA_SHOP_ID, YUKASSA_SECRET_KEY and YUKASSA_WEBHOOK_SECRET are required for $func_name${NC}"
        exit 1
    fi

    # Build environment flags before touching per-function files so --dry-run is read-only.
    env_flags=$(build_env_flags "$func_name")
    env_flags+=" --environment HEYS_DEPLOY_COMMIT=$(function_source_commit "$func_name")"
    env_flags+=" --environment HEYS_DEPLOYED_AT=$(current_deployed_at)"
    env_flags+=" --environment HEYS_DEPLOY_GROUP=${TARGET_FUNC:-$DEPLOY_GROUP}"
    assert_env_flags_no_plaintext_secrets "$func_name" "$env_flags"

    # Service account для чтения Lockbox. Прикрепляется ко ВСЕМ функциям кроме
    # heys-api-health (она ничего не читает из Lockbox).
    # SA heys-function-invoker имеет lockbox.payloadViewer на heys-app-secrets,
    # heys-database, heys-s3.
    sa_flag=""
    if [[ "$func_name" != "heys-api-health" ]]; then
        sa_flag="--service-account-id aje85rjgpj4nk9m384ek"
    fi

    # Concurrency: API-функции и Telegram bot получают concurrency=4 — один контейнер
    # обслуживает до 4 параллельных запросов. Подняли с 2 → 4 (2026-06-15)
    # для запаса под burst/cold-start.
    local concurrency_flag=""
    if [[ "$func_name" =~ ^heys-api-(rpc|rest|auth|leads|push|messages|photos)$ || "$func_name" == "heys-bot-client" ]]; then
        concurrency_flag="--concurrency 4"
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}🧪 Dry-run $func_name${NC}"
        echo "   runtime=$runtime entrypoint=$entrypoint memory=$memory timeout=$timeout"
        if [ -n "$concurrency_flag" ]; then echo "   $concurrency_flag"; fi
        if [ -n "$sa_flag" ]; then echo "   service-account=aje85rjgpj4nk9m384ek"; fi
        echo "   env keys:"
        env_key_names "$env_flags" | sed 's/^/      /'
        return 0
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

    # 🔀 Sync shared sync-merge module before deploy (heys-api-rpc/heys-api-rest).
    # Source of truth: apps/web/heys_sync_merge_v1.js (UMD; same file runs in browser).
    # Destination uses .cjs extension because Node treats .js as ESM here without it.
    if [[ "$func_name" == "heys-api-rpc" || "$func_name" == "heys-api-rest" ]]; then
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

    # First deploy for optional functions (notably heys-api-payments) needs the
    # function shell to exist before `version create` can attach code to it.
    if ! yc serverless function get --name "$func_name" >/dev/null 2>&1; then
        echo -e "${YELLOW}ℹ️  Function $func_name does not exist — creating shell...${NC}"
        yc serverless function create --name "$func_name" >/dev/null
        echo -e "${GREEN}✅ Function shell created: $func_name${NC}"
    fi

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

update_api_gateway() {
    if [ ! -f "$API_GATEWAY_SPEC" ]; then
        echo -e "${RED}❌ API Gateway spec not found: $API_GATEWAY_SPEC${NC}"
        exit 1
    fi

    echo -e "${BLUE}🌐 Updating API Gateway routes from $(basename "$API_GATEWAY_SPEC")...${NC}"
    yc serverless api-gateway update \
        --id "$API_GATEWAY_ID" \
        --spec "$API_GATEWAY_SPEC"
    echo -e "${GREEN}✅ API Gateway updated${NC}"
}

ensure_speechkit_trigger() {
    local trigger_name="${SPEECHKIT_TRIGGER_NAME:-heys-cron-speechkit-transcribe-timer}"
    local cron_expr="${SPEECHKIT_TRIGGER_CRON:-0/1 * * * ? *}"
    local invoker_sa="${FUNCTION_INVOKER_SA_ID:-aje85rjgpj4nk9m384ek}"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⏱️  Ensuring SpeechKit transcription timer${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local trigger_id=""
    trigger_id="$(yc serverless trigger get --name "$trigger_name" --format json 2>/dev/null \
        | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s); if (j.id) process.stdout.write(j.id);}catch(_){}})")"

    if [ -n "$trigger_id" ]; then
        yc serverless trigger update timer \
            --id "$trigger_id" \
            --new-cron-expression "$cron_expr" \
            --new-invoke-function-name heys-cron-speechkit-transcribe \
            --new-invoke-function-service-account-id "$invoker_sa" \
            --new-function-retry-attempts 1 \
            --new-function-retry-interval 30s
        echo -e "${GREEN}✅ SpeechKit timer updated: $trigger_name ($cron_expr)${NC}"
    else
        yc serverless trigger create timer "$trigger_name" \
            --cron-expression "$cron_expr" \
            --invoke-function-name heys-cron-speechkit-transcribe \
            --invoke-function-service-account-id "$invoker_sa" \
            --retry-attempts 1 \
            --retry-interval 30s
        echo -e "${GREEN}✅ SpeechKit timer created: $trigger_name ($cron_expr)${NC}"
    fi
}

# Every deploy path, including manual runs, is guarded by the same Node runtime
# compatibility and function contract tests. CI also runs this as a separate job
# so the deploy job itself never starts after a red gate.
if [ ! -x "$TEST_SCRIPT" ]; then
    echo -e "${RED}❌ Pre-deploy test gate is missing or not executable: $TEST_SCRIPT${NC}"
    exit 1
fi

PREDEPLOY_TARGETS=()
while IFS= read -r func_name; do
    [ -n "$func_name" ] && PREDEPLOY_TARGETS+=("$func_name")
done < <(selected_functions)

echo -e "${BLUE}🧪 Running mandatory pre-deploy function gate...${NC}"
"$TEST_SCRIPT" "${PREDEPLOY_TARGETS[@]}"

# Main execution
SHOULD_UPDATE_GATEWAY=false
if [ -n "$TARGET_FUNC" ]; then
    # Deploy single function
    deploy_function "$TARGET_FUNC"
    if [ "$TARGET_FUNC" = "heys-api-auth" ]; then
        SHOULD_UPDATE_GATEWAY=true
    fi
    if [ "$TARGET_FUNC" = "heys-cron-speechkit-transcribe" ] && [ "$DRY_RUN" != true ]; then
        ensure_speechkit_trigger
    fi
else
    echo -e "${YELLOW}🚀 Deploy group: $DEPLOY_GROUP${NC}"
    while IFS= read -r func_name; do
        [ -z "$func_name" ] && continue
        deploy_function "$func_name"
    done < <(selected_functions)
    if [[ "$DEPLOY_GROUP" == "api" || "$DEPLOY_GROUP" == "all" ]] && [ "$DRY_RUN" != true ]; then
        ensure_speechkit_trigger
    fi
    
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${GREEN}✅ Dry-run completed for group: $DEPLOY_GROUP${NC}"
    else
        echo -e "${GREEN}✅ Deploy group completed successfully: $DEPLOY_GROUP${NC}"
    fi
	    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	    if [[ "$DEPLOY_GROUP" == "api" || "$DEPLOY_GROUP" == "all" ]]; then
	        SHOULD_UPDATE_GATEWAY=true
	    fi
	    if [[ "$DEPLOY_GROUP" == "automations" || "$DEPLOY_GROUP" == "all" ]] && [ "$DRY_RUN" != true ] && [ "$SKIP_HEALTH" != true ]; then
	        echo ""
	        echo -e "${BLUE}🧪 Running automation canaries...${NC}"
	        if node "$SCRIPT_DIR/check-heys-ops-status.cjs" --canary --strict; then
	            echo -e "${GREEN}✅ Automation canaries PASSED${NC}"
	            record_deploy_receipt "ok" "true"
	        else
	            echo -e "${RED}❌ Automation canaries FAILED${NC}"
	            record_deploy_receipt "failed" "false"
	            exit 1
	        fi
	    elif [[ "$DEPLOY_GROUP" == "automations" || "$DEPLOY_GROUP" == "all" ]] && [ "$DRY_RUN" != true ]; then
	        record_deploy_receipt "ok" "null"
	    fi
	fi

if [ "$SHOULD_UPDATE_GATEWAY" = true ] && [ "$DRY_RUN" != true ]; then
    update_api_gateway
fi

# ─── Post-deploy: health check ──────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⏭️  Dry-run: skipping gateway update and health check${NC}"
elif [ "$SKIP_HEALTH" = true ]; then
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
