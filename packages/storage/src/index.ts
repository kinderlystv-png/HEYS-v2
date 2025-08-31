// Storage layer placeholder
export const createStorage = () => ({
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
});
