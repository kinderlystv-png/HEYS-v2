'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const CRON_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'index.js'),
  'utf8',
);

test('morning check-in push opens morning-checkin deep link, not home', () => {
  assert.match(
    CRON_SOURCE,
    /tag:\s*'morning-checkin',\s*url:\s*'\/\?action=morning-checkin'/,
  );
  assert.doesNotMatch(
    CRON_SOURCE,
    /tag:\s*'morning-checkin',\s*url:\s*'\/'/,
  );
});

test('water hint push opens ration tab with water focus, not home', () => {
  assert.match(
    CRON_SOURCE,
    /tag:\s*'water-hint',\s*url:\s*'\/\?tab=ration&focus=water'/,
  );
  assert.doesNotMatch(
    CRON_SOURCE,
    /tag:\s*'water-hint',\s*url:\s*'\/'/,
  );
});
