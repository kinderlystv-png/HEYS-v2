#!/usr/bin/env python3
import psycopg2

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

print("=== FINAL STATE CHECK ===\n")

dates = ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-13', '2026-01-15', '2026-01-16', '2026-01-17', '2026-01-24']

for date in dates:
    cur.execute("""
        SELECT jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb))
        FROM client_kv_store 
        WHERE client_id = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'
        AND k = %s
    """, (f'heys_dayv2_{date}',))
    row = cur.fetchone()
    if row:
        print(f"{date}: {row[0]} meals")
    else:
        print(f"{date}: NOT FOUND")

print("\n=== AUDIT LOG ===")
cur.execute("""
    SELECT action, existing_meals, new_meals, allowed, reason
    FROM data_loss_audit
    ORDER BY created_at DESC LIMIT 5
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} -> {row[2]} meals, allowed={row[3]}, reason={row[4]}")

cur.close()
conn.close()
