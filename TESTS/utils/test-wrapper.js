import { render } from '@testing-library/react';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}