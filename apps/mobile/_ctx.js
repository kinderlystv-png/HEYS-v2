// Custom context for expo-router
// This file replaces the problematic process.env.EXPO_ROUTER_APP_ROOT with a hardcoded path

export const ctx = require.context(
  './app',
  true,
  /\.(js|jsx|ts|tsx)$/,
  'lazy'
);
