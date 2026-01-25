#!/usr/bin/env python3
"""
🔐 HEYS Data Protection Audit
Проверяет все критические точки потери данных
"""
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

print("=" * 60)
print("🔐 HEYS DATA PROTECTION AUDIT")
print("=" * 60)

# 1. Проверяем защиту в write_client_kv_value
print("\n1️⃣ write_client_kv_value protection:")
cur.execute("SELECT prosrc FROM pg_proc WHERE proname = 'write_client_kv_value'")
src = cur.fetchone()[0]
if 'check_day_overwrite_allowed' in src:
    print("   ✅ Has check_day_overwrite_allowed call")
else:
    print("   ❌ MISSING protection!")

# 2. Проверяем upsert_client_kv_by_session
print("\n2️⃣ upsert_client_kv_by_session:")
cur.execute("SELECT prosrc FROM pg_proc WHERE proname = 'upsert_client_kv_by_session'")
src = cur.fetchone()[0]
if 'write_client_kv_value' in src:
    print("   ✅ Uses write_client_kv_value (protected)")
else:
    print("   ❌ Direct INSERT - NOT PROTECTED!")

# 3. Проверяем batch_upsert_client_kv_by_session
print("\n3️⃣ batch_upsert_client_kv_by_session:")
cur.execute("SELECT prosrc FROM pg_proc WHERE proname = 'batch_upsert_client_kv_by_session'")
src = cur.fetchone()[0]
if 'write_client_kv_value' in src:
    print("   ✅ Uses write_client_kv_value (protected)")
else:
    print("   ❌ Direct INSERT - NOT PROTECTED!")

# 4. Проверяем safe_upsert_client_kv (для REST API)
print("\n4️⃣ safe_upsert_client_kv (REST):")
cur.execute("SELECT prosrc FROM pg_proc WHERE proname = 'safe_upsert_client_kv'")
row = cur.fetchone()
if row and 'check_day_overwrite_allowed' in row[0]:
    print("   ✅ Has check_day_overwrite_allowed call")
else:
    print("   ❌ MISSING or NOT PROTECTED!")

# 5. Проверяем аудит таблицу
print("\n5️⃣ data_loss_audit table:")
cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'data_loss_audit'")
if cur.fetchone()[0] > 0:
    print("   ✅ Audit table exists")
    cur.execute("SELECT COUNT(*) FROM data_loss_audit WHERE allowed = FALSE")
    blocked = cur.fetchone()[0]
    print(f"   📊 Blocked attempts: {blocked}")
else:
    print("   ❌ Audit table MISSING!")

# 6. Тестируем защиту
print("\n6️⃣ Live protection test:")
client_id = "ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a"

# Получаем день с meals
cur.execute("""
    SELECT k, jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb)) as meals
    FROM client_kv_store 
    WHERE client_id = %s AND k LIKE 'heys_dayv2_%%'
    AND jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb)) > 0
    ORDER BY k DESC LIMIT 1
""", (client_id,))
row = cur.fetchone()

if row:
    test_key = row[0]
    meals_count = row[1]
    print(f"   📋 Testing: {test_key} ({meals_count} meals)")
    
    # Пытаемся перезаписать пустым
    empty_day = json.dumps({"date": test_key.replace('heys_dayv2_', ''), "meals": []})
    cur.execute("SELECT write_client_kv_value(%s, %s, %s::jsonb)", (client_id, test_key, empty_day))
    
    # Проверяем что meals не потерялись
    cur.execute("""
        SELECT jsonb_array_length(COALESCE(v->'meals', '[]'::jsonb))
        FROM client_kv_store 
        WHERE client_id = %s AND k = %s
    """, (client_id, test_key))
    meals_after = cur.fetchone()[0]
    
    if meals_after == meals_count:
        print(f"   ✅ Protection WORKS! Meals preserved: {meals_after}")
    else:
        print(f"   ❌ PROTECTION FAILED! Meals: {meals_count} -> {meals_after}")
else:
    print("   ⚠️ No test data found")

# 7. Проверяем бэкапы в Yandex Cloud
print("\n7️⃣ Database backups:")
print("   ⚠️ Check Yandex Cloud console manually")
print("   Recommended: daily automated backups, 7 day retention")

# 8. Мониторинг
print("\n8️⃣ Monitoring:")
cur.execute("SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'get_recent_data_loss_alerts'")
if cur.fetchone()[0] > 0:
    print("   ✅ get_recent_data_loss_alerts function exists")
else:
    print("   ⚠️ Monitoring function missing")

cur.execute("SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'check_suspicious_days'")
if cur.fetchone()[0] > 0:
    print("   ✅ check_suspicious_days function exists")
else:
    print("   ⚠️ Monitoring function missing")

conn.rollback()  # Откатываем тестовые изменения
cur.close()
conn.close()

print("\n" + "=" * 60)
print("🏁 AUDIT COMPLETE")
print("=" * 60)
