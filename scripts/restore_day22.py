# -*- coding: utf-8 -*-
import json
import psycopg2

# Read backup
with open('/Users/poplavskijanton/Documents/heys-backup-ccfe6ea3-2026-01-24.json', 'r') as f:
    backup = json.load(f)

all_days = backup.get('days', {})
print(f"Found {len(all_days)} days in backup")

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

updated = 0
inserted = 0

for date_str, day_data in sorted(all_days.items()):
    key = f'heys_dayv2_{date_str}'
    meals_count = len(day_data.get('meals', []))
    
    # Try update first
    cur.execute("""
        UPDATE client_kv_store 
        SET v = %s, updated_at = NOW()
        WHERE client_id = %s AND k = %s
        RETURNING k
    """, (json.dumps(day_data), client_id, key))
    
    result = cur.fetchone()
    if result:
        updated += 1
        print(f"  Updated {date_str} ({meals_count} meals)")
    else:
        # Insert new record
        cur.execute("""
            INSERT INTO client_kv_store (client_id, k, v, updated_at)
            VALUES (%s, %s, %s, NOW())
        """, (client_id, key, json.dumps(day_data)))
        inserted += 1
        print(f"  Inserted {date_str} ({meals_count} meals)")

conn.commit()
cur.close()
conn.close()

print(f"\nDone! Updated: {updated}, Inserted: {inserted}")
print("Reload the app to see changes.")
