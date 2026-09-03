#!/bin/bash
# 🚀 Centralized Deployment Script for Yandex Cloud Functions
# Reads secrets from .env file and deploys all functions with consistent configuration
# Usage: ./deploy-all.sh [function-name ...] [--group api|automations|all] [--dry-run] [--skip-checks] [--skip-health] [--ci]
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
CAPACITY_POLICY="$SCRIPT_DIR/serverless-capacity-policy.cjs"
CAPACITY_CHECK="$SCRIPT_DIR/check-serverless-capacity.cjs"
PAYMENTS_SECRET_CHECK="$SCRIPT_DIR/check-payments-secret-payload.cjs"

# Git Bash gives /c/Users/... ; Windows node cannot require() that path.
# cygpath -m → C:/Users/... which works in require() and stays POSIX-safe.
_node_module_path() {
    local p="$1"
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -m "$p"
    else
        printf '%s' "$p"
    fi
}
CAPACITY_POLICY_NODE="$(_node_module_path "$CAPACITY_POLICY")"

API_INSTANCE_CONCURRENCY="$(node -p "require('$CAPACITY_POLICY_NODE').POLICY.runtime.instanceConcurrency")"
API_INSTANCE_ADMISSION_LIMIT="$(node -p "require('$CAPACITY_POLICY_NODE').POLICY.runtime.instanceAdmissionLimit")"
API_ZONE_INSTANCES_LIMIT="$(node -p "require('$CAPACITY_POLICY_NODE').POLICY.runtime.scaling.zoneInstancesLimit")"
API_ZONE_REQUESTS_LIMIT="$(node -p "require('$CAPACITY_POLICY_NODE').POLICY.runtime.scaling.zoneRequestsLimit")"
OVERLOAD_RETRY_AFTER_SECONDS="$(node -p "require('$CAPACITY_POLICY_NODE').POLICY.runtime.overloadRetryAfterSeconds")"

# Parse flags
TARGET_FUNCTIONS=()
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
        *) TARGET_FUNCTIONS+=("$arg") ;;
    esac
    shift
done

case "$DEPLOY_GROUP" in
    api|automations|all) ;;
    *) echo -e "${RED}Unknown group: $DEPLOY_GROUP (expected api, automations, all)${NC}"; exit 1 ;;
esac

if [ ${#TARGET_FUNCTIONS[@]} -gt 0 ] && [ "$DEPLOY_GROUP" != "all" ]; then
    echo -e "${RED}Use either function names or --group, not both.${NC}"
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

# Проверка входа в yc ДО первой мутации.
#
# ⚠️ Инвариант (2026-08-03): потеря доступа не должна выглядеть как «секрет ещё
# не готов». Раньше при неработающем `yc` (нет логина / протух токен / нет прав
# на folder) вызов `yc lockbox payload get` молча отдавал пустой stdout,
# payments-проверка падала как «not ready», функция тихо уходила в
# SKIPPED_FUNCTIONS, и деплой завершался зелёным. Теперь отсутствие доступа —
# это честный отказ до того, как что-либо задеплоено.
YC_ACCESS_VERIFIED=false
require_yc_access() {
    if [ "$YC_ACCESS_VERIFIED" = true ]; then
        return 0
    fi
    if ! command -v yc >/dev/null 2>&1; then
        echo -e "${RED}❌ Refuse to deploy: yc CLI not found in PATH${NC}"
        exit 1
    fi
    # Read-only проба: требует и валидный IAM-токен, и доступ к folder'у.
    # Вывод выбрасывается целиком — печатать там нечего.
    if ! yc serverless function list --format json >/dev/null 2>&1; then
        echo -e "${RED}❌ Refuse to deploy: yc is not authenticated or has no access to the target folder${NC}"
        echo -e "${YELLOW}   Остановлено ДО первой мутации: иначе провал чтения Lockbox выглядит${NC}"
        echo -e "${YELLOW}   как «секрет не готов», функция тихо пропускается, а деплой зелёный.${NC}"
        echo -e "${YELLOW}   Fix: yc init (или задать YC_TOKEN / YC_SERVICE_ACCOUNT_KEY_FILE) и повторить.${NC}"
        exit 1
    fi
    YC_ACCESS_VERIFIED=true
}

# Коды возврата: 0 — секрет готов, 1 — секрет не готов (конфиг/ключи),
# 2 — прочитать секрет не удалось (потеря доступа), пропускать функцию нельзя.
payments_lockbox_ready() {
    if [ -z "${LOCKBOX_PAYMENTS_SECRET_ID:-}" ]; then
        echo -e "${RED}❌ ERROR: LOCKBOX_PAYMENTS_SECRET_ID is required for heys-api-payments${NC}" >&2
        return 1
    fi
    if [ ! -f "$PAYMENTS_SECRET_CHECK" ]; then
        echo -e "${RED}❌ ERROR: payments secret validator is missing: $PAYMENTS_SECRET_CHECK${NC}" >&2
        return 1
    fi

    local payload="" rc=0
    payload="$(yc lockbox payload get --id "$LOCKBOX_PAYMENTS_SECRET_ID" --format=json 2>/dev/null)" || rc=$?
    if [ "$rc" -ne 0 ] || [ -z "$payload" ]; then
        echo -e "${RED}❌ ERROR: payments Lockbox is unreadable (yc call failed) — access problem, not an empty secret${NC}" >&2
        return 2
    fi

    # payload содержит секрет: его нельзя печатать, только передать в валидатор.
    printf '%s' "$payload" | node "$PAYMENTS_SECRET_CHECK"
}

INVENTORY_SCRIPT="$SCRIPT_DIR/function-inventory.cjs"
if [ ! -f "$INVENTORY_SCRIPT" ]; then
    echo -e "${RED}❌ Function inventory not found: $INVENTORY_SCRIPT${NC}"
    exit 1
fi

API_FUNCTIONS=()
while IFS= read -r func_name; do
    API_FUNCTIONS+=("$func_name")
done < <(node "$INVENTORY_SCRIPT" --list --group api --auto-only)

AUTOMATION_FUNCTIONS=()
while IFS= read -r func_name; do
    AUTOMATION_FUNCTIONS+=("$func_name")
done < <(node "$INVENTORY_SCRIPT" --list --group automations --auto-only)

# Функция с autoDeploy:false не должна уезжать в прод «заодно». Инвентарь её
# из автоматических групп исключает, но явный список функций этот признак
# обходил: 2026-08-11 правка CORS перечислила шесть функций подряд, и
# heys-api-sms — отключённая в проде с 22 мая — вернулась в облако вместе с
# остальными. Внешний обработчик появился в проде, не появившись ни в одном
# юридическом документе.
#
# Явное указание само по себе не является «explicit release decision», которого
# требует причина в инвентаре: перечислить имя в списке слишком легко. Поэтому
# отключённая функция требует отдельной переменной с её именем — случайно такое
# не наберёшь, а осознанный релиз не блокируется.
assert_target_allowed() {
    local fn="$1"
    local auto_deploy
    auto_deploy="$(node "$INVENTORY_SCRIPT" --auto-deploy "$fn" 2>/dev/null || echo unknown)"
    [ "$auto_deploy" = "false" ] || return 0

    # Диагностика уходит в stderr: stdout этой ветки — список имён функций,
    # и любая посторонняя строка в нём становится «именем функции».
    case ",${ALLOW_DISABLED_FUNCTIONS:-}," in
        *",$fn,"*)
            if [ -z "${ALLOW_DISABLED_REASON:-}" ]; then
                echo -e "${RED}❌ $fn: ALLOW_DISABLED_FUNCTIONS задан без ALLOW_DISABLED_REASON${NC}" >&2
                echo -e "${RED}   Причина обязательна — она попадёт в лог деплоя.${NC}" >&2
                exit 1
            fi
            echo -e "${YELLOW}⚠ $fn: авто-деплой отключён, разрешён вручную — ${ALLOW_DISABLED_REASON}${NC}" >&2
            return 0
            ;;
    esac

    echo -e "${RED}❌ $fn: авто-деплой отключён в function-inventory.cjs${NC}" >&2
    echo -e "${RED}   $(node "$INVENTORY_SCRIPT" --reason "$fn" 2>/dev/null)${NC}" >&2
    echo -e "${RED}   Осознанный релиз: ALLOW_DISABLED_FUNCTIONS=$fn ALLOW_DISABLED_REASON=\"почему\" $0 $fn${NC}" >&2
    exit 1
}

selected_functions() {
    if [ ${#TARGET_FUNCTIONS[@]} -gt 0 ]; then
        local fn
        for fn in "${TARGET_FUNCTIONS[@]}"; do
            assert_target_allowed "$fn"
        done
        printf '%s\n' "${TARGET_FUNCTIONS[@]}"
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

deployment_label() {
    if [ ${#TARGET_FUNCTIONS[@]} -gt 0 ]; then
        local IFS=,
        echo "${TARGET_FUNCTIONS[*]}"
        return
    fi
    echo "$DEPLOY_GROUP"
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
        case "$key" in
            *_SHA256|LOCKBOX_*_SECRET_ID|HEYS_DEPLOY_COMMIT|HEYS_DEPLOYED_AT|HEYS_DEPLOY_GROUP)
                continue
                ;;
            *_TOKEN|*_TOKEN_*|*_SECRET|*_SECRET_*|*_PASSWORD|*_PASSWORD_*|\
            *_PRIVATE_KEY|*_PRIVATE_KEY_*|*_API_KEY|*_ACCESS_KEY_ID|YC_SPEECHKIT_KEY)
                if [[ "$value" != __IN_LOCKBOX__* ]]; then
                    violations+=("$key")
                fi
                ;;
        esac
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
              if [ -z "${!v}" ] && command -v yc >/dev/null 2>&1; then
                local existing_value
                  # jq на машине может не стоять — тогда читаем тем же node,
                  # который и так нужен для сборки. Без запасного пути подхват
                  # молча не срабатывал, и деплой падал на «пустом» ключе,
                  # хотя в задеплоенной версии он есть.
                  if command -v jq >/dev/null 2>&1; then
                      existing_value="$(yc serverless function version list \
                          --function-name "$func_name" --format json 2>/dev/null \
                          | jq -r --arg key "$v" '.[0].environment[$key] // empty')"
                  else
                      existing_value="$(yc serverless function version list \
                          --function-name "$func_name" --format json 2>/dev/null \
                          | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);process.stdout.write(((a[0]||{}).environment||{})[process.argv[1]]||'');}catch(e){}});" "$v")"
                  fi
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
        # 512m — под поиск по срезу исходников: архив распаковывается в память
        # целиком (около 64 МБ текста), замеренный пик 225 МБ.
        "heys-mcp")
            echo "nodejs22 index.handler 512m 60s" ;;
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
        # 120s: mcp_telemetry агрегирует Postgres внутри daily_cleanup.
        # При 30s один медленный page Logging съедает весь слот и платформа
        # убивает функцию до конца уборки. Ошибка телеметрии ловится в JS,
        # таймаут платформы — нет.
        "heys-maintenance")
            echo "nodejs22 index.handler 256m 120s" ;;
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

    # PG + LOCKBOX_DB_SECRET_ID — для всех функций с БД (кроме health/sms/mcp).
    # heys-mcp работает только через HTTP /rpc и в БД не ходит — креды ему не выдаём,
    # чтобы прямой путь записи в client_kv_store остался физически недоступен.
    if [[ ! "$func_name" =~ (health|sms|mcp) ]]; then
        # heys-api-auth ходит под собственной ролью heys_rpc, а не под владельцем
        # таблиц (heys/e96718). Под владельцем построчная защита не применяется
        # вовсе, поэтому точечные гранты роли ни на что не влияли. Переключена
        # первой 3 сентября: у неё все гранты уже были, а восьми её таблицам
        # дописаны политики миграцией 2026-09-03_rls_policies_heys_rpc_auth.
        #
        # Пароль роли лежит в отдельном секрете, чтобы общий heys-database с
        # админским паролем не трогать: он один на все остальные функции.
        local db_secret_id="$LOCKBOX_DB_ID"
        local k
        for k in PG_HOST PG_PORT PG_DATABASE PG_USER PG_SSL; do
            if [[ "$func_name" == "heys-api-auth" && "$k" == "PG_USER" ]]; then continue; fi
            _add_required "$k"
        done
        if [[ "$func_name" == "heys-api-auth" ]]; then
            db_secret_id="e6qp2vdmcmvm5fl5ckg2"
            env_flags+=" --environment PG_USER=heys_rpc"
        fi
        env_flags+=" --environment PG_PASSWORD=__IN_LOCKBOX__heys-database__"
        env_flags+=" --environment LOCKBOX_DB_SECRET_ID=$db_secret_id"
    fi

    # LOCKBOX_APP_SECRET_ID — для всех функций кроме health (initSecrets
    # overlay'ит env любым ключом из heys-app-secrets при cold start).
    if [[ "$func_name" != "heys-api-health" ]]; then
        env_flags+=" --environment LOCKBOX_APP_SECRET_ID=$LOCKBOX_APP_ID"
    fi

    # YooKassa credentials live in a dedicated Lockbox secret. This limits CI
    # and runtime access to the payment pair instead of the whole app secret.
    if [[ "$func_name" == "heys-api-payments" ]]; then
        env_flags+=" --environment LOCKBOX_PAYMENTS_SECRET_ID=$LOCKBOX_PAYMENTS_SECRET_ID"
    fi

    # Backup-функции (heys-client-daily-backup, heys-snapshot-demo) + photo-cleanup:
    # S3 credentials приходят только из Lockbox; Telegram — из App Lockbox.
    if [[ "$func_name" =~ (backup|snapshot-demo|photo-cleanup) ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
    fi

    # Photo/voice are not backed up. Orphan delete must actually run.
    # Code default remains dry-run if this env is omitted (fail-safe).
    if [[ "$func_name" == "heys-cron-photo-cleanup" ]]; then
        env_flags+=" --environment DRY_RUN=0"
        env_flags+=" --environment S3_PHOTOS_BUCKET=${S3_PHOTOS_BUCKET:-heys-photos}"
    fi

    # SpeechKit credentials приходят только из App Lockbox. В env остаются
    # только non-secret runtime controls/pricing.
    if [[ "$func_name" == "heys-cron-speechkit-transcribe" ]]; then
        local k
        for k in SPEECHKIT_FOLDER_ID YC_FOLDER_ID SPEECHKIT_MODEL \
                 SPEECHKIT_PILOT_MONTHLY_CAP_RUB SPEECHKIT_ASYNC_PRICE_PER_15S_RUB \
                 SPEECHKIT_WORKER_LIMIT SPEECHKIT_START_MAX_ATTEMPTS \
                 SPEECHKIT_PROCESSING_LEASE_SECONDS SPEECHKIT_OPERATION_TIMEOUT_MINUTES \
                 SPEECHKIT_FETCH_TIMEOUT_MS S3_PHOTOS_BUCKET; do
            _add "$k"
        done
    fi

    # Photos функция: S3 credentials только из Lockbox.
    if [[ "$func_name" == "heys-api-photos" ]]; then
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
    fi

    # heys-snapshot-demo: override S3_BUCKET (default bucket "heys-backups"
    # содержит client-daily; для demo нужен отдельный публичный bucket)
    if [[ "$func_name" == "heys-snapshot-demo" ]]; then
        env_flags+=" --environment S3_BUCKET=heys-public-snapshot"
    fi

    # JWT_SECRET — для rpc, auth, push, messages, photos (curator-JWT identity resolution)
    # SEC-024 v2 (2026-06-14): добавлен heys-api-rest для curator-JWT verify в
    # enforceClientKvAuthForGet middleware (cross-client read detection для кураторов).
    if [[ "$func_name" =~ (rpc|auth) ]] || [[ "$func_name" == "heys-api-push" ]] || [[ "$func_name" == "heys-api-messages" ]] || [[ "$func_name" == "heys-api-photos" ]] || [[ "$func_name" == "heys-api-rest" ]]; then
        env_flags+=" --environment JWT_SECRET=__IN_LOCKBOX__heys-app-secrets__"
    fi

    # SESSION_SECRET — только auth
    if [[ "$func_name" == "heys-api-auth" ]]; then
        env_flags+=" --environment SESSION_SECRET=__IN_LOCKBOX__heys-app-secrets__"
    fi

    # Cron drip-уведомлений (Phase 1, P0.7): token из Lockbox, APP_URL non-secret.
    if [[ "$func_name" == "heys-cron-trial-drip" ]]; then
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
    # Public key/subject — required non-secret config. Private key — только
    # placeholder: initSecrets() заменит его значением из App Lockbox.
    if [[ "$func_name" =~ (push|reminders|messages) ]]; then
        local k
        for k in VAPID_PUBLIC_KEY VAPID_SUBJECT; do
            _add_required "$k"
        done
        env_flags+=" --environment VAPID_PRIVATE_KEY=__IN_LOCKBOX__heys-app-secrets__"
    fi

    # SEC-023 hot-fix 2026-06-14: heys-api-rest в STRICT-mode для write-context.
    # POST на /rest/client_kv_store без row.context_id → 400 context_required.
    # Безопасно: 0 real REST writes без context_id за 7 дней audit'a (1 событие
    # = моя SEC-L3 проба). heys-api-rpc остаётся в warn-mode до 2026-06-21
    # (SEC-004 monitoring — там 3 события session_phase_b за 12h = реальные клиенты).
    if [[ "$func_name" == "heys-api-rest" ]]; then
        env_flags+=" --environment HEYS_WRITE_CONTEXT_STRICT=1"
        _add HEYS_REST_READ_STRICT
    fi

    # Задачник куратора живёт под обычным клиентом HEYS: ключи heys_tasks_* в
    # его client_kv_store. Id задаётся здесь, а не берётся по имени — это личные
    # файлы куратора, и подставлять их догадкой нельзя. Переменной нет —
    # инструменты задачника просто не появятся в списке (см. lib/curator.js).
    if [[ "$func_name" == "heys-mcp" ]]; then
        env_flags+=" --environment HEYS_TASKS_CLIENT_ID=${HEYS_TASKS_CLIENT_ID:-ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a}"
        env_flags+=" --environment HEYS_TASKS_CURATOR_ID=${HEYS_TASKS_CURATOR_ID:-6d4dbb32-fd9d-45b3-8e01-512595e2cb2c}"
        env_flags+=" --environment MCP_LOG_GROUP_ID=${MCP_LOG_GROUP_ID:-e23ndggvq798r3v3eepq}"
        # Срез исходников для вопросов «как это работает в приложении» лежит в
        # приватном бакете heys-backups; ключи только из Lockbox. Без них
        # инструменты по коду вообще не появляются в списке (lib/curator.js).
        env_flags+=" --environment LOCKBOX_S3_SECRET_ID=$LOCKBOX_S3_ID"
    fi

    # MCP telemetry: stdout heys-mcp по-прежнему уходит в Logging для консоли;
    # агрегация и tasks_mcp_trace читают mcp_call_events в Postgres.
    if [[ "$func_name" == "heys-maintenance" ]]; then
        env_flags+=" --environment MCP_LOG_GROUP_ID=${MCP_LOG_GROUP_ID:-e23ndggvq798r3v3eepq}"
    fi

    # Server-side overload shed: reserve one slot per instance for recovery and
    # return an explicit Retry-After before the platform-wide quota is reached.
    if [[ "$func_name" == "heys-api-rpc" || "$func_name" == "heys-api-rest" ]]; then
        env_flags+=" --environment HEYS_INSTANCE_ADMISSION_LIMIT=$API_INSTANCE_ADMISSION_LIMIT"
        env_flags+=" --environment HEYS_OVERLOAD_RETRY_AFTER_SECONDS=$OVERLOAD_RETRY_AFTER_SECONDS"
    fi

    echo "$env_flags"
}

PREVALIDATED_ENV_FLAGS=()
SKIPPED_FUNCTIONS=()
DEPLOYED_FUNCTIONS=()
CURRENT_DEPLOY_TARGET=""

write_deploy_status() {
    local phase="${1:-unknown}"
    local current_target="${2:-}"
    local partial_rollout="${3:-false}"
    local deployed_csv=""
    local deployment_mode=""
    local IFS=,

    deployed_csv="${DEPLOYED_FUNCTIONS[*]}"
    deployment_mode="$(deployment_label)"

    if [ -z "${HEYS_DEPLOY_STATUS_FILE:-}" ]; then
        return 0
    fi

    {
        printf 'phase=%s\n' "$phase"
        printf 'current_target=%s\n' "$current_target"
        printf 'deployed_functions=%s\n' "$deployed_csv"
        printf 'partial_rollout=%s\n' "$partial_rollout"
        printf 'deployment_mode=%s\n' "$deployment_mode"
    } > "$HEYS_DEPLOY_STATUS_FILE"
}

validate_function_source_state() {
    local func_name=$1
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
                exit 1
            fi
        fi
    fi
}

preflight_function() {
    local func_name=$1
    local config=""
    local env_flags=""

    config="$(get_function_config "$func_name")"
    if [ -z "$config" ]; then
        echo -e "${RED}❌ Unknown function: $func_name${NC}"
        exit 1
    fi
    if [ ! -f "$SCRIPT_DIR/$func_name/package.json" ]; then
        echo -e "${RED}❌ Missing package.json for $func_name${NC}"
        exit 1
    fi

    if [[ "$func_name" == "heys-api-payments" ]]; then
        local payments_rc=0
        payments_lockbox_ready || payments_rc=$?

        if [ "$payments_rc" -eq 2 ]; then
            echo -e "${RED}❌ ERROR: payments Lockbox readiness could NOT be verified for $func_name${NC}"
            echo -e "${YELLOW}   Потеря доступа — не повод молча пропустить функцию и уйти зелёным.${NC}"
            exit 1
        fi

        if [ "$payments_rc" -ne 0 ]; then
            if [ "$CI_MODE" = true ] && [ ${#TARGET_FUNCTIONS[@]} -eq 0 ]; then
                SKIPPED_FUNCTIONS+=("$func_name")
                PREVALIDATED_ENV_FLAGS+=("")
                echo -e "${YELLOW}⏭️  Preflight skip $func_name — dedicated payments Lockbox is not ready${NC}"
                return 0
            fi

            echo -e "${RED}❌ ERROR: dedicated payments Lockbox is not ready for $func_name${NC}"
            exit 1
        fi
    fi

    validate_function_source_state "$func_name"

    # Validate required secrets for this function
    validate_function_env "$func_name"

    env_flags="$(build_env_flags "$func_name")"
    env_flags+=" --environment HEYS_DEPLOY_COMMIT=$(function_source_commit "$func_name")"
    env_flags+=" --environment HEYS_DEPLOYED_AT=$(current_deployed_at)"
    env_flags+=" --environment HEYS_DEPLOY_GROUP=$(deployment_label)"
    assert_env_flags_no_plaintext_secrets "$func_name" "$env_flags"
    PREVALIDATED_ENV_FLAGS+=("$env_flags")
    echo -e "${GREEN}✅ Preflight $func_name${NC}"
}

is_function_skipped() {
    local func_name=$1
    local skipped
    for skipped in "${SKIPPED_FUNCTIONS[@]}"; do
        if [ "$skipped" = "$func_name" ]; then
            return 0
        fi
    done
    return 1
}

validated_env_flags_for() {
    local func_name=$1
    local i
    for ((i = 0; i < ${#PREDEPLOY_TARGETS[@]}; i++)); do
        if [ "${PREDEPLOY_TARGETS[$i]}" = "$func_name" ]; then
            printf '%s' "${PREVALIDATED_ENV_FLAGS[$i]}"
            return 0
        fi
    done
    echo -e "${RED}❌ Missing prevalidated env flags for $func_name${NC}" >&2
    return 1
}

# Упаковщик исходников. `zip` есть не везде: на Windows-машине с Git Bash его
# нет вовсе, зато обычно стоит 7-Zip. Он умеет тот же формат и те же исключения.
find_zip_packer() {
    if command -v zip >/dev/null 2>&1; then printf 'zip'; return 0; fi
    local candidate
    for candidate in 7z 7za '/c/Program Files/7-Zip/7z.exe' '/c/Program Files (x86)/7-Zip/7z.exe'; do
        if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
            printf '%s' "$candidate"; return 0
        fi
    done
    return 1
}

pack_function_source() {
    local out=$1 packer=$2
    if [ "$packer" = "zip" ]; then
        zip -qr "$out" . \
            -x 'node_modules/*' '*.zip' '.env' '.env.*' '*.log' \
               'coverage/*' '.git/*' '.DS_Store' 'docs/*' \
               'apply_*.js' 'check_*.js' 'test_*.js' 'deploy.sh' \
               '.ycignore' 'README.md'
    else
        "$packer" a -tzip -bso0 -bsp0 "$out" . \
            -xr'!node_modules' -xr'!*.zip' -xr'!.env' -xr'!.env.*' -xr'!*.log' \
            -xr'!coverage' -xr'!.git' -xr'!.DS_Store' -xr'!docs' \
            -xr'!apply_*.js' -xr'!check_*.js' -xr'!test_*.js' -xr'!deploy.sh' \
            -xr'!.ycignore' -xr'!README.md' >/dev/null
    fi
}

# Состав архива проверяется до заливки, а не по коду возврата упаковщика.
#
# Инцидент 2026-08-17: `zip` на машине не было, деплой обошли через
# `tar -a -cf out.zip`. В Git Bash на Windows `-a` не переключается на zip по
# расширению, поэтому получился обычный tar с чужим расширением — в central
# directory ноль записей. Упаковка отработала успешно, версия создалась, статус
# ACTIVE — и при этом функция не стартовала вовсе (`Cannot find module
# '/function/code/index.js'`), MCP отдавал 502 одиннадцать минут. Успешная
# упаковка ничего не доказывает; доказывает состав архива. Проверка ловит и tar
# (имён нет вовсе), и вложенную папку (точки входа нет в корне).
assert_zip_entrypoint() {
    local zip_path=$1 entry=$2
    local module="${entry%%.*}.js"
    if ! node -e '
const fs = require("fs");
const [zipPath, moduleName] = process.argv.slice(1);
const buf = fs.readFileSync(zipPath);
const names = [];
for (let i = 0; i < buf.length - 4; i += 1) {
  if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x01 && buf[i + 3] === 0x02) {
    const len = buf.readUInt16LE(i + 28);
    names.push(buf.toString("utf8", i + 46, i + 46 + len));
  }
}
if (!names.includes(moduleName)) {
  console.error(`  ${moduleName} не в корне архива; что там: ${names.slice(0, 5).join(", ") || "пусто"}`);
  process.exit(1);
}
if (names.some((n) => n.includes("\\"))) {
  console.error("  в архиве обратные слеши — Linux-рантайм не разрешит require()");
  process.exit(1);
}
' "$(_node_module_path "$zip_path")" "$module"; then
        echo -e "${RED}❌ Refuse to deploy: архив собран неправильно${NC}"
        echo -e "${YELLOW}   Точка входа обязана лежать в корне архива, разделители — прямые.${NC}"
        exit 1
    fi
}

# Deploy a single prevalidated function
deploy_function() {
    local func_name=$1
    local config=""
    local env_flags=""

    config="$(get_function_config "$func_name")"
    read -r runtime entrypoint memory timeout <<< "$config"
    env_flags="$(validated_env_flags_for "$func_name")"

    # Service account для чтения Lockbox. Прикрепляется ко ВСЕМ функциям кроме
    # heys-api-health (она ничего не читает из Lockbox).
    # SA heys-function-invoker имеет lockbox.payloadViewer на heys-app-secrets,
    # heys-database, heys-s3.
    sa_flag=""
    if [[ "$func_name" != "heys-api-health" ]]; then
        sa_flag="--service-account-id aje85rjgpj4nk9m384ek"
    fi

    # Runtime concurrency берётся из serverless-capacity-policy.cjs. Handler guard
    # не ниже runtime concurrency, чтобы не создавать искусственные 429 до того,
    # как Cloud Functions запустит дополнительный экземпляр.
    local concurrency_flag=""
    if [[ "$func_name" =~ ^heys-api-(rpc|rest|auth|leads|push|messages|photos)$ || "$func_name" == "heys-bot-client" ]]; then
        concurrency_flag="--concurrency $API_INSTANCE_CONCURRENCY"
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}🧪 Dry-run $func_name${NC}"
        echo "   runtime=$runtime entrypoint=$entrypoint memory=$memory timeout=$timeout"
        if [ -n "$concurrency_flag" ]; then echo "   $concurrency_flag"; fi
        if [[ "$func_name" == "heys-api-rpc" || "$func_name" == "heys-api-rest" ]]; then
            echo "   scaling: zone-instances=$API_ZONE_INSTANCES_LIMIT zone-requests=$API_ZONE_REQUESTS_LIMIT"
        fi
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

        CONTRACT_SRC="$SCRIPT_DIR/shared/kv-payload-contracts.js"
        CONTRACT_DST_DIR="$SCRIPT_DIR/$func_name/shared"
        CONTRACT_DST="$CONTRACT_DST_DIR/kv-payload-contracts.js"
        if [ -f "$CONTRACT_SRC" ]; then
            mkdir -p "$CONTRACT_DST_DIR"
            cp "$CONTRACT_SRC" "$CONTRACT_DST"
            echo -e "${BLUE}ℹ️  Synced KV payload contracts: shared/kv-payload-contracts.js${NC}"
        else
            echo -e "${RED}❌ ERROR: KV payload contracts not found at $CONTRACT_SRC${NC}"
            exit 1
        fi

        CAPACITY_GUARD_SRC="$SCRIPT_DIR/shared/serverless-capacity-guard.js"
        CAPACITY_GUARD_DST="$CONTRACT_DST_DIR/serverless-capacity-guard.js"
        if [ -f "$CAPACITY_GUARD_SRC" ]; then
            cp "$CAPACITY_GUARD_SRC" "$CAPACITY_GUARD_DST"
            echo -e "${BLUE}ℹ️  Synced capacity guard: shared/serverless-capacity-guard.js${NC}"
        else
            echo -e "${RED}❌ ERROR: capacity guard not found at $CAPACITY_GUARD_SRC${NC}"
            exit 1
        fi

        TASKS_KV_SRC="$SCRIPT_DIR/heys-mcp/lib/tasks.js"
        TASKS_KV_DST="$SCRIPT_DIR/$func_name/lib/heys_tasks_kv.cjs"
        if [ -f "$TASKS_KV_SRC" ]; then
            mkdir -p "$(dirname "$TASKS_KV_DST")"
            cp "$TASKS_KV_SRC" "$TASKS_KV_DST"
            echo -e "${BLUE}ℹ️  Synced tasks KV module: lib/heys_tasks_kv.cjs${NC}"
        else
            echo -e "${RED}❌ ERROR: tasks KV source not found at $TASKS_KV_SRC${NC}"
            exit 1
        fi
    fi

    # 📋 Sync day-checklist rules — общее правило «чего ещё ждём от клиента».
    # Крон решает по нему, слать ли пуш; мессенджер отдаёт по нему чек-лист.
    # Копии обязаны совпадать, иначе напоминания и UI разъедутся.
    if [[ "$func_name" == "heys-cron-reminders" || "$func_name" == "heys-api-messages" ]]; then
        CHECKLIST_SRC="$SCRIPT_DIR/shared/day-checklist-rules.js"
        CHECKLIST_DST_DIR="$SCRIPT_DIR/$func_name/shared"
        if [ -f "$CHECKLIST_SRC" ]; then
            mkdir -p "$CHECKLIST_DST_DIR"
            cp "$CHECKLIST_SRC" "$CHECKLIST_DST_DIR/day-checklist-rules.js"
            echo -e "${BLUE}ℹ️  Synced day-checklist rules: shared/day-checklist-rules.js${NC}"
        else
            echo -e "${RED}❌ ERROR: day-checklist rules not found at $CHECKLIST_SRC${NC}"
            exit 1
        fi
    fi

    # MCP telemetry: slim extractRecord для офлайн correlate (не hot path).
    if [[ "$func_name" == "heys-mcp" || "$func_name" == "heys-maintenance" ]]; then
        LOGGING_READ_SRC="$SCRIPT_DIR/shared/mcp-logging-read.js"
        LOGGING_READ_DST_DIR="$SCRIPT_DIR/$func_name/shared"
        LOGGING_READ_DST="$LOGGING_READ_DST_DIR/mcp-logging-read.js"
        if [ -f "$LOGGING_READ_SRC" ]; then
            mkdir -p "$LOGGING_READ_DST_DIR"
            cp "$LOGGING_READ_SRC" "$LOGGING_READ_DST"
            echo -e "${BLUE}ℹ️  Synced MCP logging parse helper: shared/mcp-logging-read.js${NC}"
        fi
    fi

    # Раньше yc CLI 0.184.0 при `--source-path .` читал .ycignore и сам исключал
    # node_modules. Но для функций с большим node_modules (>4000 файлов, e.g.
    # heys-client-daily-backup с @aws-sdk) yc игнорирует .ycignore — видимо
    # таймаут на traversal. Чтобы поведение было предсказуемым для ВСЕХ функций,
    # упаковываем zip сами с теми же исключениями что в .ycignore и передаём как
    # --source-path. yc auto-устанавливает npm-deps из package.json на cold
    # start, поэтому node_modules в zip не нужен.
    DEPLOY_ZIP="/tmp/${func_name}-deploy-$$.zip"
    rm -f "$DEPLOY_ZIP"
    ZIP_PACKER="$(find_zip_packer)" || {
        echo -e "${RED}❌ Refuse to deploy: нет ни zip, ни 7-Zip в PATH${NC}"
        echo -e "${YELLOW}   Ставить archiver, а не обходить вручную: ручная упаковка уже роняла прод (2026-08-17).${NC}"
        exit 1
    }
    pack_function_source "$DEPLOY_ZIP" "$ZIP_PACKER"
    assert_zip_entrypoint "$DEPLOY_ZIP" "$entrypoint"
    ZIP_SIZE=$(du -k "$DEPLOY_ZIP" | awk '{print $1}')
    echo -e "${BLUE}ℹ️  Packaged $func_name → ${ZIP_SIZE}KB (${ZIP_PACKER##*/})${NC}"

    # From this point a cloud mutation may happen. Keep partial_rollout=true
    # until the complete status is written, even if no version has succeeded yet.
    write_deploy_status "deploying" "$func_name" "true"

    # First deploy for optional functions (notably heys-api-payments) needs the
    # function shell to exist before `version create` can attach code to it.
    if ! yc serverless function get --name "$func_name" >/dev/null 2>&1; then
        echo -e "${YELLOW}ℹ️  Function $func_name does not exist — creating shell...${NC}"
        yc serverless function create --name "$func_name" >/dev/null
        echo -e "${GREEN}✅ Function shell created: $func_name${NC}"
    fi

    # Deploy function. Capture the remote failure explicitly so the status file
    # still identifies the failed target and all versions already published.
    if ! eval yc serverless function version create \
        --function-name "$func_name" \
        --runtime "$runtime" \
        --entrypoint "$entrypoint" \
        --memory "$memory" \
        --execution-timeout "$timeout" \
        $sa_flag \
        $concurrency_flag \
        --source-path "$DEPLOY_ZIP" \
        $env_flags; then
        rm -f "$DEPLOY_ZIP"
        echo -e "${RED}❌ Failed to deploy $func_name${NC}"
        exit 1
    fi

    rm -f "$DEPLOY_ZIP"
    DEPLOYED_FUNCTIONS+=("$func_name")
    write_deploy_status "deploying" "$func_name" "true"
    echo -e "${GREEN}✅ $func_name deployed successfully${NC}"

    if [[ "$func_name" == "heys-api-rpc" || "$func_name" == "heys-api-rest" ]]; then
        CURRENT_DEPLOY_TARGET="$func_name:scaling-policy"
        write_deploy_status "post-deploy" "$CURRENT_DEPLOY_TARGET" "true"
        yc serverless function set-scaling-policy \
            --name "$func_name" \
            --tag '$latest' \
            --zone-instances-limit "$API_ZONE_INSTANCES_LIMIT" \
            --zone-requests-limit "$API_ZONE_REQUESTS_LIMIT"
        echo -e "${GREEN}✅ $func_name scaling policy: instances=$API_ZONE_INSTANCES_LIMIT requests=$API_ZONE_REQUESTS_LIMIT per zone${NC}"
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

write_deploy_status "tests" "" "false"
echo -e "${BLUE}🧪 Running mandatory pre-deploy function gate...${NC}"
"$TEST_SCRIPT" "${PREDEPLOY_TARGETS[@]}"

CAPACITY_REQUIRED=false
for func_name in "${PREDEPLOY_TARGETS[@]}"; do
    if [[ "$func_name" == "heys-api-rpc" || "$func_name" == "heys-api-rest" ]]; then
        CAPACITY_REQUIRED=true
        break
    fi
done

if [ "$CAPACITY_REQUIRED" = true ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}⏭️  Capacity quota gate skipped in dry-run mode${NC}"
    else
        if [ ! -f "$CAPACITY_CHECK" ]; then
            echo -e "${RED}❌ Capacity check is missing: $CAPACITY_CHECK${NC}"
            exit 1
        fi
        echo -e "${BLUE}🧮 Verifying serverless quota has >=2x target headroom...${NC}"
        node "$CAPACITY_CHECK" --strict --quota-only
    fi
fi

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⏭️  yc access gate skipped in dry-run mode${NC}"
else
    echo -e "${BLUE}🔑 Verifying yc authentication before the first mutation...${NC}"
    require_yc_access
    echo -e "${GREEN}✅ yc access verified${NC}"
fi

echo -e "${BLUE}🔎 Preflighting all deployment targets before the first mutation...${NC}"
for func_name in "${PREDEPLOY_TARGETS[@]}"; do
    CURRENT_DEPLOY_TARGET="$func_name"
    write_deploy_status "preflight" "$CURRENT_DEPLOY_TARGET" "false"
    preflight_function "$func_name"
done
CURRENT_DEPLOY_TARGET=""
write_deploy_status "preflight-complete" "" "false"

# Main execution
SHOULD_UPDATE_GATEWAY=false
IS_GROUP_DEPLOY=false
if [ ${#TARGET_FUNCTIONS[@]} -eq 0 ]; then
    IS_GROUP_DEPLOY=true
fi

echo -e "${YELLOW}🚀 Deploy selection: $(deployment_label)${NC}"
for func_name in "${PREDEPLOY_TARGETS[@]}"; do
    if is_function_skipped "$func_name"; then
        continue
    fi

    CURRENT_DEPLOY_TARGET="$func_name"
    if [ ${#DEPLOYED_FUNCTIONS[@]} -gt 0 ] && [ "$DRY_RUN" != true ]; then
        write_deploy_status "deploying" "$CURRENT_DEPLOY_TARGET" "true"
    else
        write_deploy_status "deploying" "$CURRENT_DEPLOY_TARGET" "false"
    fi

    deploy_function "$func_name"

    if [ "$func_name" = "heys-api-auth" ]; then
        SHOULD_UPDATE_GATEWAY=true
    fi
    if [ "$IS_GROUP_DEPLOY" != true ] && [ "$func_name" = "heys-cron-speechkit-transcribe" ] && [ "$DRY_RUN" != true ] && [ "$CI_MODE" != true ]; then
        CURRENT_DEPLOY_TARGET="speechkit-trigger"
        write_deploy_status "post-deploy" "$CURRENT_DEPLOY_TARGET" "true"
        ensure_speechkit_trigger
    fi
done
CURRENT_DEPLOY_TARGET=""
if [ "$DRY_RUN" = true ]; then
    write_deploy_status "dry-run-complete" "" "false"
else
    write_deploy_status "deploy-complete" "" "true"
fi

if [ "$IS_GROUP_DEPLOY" = true ]; then
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
    if [[ "$DEPLOY_GROUP" == "api" || "$DEPLOY_GROUP" == "all" ]] && [ "$DRY_RUN" != true ] && [ "$CI_MODE" != true ]; then
        CURRENT_DEPLOY_TARGET="speechkit-trigger"
        write_deploy_status "post-deploy" "$CURRENT_DEPLOY_TARGET" "true"
        ensure_speechkit_trigger
    fi
    if [[ "$DEPLOY_GROUP" == "automations" || "$DEPLOY_GROUP" == "all" ]] && [ "$DRY_RUN" != true ] && [ "$SKIP_HEALTH" != true ]; then
        echo ""
        echo -e "${BLUE}🧪 Running automation canaries...${NC}"
        CURRENT_DEPLOY_TARGET="automation-canaries"
        write_deploy_status "post-deploy" "$CURRENT_DEPLOY_TARGET" "true"
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
    CURRENT_DEPLOY_TARGET="api-gateway"
    write_deploy_status "post-deploy" "$CURRENT_DEPLOY_TARGET" "true"
    update_api_gateway
fi

# ─── Post-deploy: health check ──────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⏭️  Dry-run: skipping gateway update and health check${NC}"
elif [ "$SKIP_HEALTH" = true ]; then
    echo -e "${YELLOW}⏭️  Skipping health check (--skip-health)${NC}"
else
    CURRENT_DEPLOY_TARGET="post-deploy-health"
    write_deploy_status "verification" "$CURRENT_DEPLOY_TARGET" "true"
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

CURRENT_DEPLOY_TARGET=""
write_deploy_status "complete" "" "false"
