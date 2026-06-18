// @vitest-environment node

import fs from 'fs';
import path from 'path';
import Module, { createRequire } from 'module';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class S3Client {},
  DeleteObjectCommand: class DeleteObjectCommand {},
  PutObjectCommand: class PutObjectCommand {},
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

const require = createRequire(import.meta.url);
const originalModuleLoad = Module._load;

const originalWindow = global.window;
const originalHEYS = global.HEYS;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalLocalStorage = global.localStorage;
const originalFetch = global.fetch;
const originalLogControl = global.__heysLogControl;

function mockStorage() {
  const store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
}

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

function loadCloudFunction(relativePath) {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@aws-sdk/client-s3') {
      return {
        S3Client: class S3Client {},
        DeleteObjectCommand: class DeleteObjectCommand {},
        PutObjectCommand: class PutObjectCommand {},
      };
    }
    if (request === 'web-push') {
      return { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
    }
    if (request === 'pg') {
      return { Pool: class Pool {} };
    }
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    const resolved = require.resolve(relativePath);
    delete require.cache[resolved];
    return require(relativePath);
  } finally {
    Module._load = originalModuleLoad;
  }
}

function loadStorageMedia() {
  global.window = global;
  global.__heysLogControl = { isEnabled: () => false };
  global.localStorage = mockStorage();
  setNavigator({ onLine: true });
  global.HEYS = {
    YandexAPI: { CONFIG: { API_URL: 'https://api.example.test' } },
    auth: { getSessionToken: () => 'client-session' },
  };
  const src = fs.readFileSync(path.resolve(__dirname, '../heys_storage_photos_v1.js'), 'utf8');
  eval(src);
  return global.HEYS.StorageMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  global.window = originalWindow;
  global.HEYS = originalHEYS;
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
  global.localStorage = originalLocalStorage;
  global.fetch = originalFetch;
  global.__heysLogControl = originalLogControl;
  Module._load = originalModuleLoad;
});

describe('messenger audio media contract', () => {
  it('allows Yandex Object Storage as an audio media source in CSP', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const mediaSrc = html.match(/media-src\s+([^;"]+)/)?.[0] || '';

    expect(mediaSrc).toContain("media-src 'self' blob:");
    expect(mediaSrc).toContain('https://storage.yandexcloud.net');
    expect(mediaSrc).toContain('https://*.storage.yandexcloud.net');
  });

  it('accepts voice upload metadata and stores it under voice prefix', () => {
    const api = loadCloudFunction('../../../yandex-cloud-functions/heys-api-photos/index.js')._test;
    expect(api.normalizeUploadMeta({ media_type: 'audio', content_type: 'audio/webm' })).toEqual({
      contentType: 'audio/webm',
      mediaType: 'audio',
      ext: 'webm',
    });
    expect(api.normalizeUploadMeta({ media_type: 'audio', content_type: 'audio/ogg;codecs=opus' })).toEqual({
      contentType: 'audio/ogg',
      mediaType: 'audio',
      ext: 'ogg',
    });
    expect(api.normalizeUploadMeta({ media_type: 'audio', content_type: 'audio/wav' })).toEqual({
      contentType: 'audio/wav',
      mediaType: 'audio',
      ext: 'wav',
    });

    const key = api.buildKey({
      clientId: 'client_1',
      date: '2026-06-18',
      mealId: 'msg-a1',
      ext: 'webm',
      mediaType: 'audio',
    });
    expect(key).toMatch(/^client_1\/2026-06-18\/voice\/msg-a1\/[a-f0-9]+\.webm$/);
  });

  it('rejects tiny or malformed audio payloads before storing', () => {
    const api = loadCloudFunction('../../../yandex-cloud-functions/heys-api-photos/index.js')._test;
    const webmLike = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.alloc(api.MIN_AUDIO_BYTES, 0),
    ]);
    const wavLike = Buffer.concat([
      Buffer.from('RIFF____WAVEfmt ', 'ascii'),
      Buffer.alloc(api.MIN_AUDIO_BYTES, 0),
    ]);
    const emptyDataUrlGarbage = Buffer.from('data:audio/webm;base64,', 'base64');

    expect(api.hasAudioSignature(webmLike, 'audio/webm')).toBe(true);
    expect(api.hasAudioSignature(wavLike, 'audio/wav')).toBe(true);
    expect(api.hasAudioSignature(emptyDataUrlGarbage, 'audio/webm')).toBe(false);
    expect(api.hasAudioSignature(Buffer.alloc(10), 'audio/webm')).toBe(false);
    expect(api.parseUploadData('data:audio/webm;base64,', 'image/jpeg')).toEqual({
      realB64: '',
      realContentType: 'audio/webm',
    });
  });

  it('validates audio attachments for message send and push badges', () => {
    const api = loadCloudFunction('../../../yandex-cloud-functions/heys-api-messages/index.js')._test;
    const audio = {
      type: 'audio',
      url: 'https://heys-photos.storage.yandexcloud.net/client/voice.webm',
      path: 'client/date/voice/msg/voice.webm',
      mime: 'audio/ogg;codecs=opus',
      duration_ms: 3200,
      size_bytes: 42_000,
      transcript_status: 'queued',
    };

    expect(api.validateAttachments([audio])).toEqual({ ok: true });
    expect(api.buildAttachmentBadge([audio])).toBe(' 🎙️');
    expect(api.validateAttachments([{ ...audio, duration_ms: api.MAX_AUDIO_DURATION_MS + 1 }])).toEqual({
      ok: false,
      error: 'invalid_audio_duration',
    });
    expect(api.validateAttachments([{ ...audio, transcript_status: 'done-ish' }])).toEqual({
      ok: false,
      error: 'invalid_transcript_status',
    });
    expect(api.validateAttachments([{ ...audio, transcript_text: 'x'.repeat(api.MAX_TRANSCRIPT_TEXT_LENGTH + 1) }])).toEqual({
      ok: false,
      error: 'invalid_transcript_text',
    });
    expect(api.stripClientTranscriptFields({
      ...audio,
      transcript_status: 'ready',
      transcript_text: 'client spoof',
      transcript_provider: 'other',
      transcript_error: 'nope',
    })).toMatchObject({
      type: 'audio',
      mime: 'audio/ogg',
      transcript_status: 'none',
    });
    expect(api.estimateSpeechKitCost(1000, 0.25)).toEqual({
      billableSeconds: 15,
      estimatedCostRub: 0.25,
    });
  });

  it('casts curator transcription-consent IP through nullable text before inet', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-messages/index.js'),
      'utf8',
    );

    expect(source).toContain("NULLIF($5::text, '')::inet");
    expect(source).not.toContain("$5 <> ''");
  });

  it('builds SpeechKit recognition payload from object storage path', () => {
    const previousFolderId = process.env.SPEECHKIT_FOLDER_ID;
    const previousBucket = process.env.S3_PHOTOS_BUCKET;
    process.env.SPEECHKIT_FOLDER_ID = 'folder-test';
    process.env.S3_PHOTOS_BUCKET = 'heys-photos';
    try {
      const worker = loadCloudFunction('../../../yandex-cloud-functions/heys-cron-speechkit-transcribe/index.js')._test;
      const payload = worker.buildRecognitionPayload({
        attachment_path: 'client/date/voice/msg/voice.ogg',
        mime: 'audio/ogg',
      });
      const wavPayload = worker.buildRecognitionPayload({
        attachment_path: 'client/date/voice/msg/voice.wav',
        mime: 'audio/wav',
      });

      expect(payload).toMatchObject({
        config: {
          folderId: 'folder-test',
          specification: {
            languageCode: 'ru-RU',
            audioEncoding: 'OGG_OPUS',
          },
        },
        audio: {
          uri: 'https://storage.yandexcloud.net/heys-photos/client/date/voice/msg/voice.ogg',
        },
      });
      expect(wavPayload).toMatchObject({
        config: {
          specification: {
            audioEncoding: 'LINEAR16_PCM',
            sampleRateHertz: 16000,
          },
        },
        audio: {
          uri: 'https://storage.yandexcloud.net/heys-photos/client/date/voice/msg/voice.wav',
        },
      });
    } finally {
      if (previousFolderId === undefined) delete process.env.SPEECHKIT_FOLDER_ID;
      else process.env.SPEECHKIT_FOLDER_ID = previousFolderId;
      if (previousBucket === undefined) delete process.env.S3_PHOTOS_BUCKET;
      else process.env.S3_PHOTOS_BUCKET = previousBucket;
    }
  });

  it('classifies retryable SpeechKit start errors without retrying auth/client failures', () => {
    const worker = loadCloudFunction('../../../yandex-cloud-functions/heys-cron-speechkit-transcribe/index.js')._test;

    expect(worker.isTransientSpeechkitError({ status: 429, message: 'Too Many Requests' })).toBe(true);
    expect(worker.isTransientSpeechkitError({ status: 503, message: 'Service Unavailable' })).toBe(true);
    expect(worker.isTransientSpeechkitError(new Error('fetch failed: ECONNRESET'))).toBe(true);
    expect(worker.isTransientSpeechkitError({ status: 401, message: 'Unauthorized' })).toBe(false);
    expect(worker.isTransientSpeechkitError({ status: 400, message: 'Bad Request' })).toBe(false);
  });

  it('claims SpeechKit processing jobs with row locks and a short lease', () => {
    const workerSource = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-cron-speechkit-transcribe/index.js'),
      'utf8',
    );

    expect(workerSource).toContain('FOR UPDATE SKIP LOCKED');
    expect(workerSource).toContain('SPEECHKIT_PROCESSING_LEASE_SECONDS');
    expect(workerSource).toContain('speechkit_operation_timeout');
  });

  it('locks message rows before rewriting attachment transcripts', () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../../database/2026-06-18_message_transcription_pilot.sql'),
      'utf8',
    );

    expect(migration).toContain('WHERE m.id = p_message_id');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('jsonb_array_elements(v_attachments)');
    expect(migration).toContain('v_attachment_found');
    expect(migration).toContain('NOT v_attachment_found');
  });

  it('prepares unsupported recorder audio for SpeechKit before upload independent of consent', () => {
    const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');

    expect(messengerSource).toContain('const shouldPrepareForTranscription = true;');
    expect(messengerSource).toContain('convertBlobToSpeechkitWav(uploadBlob)');
  });

  it('refreshes pending voice transcripts on foreground and with a tighter watch', () => {
    const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');

    expect(messengerSource).toContain('function pendingTranscriptKey(messages)');
    expect(messengerSource).toContain("status === 'queued' || status === 'processing'");
    expect(messengerSource).toContain("window.addEventListener('focus', refreshIfVisible)");
    expect(messengerSource).toContain('schedule(1200)');
    expect(messengerSource).toContain('attempts < 8 ? 3500 : 10000');
  });

  it('StorageMedia.uploadAudio posts to /photos/upload with auth-safe payload', async () => {
    const blob = new Blob(['voice'], { type: 'audio/ogg;codecs=opus' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        url: 'https://heys-photos.storage.yandexcloud.net/client/date/voice/msg/a.webm',
        path: 'client/date/voice/msg/a.webm',
        media_type: 'audio',
        mime: 'audio/ogg',
        size_bytes: blob.size,
      }),
    });
    const media = loadStorageMedia();

    const result = await media.uploadAudio(
      'data:audio/webm;base64,dm9pY2U=',
      'client-id',
      '2026-06-18',
      'msg-a',
      { blob, durationMs: 1200 },
    );

    expect(result.uploaded).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/photos/upload');
    expect(options.credentials).toBe('include');
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({
      media_type: 'audio',
      client_id: 'client-id',
      date: '2026-06-18',
      meal_id: 'msg-a',
      content_type: 'audio/ogg',
      duration_ms: 1200,
      session_token: 'client-session',
    });
    expect(payload.data).toBe('dm9pY2U=');
    expect(payload.data).not.toMatch(/^data:/);
  });

  it('StorageMedia.uploadAudio retries via /media/upload when /photos/upload rejects audio', async () => {
    const blob = new Blob(['voice'], { type: 'audio/webm' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'unsupported_audio_type' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          url: 'https://heys-photos.storage.yandexcloud.net/client/date/voice/msg/a.webm',
          path: 'client/date/voice/msg/a.webm',
          media_type: 'audio',
          mime: 'audio/webm',
          size_bytes: blob.size,
        }),
      });
    const media = loadStorageMedia();

    const result = await media.uploadAudio(
      'data:audio/webm;base64,dm9pY2U=',
      'client-id',
      '2026-06-18',
      'msg-a',
      { blob, durationMs: 1200 },
    );

    expect(result.uploaded).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.example.test/photos/upload');
    expect(global.fetch.mock.calls[1][0]).toBe('https://api.example.test/media/upload');
  });
});
