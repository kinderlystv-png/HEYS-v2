// filepath: apps/web/src/components/OptimizedImage/__tests__/OptimizedImage.test.tsx

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { imageOptimizer } from '../../../utils/image-optimizer';
import OptimizedImage from '../OptimizedImage';

// Mock image optimizer
vi.mock('../../../utils/image-optimizer', () => ({
  imageOptimizer: {
    optimizeImage: vi.fn(),
  },
}));

// Mock useLazyLoad hook
vi.mock('../../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn(() => ({
    ref: { current: null },
    isVisible: true,
    isIntersecting: true,
    hasIntersected: true,
  })),
}));

const mockImageOptimizer = vi.mocked(imageOptimizer);
const OriginalImage = globalThis.Image;

class MockImage {
  onload: ((this: GlobalEventHandlers, ev: Event) => void) | null = null;
  onerror: ((this: GlobalEventHandlers, ev: Event | string) => void) | null = null;

  set src(_value: string) {
    setTimeout(() => {
      this.onload?.call(this as unknown as GlobalEventHandlers, new Event('load'));
    }, 0);
  }
}

describe('OptimizedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.Image = MockImage as unknown as typeof Image;

    // Default mock response
    mockImageOptimizer.optimizeImage.mockResolvedValue({
      src: '/optimized-image.webp',
      width: 800,
      height: 600,
      format: 'webp',
      size: 45000,
      optimized: true,
      cached: false,
      timestamp: Date.now(),
    });
  });

  afterAll(() => {
    globalThis.Image = OriginalImage;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders with basic props', async () => {
    const view = render(
      <OptimizedImage src="/test-image.jpg" alt="Test image" width={400} height={300} priority />,
    );

    expect(view.getByAltText('Test image')).toBeTruthy();
  });

  it('calls image optimizer with correct options', async () => {
    render(
      <OptimizedImage
        src="/test-image.jpg"
        alt="Test image"
        width={400}
        height={300}
        optimization={{ quality: 90, format: 'webp' }}
        priority
      />,
    );

    await waitFor(() => {
      expect(mockImageOptimizer.optimizeImage).toHaveBeenCalledWith(
        '/test-image.jpg',
        expect.objectContaining({
          width: 400,
          height: 300,
          quality: 90,
          format: 'webp',
          priority: true,
        }),
      );
    });
  });

  it('displays loading state initially', () => {
    const view = render(<OptimizedImage src="/test-image.jpg" alt="Test image" priority />);

    expect(view.getByRole('img').className).toContain('loading');
  });

  it('handles optimization errors gracefully', async () => {
    mockImageOptimizer.optimizeImage.mockRejectedValue(new Error('Optimization failed'));

    const view = render(
      <OptimizedImage src="/test-image.jpg" alt="Test image" fallback="/fallback.jpg" priority />,
    );

    // Should not crash and should attempt fallback
    await waitFor(() => {
      expect(view.getByAltText('Test image')).toBeTruthy();
    });
  });

  it('applies priority attributes correctly', async () => {
    const view = render(<OptimizedImage src="/test-image.jpg" alt="Test image" priority />);

    const img = view.getByRole('img');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('decoding')).toBe('sync');
  });

  it('applies lazy loading attributes for non-priority images', () => {
    const view = render(<OptimizedImage src="/test-image.jpg" alt="Test image" lazy />);

    const img = view.getByRole('img');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('shows optimization info in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const view = render(<OptimizedImage src="/test-image.jpg" alt="Test image" priority />);

    await waitFor(() => {
      expect(Boolean(view.queryByText(/WEBP/))).toBe(true);
      expect(Boolean(view.queryByText(/Optimized/))).toBe(true);
    });

    process.env.NODE_ENV = originalEnv;
  });
});
