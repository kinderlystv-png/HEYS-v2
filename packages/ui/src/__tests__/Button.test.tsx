// @vitest-environment happy-dom

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../components/Button/Button.js';

const ensureDomEnvironment = () => {
  if (typeof globalThis.navigator !== 'undefined' && !globalThis.navigator.clipboard) {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
        readText: vi.fn(),
      },
    });
  }
};

describe('Button Component', () => {
  beforeEach(() => {
    ensureDomEnvironment();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with children', () => {
      const view = render(<Button>Click me</Button>);

      const local = within(view.container);
      expect(local.getByRole('button')).toBeInTheDocument();
      expect(local.getByText('Click me')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const view = render(<Button className="custom-class">Test Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Variants', () => {
    it('should render primary variant by default', () => {
      const view = render(<Button>Primary Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('bg-blue-600');
    });

    it('should render secondary variant', () => {
      const view = render(<Button variant="secondary">Secondary Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('bg-gray-600');
    });

    it('should render outline variant', () => {
      const view = render(<Button variant="outline">Outline Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('border-gray-300');
    });

    it('should render ghost variant', () => {
      const view = render(<Button variant="ghost">Ghost Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('hover:bg-gray-100');
    });
  });

  describe('Sizes', () => {
    it('should render medium size by default', () => {
      const view = render(<Button>Medium Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('px-4', 'py-2');
    });

    it('should render small size', () => {
      const view = render(<Button size="sm">Small Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('px-3', 'py-1.5');
    });

    it('should render large size', () => {
      const view = render(<Button size="lg">Large Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('px-6', 'py-3');
    });
  });

  describe('States', () => {
    it('should handle disabled state', () => {
      const view = render(<Button disabled>Disabled Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:opacity-50');
    });

    it('should handle loading state', () => {
      const view = render(<Button loading>Loading Button</Button>);

      const local = within(view.container);
      const button = local.getByRole('button');
      expect(button).toBeDisabled();
      expect(local.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show spinner when loading', () => {
      const view = render(<Button loading>Loading Button</Button>);

      // Проверяем наличие спиннера (svg элемент)
      const spinner = view.container.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });
  });

  describe('Interactions', () => {
    it('should call onClick when clicked', async () => {
      const handleClick = vi.fn();

      const view = render(<Button onClick={handleClick}>Clickable Button</Button>);

      const button = within(view.container).getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();

      const view = render(
        <Button onClick={handleClick} disabled>
          Disabled Button
        </Button>,
      );

      const button = within(view.container).getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should not call onClick when loading', async () => {
      const handleClick = vi.fn();

      const view = render(
        <Button onClick={handleClick} loading>
          Loading Button
        </Button>,
      );

      const button = within(view.container).getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have correct button role', () => {
      const view = render(<Button>Accessible Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should support custom aria attributes', () => {
      const view = render(<Button aria-label="Custom label">Icon Button</Button>);

      const button = within(view.container).getByLabelText('Custom label');
      expect(button).toBeInTheDocument();
    });

    it('should have focus styles', () => {
      const view = render(<Button>Focus Button</Button>);

      const button = within(view.container).getByRole('button');
      expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });

  describe('Props forwarding', () => {
    it('should forward HTML button attributes', () => {
      const view = render(
        <Button type="submit" name="test-button">
          Submit Button
        </Button>,
      );

      const button = within(view.container).getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('name', 'test-button');
    });

    it('should forward data attributes', () => {
      const view = render(<Button data-testid="custom-button">Test Button</Button>);

      const button = within(view.container).getByTestId('custom-button');
      expect(button).toBeInTheDocument();
    });
  });
});
