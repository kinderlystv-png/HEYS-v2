# -*- coding: utf-8 -*-
import json
import os
import psycopg2

# Read backup
backup_path = os.environ.get('HEYS_RESTORE_BACKUP_PATH')
client_id = os.environ.get('HEYS_RESTORE_CLIENT_ID')
pg_password = os.environ.get('YC_PG_PASSWORD')

if not backup_path or not client_id or not pg_password:
    raise SystemExit(
        "Set HEYS_RESTORE_BACKUP_PATH, HEYS_RESTORE_CLIENT_ID and YC_PG_PASSWORD before running restore_day25.py"
    )

with open(backup_path, 'r') as f:
    backup = json.load(f)

day_data = backup['days'].get('2026-01-25')
if not day_data:
    print("ERROR: No data for 2026-01-25")
    exit(1)

print(f"Day 25 has {len(day_data.get('meals', []))} meals")

# Connect to DB
conn = psycopg2.connect(
    host="rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net",
    port=6432,
    dbname="heys_production",
    user=os.environ.get("YC_PG_USER", "heys_admin"),
    password=pg_password,
    sslmode="verify-full",
    sslrootcert=os.environ.get("YC_PG_SSL_ROOT_CERT", "/Users/poplavskijanton/.postgresql/root.crt")
)
cur = conn.cursor()

key = 'heys_dayv2_2026-01-25'

# Check existing
cur.execute("SELECT v FROM client_kv_store WHERE client_id = %s AND k = %s", (client_id, key))
existing = cur.fetchone()
if existing:
    print("Existing record found, will UPDATE")

# Upsert
sql = """
INSERT INTO client_kv_store (client_id, k, v, updated_at)
VALUES (%s, %s, %s, NOW())
ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW()
"""
cur.execute(sql, (client_id, key, json.dumps(day_data)))

conn.commit()
print("Day 2026-01-25 restored successfully!")

# Verify
cur.execute("SELECT v->>'date', jsonb_array_length(v->'meals') FROM client_kv_store WHERE client_id = %s AND k = %s", (client_id, key))
row = cur.fetchone()
print(f"Verified: date={row[0]}, meals={row[1]}")

cur.close()
conn.close()
