# -*- coding: utf-8 -*-
import json
import psycopg2
import time

# Dates to fix (с данными в бэкапе)
dates_to_fix = ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-13', '2026-01-15', '2026-01-16', '2026-01-17', '2026-01-24']

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

# CRITICAL: Set updatedAt to NOW (very fresh) so merge logic prefers this data!
now_timestamp = int(time.time() * 1000)  # JavaScript timestamp (ms)

print(f"Fixing {len(dates_to_fix)} days with updatedAt = {now_timestamp}...\n")

for date in dates_to_fix:
    day_data = backup['days'].get(date)
    if not day_data:
        print(f"  {date}: NOT IN BACKUP - skipping")
        continue
    
    meals = len(day_data.get('meals', []))
    
    # SET FRESH updatedAt so sync logic keeps this data!
    day_data['updatedAt'] = now_timestamp
    
    key = f'heys_dayv2_{date}'
    
    cur.execute("""
        UPDATE client_kv_store 
        SET v = %s, updated_at = NOW()
        WHERE client_id = %s AND k = %s
        RETURNING k
    """, (json.dumps(day_data), client_id, key))
    
    result = cur.fetchone()
    if result:
        print(f"  {date}: UPDATED ({meals} meals, updatedAt={now_timestamp})")
    else:
        cur.execute("""
            INSERT INTO client_kv_store (client_id, k, v, updated_at)
            VALUES (%s, %s, %s, NOW())
        """, (client_id, key, json.dumps(day_data)))
        print(f"  {date}: INSERTED ({meals} meals)")

conn.commit()
cur.close()
conn.close()

print(f"\n✅ Done! updatedAt set to {now_timestamp}")
print("⚠️ ВАЖНО: Закрой ВСЕ вкладки приложения, открой НОВОЕ инкогнито окно!")
