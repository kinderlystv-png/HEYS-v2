// Смоук: баннер «Код не распознан» после 10 с непрерывного скана без остановки сканера.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const ADD_PRODUCT_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_add_product_step_v1.js'), 'utf8');

function loadAddProduct() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.React = globalThis.window.React = React;
  globalThis.HEYS = globalThis.window.HEYS = {
    barcode: {
      isSupported: () => true,
      getDebugState: () => ({}),
      startScanning: vi.fn(),
    },
    store: { getFavorites: () => new Set(), toggleFavorite: vi.fn() },
  };
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  // eslint-disable-next-line no-eval
  eval(ADD_PRODUCT_SRC);
  return globalThis.HEYS.AddProductStep;
}

function mockVideoReady(video) {
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });
  video.play = vi.fn().mockResolvedValue(undefined);
}

describe('barcode scanner · unrecognized threshold', () => {
  it('source contract: 10 s threshold and banner copy', () => {
    expect(ADD_PRODUCT_SRC).toContain('BARCODE_SCAN_UNRECOGNIZED_MS = 10000');
    expect(ADD_PRODUCT_SRC).toContain("'Код не распознан'");
    expect(ADD_PRODUCT_SRC).toContain('Не получается прочитать');
    expect(ADD_PRODUCT_SRC).toContain('aps-barcode-unrecognized__card');
    const timerChunk = ADD_PRODUCT_SRC.slice(
      ADD_PRODUCT_SRC.indexOf('unrecognizedTimerRef.current = setTimeout'),
      ADD_PRODUCT_SRC.indexOf('unrecognizedTimerRef.current = setTimeout') + 220,
    );
    expect(timerChunk).toContain('setScanUnrecognized(true)');
    expect(timerChunk).not.toContain('stop');
  });
});

describe('barcode scanner · unrecognized threshold runtime', () => {
  let scannerStop;
  let AddProduct;

  beforeEach(() => {
    vi.useFakeTimers();
    scannerStop = vi.fn();
    AddProduct = loadAddProduct();
    globalThis.HEYS.barcode.startScanning.mockResolvedValue({
      success: true,
      stop: scannerStop,
    });

    const track = { kind: 'video', label: 'mock', enabled: true, muted: false, readyState: 'live', getSettings: () => ({}) };
    class MockMediaStream {
      constructor() {
        this.active = true;
      }
      getTracks() {
        return [track];
      }
    }
    vi.stubGlobal('MediaStream', MockMediaStream);
    const stream = new MockMediaStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    vi.spyOn(navigator.permissions, 'query').mockResolvedValue({ state: 'granted' });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
      configurable: true,
      set() {},
      get() { return null; },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows banner after 10 s and keeps scanner running', async () => {
    const Modal = AddProduct.BarcodeScannerModal;
    render(React.createElement(Modal, {
      title: 'Штрихкод',
      subtitle: 'Тест',
      fullscreen: true,
      autoStart: false,
      onDetected: vi.fn(),
      onClose: vi.fn(),
    }));

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    mockVideoReady(video);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Включить камеру' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(globalThis.HEYS.barcode.startScanning).toHaveBeenCalled();
    expect(screen.queryByText('Код не распознан')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(9999);
    });
    expect(screen.queryByText('Код не распознан')).toBeNull();
    expect(scannerStop).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('Код не распознан')).toBeTruthy();
    expect(scannerStop).not.toHaveBeenCalled();
  });
});
