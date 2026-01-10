/**
 * 🌐 Примеры вызова Yandex API (HEYS паттерны)
 * Файл: apps/web/heys_yandex_api_v1.js
 */

// ═══════════════════════════════════════════════════════════════════
// ✅ ПРАВИЛЬНО — RPC вызов через YandexAPI
// ═══════════════════════════════════════════════════════════════════

// Получить shared products
async function getSharedProducts() {
  const result = await HEYS.YandexAPI.rpc('get_shared_products', {});
  if (result.error) {
    console.error('[Products] Failed:', result.error);
    return [];
  }
  return result.data || [];
}

// Сохранить данные клиента (session-safe!)
async function saveClientData(key, value) {
  const sessionToken = HEYS.auth.getSessionToken();
  
  const result = await HEYS.YandexAPI.rpc('upsert_client_kv_by_session', {
    p_session_token: sessionToken,
    p_key: key,
    p_value: value
  });
  
  if (!result.data?.success) {
    throw new Error(result.data?.error || 'Save failed');
  }
  
  return result.data;
}

// Batch upsert (несколько ключей за раз)
async function batchSaveClientData(items) {
  const sessionToken = HEYS.auth.getSessionToken();
  
  // items = [{k: 'key1', v: {...}}, {k: 'key2', v: {...}}]
  const result = await HEYS.YandexAPI.rpc('batch_upsert_client_kv_by_session', {
    p_session_token: sessionToken,
    p_items: items
  });
  
  return result.data;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ ПРАВИЛЬНО — REST вызов для чтения
// ═══════════════════════════════════════════════════════════════════

async function getLeads() {
  const data = await HEYS.YandexAPI.rest('leads', {
    method: 'GET',
    params: { limit: 50, order: 'created_at.desc' }
  });
  return data;
}

// ═══════════════════════════════════════════════════════════════════
// ❌ ЗАПРЕЩЕНО — Supabase SDK (удалён!)
// ═══════════════════════════════════════════════════════════════════

// НЕ ИСПОЛЬЗОВАТЬ:
// await cloud.client.from('clients').select('*')
// await cloud.client.rpc('get_client_data', { client_id: uuid })
// await supabase.auth.signIn(...)
