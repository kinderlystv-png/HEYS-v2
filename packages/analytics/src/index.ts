// Analytics placeholder
import { logger } from '@heys/logger';

export const trackEvent = (event: string, data?: Record<string, unknown>) => 
  logger.info('Track:', { event, data });
