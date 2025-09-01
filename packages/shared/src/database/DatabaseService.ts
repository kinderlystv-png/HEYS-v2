import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  metadata?: Record<string, any>;
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
  ioc_matches?: Record<string, any>;
  ml_confidence?: number;
  response_actions?: Record<string, any>;
  timeline?: Record<string, any>;
  impact_assessment?: Record<string, any>;
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
  dimensions?: Record<string, any>;
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
  metadata?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuestSession {
  id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  geo_location?: Record<string, any>;
  device_fingerprint?: string;
  activity_log?: Record<string, any>;
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

/**
 * Database integration service for security and analytics
 */
export class DatabaseService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // Security Events
  async createSecurityEvent(event: Omit<SecurityEvent, 'id' | 'created_at' | 'updated_at'>): Promise<SecurityEvent> {
    const { data, error } = await this.supabase
      .from('security_events')
      .insert(event)
      .select()
      .single();

    if (error) throw new Error(`Failed to create security event: ${error.message}`);
    return data;
  }

  async getSecurityEvents(
    userId: string,
    clientId?: string,
    limit = 100,
    offset = 0
  ): Promise<SecurityEvent[]> {
    let query = this.supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (clientId) {
      query = query.eq('client_id', clientId);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch security events: ${error.message}`);
    return data || [];
  }

  // Security Incidents
  async createSecurityIncident(incident: Omit<SecurityIncident, 'id' | 'created_at' | 'updated_at'>): Promise<SecurityIncident> {
    const { data, error } = await this.supabase
      .from('security_incidents')
      .insert(incident)
      .select()
      .single();

    if (error) throw new Error(`Failed to create security incident: ${error.message}`);
    return data;
  }

  async getSecurityIncidents(
    userId: string,
    clientId?: string,
    status?: SecurityIncident['status']
  ): Promise<SecurityIncident[]> {
    let query = this.supabase
      .from('security_incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    } else {
      query = query.eq('user_id', userId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch security incidents: ${error.message}`);
    return data || [];
  }

  async updateSecurityIncident(
    id: string, 
    updates: Partial<Omit<SecurityIncident, 'id' | 'created_at'>>
  ): Promise<SecurityIncident> {
    const { data, error } = await this.supabase
      .from('security_incidents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update security incident: ${error.message}`);
    return data;
  }

  // Analytics Metrics
  async createAnalyticsMetric(metric: Omit<AnalyticsMetric, 'id' | 'created_at'>): Promise<AnalyticsMetric> {
    const { data, error } = await this.supabase
      .from('analytics_metrics')
      .insert(metric)
      .select()
      .single();

    if (error) throw new Error(`Failed to create analytics metric: ${error.message}`);
    return data;
  }

  async getAnalyticsMetrics(
    userId: string,
    clientId?: string,
    metricName?: string,
    period?: AnalyticsMetric['aggregation_period'],
    startDate?: string,
    endDate?: string
  ): Promise<AnalyticsMetric[]> {
    let query = this.supabase
      .from('analytics_metrics')
      .select('*')
      .order('period_start', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    } else {
      query = query.eq('user_id', userId);
    }

    if (metricName) {
      query = query.eq('metric_name', metricName);
    }

    if (period) {
      query = query.eq('aggregation_period', period);
    }

    if (startDate) {
      query = query.gte('period_start', startDate);
    }

    if (endDate) {
      query = query.lte('period_end', endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch analytics metrics: ${error.message}`);
    return data || [];
  }

  // Threat Intelligence
  async getThreatIntelligence(): Promise<ThreatIntelligence[]> {
    const { data, error } = await this.supabase
      .from('threat_intelligence')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch threat intelligence: ${error.message}`);
    return data || [];
  }

  async checkIOCMatch(iocType: string, iocValue: string): Promise<ThreatIntelligence | null> {
    const { data, error } = await this.supabase
      .from('threat_intelligence')
      .select('*')
      .eq('ioc_type', iocType)
      .eq('ioc_value', iocValue)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to check IOC match: ${error.message}`);
    }
    return data;
  }

  // Guest Sessions
  async createGuestSession(session: Omit<GuestSession, 'id' | 'created_at' | 'updated_at'>): Promise<GuestSession> {
    const { data, error } = await this.supabase
      .from('guest_sessions')
      .insert(session)
      .select()
      .single();

    if (error) throw new Error(`Failed to create guest session: ${error.message}`);
    return data;
  }

  async getGuestSession(sessionToken: string): Promise<GuestSession | null> {
    const { data, error } = await this.supabase
      .from('guest_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch guest session: ${error.message}`);
    }
    return data;
  }

  // Analytics Functions
  async getSecurityMetrics(
    userId: string,
    clientId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<SecurityMetrics> {
    const { data, error } = await this.supabase
      .rpc('get_security_metrics', {
        p_user_id: userId,
        p_client_id: clientId || null,
        p_start_date: startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        p_end_date: endDate || new Date().toISOString()
      });

    if (error) throw new Error(`Failed to get security metrics: ${error.message}`);
    return data || {
      total_events: 0,
      unique_ips: 0,
      error_rate: 0,
      avg_response_time: 0,
      failed_attempts: 0,
      event_types: []
    };
  }

  async getTopThreats(limit = 10): Promise<TopThreat[]> {
    const { data, error } = await this.supabase
      .rpc('get_top_threats', { p_limit: limit });

    if (error) throw new Error(`Failed to get top threats: ${error.message}`);
    return data || [];
  }

  // Real-time subscriptions
  subscribeToSecurityEvents(
    userId: string,
    callback: (event: SecurityEvent) => void
  ) {
    return this.supabase
      .channel('security_events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'security_events',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        callback(payload.new as SecurityEvent);
      })
      .subscribe();
  }

  subscribeToSecurityIncidents(
    userId: string,
    callback: (incident: SecurityIncident) => void
  ) {
    return this.supabase
      .channel('security_incidents')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'security_incidents',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        callback(payload.new as SecurityIncident);
      })
      .subscribe();
  }
}
