# -*- coding: utf-8 -*-
import json
import psycopg2

# Read backup
with open('/Users/poplavskijanton/Documents/heys-backup-ccfe6ea3-2026-01-25.json', 'r') as f:
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
    user="heys_admin",
    password="heys007670",
    sslmode="verify-full",
    sslrootcert="/Users/poplavskijanton/.postgresql/root.crt"
)
cur = conn.cursor()

client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
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
