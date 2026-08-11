/**
 * Ограничитель PIN-входа: блокировка ключуется на КЛИЕНТЕ, не на адресе.
 *
 * Зачем этот тест существует. В `verify_client_pin_v2` счётчик неудач жил на
 * записи клиента. В v3 его заменили на пару (телефон, IP) — и в коде пометили
 * как усиление защиты. Замена оказалась потерей: IP приходит из заголовка
 * `X-Forwarded-For`, который присылает сам клиент (подтверждено 2026-08-11
 * запросом на живой `/leads`), поэтому новый заголовок на каждой попытке даёт
 * новую строку счётчика и блокировка не наступает никогда.
 *
 * Тест проверяет не реализацию, а свойство: пять неудачных попыток по одному
 * номеру приводят к блокировке, ДАЖЕ если каждая пришла с нового адреса.
 * Существуй он раньше — v3 не выехала бы, она бы на нём упала.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { runSql, runSqlBlock } from './_helpers';

const TEST_PHONE = '79995550137';
const TEST_PIN = '4731';

/**
 * Весь сценарий — одним round-trip. Каждый вызов psql уходит в облачный
 * Postgres и стоит секунды; шесть отдельных вызовов упирались в таймаут
 * vitest-воркера, и тест падал не по логике, а по времени.
 */
function runLockoutScenario() {
  return runSqlBlock(`
    DELETE FROM public.clients WHERE phone = '+${TEST_PHONE}';
    INSERT INTO public.clients (id, curator_id, name, phone, pin_hash, pin_failed_attempts, pin_locked_until)
    SELECT gen_random_uuid(), c.id, 'PIN lockout test', '+${TEST_PHONE}',
           crypt('${TEST_PIN}', gen_salt('bf', 12)), 0, NULL
      FROM public.curators c LIMIT 1;

    SELECT 'attempts' AS marker, string_agg(r, ',') AS value FROM (
      SELECT public.verify_client_pin_v3('+${TEST_PHONE}', '0000', ip, 'vitest')->>'error' AS r
        FROM unnest(ARRAY['203.0.113.1','203.0.113.2','203.0.113.3','198.51.100.7','198.51.100.9']) AS ip
    ) t;

    SELECT 'sixth' AS marker,
           public.verify_client_pin_v3('+${TEST_PHONE}', '${TEST_PIN}', '198.51.100.42', 'vitest')->>'error' AS value;

    SELECT 'state' AS marker, pin_failed_attempts || '/' || (pin_locked_until > now()) AS value
      FROM public.clients WHERE phone = '+${TEST_PHONE}';

    DELETE FROM public.clients WHERE phone = '+${TEST_PHONE}';
  `);
}

afterEach(() => {
  runSql(`DELETE FROM public.clients WHERE phone = '+${TEST_PHONE}';`);
});

describe('PIN lockout', () => {
  it('блокирует после пяти неудач, даже когда каждая попытка с нового адреса', () => {
    const out = runLockoutScenario().output;

    // Пять промахов — каждый со своего адреса: ровно тот сценарий, который
    // обходил прежний счётчик по паре (телефон, IP).
    expect(out).toContain('invalid_credentials,invalid_credentials,invalid_credentials,invalid_credentials,invalid_credentials');

    // Шестая попытка — новый адрес и ВЕРНЫЙ код. Обязана упереться в
    // блокировку: иначе счётчик снова не по клиенту.
    expect(out).toMatch(/sixth\s*\|\s*pin_rate_limited/);
    expect(out).toMatch(/state\s*\|\s*5\/t/);
  });
});
