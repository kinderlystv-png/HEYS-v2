"use strict";
// check_clients_debug.js — утилита для проверки наличия данных по продуктам и нормы углеводов у первых двух клиентов
// Использование: вставьте в консоль браузера (когда вы авторизованы и загружено приложение) строку:
//   import('./check_clients_debug.js')
// или скопируйте самовызывающийся блок ниже.
(async function () {
    if (!window.HEYS || !HEYS.cloud || !HEYS.cloud.client) {
        console.warn('[check_clients_debug] HEYS.cloud не готов');
        return;
    }
    const supa = HEYS.cloud.client;
    try {
        const { data: clients, error: cErr } = await supa.from('clients').select('id,name,created_at').order('created_at', { ascending: true }).limit(10);
        if (cErr) {
            console.error('Ошибка загрузки клиентов', cErr);
            return;
        }
        if (!clients || !clients.length) {
            console.log('Клиентов нет');
            return;
        }
        console.table(clients.map((c, i) => ({ idx: i + 1, id: c.id, name: c.name, created_at: c.created_at })));
        const targetIdx = [0, 1]; // «клиент 1» и «клиент 2» как первые по created_at
        for (const i of targetIdx) {
            const client = clients[i];
            if (!client) {
                continue;
            }
            const { data: kv, error: kvErr } = await supa.from('client_kv_store').select('k,v').eq('client_id', client.id).in('k', ['heys_products', 'heys_norms']);
            if (kvErr) {
                console.error('Ошибка чтения client_kv_store', client.id, kvErr);
                continue;
            }
            const recProducts = kv.find(r => r.k === 'heys_products');
            const recNorms = kv.find(r => r.k === 'heys_norms');
            const products = recProducts ? recProducts.v : null;
            const norms = recNorms ? recNorms.v : null;
            const carbsNorm = norms && (norms.carbsPct != null) ? norms.carbsPct : '(нет значения)';
            console.group(`Клиент #${i + 1} (${client.name})`);
            console.log('ID:', client.id);
            console.log('Продукты есть?:', Array.isArray(products) ? `да (${products.length})` : 'нет');
            if (Array.isArray(products)) {
                console.log('Пример первых 3 продуктов:', products.slice(0, 3).map(p => p.name));
            }
            console.log('Норма углеводов (carbsPct):', carbsNorm);
            if (!norms) {
                console.log('Комментарий: ключ heys_norms отсутствует для клиента — используется локальный/дефолт.');
            }
            console.groupEnd();
        }
        console.log('Готово. Если «клиент 1/2» должны определяться иначе (например по имени) — скорректируйте выборку.');
    }
    catch (e) {
        console.error('Исключение', e);
    }
})();
//# sourceMappingURL=check_clients_debug.js.map