const assert = require('node:assert/strict');
const test = require('node:test');

const { __test: backup } = require('../index.js');
const { executeFullRestore } = require('../restore-client-backup.js');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test('snapshotClientBundle keeps KV and account reads in one repeatable-read snapshot', async () => {
    const live = {
        kv: [{ k: 'heys_profile', v: { name: 'before' }, updated_at: '2026-07-18T00:00:00.000Z' }],
        client: { id: CLIENT_ID, name: 'before' },
    };
    let transactionSnapshot = null;
    const queries = [];

    const dbClient = {
        async query(sql) {
            queries.push(sql);
            if (sql.startsWith('BEGIN TRANSACTION')) {
                transactionSnapshot = clone(live);
                return { rows: [] };
            }
            if (sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM client_kv_store')) {
                const rows = clone(transactionSnapshot.kv);
                live.client.name = 'concurrent-update';
                return { rows };
            }
            if (sql.includes('FROM clients')) {
                return { rows: [clone(transactionSnapshot.client)] };
            }
            return { rows: [] };
        },
    };

    const result = await backup.snapshotClientBundle(dbClient, CLIENT_ID);

    assert.equal(result.kvSnapshot.heys_profile.v.name, 'before');
    assert.equal(result.accountData.client.name, 'before');
    assert.equal(queries.filter((sql) => sql.startsWith('BEGIN TRANSACTION')).length, 1);
    assert.equal(queries.filter((sql) => sql === 'COMMIT').length, 1);
    assert.equal(queries.filter((sql) => sql === 'ROLLBACK').length, 0);
});

test('executeFullRestore writes clients before KV and rolls back when account write fails', async () => {
    const queries = [];
    const committed = [];
    let pending = [];
    let released = 0;

    const client = {
        async query(sql, values) {
            queries.push(sql);
            if (sql === 'BEGIN') {
                pending = [];
                return { rows: [] };
            }
            if (sql.startsWith('INSERT INTO client_kv_store')) {
                pending.push({ kind: 'kv', values });
                return { rows: [] };
            }
            if (sql.startsWith('INSERT INTO clients')) {
                throw new Error('fault-on-clients');
            }
            if (sql === 'COMMIT') {
                committed.push(...pending);
                pending = [];
                return { rows: [] };
            }
            if (sql === 'ROLLBACK') {
                pending = [];
                return { rows: [] };
            }
            return { rows: [] };
        },
        release() {
            released += 1;
        },
    };
    const pool = { connect: async () => client };
    const kvSnapshot = {
        heys_profile: { v: { name: 'snapshot' }, updated_at: '2026-07-18T00:00:00.000Z' },
    };
    const accountData = { client: { id: CLIENT_ID, name: 'snapshot' } };
    const tableDiffs = {
        clients: { toInsert: [], toUpdate: [accountData.client], unchanged: [] },
    };

    await assert.rejects(
        executeFullRestore(
            pool,
            CLIENT_ID,
            kvSnapshot,
            ['heys_profile'],
            tableDiffs,
        ),
        /fault-on-clients/,
    );

    assert.equal(queries.filter((sql) => sql === 'BEGIN').length, 1);
    assert.equal(queries.filter((sql) => sql === 'ROLLBACK').length, 1);
    assert.equal(queries.filter((sql) => sql === 'COMMIT').length, 0);
    assert.equal(queries.some((sql) => sql.startsWith('INSERT INTO client_kv_store')), false);
    assert.deepEqual(committed, []);
    assert.equal(released, 1);
});

test('executeFullRestore commits KV and account rows together on success', async () => {
    const queries = [];
    let released = 0;
    const client = {
        async query(sql) {
            queries.push(sql);
            return { rows: [] };
        },
        release() {
            released += 1;
        },
    };
    const pool = { connect: async () => client };
    const kvSnapshot = {
        heys_profile: { v: { name: 'snapshot' }, updated_at: '2026-07-18T00:00:00.000Z' },
    };
    const accountData = { client: { id: CLIENT_ID, name: 'snapshot' } };
    const tableDiffs = {
        clients: { toInsert: [accountData.client], toUpdate: [], unchanged: [] },
    };

    const result = await executeFullRestore(
        pool,
        CLIENT_ID,
        kvSnapshot,
        ['heys_profile'],
        tableDiffs,
    );

    assert.deepEqual(result, { kvRestored: 1, accountRestored: 1 });
    assert.equal(queries.filter((sql) => sql === 'BEGIN').length, 1);
    assert.equal(queries.filter((sql) => sql === 'COMMIT').length, 1);
    assert.equal(queries.filter((sql) => sql === 'ROLLBACK').length, 0);
    const clientsIdx = queries.findIndex((sql) => sql.startsWith('INSERT INTO clients'));
    const kvIdx = queries.findIndex((sql) => sql.startsWith('INSERT INTO client_kv_store'));
    assert.ok(clientsIdx >= 0 && kvIdx >= 0 && clientsIdx < kvIdx);
    assert.equal(released, 1);
});

test('readClientKvSnapshot omits plaintext v when the row is encrypted', async () => {
    const dbClient = {
        async query() {
            return {
                rows: [{
                    k: 'heys_dayv2_2026-08-14',
                    v: { meals: ['secret'] },
                    v_encrypted: Buffer.from('cipher'),
                    key_version: 1,
                    updated_at: '2026-08-14T00:00:00.000Z',
                }],
            };
        },
    };

    const result = await backup.readClientKvSnapshot(dbClient, CLIENT_ID);
    const entry = result.kvSnapshot['heys_dayv2_2026-08-14'];
    assert.equal(entry.v, undefined);
    assert.equal(entry.v_encrypted_b64, Buffer.from('cipher').toString('base64'));
    assert.equal(entry.key_version, 1);
});
