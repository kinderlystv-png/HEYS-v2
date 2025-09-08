// ЭМТ v3.0-stable Data Factories
export const userFactory = (overrides = {}) => ({
  id: 'a614069f-5091-49f2-b5c7-b1934b1eca13',
  name: 'Test User',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
  ...overrides
});

export const postFactory = (overrides = {}) => ({
  id: '9f55ff13-a0a1-4400-a990-ea5966e81b88',
  title: 'Test Post',
  content: 'Sample test content',
  author: userFactory(),
  publishedAt: new Date().toISOString(),
  ...overrides
});