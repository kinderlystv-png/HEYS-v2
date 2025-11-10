// Analytics placeholder
// eslint-disable-next-line no-console
export const trackEvent = (event: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('Track:', event, data);
  }
};
