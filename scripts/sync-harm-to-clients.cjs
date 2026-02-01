#!/usr/bin/env node
/**
 * Синхронизация harm в личных базах клиентов из shared_products
 */

const fs = require('fs');
const path = require('path');

const { Client } = require('pg');

// Загружаем .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
    const client = new Client({
        host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
        port: parseInt(process.env.PG_PORT || '6432'),
        database: process.env.PG_DATABASE || 'heys_production',
        user: process.env.PG_USER || 'heys_admin',
        password: process.env.PG_PASSWORD,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('Connected to PostgreSQL\n');

    // 1. Получаем shared_products для индекса
    const sharedRes = await client.query('SELECT name, harm, nova_group FROM shared_products');
    const sharedByName = new Map();
    sharedRes.rows.forEach(p => {
        sharedByName.set(p.name.toLowerCase().trim(), { harm: parseFloat(p.harm) || 0, novaGroup: p.nova_group });
    });
    console.log('Shared products loaded: ' + sharedByName.size);

    // 2. Получаем всех клиентов с heys_products
    const clientsRes = await client.query(`
    SELECT client_id, v 
    FROM client_kv_store 
    WHERE k = 'heys_products'
  `);
    console.log('Clients with products: ' + clientsRes.rows.length + '\n');

    for (const row of clientsRes.rows) {
        const clientId = row.client_id;
        let products = [];

        try {
            products = typeof row.v === 'string' ? JSON.parse(row.v) : row.v;
        } catch (e) {
            console.log('Error parsing products for client ' + clientId);
            continue;
        }

        if (!Array.isArray(products) || products.length === 0) {
            console.log('Skipping client ' + clientId + ' (empty products)');
            continue;
        }

        let updated = 0;
        let novaUpdated = 0;

        for (const p of products) {
            const key = (p.name || '').toLowerCase().trim();
            const shared = sharedByName.get(key);

            if (shared) {
                // Обновляем harm
                const oldHarm = parseFloat(p.harm) || 0;
                if (Math.abs(oldHarm - shared.harm) > 0.1) {
                    p.harm = shared.harm;
                    updated++;
                }

                // Обновляем novaGroup если есть в shared и отличается
                if (shared.novaGroup && p.novaGroup !== shared.novaGroup) {
                    p.novaGroup = shared.novaGroup;
                    novaUpdated++;
                }
            }
        }

        if (updated > 0 || novaUpdated > 0) {
            // Сохраняем обновлённые продукты
            await client.query(`
        UPDATE client_kv_store 
        SET v = $1::jsonb, updated_at = NOW()
        WHERE client_id = $2 AND k = 'heys_products'
      `, [JSON.stringify(products), clientId]);

            console.log('Client ' + clientId.slice(0, 8) + '... updated: harm=' + updated + ', novaGroup=' + novaUpdated);
        } else {
            console.log('Client ' + clientId.slice(0, 8) + '... no changes needed');
        }
    }

    await client.end();
    console.log('\nDone!');
}

main().catch(console.error);
