// Смоук: отзыв согласия на расшифровку — bottom sheet с цифрами, без window.confirm.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadMessengerInternals() {
  globalThis.React = React;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

describe('мессенджер · отзыв согласия на расшифровку', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('TranscriptionRevokeSheet показывает стоимость в числах', () => {
    const { TranscriptionRevokeSheet } = loadMessengerInternals();
    const { container, getByRole } = render(
      React.createElement(TranscriptionRevokeSheet, {
        open: true,
        stats: { audioCount: 3, transcribedCount: 2, hasData: true },
        busy: false,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );

    expect(getByRole('dialog')).toBeTruthy();
    expect(container.querySelector('.heys-supp-revoke-sheet__impact-primary')?.textContent)
      .toBe('3 голосовых в переписке');
    expect(container.querySelector('.heys-supp-revoke-sheet__impact-secondary')?.textContent)
      .toBe('2 с готовым текстом');
    expect(container.querySelector('.consent-doc-body')).toBeTruthy();
  });

  it('countThreadAudioAttachments считает аудио и готовые расшифровки', () => {
    const { countThreadAudioAttachments } = loadMessengerInternals();
    const stats = countThreadAudioAttachments([
      {
        attachments: [
          { mime: 'audio/ogg', transcript_status: 'ready', transcript_text: 'текст' },
          { mime: 'audio/ogg' },
          { mime: 'image/jpeg' },
        ],
      },
    ]);
    expect(stats).toEqual({ audioCount: 2, transcribedCount: 1, hasData: true });
  });

  it('отзыв через меню открывает sheet, не window.confirm', () => {
    expect(messengerSource).not.toMatch(/window\.confirm\([^)]*расшифров/i);
    expect(messengerSource).toMatch(/setTranscriptionRevokeOpen\(true\)/);
    expect(messengerSource).toMatch(/TranscriptionRevokeSheet/);
    expect(messengerSource).toMatch(/confirmTranscriptionRevoke/);
  });
});
