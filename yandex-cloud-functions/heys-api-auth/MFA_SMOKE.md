# heys-api-auth MFA smoke

This smoke closes the live-verification part of `6В.2` after an approved commit
and deploy of `heys-api-auth`.

Do not paste real TOTP secrets into chat, issue comments, logs or screenshots.
Use a controlled curator account for the first smoke.

## Preconditions

- `database/2026-06-14_curator_mfa_account_lockout.sql` has been applied.
- `heys-api-auth` has been deployed from the current source.
- `yandex-cloud-functions/api-gateway-spec.yaml` has been applied after deploy;
  `deploy-all.sh` creates a function version but does not update API Gateway.
- `JWT_SECRET` and `SESSION_SECRET` are configured.
- The web app contains the optional 2FA input and sends `mfa_code`.

## Source preflight

```bash
cd /Users/poplavskijanton/HEYS-v2
node --check yandex-cloud-functions/heys-api-auth/index.js
node --test yandex-cloud-functions/heys-api-auth/__tests__/mfa-totp.test.js
ruby -e "require 'yaml'; YAML.load_file('yandex-cloud-functions/api-gateway-spec.yaml')"
```

## Gateway apply

After deploying the function version, apply the gateway spec so
`/auth/mfa/{action}` reaches `heys-api-auth`:

```bash
cd /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions
yc serverless api-gateway update \
  --id=d5d7939njvjp27ofsok0 \
  --spec=api-gateway-spec.yaml
```

## DB shape

```sql
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'curators'
   AND column_name IN (
     'mfa_enabled',
     'mfa_enabled_at',
     'mfa_totp_secret_ciphertext',
     'failed_login_attempts',
     'last_failed_login_at',
     'login_locked_until'
   )
 ORDER BY column_name;
```

Expected: all six columns are present.

## MFA status

```bash
curl -sS -X POST 'https://api.heyslab.ru/auth/mfa/status' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CURATOR_JWT"
```

Expected before setup:

```json
{ "mfa_enabled": false, "has_secret": false }
```

## Setup

```bash
curl -sS -X POST 'https://api.heyslab.ru/auth/mfa/setup' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CURATOR_JWT"
```

Expected:

- response contains `secret` and `otpauth_url`;
- secret is used only to configure the authenticator app;
- do not store the plaintext secret outside the authenticator.

DB expected:

```sql
SELECT mfa_enabled,
       mfa_totp_secret_ciphertext IS NOT NULL AS has_ciphertext,
       mfa_enabled_at
  FROM public.curators
 WHERE id = '<curator_id>';
```

Expected: `mfa_enabled=false`, `has_ciphertext=true`, `mfa_enabled_at IS NULL`.

## Enable

```bash
curl -sS -X POST 'https://api.heyslab.ru/auth/mfa/enable' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CURATOR_JWT" \
  -d '{"mfa_code":"123456"}'
```

Replace `123456` with a current authenticator code.

Expected:

```json
{ "mfa_enabled": true }
```

DB expected: `mfa_enabled=true`, `mfa_enabled_at IS NOT NULL`.

## Login gates

1. Login with correct email/password and no MFA code.

Expected HTTP 401:

```json
{ "error": "mfa_required", "mfa_required": true }
```

2. Login with correct email/password and wrong MFA code.

Expected HTTP 401 with `Invalid MFA code`.

3. Login with correct email/password and current MFA code.

Expected HTTP 200 with `access_token`.

## Account lockout

Use the controlled curator account. Do not run against the main production
operator account unless explicitly approved.

1. Send 10 wrong password attempts.
2. Verify login is blocked for the configured window.

Expected response after lock:

```json
{ "error": "account_locked", "retry_after_seconds": 900 }
```

DB expected:

```sql
SELECT failed_login_attempts,
       login_locked_until > NOW() AS locked
  FROM public.curators
 WHERE id = '<curator_id>';
```

Expected: `failed_login_attempts >= 10`, `locked=true`.

After a successful login outside the lock window, expected:

```sql
SELECT failed_login_attempts, login_locked_until, last_failed_login_at
  FROM public.curators
 WHERE id = '<curator_id>';
```

`failed_login_attempts = 0`, lock fields are null.

## Disable

```bash
curl -sS -X POST 'https://api.heyslab.ru/auth/mfa/disable' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CURATOR_JWT" \
  -d '{"mfa_code":"123456"}'
```

Expected:

```json
{ "mfa_enabled": false }
```

DB expected: `mfa_enabled=false`, `mfa_totp_secret_ciphertext IS NULL`,
`mfa_enabled_at IS NULL`.

## Pass criteria

`6В.2` can be marked `✅` only when all are true:

- source and TOTP unit tests pass;
- six DB columns exist in production;
- setup stores only encrypted secret ciphertext in DB;
- enable requires a valid TOTP code;
- login without MFA code is rejected when MFA is enabled;
- login with wrong MFA code is rejected;
- login with valid MFA code succeeds;
- per-account lockout activates after repeated failures;
- disable clears the encrypted secret and MFA flag.
