#!/usr/bin/env node
/**
 * generate-finger-voice.mjs — Wave 4 helper.
 *
 * Генерирует MP3 для phrase bank из heys_fingers_voice_v1.js через Yandex SpeechKit TTS.
 *
 * IAM token: Lockbox secret `fingers-speechkit-key` (key `iam-token` или `sa-key` base64-json).
 *   Fallback: env var YC_IAM_TOKEN или YC_SPEECHKIT_KEY (raw IAM token).
 *
 * CLI:
 *   node apps/web/scripts/generate-finger-voice.mjs                # генерация всех phrase в каталог /public/voice/fingers-ru/
 *   node apps/web/scripts/generate-finger-voice.mjs --voice=jane   # выбрать голос (alena|jane|ermil|...) default 'alena'
 *   node apps/web/scripts/generate-finger-voice.mjs --test         # только первая фраза (smoke)
 *   node apps/web/scripts/generate-finger-voice.mjs --dry-run      # вывести список без HTTP-запросов
 *   node apps/web/scripts/generate-finger-voice.mjs --force        # перезаписать существующие MP3
 *
 * После генерации записывает `public/voice/fingers-ru/voice-manifest.json` для SW precache.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VOICE_DIR = path.join(ROOT, 'public', 'voice', 'fingers-ru');
const PHRASE_BANK_FILE = path.join(ROOT, 'fingers', 'heys_fingers_voice_v1.js');

// ===== CLI =====
const argv = process.argv.slice(2);
const opts = {
  voice: 'alena',
  test: false,
  dryRun: false,
  force: false,
};
for (const a of argv) {
  if (a === '--test') opts.test = true;
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--force') opts.force = true;
  else if (a.startsWith('--voice=')) opts.voice = a.slice('--voice='.length);
}

// ===== Phrase bank extraction =====
// Извлекаем массивы BASE_PHRASES + templated через regex (модуль — IIFE, не ESM).
function extractPhraseBank() {
  const src = fs.readFileSync(PHRASE_BANK_FILE, 'utf8');
  const phrases = [];
  // Match { id: '...', text: '...' }
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*text:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    phrases.push({ id: m[1], text: m[2] });
  }
  // Templated rest_*sec
  const restMatches = src.matchAll(/REST_DURATIONS\s*=\s*\[([\d,\s]+)\]/g);
  for (const r of restMatches) {
    const nums = r[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    for (const sec of nums) {
      const id = 'cue.rest_' + sec + 'sec';
      if (!phrases.find((p) => p.id === id)) {
        phrases.push({ id, text: restToText(sec) });
      }
    }
  }
  // Templated set_NofM (N∈1..6, M∈3..6)
  for (let m2 = 3; m2 <= 6; m2++) {
    for (let n = 1; n <= m2; n++) {
      const id = 'cue.set_' + n + 'of' + m2;
      if (!phrases.find((p) => p.id === id)) {
        phrases.push({ id, text: 'Подход ' + n + ' из ' + m2 + '.' });
      }
    }
  }
  return phrases;
}

function restToText(sec) {
  if (sec < 60) return 'Отдых ' + sec + ' секунд.';
  if (sec === 60) return 'Отдых одна минута.';
  if (sec === 90) return 'Отдых полторы минуты.';
  if (sec === 120) return 'Отдых две минуты.';
  if (sec === 180) return 'Отдых три минуты.';
  return 'Отдых ' + Math.floor(sec / 60) + ' минут.';
}

// ===== IAM token =====
function getIamToken() {
  // 1) Env var (если задан напрямую)
  if (process.env.YC_IAM_TOKEN) return { token: process.env.YC_IAM_TOKEN, folderId: process.env.YC_FOLDER_ID || '' };
  if (process.env.YC_SPEECHKIT_KEY) return { token: process.env.YC_SPEECHKIT_KEY, folderId: process.env.YC_FOLDER_ID || '' };
  // 2) Lockbox
  try {
    const out = execSync('yc lockbox payload get fingers-speechkit-key --format json', { encoding: 'utf8', timeout: 15000 });
    const payload = JSON.parse(out);
    const entries = payload.entries || [];
    const tokenEntry = entries.find((e) => e.key === 'iam-token') || entries.find((e) => e.key === 'sa-key');
    if (tokenEntry) {
      if (tokenEntry.key === 'iam-token') return { token: tokenEntry.text_value, folderId: process.env.YC_FOLDER_ID || '' };
      // sa-key → нужно exchange via yc iam create-token
      const saJson = Buffer.from(tokenEntry.text_value, 'base64').toString('utf8');
      const tmp = '/tmp/fingers-sa-key.json';
      fs.writeFileSync(tmp, saJson, { mode: 0o600 });
      try {
        const t = execSync('yc iam create-token --service-account-key ' + tmp, { encoding: 'utf8', timeout: 15000 }).trim();
        return { token: t, folderId: process.env.YC_FOLDER_ID || '' };
      } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
    }
  } catch (e) {
    console.error('[generate-finger-voice] Lockbox недоступен:', e.message);
  }
  throw new Error('IAM token не найден: ни env YC_IAM_TOKEN/YC_SPEECHKIT_KEY, ни Lockbox secret fingers-speechkit-key.');
}

// ===== Yandex SpeechKit POST =====
function synthesize({ text, voice, folderId, iamToken }) {
  return new Promise((resolve, reject) => {
    const form = new URLSearchParams({
      text,
      voice,
      lang: 'ru-RU',
      format: 'mp3',
      sampleRateHertz: '48000',
      ...(folderId ? { folderId } : {}),
    }).toString();
    const req = https.request({
      method: 'POST',
      hostname: 'tts.api.cloud.yandex.net',
      path: '/speech/v1/tts:synthesize',
      headers: {
        Authorization: 'Bearer ' + iamToken,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('SpeechKit HTTP ' + res.statusCode + ': ' + Buffer.concat(chunks).toString('utf8').slice(0, 300)));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.write(form);
    req.end();
  });
}

// ===== Main =====
async function main() {
  const phrases = extractPhraseBank();
  console.log('[generate-finger-voice] phrases:', phrases.length, '| voice:', opts.voice, '| dryRun:', opts.dryRun);
  if (opts.test) phrases.splice(1);

  if (!opts.dryRun) {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
  }

  let token, folderId;
  if (!opts.dryRun) {
    const auth = getIamToken();
    token = auth.token; folderId = auth.folderId;
  }

  const manifest = { generatedAt: new Date().toISOString(), voice: opts.voice, files: [] };
  let okCount = 0, skipCount = 0;
  for (const p of phrases) {
    const outFile = path.join(VOICE_DIR, p.id + '.mp3');
    if (!opts.force && fs.existsSync(outFile)) {
      skipCount++;
      manifest.files.push({ id: p.id, path: '/voice/fingers-ru/' + p.id + '.mp3', skipped: true });
      continue;
    }
    if (opts.dryRun) {
      console.log('  [dry]', p.id, '←', p.text);
      manifest.files.push({ id: p.id, path: '/voice/fingers-ru/' + p.id + '.mp3', dryRun: true });
      continue;
    }
    try {
      const audio = await synthesize({ text: p.text, voice: opts.voice, folderId, iamToken: token });
      fs.writeFileSync(outFile, audio);
      okCount++;
      manifest.files.push({ id: p.id, path: '/voice/fingers-ru/' + p.id + '.mp3', bytes: audio.length });
      console.log('  [ok]', p.id, '(' + audio.length + ' bytes)');
    } catch (e) {
      console.error('  [err]', p.id, ':', e.message);
      manifest.files.push({ id: p.id, path: '/voice/fingers-ru/' + p.id + '.mp3', error: e.message });
    }
  }

  if (!opts.dryRun) {
    fs.writeFileSync(path.join(VOICE_DIR, 'voice-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('[generate-finger-voice] done. ok:', okCount, '| skipped:', skipCount, '| total:', phrases.length);
  } else {
    console.log('[generate-finger-voice] dry-run done. ', phrases.length, 'phrases planned.');
  }
}

main().catch((e) => {
  console.error('[generate-finger-voice] FATAL:', e.message);
  process.exit(1);
});
