// Фабрики для создания тестовых данных
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));

export const dataFactory = {
  user: (overrides = {}) => ({
    id: uuid(),
    email: `test-1757241685754@example.com`,
    name: 'Test User',
    role: 'user',
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  event: (overrides = {}) => ({
    id: uuid(),
    title: 'Test Event',
    description: 'Test event description',
    date: new Date().toISOString(),
    status: 'draft',
    ...overrides
  }),

  client: (overrides = {}) => ({
    id: uuid(),
    name: 'Test Client',
    email: `client-1757241685754@example.com`,
    phone: '+1234567890',
    ...overrides
  })
};