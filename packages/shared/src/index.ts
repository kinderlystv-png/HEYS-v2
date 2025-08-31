// Shared utilities
export const formatDate = (date: Date) => date.toISOString().split('T')[0];
export const generateId = () => crypto.randomUUID();
