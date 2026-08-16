const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'coverage']);

function walkJs(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(absolute, output);
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(absolute);
  }
  return output;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function extractCalls(source, name) {
  const calls = [];
  const needle = `${name}(`;
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start === -1) break;
    const open = start + name.length;
    let depth = 0;
    let i = open;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(start, i + 1));
          break;
        }
      }
    }
    from = i + 1;
  }
  return calls;
}

function topLevelArgs(call) {
  const start = call.indexOf('(');
  const end = call.lastIndexOf(')');
  const inner = call.slice(start + 1, end);
  const args = [];
  let current = '';
  let depth = 0;
  for (const char of inner) {
    if (char === '{' || char === '(' || char === '[') depth += 1;
    if (char === '}' || char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

test('push is sent only through webpush.sendNotification', () => {
  const files = walkJs(ROOT);
  const senders = [];
  const forbidden = [];
  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    if (source.includes('webpush.sendNotification(')) senders.push(relative);

    if (/require\(\s*['"]firebase-admin['"]\s*\)/.test(source)) {
      forbidden.push(`${relative}: firebase-admin`);
    }
    if (/require\(\s*['"]apn['"]\s*\)/.test(source)) {
      forbidden.push(`${relative}: apn`);
    }
    if (/admin\.messaging\s*\(/.test(source) || /sendEachForMulticast/.test(source)) {
      forbidden.push(`${relative}: fcm admin send`);
    }
    if (/fcm\.googleapis\.com\/(?:fcm\/send|v1\/)/.test(source)) {
      forbidden.push(`${relative}: direct FCM HTTP`);
    }
    if (/api\.push\.apple\.com/.test(source)) {
      forbidden.push(`${relative}: direct APNs HTTP`);
    }

    for (const call of extractCalls(source, 'webpush.sendNotification')) {
      const args = topLevelArgs(call);
      if (args.length !== 2) {
        forbidden.push(`${relative}: webpush.sendNotification must take (subscription, payload) only`);
      }
      if (args.some((arg) => /\bTopic\b|\btopic\s*:/.test(arg))) {
        forbidden.push(`${relative}: push Topic is not encrypted`);
      }
      if (args.some((arg) => /\bheaders\s*:/.test(arg))) {
        forbidden.push(`${relative}: unencrypted push headers`);
      }
    }
    if (source.includes('webpush.sendNotification(') && !source.includes('curatorHasLivePushConsent')) {
      forbidden.push(`${relative}: curator send/subscribe path missing curatorHasLivePushConsent`);
    }
  }

  assert.deepEqual(
    senders.sort(),
    [
      'heys-api-messages/index.js',
      'heys-api-push/index.js',
      'heys-cron-reminders/index.js',
    ],
    `unexpected push senders: ${JSON.stringify(senders)}`,
  );
  assert.deepEqual(forbidden, [], forbidden.join('\n'));
});
