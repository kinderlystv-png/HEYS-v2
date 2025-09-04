// filepath: apps/web/src/components/OptimizedImage/__tests__/OptimizedImage.test.tsx

import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { imageOptimizer } from '../../../utils/image-optimizer';
import OptimizedImage from '../OptimizedImage';

// Mock image optimizer
vi.mock('../../../utils/image-optimizer', () => ({
  imageOptimizer: {
    optimizeImage: vi.fn()
  }
}));

// Mock useLazyLoad hook
vi.mock('../../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn(() => ({
    ref: { current: null },
    isVisible: true,
    isIntersecting: true,
    hasIntersected: true
  }))
}));

const mockImageOptimizer = vi.mocked(imageOptimizer);

describe('OptimizedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock response
    mockImageOptimizer.optimizeImage.mockResolvedValue({
      src: '/optimized-image.webp',
      width: 800,
      height: 600,
      format: 'webp',
      size: 45000,
      optimized: true,
      cached: false,
      timestamp: Date.now()
    });
  });

  it('renders with basic props', async () => {
    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image" 
        width={400} 
        height={300}
        priority
      />
    );

    expect(screen.getByAltText('Test image')).toBeInTheDocument();
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
      />
    );

    await waitFor(() => {
      expect(mockImageOptimizer.optimizeImage).toHaveBeenCalledWith(
        '/test-image.jpg',
        expect.objectContaining({
          width: 400,
          height: 300,
          quality: 90,
          format: 'webp',
          priority: true
        })
      );
    });
  });

  it('displays loading state initially', () => {
    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image"
        priority
      />
    );

    expect(screen.getByRole('img')).toHaveClass('loading');
  });

  it('handles optimization errors gracefully', async () => {
    mockImageOptimizer.optimizeImage.mockRejectedValue(new Error('Optimization failed'));

    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image"
        fallback="/fallback.jpg"
        priority
      />
    );

    // Should not crash and should attempt fallback
    await waitFor(() => {
      expect(screen.getByAltText('Test image')).toBeInTheDocument();
    });
  });

  it('applies priority attributes correctly', async () => {
    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image"
        priority
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('decoding', 'sync');
  });

  it('applies lazy loading attributes for non-priority images', () => {
    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image"
        lazy
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('shows optimization info in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <OptimizedImage 
        src="/test-image.jpg" 
        alt="Test image"
        priority
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/WEBP/)).toBeInTheDocument();
      expect(screen.getByText(/Optimized/)).toBeInTheDocument();
    });

    process.env.NODE_ENV = originalEnv;
  });
});
