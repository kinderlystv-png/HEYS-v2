// Панель куратора: серверный контракт.
//
// Главное правило зоны — числа у куратора и у клиента совпадают. Оно держится
// на том, что сервер отдаёт СЫРЬЁ, а считает тот же движок, что и у клиента.
// Значит окно обязано отдать всё, из чего движок собирает расход дня: минуты
// по зонам пульса (а не одну сумму), быт, шаги, вес с признаком измеренности.
// Стоит выкинуть любое из них — панель посчитает своё число, и правило падает
// молча, потому что оба числа выглядят правдоподобно.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SQL = fs.readFileSync(
  path.join(ROOT, 'scripts/db/migrations/2026-08-30_curator_panel_window_and_norm_context.sql'),
  'utf8'
);
const RPC = fs.readFileSync(
  path.join(ROOT, 'yandex-cloud-functions/heys-api-rpc/index.js'),
  'utf8'
);
const API = fs.readFileSync(path.resolve(__dirname, '../heys_yandex_api_v1.js'), 'utf8');
const TDEE = fs.readFileSync(path.resolve(__dirname, '../heys_tdee_v1.js'), 'utf8');

const FNS = ['get_curator_clients_window', 'get_curator_clients_norm_context'];

describe('панель куратора · серверный контракт', () => {
  it('окно отдаёт всё, из чего движок собирает расход дня', () => {
    // Именно этот набор читает HEYS.TDEE.calculate. Сумма минут тренировки
    // расход не задаёт: он считается по зонам.
    for (const field of ['zone_min', 'household_min', 'steps', 'weight_morning']) {
      expect(SQL, field).toContain(field);
    }
    expect(TDEE).toContain('training.z');
  });

  it('свои METы зон едут вместе с профилем', () => {
    // Без них панель посчитает по умолчанию 2.5/6/8/10 и разойдётся с клиентом.
    expect(SQL).toContain('hr_zones');
    expect(SQL).toContain("kv.k = 'heys_hr_zones'");
    expect(TDEE).toContain("lsGet('heys_hr_zones'");
  });

  it('профиль отдаёт всё, из чего считается базовый обмен', () => {
    // Mifflin-St Jeor: вес, рост, возраст, пол. Плюс дефицит — он делает из
    // расхода норму.
    for (const field of ['weight', 'height', 'age', 'gender', 'deficit_pct_target']) {
      expect(SQL, field).toContain(field);
    }
  });

  it('возраст едет и числом, и датой рождения', () => {
    // В блобах встречается зашитое age, разошедшееся с birthDate на годы.
    // Правило выбора живёт в движке, сервер за него не решает.
    expect(SQL).toContain('birth_date');
    expect(TDEE).toContain('birthDate');
  });

  it('вес несёт признак измеренности, а поправка расчётный вес не берёт', () => {
    // Поправка меряет расхождение расчёта с фактом; подставленное число фактом
    // не является.
    expect(SQL).toContain('weight_measured');
    expect(SQL).toContain('weightMorningEstimated');
  });

  it('талия едет с окном — без неё не отличить перестройку от застоя', () => {
    expect(SQL).toContain('waist');
    expect(SQL).toContain("'measurements' -> 'waist'");
  });

  it('окно ограничено сверху — иначе это выгрузка всей истории всех клиентов', () => {
    expect(SQL).toMatch(/LEAST\(p_to, p_from \+ INTERVAL '61 day'\)/);
  });

  it('обе функции read-only и проверяют владельца', () => {
    const window = SQL.slice(SQL.indexOf('CREATE FUNCTION public.get_curator_clients_window'));
    expect((SQL.match(/SECURITY DEFINER/g) || []).length).toBe(2);
    expect((SQL.match(/STABLE/g) || []).length).toBe(2);
    expect((SQL.match(/c\.curator_id = p_curator_id/g) || []).length).toBe(2);
    // Ни одной записи: панель только смотрит.
    expect(window).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('обе функции объявлены кураторскими и с типами параметров', () => {
    for (const fn of FNS) {
      // CURATOR_ONLY_FUNCTIONS — иначе 403 и p_curator_id не подставится из JWT.
      const curatorList = RPC.slice(
        RPC.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
        RPC.indexOf('const CURATOR_AUDIT_SKIP')
      );
      expect(curatorList, fn).toContain(`'${fn}'`);
      // Типы: без них параметры уедут в SQL нетипизированными.
      expect(RPC, fn).toContain(`'${fn}': {`);
    }
    expect(RPC).toContain("'p_from': '::date'");
    expect(RPC).toContain("'p_to': '::date'");
  });

  it('агрегаты по всем клиентам не пишут аудит на одного клиента', () => {
    // У этих вызовов нет единого target client_id — как и у посуточной сводки.
    const skip = RPC.slice(RPC.indexOf('const CURATOR_AUDIT_SKIP'));
    for (const fn of FNS) expect(skip, fn).toContain(`'${fn}'`);
  });

  it('клиентские обёртки есть и отдают массив, а не падают', () => {
    expect(API).toContain('getClientsWindow');
    expect(API).toContain('getClientsNormContext');
    const fn = API.slice(API.indexOf('async function getClientsWindow'), API.indexOf('async function getClientsNormContext'));
    expect(fn).toContain('Array.isArray(data) ? data : []');
  });
});
