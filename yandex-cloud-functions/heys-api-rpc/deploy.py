#!/usr/bin/env python3
"""Deploy heys-api-rpc with proper password handling"""
import subprocess
import os

# Получаем пароль из Lockbox
result = subprocess.run(
    ['yc', 'lockbox', 'payload', 'get', '--name', 'connection-a59ouh02bsch0qj11lv2', '--key', 'postgresql_password'],
    capture_output=True,
    text=True
)
password = result.stdout.strip()
print(f"Password length: {len(password)}")
print(f"Password chars: {[ord(c) for c in password]}")

# Деплоим с отдельными --environment для каждой переменной
cmd = [
    'yc', 'serverless', 'function', 'version', 'create',
    '--function-name', 'heys-api-rpc',
    '--runtime', 'nodejs18',
    '--entrypoint', 'index.handler',
    '--memory', '256m',
    '--execution-timeout', '30s',
    '--source-path', '/Users/poplavskijanton/HEYS-v2/yandex-cloud-functions/heys-api-rpc',
    '--environment', 'PG_HOST=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    '--environment', 'PG_PORT=6432',
    '--environment', 'PG_DATABASE=heys_production',
    '--environment', 'PG_USER=heys_rpc',
    '--environment', f'PG_PASSWORD={password}'
]

print("🚀 Deploying...")
print("CMD:", ' '.join(cmd[:15]) + '...')  # Print partial command
result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
print("✅ Done!" if result.returncode == 0 else f"❌ Error code: {result.returncode}")
