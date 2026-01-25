# -*- coding: utf-8 -*-
import json
import psycopg2

# Read backup
with open('/Users/poplavskijanton/Documents/heys-backup-ccfe6ea3-2026-01-24.json', 'r') as f:
    backup = json.load(f)

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

print("Comparing backup vs DB for January 2026:\n")
print(f"{'Date':<12} {'Backup':<10} {'DB':<10} {'Status'}")
print("-" * 45)

mismatches = []

for date in sorted([d for d in backup['days'].keys() if d.startswith('2026-01')]):
    backup_meals = len(backup['days'][date].get('meals', []))
    key = f'heys_dayv2_{date}'
    
    cur.execute("""
        SELECT jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb))
        FROM client_kv_store 
        WHERE client_id = %s AND k = %s
    """, (client_id, key))
    
    row = cur.fetchone()
    db_meals = row[0] if row else -1
    
    if db_meals == -1:
        status = "MISSING!"
        mismatches.append(date)
    elif backup_meals != db_meals:
        status = "MISMATCH!"
        mismatches.append(date)
    elif backup_meals == 0:
        status = "empty"
    else:
        status = "OK"
    
    db_str = str(db_meals) if db_meals >= 0 else "MISSING"
    print(f"{date:<12} {backup_meals:<10} {db_str:<10} {status}")

print(f"\nMismatches: {len(mismatches)}")
if mismatches:
    print("Dates to fix:", mismatches)

cur.close()
conn.close()
