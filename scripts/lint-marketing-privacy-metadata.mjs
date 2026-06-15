#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BOT_FILE = path.join(ROOT, 'yandex-cloud-functions/heys-bot-client/index.js');
const PAYMENTS_FILE = path.join(ROOT, 'yandex-cloud-functions/heys-api-payments/index.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Missing function ${name}`);
  const open = source.indexOf('{', start);
  if (open === -1) throw new Error(`Missing body for function ${name}`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Unclosed function ${name}`);
}

function extractBlockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Missing marker: ${marker}`);
  const open = source.indexOf('{', start + marker.length);
  if (open === -1) throw new Error(`Missing block after marker: ${marker}`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`Unclosed block after marker: ${marker}`);
}

function extractCallObjectContaining(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt === -1) throw new Error(`Missing marker: ${marker}`);

  const callAt = source.lastIndexOf('JSON.stringify(', markerAt);
  if (callAt === -1) throw new Error(`Missing JSON.stringify before marker: ${marker}`);

  const open = source.indexOf('{', callAt);
  if (open === -1 || open > markerAt) {
    throw new Error(`Missing JSON object before marker: ${marker}`);
  }

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`Unclosed JSON object for marker: ${marker}`);
}

function assertNo(pattern, text, label) {
  const match = pattern.exec(text);
  if (match) {
    throw new Error(`${label}: forbidden token "${match[0]}"`);
  }
}

function assertHas(pattern, text, label) {
  if (!pattern.test(text)) throw new Error(`${label}: expected pattern not found`);
}

function checkTelegramLeadHandoff() {
  const source = read(BOT_FILE);
  const handoff = extractFunction(source, 'sendStartLeadHandoff');
  const contactFlow = extractFunction(source, 'createStartLeadFromContact');

  assertHas(/lead_id:\s*\$\{lead\.id\}/, handoff, 'telegram handoff');
  assertHas(/ПДн не отправлены в Telegram/, handoff, 'telegram handoff');
  assertNo(/\blead\.(?:phone|name|email|displayName)\b/, handoff, 'telegram handoff');
  assertNo(/\b(?:normalizedPhone|displayName|clientPhone|clientEmail)\b/, handoff, 'telegram handoff');
  assertNo(/(?:phone|name|email):\s*\$\{lead\./, handoff, 'telegram handoff');

  const handoffLead = extractBlockAfter(contactFlow, 'const lead =');
  assertHas(/\bid:\s*leadId\b/, handoffLead, 'handoff lead object');
  assertNo(/\b(?:phone|name|email|displayName|normalizedPhone)\b/, handoffLead, 'handoff lead object');
}

function checkPaymentMetadata() {
  const source = read(PAYMENTS_FILE);
  const createPayment = extractFunction(source, 'createPayment');
  const applyPaymentStatus = extractFunction(source, 'applyPaymentStatus');

  const yukassaPayload = extractBlockAfter(createPayment, 'const yukassaPayload =');
  const yukassaMetadata = extractBlockAfter(yukassaPayload, 'metadata:');
  assertHas(/\bclient_id:\s*clientId\b/, yukassaMetadata, 'YuKassa metadata');
  assertHas(/\bplan:\s*plan\b/, yukassaMetadata, 'YuKassa metadata');
  assertHas(/\binternal_payment_id:\s*paymentId\b/, yukassaMetadata, 'YuKassa metadata');

  const funnelMetadata = extractCallObjectContaining(applyPaymentStatus, "source: 'yukassa_webhook'");
  assertHas(/\binternal_payment_id:\s*payment\.id\b/, funnelMetadata, 'payment funnel metadata');
  assertHas(/\bexternal_payment_id:\s*externalPaymentId\b/, funnelMetadata, 'payment funnel metadata');
  assertHas(/\bsource:\s*'yukassa_webhook'/, funnelMetadata, 'payment funnel metadata');

  const forbiddenHealth =
    /\b(?:health|profile|dayv2|meal|food|kcal|calorie|weight|height|bmi|glucose|pressure|symptom|diagnosis|medicine|hr_zone|heart_rate)\b/i;
  assertNo(forbiddenHealth, yukassaMetadata, 'YuKassa metadata');
  assertNo(forbiddenHealth, funnelMetadata, 'payment funnel metadata');
}

try {
  checkTelegramLeadHandoff();
  checkPaymentMetadata();
  console.log('marketing privacy metadata lint OK');
} catch (err) {
  console.error(`marketing privacy metadata lint failed: ${err.message}`);
  process.exit(1);
}
