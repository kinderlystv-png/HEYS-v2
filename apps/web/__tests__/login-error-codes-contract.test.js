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

const PIN_FUNCTION_DEFINITION = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(public\.)?verify_client_pin_v3/i;
const MIGRATION_DATE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Самая свежая версия verify_client_pin_v3 в репозитории. Выбор: дата в имени,
 * при нескольких файлах за день — лексикографический хвост (= порядок apply
 * по sorted filename). Файл без даты — явный отказ: иначе сверка ушла бы
 * молча не на тот SQL.
 */
function readLatestPinFunctionSql() {
    const candidates = fs
        .readdirSync(DATABASE_DIR)
        .filter((name) => name.endsWith('.sql'))
        .filter((name) => PIN_FUNCTION_DEFINITION.test(fs.readFileSync(path.join(DATABASE_DIR, name), 'utf8')));

    expect(
        candidates.length,
        'в database/ не найдено ни одного файла с CREATE OR REPLACE FUNCTION verify_client_pin_v3. '
        + 'Либо функцию переименовали, либо миграции переехали — сверка кодов входа сейчас не проверяет ничего.',
    ).toBeGreaterThan(0);

    const undated = candidates.filter((name) => !MIGRATION_DATE.test(name));
    expect(
        undated,
        `миграции verify_client_pin_v3 без даты в имени: ${undated.join(', ')}. Порядок версий определить нельзя — `
        + 'переименуйте по образцу ГГГГ-ММ-ДД_описание.sql.',
    ).toEqual([]);

    // В один день несколько CREATE OR REPLACE — нормально (incremental).
    // Актуальная = последняя по лексикографическому имени: так же идёт apply
    // по sorted filename в database/. Не по дате mtime и не «первая попавшаяся».
    const file = candidates.sort().at(-1);
    const fullSql = fs.readFileSync(path.join(DATABASE_DIR, file), 'utf8');

    // В одном файле могут быть и verify_client_pin_v3, и login_client_v1 — берём только v3.
    const fnStart = fullSql.search(PIN_FUNCTION_DEFINITION);
    expect(fnStart, `в ${file} не найден verify_client_pin_v3`).toBeGreaterThan(-1);
    const fnTail = fullSql.slice(fnStart);
    const fnEndMatch = fnTail.slice(1).search(
        /\nCREATE\s+OR\s+REPLACE\s+FUNCTION\s+(public\.)?(?!verify_client_pin_v3)/i,
    );
    const sql = fnEndMatch >= 0 ? fnTail.slice(0, fnEndMatch + 1) : fnTail;

    expect(
        PIN_FUNCTION_DEFINITION.test(sql),
        `выбранный фрагмент ${file} не содержит verify_client_pin_v3.`,
    ).toBe(true);

    return { file, sql };
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

    it('«PIN не подошёл» по умолчанию не показывается на invalid_credentials', () => {
        const handler = sliceBetween(
            screenSource,
            'async function handleClientLogin',
            'async function handleCuratorLogin',
        );

        const calls = matchAll(handler, /(showInvalidPinFeedback)\(/g);
        expect(calls.length, 'реакция на invalid_credentials вызывается больше одного раза — проверьте ветки')
            .toBe(1);

        const branchIndex = handler.indexOf("code === 'invalid_credentials'");
        const callIndex = handler.indexOf('showInvalidPinFeedback(');
        expect(branchIndex).toBeGreaterThan(-1);
        expect(callIndex).toBeGreaterThan(branchIndex);
        expect(
            handler.slice(branchIndex, callIndex),
            'между веткой invalid_credentials и реакцией появилось другое условие',
        ).not.toContain('else if');

        const invalidBranch = handler.slice(branchIndex, handler.indexOf('} else if', callIndex));
        expect(invalidBranch).toContain('showInvalidPinFeedback()');
        expect(invalidBranch).not.toContain('Не удалось войти');
        expect(invalidBranch).not.toContain("'PIN не подошёл'");
    });

    /**
     * Строка контракта login «слова на экране», решение 31 августа: «Блокировка
     * входа — состояние экрана… Разный вес разным отказам: в блокировке человек
     * не может ничего, и единственный выход к живому куратору не может быть
     * набран тем же кеглем, что „код не подошёл“».
     *
     * До 1 сентября оба отказа приходили одной строкой в общий слот ошибки.
     * Здесь сторожится развилка: отсчёт локального ограничителя остаётся
     * строкой (выход из него — подождать), серверная блокировка без отсчёта
     * разворачивается карточкой (выход из неё — куратор).
     */
    it('блокировка входа — состояние экрана, а не строка ошибки', () => {
        const handler = sliceBetween(
            screenSource,
            'async function handleClientLogin',
            'async function handleCuratorLogin',
        );

        const branch = sliceBetween(handler, "if (code === 'rate_limited')", "} else if (code ===");
        // Отсчёт — строка ошибки: карточка тут не поднимается.
        expect(branch).toContain('Подождите ${sec}с');
        expect(branch).toMatch(/if \(sec > 0\) \{[\s\S]*setErr\(`Слишком много попыток\. Подождите/);
        // Без отсчёта — карточка, и слот ошибки при ней пуст: две подачи одного
        // отказа рядом читались бы как два разных отказа.
        expect(branch).toContain('setRateBlocked(true)');
        expect(branch.slice(branch.indexOf('setRateBlocked(true)'))).toContain("setErr('')");

        // Карточка несёт заголовок и причину отдельными строками — иначе вес
        // отказа снова сравнялся бы со строкой ошибки.
        expect(screenSource).toContain("'heys-auth-lockout__title' }, 'Слишком много попыток входа'");
        expect(screenSource).toContain("'heys-auth-lockout__body' }, 'Напишите куратору — он снимет блокировку.'");
        // Новая попытка снимает блокировку: иначе карточка переживёт и смену
        // номера, и успешный вход.
        expect(handler.slice(0, handler.indexOf("if (code === 'rate_limited')")))
            .toContain('setRateBlocked(false)');
    });
});
