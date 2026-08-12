/**
 * Unit tests for trial candidate purge-warn copy (heys/8958ff).
 * No network / DB — text helpers only.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { purgeWarnText, purgeWarnButtons } = require('./index.js')._test;

describe('purgeWarnText', () => {
  it('is anonymized (no name placeholder)', () => {
    const text = purgeWarnText(2);
    assert.match(text, /Черновик анкеты HEYS/);
    assert.doesNotMatch(text, /\$\{|undefined/);
    assert.match(text, /Код из того сообщения/);
  });

  it('clamps days into 1..3', () => {
    assert.match(purgeWarnText(0), /через 2 дн/);
    assert.match(purgeWarnText(1), /через 1 дн/);
    assert.match(purgeWarnText(2), /через 2 дн/);
    assert.match(purgeWarnText(9), /через 3 дн/);
  });
});

describe('purgeWarnButtons', () => {
  it('points to intake entry', () => {
    const markup = purgeWarnButtons();
    const url = markup.inline_keyboard[0][0].url;
    assert.match(url, /intake=1/);
  });
});
