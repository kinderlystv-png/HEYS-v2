import { log } from '@heys/logger';

// Analytics placeholder
export const trackEvent = (event: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production') {
    log.debug('Analytics track event', { event, data });
  }
};
