import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Простой пример компонента для демонстрации
function TestButton({ onClick, children }) {
  return (
    <button onClick={onClick} data-testid="test-button">
      {children}
    </button>
  );
}

describe('Example Test', () => {
  it('should render and handle click', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<TestButton onClick={handleClick}>Click me</TestButton>);

    const button = screen.getByTestId('test-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');

    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});