import '@testing-library/jest-dom';
import { Window as HappyDomWindow } from 'happy-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../components/Button/Button.js';

const ensureDomEnvironment = () => {
  const hasValidDom =
    typeof globalThis.window !== 'undefined' &&
    typeof globalThis.document !== 'undefined' &&
    typeof globalThis.document.createElement === 'function' &&
    typeof globalThis.document.body?.appendChild === 'function';

  if (!hasValidDom) {
    const win = new HappyDomWindow();
    globalThis.window = win as unknown as typeof globalThis.window;
    globalThis.document = win.document;
    globalThis.navigator = win.navigator as unknown as Navigator;
    globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
    globalThis.Node = win.Node as unknown as typeof Node;
    globalThis.Event = win.Event as unknown as typeof Event;
  }

  if (!globalThis.navigator.clipboard) {
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

  describe('Rendering', () => {
    it('should render with children', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      render(<Button className="custom-class">Test Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Variants', () => {
    it('should render primary variant by default', () => {
      render(<Button>Primary Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-600');
    });

    it('should render secondary variant', () => {
      render(<Button variant="secondary">Secondary Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-600');
    });

    it('should render outline variant', () => {
      render(<Button variant="outline">Outline Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border-gray-300');
    });

    it('should render ghost variant', () => {
      render(<Button variant="ghost">Ghost Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-gray-100');
    });
  });

  describe('Sizes', () => {
    it('should render medium size by default', () => {
      render(<Button>Medium Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('px-4', 'py-2');
    });

    it('should render small size', () => {
      render(<Button size="sm">Small Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('px-3', 'py-1.5');
    });

    it('should render large size', () => {
      render(<Button size="lg">Large Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('px-6', 'py-3');
    });
  });

  describe('States', () => {
    it('should handle disabled state', () => {
      render(<Button disabled>Disabled Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:opacity-50');
    });

    it('should handle loading state', () => {
      render(<Button loading>Loading Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show spinner when loading', () => {
      render(<Button loading>Loading Button</Button>);

      // Проверяем наличие спиннера (svg элемент)
      const spinner = document.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });
  });

  describe('Interactions', () => {
    it('should call onClick when clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Clickable Button</Button>);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button onClick={handleClick} disabled>
          Disabled Button
        </Button>,
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should not call onClick when loading', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button onClick={handleClick} loading>
          Loading Button
        </Button>,
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have correct button role', () => {
      render(<Button>Accessible Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should support custom aria attributes', () => {
      render(<Button aria-label="Custom label">Icon Button</Button>);

      const button = screen.getByLabelText('Custom label');
      expect(button).toBeInTheDocument();
    });

    it('should have focus styles', () => {
      render(<Button>Focus Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });

  describe('Props forwarding', () => {
    it('should forward HTML button attributes', () => {
      render(
        <Button type="submit" name="test-button">
          Submit Button
        </Button>,
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('name', 'test-button');
    });

    it('should forward data attributes', () => {
      render(<Button data-testid="custom-button">Test Button</Button>);

      const button = screen.getByTestId('custom-button');
      expect(button).toBeInTheDocument();
    });
  });
});
