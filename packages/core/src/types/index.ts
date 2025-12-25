// Types barrel export
export interface HeysConfig {
  apiUrl: string;
  environment: 'development' | 'production' | 'test';
  features: {
    analytics: boolean;
    gaming: boolean;
    search: boolean;
  };
}

export interface HeysState {
  user: unknown | null;
  loading: boolean;
  error: string | null;
}
