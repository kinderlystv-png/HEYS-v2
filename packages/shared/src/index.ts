// Export all shared utilities, types, and components
export * from './monitoring';
export * from './security';

// Shared utilities
export const formatDate = (date: Date) => date.toISOString().split('T')[0];
export const generateId = () => crypto.randomUUID();
