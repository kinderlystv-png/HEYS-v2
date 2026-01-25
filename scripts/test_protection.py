#!/usr/bin/env python3
import psycopg2
import json

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

client_id = "ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a"

# Check current state
print("1. Current state:")
cur.execute("""
    SELECT jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb))
    FROM client_kv_store 
    WHERE client_id = %s AND k = 'heys_dayv2_2026-01-17'
""", (client_id,))
meals_before = cur.fetchone()[0]
print(f"   Meals: {meals_before}")

# Try to overwrite with empty day
print("\n2. Trying to overwrite with EMPTY day...")
empty_day = json.dumps({
    "date": "2026-01-17",
    "meals": [],
    "updatedAt": 1769356000000
})
cur.execute("""
    SELECT safe_upsert_client_kv(%s, 'heys_dayv2_2026-01-17', %s::jsonb)
""", (client_id, empty_day))
result = cur.fetchone()[0]
print(f"   Result: {result}")

# Check after
print("\n3. After attempt:")
cur.execute("""
    SELECT jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb))
    FROM client_kv_store 
    WHERE client_id = %s AND k = 'heys_dayv2_2026-01-17'
""", (client_id,))
meals_after = cur.fetchone()[0]
print(f"   Meals: {meals_after}")

# Check audit
print("\n4. Audit log:")
cur.execute("""
    SELECT action, existing_meals, new_meals, allowed, reason
    FROM data_loss_audit
    WHERE client_id = %s
    ORDER BY created_at DESC LIMIT 1
""", (client_id,))
row = cur.fetchone()
if row:
    print(f"   Action: {row[0]}, existing_meals: {row[1]}, new_meals: {row[2]}, allowed: {row[3]}, reason: {row[4]}")

if meals_after == meals_before:
    print("\n✅ PROTECTION WORKS! Data NOT overwritten!")
else:
    print("\n❌ PROTECTION FAILED!")

conn.rollback()
cur.close()
conn.close()
