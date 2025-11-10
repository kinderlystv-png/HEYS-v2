import React, { useEffect, useRef, useState } from 'react';

import { MockSecurityAnalyticsService } from '../mock/MockSecurityAnalyticsService';
import './SecurityDashboard.css';

interface DemoSecurityDashboardProps {
  updateInterval?: number;
}

export const DemoSecurityDashboard: React.FC<DemoSecurityDashboardProps> = ({
  updateInterval = 5000,
}) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const analyticsService = useRef(new MockSecurityAnalyticsService());
  const unsubscribeRef = useRef<Function | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await analyticsService.current.initialize();
        const data = await analyticsService.current.getSecurityAnalytics();
        setAnalytics(data);
        setEvents(data.events || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Подписка на real-time события
    const subscribeToEvents = async () => {
      try {
        const unsubscribe = await analyticsService.current.subscribeToEvents((event: any) => {
          setEvents((prev) => [event, ...prev.slice(0, 9)]); // Последние 10 событий
          setLastUpdate(new Date());
        });
        unsubscribeRef.current = unsubscribe;
      } catch (err) {
        console.warn('Failed to subscribe to events:', err);
      }
    };

    subscribeToEvents();

    // Периодическое обновление данных
    const interval = setInterval(loadData, updateInterval);

    return () => {
      clearInterval(interval);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      analyticsService.current.destroy();
    };
  }, [updateInterval]);

  if (loading && !analytics) {
    return (
      <div className="security-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>🛡️ Loading Security Analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="security-dashboard error">
        <div className="error-message">
          <h3>❌ Error Loading Dashboard</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>🔄 Retry</button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { overview, threats, incidents, ml_stats } = analytics;

  const getRiskColor = (score: number) => {
    if (score >= 0.8) return '#ff4757'; // critical
    if (score >= 0.6) return '#ff6b35'; // high
    if (score >= 0.4) return '#ffa502'; // medium
    return '#2ed573'; // low
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return '#ff4757';
      case 'high':
        return '#ff6b35';
      case 'medium':
        return '#ffa502';
      case 'low':
        return '#2ed573';
      default:
        return '#747d8c';
    }
  };

  return (
    <div className="security-dashboard">
      <div className="dashboard-header">
        <h2>🛡️ Security Analytics Dashboard</h2>
        <div className="last-update">
          <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
          {loading && <div className="update-indicator">🔄</div>}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Security Overview Panel */}
        <div className="dashboard-panel overview-panel">
          <h3>📊 Security Overview</h3>
          <div className="overview-stats">
            <div className="stat-item">
              <span className="stat-value">{overview.total_events.toLocaleString()}</span>
              <span className="stat-label">Total Events</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{overview.unique_ips}</span>
              <span className="stat-label">Unique IPs</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{overview.failed_attempts}</span>
              <span className="stat-label">Failed Attempts</span>
            </div>
            <div className="stat-item risk-score">
              <span className="stat-value" style={{ color: getRiskColor(overview.risk_score) }}>
                {Math.round(overview.risk_score * 100)}%
              </span>
              <span className="stat-label">Risk Score</span>
            </div>
          </div>
        </div>

        {/* Threat Intelligence Panel */}
        <div className="dashboard-panel threats-panel">
          <h3>🎯 Threat Intelligence</h3>
          <div className="threats-list">
            {threats.top_threats.map((threat: any, index: number) => (
              <div key={index} className="threat-item">
                <div className="threat-info">
                  <strong>{threat.ioc_value}</strong>
                  <span className="threat-type">{threat.ioc_type}</span>
                </div>
                <div className="threat-details">
                  <span className="threat-actor">{threat.threat_actor}</span>
                  <span
                    className="threat-count"
                    style={{ color: getSeverityColor(threat.severity) }}
                  >
                    {threat.matches_count} matches
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Incidents Panel */}
        <div className="dashboard-panel incidents-panel">
          <h3>🚨 Recent Incidents</h3>
          <div className="incidents-list">
            {incidents.slice(0, 5).map((incident: any) => (
              <div key={incident.id} className="incident-item">
                <div className="incident-header">
                  <span className="incident-title">{incident.title}</span>
                  <span
                    className={`severity-badge severity-${incident.severity}`}
                    style={{ backgroundColor: getSeverityColor(incident.severity) }}
                  >
                    {incident.severity}
                  </span>
                </div>
                <div className="incident-meta">
                  <span className="incident-status">{incident.status}</span>
                  <span className="incident-time">
                    {new Date(incident.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ML Analytics Panel */}
        <div className="dashboard-panel ml-panel">
          <h3>🤖 ML Analytics</h3>
          <div className="ml-stats">
            <div className="ml-stat">
              <span className="ml-label">Events Analyzed</span>
              <span className="ml-value">{ml_stats.totalEventsAnalyzed?.toLocaleString()}</span>
            </div>
            <div className="ml-stat">
              <span className="ml-label">Anomalies Detected</span>
              <span className="ml-value">{ml_stats.anomaliesDetected}</span>
            </div>
            <div className="ml-stat">
              <span className="ml-label">Model Accuracy</span>
              <span className="ml-value">{Math.round((ml_stats.modelAccuracy || 0) * 100)}%</span>
            </div>
            <div className="ml-stat">
              <span className="ml-label">Threat Level</span>
              <span className="ml-value" style={{ color: getSeverityColor(ml_stats.threatLevel) }}>
                {ml_stats.threatLevel}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Events Panel */}
        <div className="dashboard-panel events-panel">
          <h3>📡 Real-time Events</h3>
          <div className="events-list">
            {events.slice(0, 6).map((event: any, index: number) => (
              <div key={event.id || index} className="event-item">
                <div className="event-type">
                  <span className="event-icon">
                    {event.event_type === 'authentication_failure' && '🔐'}
                    {event.event_type === 'suspicious_request' && '🕵️'}
                    {event.event_type === 'data_access' && '📁'}
                    {event.event_type === 'sql_injection' && '💉'}
                    {event.event_type === 'xss_attempt' && '🎭'}
                  </span>
                  <span>{event.event_type.replace('_', ' ')}</span>
                </div>
                <div className="event-details">
                  <span className="event-ip">{event.source_ip}</span>
                  <span
                    className="event-severity"
                    style={{ color: getSeverityColor(event.severity) }}
                  >
                    {event.severity}
                  </span>
                </div>
                <div className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Metrics Panel */}
        <div className="dashboard-panel metrics-panel">
          <h3>📈 Security Metrics</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">Error Rate</span>
              <span className="metric-value">{overview.error_rate}%</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Avg Response</span>
              <span className="metric-value">{overview.avg_response_time}ms</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Active Incidents</span>
              <span className="metric-value">{overview.active_incidents}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Processing Time</span>
              <span className="metric-value">{ml_stats.processingTime}ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoSecurityDashboard;
