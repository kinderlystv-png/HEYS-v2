/**
 * Подзаголовок шапки мессенджера: состояние ответа, а не время реплики.
 *
 * Механика дизайнера 13 сентября: отметка о прочтении появляется, когда
 * собеседник открыл наше последнее сообщение. Строка «отвечает обычно за час»
 * в продукте невозможна — среднее время ответа нигде не считается, и обещать
 * его нельзя; проверка это закрепляет, чтобы строка не завелась случайно.
 *
 * Слово без рода: пола куратора в базе нет, и «прочитала» у куратора-мужчины
 * было бы ошибкой на каждом экране (решение владельца 14 сентября).
 */
import fs from 'fs';
import path from 'path';

import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  // eslint-disable-next-line no-eval
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

/** Сегодняшнее время в ISO — форматирование часов зависит от «сегодня ли это». */
function today(hours, minutes) {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

const message = (role, hh, mm, readAt = null) => ({
  sender_role: role,
  created_at: today(hh, mm),
  read_at: readAt,
});

describe('подзаголовок треда', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('загрузка и пустой диалог говорят о себе', () => {
    const { getThreadSubtitle } = loadInternals();
    expect(getThreadSubtitle([], true, 'client')).toBe('История загружается');
    expect(getThreadSubtitle([], false, 'client')).toBe('Диалог пока пуст');
  });

  it('своё последнее сообщение прочитано — говорим когда, и без рода', () => {
    const { getThreadSubtitle } = loadInternals();
    const messages = [
      message('client', 9, 10, today(9, 15)),
      message('curator', 9, 20),
    ];
    const subtitle = getThreadSubtitle(messages, false, 'client');
    expect(subtitle).toMatch(/^прочитано · /);
    expect(subtitle).not.toMatch(/прочитала|прочитал\b/);
  });

  it('время берётся от прочтения, а не от отправки', () => {
    const { getThreadSubtitle, } = loadInternals();
    const readSubtitle = getThreadSubtitle(
      [message('client', 9, 10, today(14, 40))],
      false,
      'client',
    );
    const sentSubtitle = getThreadSubtitle([message('client', 9, 10)], false, 'client');
    expect(readSubtitle).not.toBe(sentSubtitle);
    expect(readSubtitle).toContain('14:40');
  });

  it('своё последнее не прочитано — про прочтение молчим', () => {
    const { getThreadSubtitle } = loadInternals();
    const messages = [
      message('client', 9, 10, today(9, 15)),
      message('client', 9, 30),
    ];
    expect(getThreadSubtitle(messages, false, 'client')).toMatch(/^Последнее сообщение /);
  });

  it('куратор смотрит на свои сообщения, а не на клиентские', () => {
    const { getThreadSubtitle } = loadInternals();
    const messages = [
      message('client', 9, 10, today(9, 15)),
      message('curator', 9, 30, today(9, 45)),
    ];
    expect(getThreadSubtitle(messages, false, 'curator')).toContain('9:45');
    // Клиент в том же треде видит прочтение СВОЕГО сообщения, в 9:15.
    expect(getThreadSubtitle(messages, false, 'client')).toContain('9:15');
  });

  it('своих сообщений в треде нет — прежняя строка про последнюю реплику', () => {
    const { getThreadSubtitle } = loadInternals();
    const messages = [message('curator', 9, 30)];
    expect(getThreadSubtitle(messages, false, 'client')).toMatch(/^Последнее сообщение /);
  });

  it('обещания «отвечает обычно за N» в продукте нет', () => {
    // Величины, из которой её считать, не существует: среднее время ответа
    // куратора нигде не копится. Строка не должна завестись «по кадру».
    // Ищем строкой кода, а не любым упоминанием: почему её нет, в самом файле
    // написано комментарием.
    expect(messengerSource).not.toMatch(/['"`]отвечает обычно/);
  });
});
