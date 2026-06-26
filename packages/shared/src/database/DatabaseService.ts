/**
 * PostgREST-compatible database access (no @supabase/* SDK).
 * Constructor URL/key match a generic PostgREST shape: base URL + bearer/API token.
 */

// Database Types
export interface SecurityEvent {
  id: string;
  user_id?: string;
  client_id?: string;
  event_type: string;
  source_ip?: string;
  user_agent?: string;
  session_id?: string;
  request_frequency?: number;
  session_duration?: string;
  error_rate?: number;
  response_time?: string;
  data_volume?: number;
  geo_location?: {
    lat: number;
    lng: number;
    country?: string;
    city?: string;
  };
  device_fingerprint?: string;
  privilege_level?: 'user' | 'admin' | 'system';
  failed_attempts?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SecurityIncident {
  id: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  user_id?: string;
  client_id?: string;
  event_ids?: string[];
  ioc_matches?: Record<string, unknown>;
  ml_confidence?: number;
  response_actions?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  impact_assessment?: Record<string, unknown>;
  assigned_to?: string;
  escalated_to?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsMetric {
  id: string;
  user_id?: string;
  client_id?: string;
  metric_name: string;
  metric_value: number;
  metric_unit?: string;
  dimensions?: Record<string, unknown>;
  aggregation_period: 'minute' | 'hour' | 'day' | 'week' | 'month';
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ThreatIntelligence {
  id: string;
  ioc_type: 'ip' | 'domain' | 'hash' | 'user_agent';
  ioc_value: string;
  threat_actor?: string;
  threat_type?: string;
  confidence_score?: number;
  first_seen?: string;
  last_seen?: string;
  source?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuestSession {
  id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  geo_location?: Record<string, unknown>;
  device_fingerprint?: string;
  activity_log?: Record<string, unknown>;
  security_score?: number;
  is_suspicious?: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// Security Metrics Response
export interface SecurityMetrics {
  total_events: number;
  unique_ips: number;
  error_rate: number;
  avg_response_time: number;
  failed_attempts: number;
  event_types: string[];
}

// Top Threats Response
export interface TopThreat {
  ioc_value: string;
  ioc_type: string;
  threat_actor: string;
  matches_count: number;
  last_seen: string;
}

const emptySecurityMetrics: SecurityMetrics = {
  total_events: 0,
  unique_ips: 0,
  error_rate: 0,
  avg_response_time: 0,
  failed_attempts: 0,
  event_types: [],
};

/**
 * Database integration service for security and analytics (PostgREST over HTTP).
 */
export class DatabaseService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  /** @param postgrestBaseUrl Project REST base (e.g. https://api.example.com or any PostgREST root) */
  constructor(postgrestBaseUrl: string, apiKey: string) {
    this.baseUrl = postgrestBaseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private buildHeaders(extra?: HeadersInit): Headers {
    const h = new Headers(extra);
    if (!h.has('apikey')) {
      h.set('apikey', this.apiKey);
    }
    if (!h.has('Authorization')) {
      h.set('Authorization', `Bearer ${this.apiKey}`);
    }
    if (!h.has('Content-Type')) {
      h.set('Content-Type', 'application/json');
    }
    return h;
  }

  private async readErrorMessage(res: Response): Promise<string> {
    try {
      const j: unknown = await res.json();
      if (j && typeof j === 'object' && 'message' in j && typeof (j as { message: unknown }).message === 'string') {
        return (j as { message: string }).message;
      }
      return JSON.stringify(j);
    } catch {
      return await res.text();
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return fetch(url, {
      ...init,
      headers: this.buildHeaders(init?.headers),
    });
  }

  private async parseJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  private isPgrstNoRow(res: Response, body: unknown): boolean {
    if (res.status !== 406) {
      return false;
    }
    return (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      (body as { code: string }).code === 'PGRST116'
    );
  }

  // Security Events
  async createSecurityEvent(event: Omit<SecurityEvent, 'id' | 'created_at' | 'updated_at'>): Promise<SecurityEvent> {
    const res = await this.request('/rest/v1/security_events', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      throw new Error(`Failed to create security event: ${await this.readErrorMessage(res)}`);
    }
    const rows = await this.parseJson<SecurityEvent[]>(res);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Failed to create security event: empty response');
    }
    return rows[0]!;
  }

  async getSecurityEvents(
    userId: string,
    clientId?: string,
    limit = 100,
    offset = 0,
  ): Promise<SecurityEvent[]> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('order', 'created_at.desc');
    if (clientId) {
      q.set('client_id', `eq.${clientId}`);
    } else {
      q.set('user_id', `eq.${userId}`);
    }
    const path = `/rest/v1/security_events?${q.toString()}`;
    const res = await this.request(path, {
      method: 'GET',
      headers: { Range: `${offset}-${offset + limit - 1}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch security events: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<SecurityEvent[]>(res);
    return Array.isArray(data) ? data : [];
  }

  // Security Incidents
  async createSecurityIncident(
    incident: Omit<SecurityIncident, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<SecurityIncident> {
    const res = await this.request('/rest/v1/security_incidents', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(incident),
    });
    if (!res.ok) {
      throw new Error(`Failed to create security incident: ${await this.readErrorMessage(res)}`);
    }
    const rows = await this.parseJson<SecurityIncident[]>(res);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Failed to create security incident: empty response');
    }
    return rows[0]!;
  }

  async getSecurityIncidents(
    userId: string,
    clientId?: string,
    status?: SecurityIncident['status'],
  ): Promise<SecurityIncident[]> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('order', 'created_at.desc');
    if (clientId) {
      q.set('client_id', `eq.${clientId}`);
    } else {
      q.set('user_id', `eq.${userId}`);
    }
    if (status) {
      q.set('status', `eq.${status}`);
    }
    const res = await this.request(`/rest/v1/security_incidents?${q.toString()}`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Failed to fetch security incidents: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<SecurityIncident[]>(res);
    return Array.isArray(data) ? data : [];
  }

  async updateSecurityIncident(
    id: string,
    updates: Partial<Omit<SecurityIncident, 'id' | 'created_at'>>,
  ): Promise<SecurityIncident> {
    const q = new URLSearchParams();
    q.set('id', `eq.${id}`);
    const res = await this.request(`/rest/v1/security_incidents?${q.toString()}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error(`Failed to update security incident: ${await this.readErrorMessage(res)}`);
    }
    const rows = await this.parseJson<SecurityIncident[]>(res);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Failed to update security incident: empty response');
    }
    return rows[0]!;
  }

  // Analytics Metrics
  async createAnalyticsMetric(metric: Omit<AnalyticsMetric, 'id' | 'created_at'>): Promise<AnalyticsMetric> {
    const res = await this.request('/rest/v1/analytics_metrics', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(metric),
    });
    if (!res.ok) {
      throw new Error(`Failed to create analytics metric: ${await this.readErrorMessage(res)}`);
    }
    const rows = await this.parseJson<AnalyticsMetric[]>(res);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Failed to create analytics metric: empty response');
    }
    return rows[0]!;
  }

  async getAnalyticsMetrics(
    userId: string,
    clientId?: string,
    metricName?: string,
    period?: AnalyticsMetric['aggregation_period'],
    startDate?: string,
    endDate?: string,
  ): Promise<AnalyticsMetric[]> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('order', 'period_start.desc');
    if (clientId) {
      q.set('client_id', `eq.${clientId}`);
    } else {
      q.set('user_id', `eq.${userId}`);
    }
    if (metricName) {
      q.set('metric_name', `eq.${metricName}`);
    }
    if (period) {
      q.set('aggregation_period', `eq.${period}`);
    }
    if (startDate) {
      q.set('period_start', `gte.${startDate}`);
    }
    if (endDate) {
      q.set('period_end', `lte.${endDate}`);
    }
    const res = await this.request(`/rest/v1/analytics_metrics?${q.toString()}`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Failed to fetch analytics metrics: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<AnalyticsMetric[]>(res);
    return Array.isArray(data) ? data : [];
  }

  // Threat Intelligence
  async getThreatIntelligence(): Promise<ThreatIntelligence[]> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('is_active', 'eq.true');
    q.set('order', 'updated_at.desc');
    const res = await this.request(`/rest/v1/threat_intelligence?${q.toString()}`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Failed to fetch threat intelligence: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<ThreatIntelligence[]>(res);
    return Array.isArray(data) ? data : [];
  }

  async checkIOCMatch(iocType: string, iocValue: string): Promise<ThreatIntelligence | null> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('ioc_type', `eq.${iocType}`);
    q.set('ioc_value', `eq.${iocValue}`);
    q.set('is_active', 'eq.true');
    const res = await this.request(`/rest/v1/threat_intelligence?${q.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/vnd.pgrst.object+json' },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (this.isPgrstNoRow(res, body)) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to check IOC match: ${text || res.statusText}`);
    }
    return body as ThreatIntelligence;
  }

  // Guest Sessions
  async createGuestSession(session: Omit<GuestSession, 'id' | 'created_at' | 'updated_at'>): Promise<GuestSession> {
    const res = await this.request('/rest/v1/guest_sessions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      throw new Error(`Failed to create guest session: ${await this.readErrorMessage(res)}`);
    }
    const rows = await this.parseJson<GuestSession[]>(res);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Failed to create guest session: empty response');
    }
    return rows[0]!;
  }

  async getGuestSession(sessionToken: string): Promise<GuestSession | null> {
    const q = new URLSearchParams();
    q.set('select', '*');
    q.set('session_token', `eq.${sessionToken}`);
    const res = await this.request(`/rest/v1/guest_sessions?${q.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/vnd.pgrst.object+json' },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (this.isPgrstNoRow(res, body)) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch guest session: ${text || res.statusText}`);
    }
    return body as GuestSession;
  }

  // Analytics Functions
  async getSecurityMetrics(
    userId: string,
    clientId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<SecurityMetrics> {
    const payload = {
      p_user_id: userId,
      p_client_id: clientId || null,
      p_start_date: startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      p_end_date: endDate || new Date().toISOString(),
    };
    const res = await this.request('/rest/v1/rpc/get_security_metrics', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to get security metrics: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<unknown>(res);
    if (data === null || data === undefined) {
      return emptySecurityMetrics;
    }
    if (Array.isArray(data)) {
      return (data[0] as SecurityMetrics) ?? emptySecurityMetrics;
    }
    return data as SecurityMetrics;
  }

  async getTopThreats(limit = 10): Promise<TopThreat[]> {
    const res = await this.request('/rest/v1/rpc/get_top_threats', {
      method: 'POST',
      body: JSON.stringify({ p_limit: limit }),
    });
    if (!res.ok) {
      throw new Error(`Failed to get top threats: ${await this.readErrorMessage(res)}`);
    }
    const data = await this.parseJson<TopThreat[]>(res);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Realtime subscriptions are not implemented without a WebSocket client.
   * Returns a stub compatible with callers that only call `unsubscribe()`.
   */
  subscribeToSecurityEvents(_userId: string, _callback: (event: SecurityEvent) => void) {
    return {
      unsubscribe: async () => {
        /* no-op: realtime not wired in fetch-only mode */
      },
    };
  }

  subscribeToSecurityIncidents(_userId: string, _callback: (incident: SecurityIncident) => void) {
    return {
      unsubscribe: async () => {
        /* no-op: realtime not wired in fetch-only mode */
      },
    };
  }
}
