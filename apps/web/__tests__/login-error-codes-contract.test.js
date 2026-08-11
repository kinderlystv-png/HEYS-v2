/**
 * Контракт кодов отказа на входе клиента: SQL → heys_auth_v1.js → экран входа.
 *
 * Зачем. До 2026-08-11 сверки между тремя слоями не было, и это стоило двух
 * живых дефектов сразу: серверная заглушка `pin_login_disabled` и блокировка по
 * номеру `pin_rate_limited` показывались клиенту как «PIN не подошёл». Механизм
 * был с обеих сторон, а соответствие между ними не проверял никто.
 *
 * Тест закрывает три стыка:
 *   1. код, который возвращает актуальная verify_client_pin_v3, обязан быть в
 *      словаре LOGIN_SERVER_ERRORS;
 *   2. код словаря с kind 'explained' обязан иметь ветку на экране входа —
 *      иначе он покажется общим «Не удалось войти», если сервер не прислал
 *      текст;
 *   3. код, который loginClient возвращает сам, обязан иметь ветку на экране.
 *
 * Падение теста означает: на сервере или в auth появился новый код, а решение,
 * что о нём читает человек, не принято.
 */

import fs from 'fs';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '..');
const DATABASE_DIR = path.resolve(WEB_ROOT, '../../database');

const authSource = fs.readFileSync(path.resolve(WEB_ROOT, 'heys_auth_v1.js'), 'utf8');
const screenSource = fs.readFileSync(path.resolve(WEB_ROOT, 'heys_login_screen_v1.js'), 'utf8');

/** Кусок файла между двумя якорями — чтобы не собирать коды из соседних функций. */
function sliceBetween(source, startAnchor, endAnchor) {
    const start = source.indexOf(startAnchor);
    const end = source.indexOf(endAnchor, start);
    expect(start, `не найден якорь: ${startAnchor}`).toBeGreaterThan(-1);
    expect(end, `не найден якорь: ${endAnchor}`).toBeGreaterThan(start);
    return source.slice(start, end);
}

function matchAll(source, pattern) {
    return [...source.matchAll(pattern)].map((m) => m[1]);
}

/**
 * Самая свежая версия verify_client_pin_v3 в репозитории. Имена миграций
 * начинаются с даты, поэтому лексикографическая сортировка = хронологическая.
 */
function readLatestPinFunctionSql() {
    const files = fs
        .readdirSync(DATABASE_DIR)
        .filter((name) => name.endsWith('.sql'))
        .filter((name) => {
            const body = fs.readFileSync(path.join(DATABASE_DIR, name), 'utf8');
            return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(public\.)?verify_client_pin_v3/i.test(body);
        })
        .sort();

    expect(files.length, 'в database/ не найдено ни одной версии verify_client_pin_v3').toBeGreaterThan(0);

    const latest = files[files.length - 1];
    return { file: latest, sql: fs.readFileSync(path.join(DATABASE_DIR, latest), 'utf8') };
}

describe('контракт кодов отказа на входе клиента', () => {
    let dictionary;
    let screenBranchCodes;

    beforeAll(() => {
        // Словарь берём из живого модуля, а не из текста: так тест сломается и
        // при переименовании, и при подмене структуры.
        const window = { HEYS: {}, location: { hostname: 'app.heyslab.ru' } };
        // eslint-disable-next-line no-eval
        eval(authSource);
        dictionary = window.HEYS.auth.LOGIN_SERVER_ERRORS;

        const handler = sliceBetween(
            screenSource,
            'async function handleClientLogin',
            'async function handleCuratorLogin',
        );
        screenBranchCodes = new Set(matchAll(handler, /code === '([a-z0-9_]+)'/g));
    });

    it('словарь экспортирован и у каждого кода известная трактовка', () => {
        expect(dictionary, 'HEYS.auth.LOGIN_SERVER_ERRORS не экспортирован').toBeTruthy();
        const kinds = Object.values(dictionary).map((entry) => entry.kind);
        expect(kinds.length).toBeGreaterThan(0);
        kinds.forEach((kind) => {
            expect(['wrong_pin', 'rate_limit', 'explained']).toContain(kind);
        });
    });

    it('каждый код из актуальной verify_client_pin_v3 есть в словаре', () => {
        const { file, sql } = readLatestPinFunctionSql();
        const sqlCodes = [...new Set(matchAll(sql, /'error',\s*'([a-z0-9_]+)'/g))];

        expect(sqlCodes.length, `в ${file} не найдено ни одного кода отказа`).toBeGreaterThan(0);

        const unknown = sqlCodes.filter((code) => !Object.prototype.hasOwnProperty.call(dictionary, code));
        expect(
            unknown,
            `${file} возвращает коды, которых нет в LOGIN_SERVER_ERRORS (heys_auth_v1.js): ${unknown.join(', ')}. `
            + 'Добавьте их в словарь с трактовкой wrong_pin / rate_limit / explained — иначе клиент покажет их '
            + 'как «PIN не подошёл» или как общее «Не удалось войти».',
        ).toEqual([]);
    });

    it('каждый код с kind explained имеет собственную ветку на экране входа', () => {
        const explained = Object.entries(dictionary)
            .filter(([, entry]) => entry.kind === 'explained')
            .map(([code]) => code);

        expect(explained.length, 'в словаре нет ни одного explained-кода — проверка потеряла смысл').toBeGreaterThan(0);

        const missing = explained.filter((code) => !screenBranchCodes.has(code));
        expect(
            missing,
            `heys_login_screen_v1.js не разбирает коды: ${missing.join(', ')}. Без ветки человек увидит общее `
            + '«Не удалось войти», если сервер не прислал текст.',
        ).toEqual([]);
    });

    it('каждый код, который loginClient возвращает сам, разобран на экране', () => {
        const loginBody = sliceBetween(
            authSource,
            'const LOGIN_SERVER_ERRORS',
            'async function createClientWithPin',
        );
        const returned = new Set([
            ...matchAll(loginBody, /error:\s*'([a-z0-9_]+)'/g),
            ...matchAll(loginBody, /\berror\s*=\s*'([a-z0-9_]+)'/g),
        ]);

        expect(returned.size).toBeGreaterThan(3);

        const missing = [...returned].filter((code) => !screenBranchCodes.has(code));
        expect(
            missing,
            `loginClient возвращает коды без ветки на экране: ${missing.join(', ')}.`,
        ).toEqual([]);
    });

    it('«PIN не подошёл» показывается только на invalid_credentials', () => {
        const handler = sliceBetween(
            screenSource,
            'async function handleClientLogin',
            'async function handleCuratorLogin',
        );

        const calls = matchAll(handler, /(showInvalidPinFeedback)\(/g);
        expect(calls.length, 'реакция «неверный PIN» вызывается больше одного раза — проверьте, в каких ветках')
            .toBe(1);

        const branchIndex = handler.indexOf("code === 'invalid_credentials'");
        const callIndex = handler.indexOf('showInvalidPinFeedback(');
        expect(branchIndex).toBeGreaterThan(-1);
        expect(callIndex).toBeGreaterThan(branchIndex);
        expect(
            handler.slice(branchIndex, callIndex),
            'между веткой invalid_credentials и реакцией «неверный PIN» появилось другое условие',
        ).not.toContain('else if');
    });
});
