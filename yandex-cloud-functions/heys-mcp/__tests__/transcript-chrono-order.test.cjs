'use strict';

/**
 * heys/cf4935: блок стенограммы встаёт по времени, а не в конец файла.
 *
 * Стенограмму пишут несколько сессий сразу, и запись, начатая раньше, приходит
 * позже. appendBlock ставил её в конец — в transcript/2026-09-02.md подряд шли
 * заголовки 20:10, 14:20, 18:45, 18:52. Читают такой файл с середины, и порядок
 * в нём единственный ориентир.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { insertBlockByTime, blockMinutes, appendBlock } = require('../lib/tasks.js');

const heads = (text) =>
  text
    .split('\n')
    .filter((l) => /^##\s*\d{1,2}:\d{2}\b/.test(l))
    .map((l) => l.trim());

test('время заголовка разбирается, ночь до трёх уезжает в конец суток', () => {
  assert.equal(blockMinutes('## 09:40\n\ntext'), 9 * 60 + 40);
  assert.equal(blockMinutes('## 00:15\n\ntext'), 24 * 60 + 15);
  assert.equal(blockMinutes('## 02:59\n\ntext'), 26 * 60 + 59);
  assert.equal(blockMinutes('## 03:00\n\ntext'), 3 * 60);
  assert.equal(blockMinutes('нет заголовка'), null);
  assert.equal(blockMinutes('## 99:99'), null);
});

test('блок встаёт между соседями по времени, а не в конец', () => {
  const file = ['## 09:00', '', 'утро', '', '## 18:45', '', 'вечер'].join('\n');
  const out = insertBlockByTime(file, '## 14:20\n\nдень');
  assert.deepEqual(heads(out), ['## 09:00', '## 14:20', '## 18:45']);
  assert.match(out, /день/);
  assert.match(out, /утро/);
  assert.match(out, /вечер/);
});

test('воспроизводит поломку из transcript/2026-09-02.md и чинит её', () => {
  // Ровно тот порядок, что лежал в файле: 20:10, потом 14:20, потом 18:45.
  let file = '## 20:10\n\nпервый';
  for (const block of ['## 14:20\n\nвторой', '## 18:45\n\nтретий', '## 18:52\n\nчетвёртый']) {
    file = insertBlockByTime(file, block);
  }
  assert.deepEqual(heads(file), ['## 14:20', '## 18:45', '## 18:52', '## 20:10']);
});

test('самый поздний блок дописывается в конец', () => {
  const file = ['## 09:00', '', 'утро', '', '## 12:00', '', 'полдень'].join('\n');
  const out = insertBlockByTime(file, '## 23:30\n\nночь');
  assert.deepEqual(heads(out), ['## 09:00', '## 12:00', '## 23:30']);
});

test('одинаковое время не переставляет уже записанное', () => {
  const file = ['## 12:00', '', 'первый'].join('\n');
  const out = insertBlockByTime(file, '## 12:00\n\nвторой');
  assert.deepEqual(heads(out), ['## 12:00', '## 12:00']);
  assert.ok(out.indexOf('первый') < out.indexOf('второй'));
});

test('блок без времени и пустой файл ведут себя как раньше', () => {
  const file = ['## 09:00', '', 'утро'].join('\n');
  assert.equal(insertBlockByTime(file, 'без заголовка'), appendBlock(file, 'без заголовка'));
  assert.equal(insertBlockByTime('', '## 09:00\n\nутро'), '## 09:00\n\nутро\n');
});

test('файл без единого заголовка принимает блок в конец', () => {
  const out = insertBlockByTime('просто текст', '## 09:00\n\nутро');
  assert.match(out, /просто текст[\s\S]*## 09:00/);
});
