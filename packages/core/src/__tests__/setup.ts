/**
 * Test setup for Core Package
 * Mock WebSocket and other browser APIs for testing
 */

import { vi } from 'vitest';

type WebSocketConstructor = typeof WebSocket & {
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
};

const mockWebSocket = vi.fn(() => ({
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  readyState: 1,
  close: vi.fn(),
  send: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as WebSocketConstructor;

// Mock WebSocket for testing environment
globalThis.WebSocket = mockWebSocket;

// Also set WebSocket static properties
Object.assign(mockWebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

// Mock crypto for UUID generation
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
    getRandomValues: <T extends ArrayBufferView>(arr: T): T => {
      const view = arr as unknown as Uint8Array;
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock performance API
Object.defineProperty(globalThis, 'performance', {
  value: {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => []),
  },
});
