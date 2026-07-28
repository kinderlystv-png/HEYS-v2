'use strict';

const REQUIRED_KEYS = ['YUKASSA_SHOP_ID', 'YUKASSA_SECRET_KEY'];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    console.error('Payments Lockbox payload is unavailable or invalid');
    process.exitCode = 1;
    return;
  }

  const entries = new Map(
    (Array.isArray(payload.entries) ? payload.entries : []).map((entry) => [
      entry?.key,
      entry?.text_value,
    ]),
  );
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = entries.get(key);
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    console.error(`Payments Lockbox is missing required keys: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Payments Lockbox readiness verified');
});
