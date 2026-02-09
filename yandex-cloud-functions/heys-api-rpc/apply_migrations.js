/**
 * Скрипт для применения миграций к БД
 * Запуск: node apply_migrations.js
 * 
 * Переменные окружения:
 * - PG_USER (default: heys_admin)
 * - PG_PASSWORD (обязательно!)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1000
});

// Миграции для применения (в порядке)
const MIGRATIONS = [
    '2025-01-10_curator_sessions.sql',          // 🔑 Таблица сессий кураторов (КРИТИЧНА!)
    '2026-02-04_update_get_curator_clients.sql',
    '2026-02-04_extend_trials.sql',
    '2026-02-04_admin_extend_subscription.sql',
    '2026-02-08_delete_gamification_events.sql',
    '2026-02-08_trial_machine_fix.sql',
    '2026-02-09_trial_machine_v3.sql',          // 🆕 Trial Machine v3.0
    '2026-02-08_fix_extend_and_curator_clients.sql',
    '2026-02-09_admin_functions_jwt_only.sql',  // 🔐 JWT-only авторизация для admin_* функций (v4.0)
    '2026-02-09_fix_get_client_data_by_session.sql', // 🐛 Fix: remove non-existent clients.created_at
    '2026-02-10_trial_chain_fixes.sql',         // 🔧 Trial chain fixes: JWT params, phone normalization, session management
];

async function main() {
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Подключение к БД успешно\n');

        // 1. Показать текущее состояние клиентов
        console.log('=== ТЕКУЩЕЕ СОСТОЯНИЕ КЛИЕНТОВ ===');
        const clients = await client.query(`
            SELECT id, name, subscription_status, trial_ends_at
            FROM clients
            ORDER BY name
        `);
        clients.rows.forEach(c => {
            const endDate = c.trial_ends_at ? new Date(c.trial_ends_at).toLocaleDateString('ru-RU') : 'N/A';
            console.log(`  ${c.name}: ${c.subscription_status} (до ${endDate})`);
        });
        console.log('');

        // 2. Применить миграции
        console.log('=== ПРИМЕНЕНИЕ МИГРАЦИЙ ===');
        const dbDir = path.join(__dirname, '..', '..', 'database');

        for (const migrationFile of MIGRATIONS) {
            const filePath = path.join(dbDir, migrationFile);
            if (!fs.existsSync(filePath)) {
                console.log(`⚠️  Файл не найден: ${migrationFile}`);
                continue;
            }

            const sql = fs.readFileSync(filePath, 'utf8');
            console.log(`📄 Применяю: ${migrationFile}`);

            try {
                await client.query(sql);
                console.log(`   ✅ Успешно`);
            } catch (e) {
                console.log(`   ❌ Ошибка: ${e.message}`);
            }
        }
        console.log('');

        // 3. Проверить что функции созданы
        console.log('=== ПРОВЕРКА ФУНКЦИЙ ===');
        const functions = [
            'get_curator_clients',
            'admin_extend_trial',
            'admin_get_all_clients',
            'admin_extend_subscription',
            'activate_trial_timer_by_session',
            'admin_activate_trial',
            'admin_get_leads',
            'admin_convert_lead'
        ];

        for (const fn of functions) {
            const check = await client.query(`
                SELECT 1 FROM pg_proc WHERE proname = $1
            `, [fn]);
            const status = check.rows.length > 0 ? '✅' : '❌';
            console.log(`  ${status} ${fn}`);
        }
        console.log('');

        // 4. Тест get_curator_clients
        console.log('=== ТЕСТ get_curator_clients ===');
        try {
            const curatorId = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c';
            const test = await client.query(`SELECT * FROM get_curator_clients($1::UUID)`, [curatorId]);
            console.log(`Найдено клиентов: ${test.rows.length}`);
            test.rows.forEach(c => {
                console.log(`  - ${c.name} (${c.subscription_status})`);
            });
        } catch (e) {
            console.log(`❌ Ошибка: ${e.message}`);
        }
        console.log('');

        console.log('🎉 Готово!');

    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
