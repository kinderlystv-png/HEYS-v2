import React, { useState, useEffect, useCallback } from 'react';
import { SecurityAnalyticsService, IntegratedSecurityEvent } from '@heys/shared';

export interface SecurityDashboardProps {
  userId: string;
  clientId?: string;
  supabaseUrl: string;
  supabaseKey: string;
  timeRange?: 'hour' | 'day' | 'week' | 'month';
  enableRealTime?: boolean;
}

export interface SecurityAnalytics {
  overview: {
    total_events: number;
    unique_ips: number;
    error_rate: number;
    avg_response_time: number;
    failed_attempts: number;
    event_types: string[];
    risk_score: number;
    active_incidents: number;
    total_incidents: number;
  };
  threats: {
    top_threats: Array<{
      ioc_value: string;
      ioc_type: string;
      threat_actor: string;
      matches_count: number;
      last_seen: string;
    }>;
    threat_distribution: Array<{
      type: string;
      count: number;
    }>;
  };
  incidents: any[];
  trends: {
    events_trend: string;
    incidents_trend: string;
    risk_trend: string;
    response_time_trend: string;
  };
  ml_stats: any;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  userId,
  clientId,
  supabaseUrl,
  supabaseKey,
  timeRange = 'day',
  enableRealTime = true
}) => {
  const [analytics, setAnalytics] = useState<SecurityAnalytics | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<IntegratedSecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [securityService, setSecurityService] = useState<SecurityAnalyticsService | null>(null);

  // Инициализация сервиса
  useEffect(() => {
    const initializeService = async () => {
      try {
        const service = new SecurityAnalyticsService({
          supabaseUrl,
          supabaseKey,
          enableRealTimeProcessing: enableRealTime,
          enableAutomatedResponse: true
        });

        await service.initialize();
        setSecurityService(service);

        // Подписка на real-time события
        if (enableRealTime) {
          service.on('eventProcessed', (event: IntegratedSecurityEvent) => {
            setRealtimeEvents(prev => [event, ...prev.slice(0, 99)]); // последние 100 событий
          });

          service.on('incidentCreated', (incident: any) => {
            console.log('New security incident created:', incident);
          });

          service.subscribeToRealTimeEvents(userId);
          service.subscribeToRealTimeIncidents(userId);
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize security service');
        console.error('Security service initialization error:', err);
      }
    };

    initializeService();
  }, [userId, supabaseUrl, supabaseKey, enableRealTime]);

  // Загрузка аналитических данных
  const loadAnalytics = useCallback(async () => {
    if (!securityService) return;

    setIsLoading(true);
    try {
      const data = await securityService.getSecurityAnalytics(userId, clientId, timeRange);
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.error('Analytics loading error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [securityService, userId, clientId, timeRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Автообновление данных каждые 30 секунд
  useEffect(() => {
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, [loadAnalytics]);

  if (error) {
    return (
      <div className="security-dashboard error">
        <h2>🚨 Security Dashboard Error</h2>
        <p>{error}</p>
        <button onClick={loadAnalytics}>Retry</button>
      </div>
    );
  }

  if (isLoading || !analytics) {
    return (
      <div className="security-dashboard loading">
        <h2>🛡️ Security Dashboard</h2>
        <p>Loading security analytics...</p>
      </div>
    );
  }

  return (
    <div className="security-dashboard">
      <div className="dashboard-header">
        <h2>🛡️ Security Dashboard</h2>
        <div className="time-range-selector">
          <label>Time Range: </label>
          <select 
            value={timeRange} 
            onChange={() => window.location.reload()} // Simplified for demo
          >
            <option value="hour">Last Hour</option>
            <option value="day">Last Day</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
          </select>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>🔍 Total Events</h3>
          <div className="metric-value">{analytics.overview.total_events.toLocaleString()}</div>
          <div className="metric-trend">{analytics.trends.events_trend}</div>
        </div>

        <div className="metric-card">
          <h3>🚨 Active Incidents</h3>
          <div className="metric-value">{analytics.overview.active_incidents}</div>
          <div className="metric-trend">{analytics.trends.incidents_trend}</div>
        </div>

        <div className="metric-card">
          <h3>⚠️ Risk Score</h3>
          <div className={`metric-value risk-${getRiskLevel(analytics.overview.risk_score)}`}>
            {analytics.overview.risk_score}/100
          </div>
          <div className="metric-trend">{analytics.trends.risk_trend}</div>
        </div>

        <div className="metric-card">
          <h3>🌐 Unique IPs</h3>
          <div className="metric-value">{analytics.overview.unique_ips}</div>
        </div>

        <div className="metric-card">
          <h3>❌ Failed Attempts</h3>
          <div className="metric-value">{analytics.overview.failed_attempts}</div>
        </div>

        <div className="metric-card">
          <h3>⚡ Avg Response</h3>
          <div className="metric-value">{analytics.overview.avg_response_time.toFixed(0)}ms</div>
          <div className="metric-trend">{analytics.trends.response_time_trend}</div>
        </div>
      </div>

      {/* Top Threats */}
      <div className="threats-section">
        <h3>🎯 Top Threats</h3>
        <div className="threats-list">
          {analytics.threats.top_threats.slice(0, 5).map((threat, index) => (
            <div key={index} className="threat-item">
              <div className="threat-info">
                <span className="threat-type">{threat.ioc_type.toUpperCase()}</span>
                <span className="threat-value">{threat.ioc_value}</span>
                {threat.threat_actor && (
                  <span className="threat-actor">({threat.threat_actor})</span>
                )}
              </div>
              <div className="threat-stats">
                <span className="matches">{threat.matches_count} matches</span>
                <span className="last-seen">
                  {new Date(threat.last_seen).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Threat Distribution */}
      <div className="distribution-section">
        <h3>📊 Event Type Distribution</h3>
        <div className="distribution-chart">
          {analytics.threats.threat_distribution.map((item, index) => (
            <div key={index} className="distribution-item">
              <div className="distribution-bar">
                <div 
                  className="distribution-fill"
                  style={{ 
                    width: `${(item.count / (analytics.threats.threat_distribution[0]?.count || 1) * 100) || 0}%` 
                  }}
                />
              </div>
              <div className="distribution-label">
                <span>{item.type}</span>
                <span>{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="incidents-section">
        <h3>🚨 Recent Incidents</h3>
        <div className="incidents-list">
          {analytics.incidents.slice(0, 5).map((incident, index) => (
            <div key={index} className={`incident-item severity-${incident.severity}`}>
              <div className="incident-header">
                <span className="incident-title">{incident.title}</span>
                <span className={`incident-status status-${incident.status}`}>
                  {incident.status.toUpperCase()}
                </span>
              </div>
              <div className="incident-details">
                <span className="incident-severity">{incident.severity.toUpperCase()}</span>
                <span className="incident-time">
                  {new Date(incident.created_at).toLocaleString()}
                </span>
                {incident.ml_confidence && (
                  <span className="incident-confidence">
                    ML: {(incident.ml_confidence * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-time Events (if enabled) */}
      {enableRealTime && realtimeEvents.length > 0 && (
        <div className="realtime-section">
          <h3>⚡ Real-time Events</h3>
          <div className="realtime-events">
            {realtimeEvents.slice(0, 10).map((event, index) => (
              <div key={index} className={`realtime-event threat-${event.threat_level}`}>
                <div className="event-time">
                  {new Date(event.created_at).toLocaleTimeString()}
                </div>
                <div className="event-type">{event.event_type}</div>
                <div className="event-ip">{event.source_ip}</div>
                {event.anomaly_score && (
                  <div className="event-score">
                    Score: {(event.anomaly_score * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ML Statistics */}
      {analytics.ml_stats && (
        <div className="ml-stats-section">
          <h3>🤖 ML Model Statistics</h3>
          <div className="ml-stats">
            <div>Events Analyzed: {analytics.ml_stats.totalEventsAnalyzed || 0}</div>
            <div>Anomalies Detected: {analytics.ml_stats.anomaliesDetected || 0}</div>
            <div>Model Accuracy: {((analytics.ml_stats.modelAccuracy || 0) * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function
const getRiskLevel = (score: number): string => {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

export default SecurityDashboard;
