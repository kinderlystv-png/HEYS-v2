import '@testing-library/jest-dom';


// Глобальные моки для DOM API
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

console.info('✅ ЭМТ v3.0.1-enhanced test environment loaded');
