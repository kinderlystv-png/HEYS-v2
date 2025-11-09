import type { EnvironmentLoggingConfig } from '../../../levels.config.js';

declare const DEVELOPMENT_CONFIG: EnvironmentLoggingConfig;
declare const TEST_CONFIG: EnvironmentLoggingConfig;
declare const STAGING_CONFIG: EnvironmentLoggingConfig;
declare const PRODUCTION_CONFIG: EnvironmentLoggingConfig;

export { DEVELOPMENT_CONFIG, TEST_CONFIG, STAGING_CONFIG, PRODUCTION_CONFIG };

export function getEnvironmentConfig(env?: string): EnvironmentLoggingConfig;
export function createPinoConfig(env?: string): Record<string, unknown>;
export function createWinstonConfig(env?: string): Record<string, unknown>;

declare const _default: {
  DEVELOPMENT_CONFIG: typeof DEVELOPMENT_CONFIG;
  TEST_CONFIG: typeof TEST_CONFIG;
  STAGING_CONFIG: typeof STAGING_CONFIG;
  PRODUCTION_CONFIG: typeof PRODUCTION_CONFIG;
  getEnvironmentConfig: typeof getEnvironmentConfig;
  createPinoConfig: typeof createPinoConfig;
  createWinstonConfig: typeof createWinstonConfig;
};

export default _default;
