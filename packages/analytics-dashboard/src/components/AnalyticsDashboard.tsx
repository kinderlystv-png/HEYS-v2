import React, { useState, useEffect } from 'react';
import { WebSocketProvider, useWebSocket } from '../providers/WebSocketProvider';
import { MetricsProvider, useMetrics } from '../providers/MetricsProvider';
import { formatMetricValue, formatDuration, generateTimeRanges } from '../utils';

interface AnalyticsDashboardProps {
  title?: string;
  refreshInterval?: number;
  webSocketUrl?: string;
  className?: string;
}

const DashboardHeader: React.FC<{
  title: string;
  isConnected: boolean;
  connectionStatus: string;
  lastUpdate: number | null;
}> = ({ title, isConnected, connectionStatus, lastUpdate }) => {
  return (
    <div className="dashboard-header">
      <div className="header-content">
        <h1 className="dashboard-title">{title}</h1>
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              {isConnected ? 'Connected' : connectionStatus}
            </span>
          </div>
          {lastUpdate && (
            <div className="last-update">
              Last update: {formatDuration(Date.now() - lastUpdate)} ago
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: number;
  unit: string;
  trend?: number;
  trendLabel?: string;
  icon?: string;
  color?: string;
}> = ({ title, value, unit, trend, trendLabel, icon, color = '#4F46E5' }) => {
  const formattedValue = formatMetricValue(value, unit);
  const trendDirection = trend ? (trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral') : 'neutral';

  return (
    <div className="metric-card" style={{ borderTopColor: color }}>
      <div className="metric-header">
        {icon && <span className="metric-icon">{icon}</span>}
        <h3 className="metric-title">{title}</h3>
      </div>
      <div className="metric-value">
        <span className="value">{formattedValue}</span>
        {trend !== undefined && (
          <div className={`trend ${trendDirection}`}>
            <span className="trend-arrow">
              {trendDirection === 'up' ? '↗' : trendDirection === 'down' ? '↘' : '→'}
            </span>
            <span className="trend-value">{Math.abs(trend).toFixed(1)}%</span>
            {trendLabel && <span className="trend-label">{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const TimeRangeSelector: React.FC<{
  selectedRange: string;
  onRangeChange: (range: string) => void;
}> = ({ selectedRange, onRangeChange }) => {
  const timeRanges = generateTimeRanges();

  return (
    <div className="time-range-selector">
      <label htmlFor="timeRange">Time Range:</label>
      <select
        id="timeRange"
        value={selectedRange}
        onChange={(e) => onRangeChange(e.target.value)}
        className="time-range-select"
      >
        {timeRanges.map((range) => (
          <option key={range.value} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const AlertsList: React.FC<{
  alerts: any[];
  maxVisible?: number;
}> = ({ alerts, maxVisible = 5 }) => {
  const visibleAlerts = alerts.slice(0, maxVisible);

  if (visibleAlerts.length === 0) {
    return (
      <div className="alerts-empty">
        <span className="empty-icon">✅</span>
        <p>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="alerts-list">
      {visibleAlerts.map((alert, index) => (
        <div key={index} className={`alert-item ${alert.severity || 'medium'}`}>
          <div className="alert-content">
            <h4 className="alert-title">{alert.name || alert.message || 'Alert'}</h4>
            <p className="alert-description">
              {alert.description || `Triggered at ${new Date(alert.triggeredAt || alert.timestamp).toLocaleTimeString()}`}
            </p>
          </div>
          <div className="alert-meta">
            <span className={`severity-badge ${alert.severity || 'medium'}`}>
              {(alert.severity || 'medium').toUpperCase()}
            </span>
          </div>
        </div>
      ))}
      {alerts.length > maxVisible && (
        <div className="alerts-more">
          +{alerts.length - maxVisible} more alerts
        </div>
      )}
    </div>
  );
};

const DashboardContent: React.FC<{ selectedTimeRange: string }> = ({ selectedTimeRange: _selectedTimeRange }) => {
  const { isConnected, connectionStatus, lastHeartbeat } = useWebSocket();
  const { 
    metrics, 
    uxMetrics, 
    errorImpacts, 
    roiCalculations, 
    isProcessing,
    getBusinessInsights 
  } = useMetrics();

  const [insights, setInsights] = useState<any>(null);

  // Update insights when data changes
  useEffect(() => {
    const newInsights = getBusinessInsights();
    setInsights(newInsights);
  }, [metrics, getBusinessInsights]);

  // Calculate key metrics from current data
  const keyMetrics = React.useMemo(() => {
    const recentMetrics = metrics.slice(-100);
    const totalUsers = recentMetrics.filter(m => m.source === 'user').length;
    const avgPageLoad = recentMetrics
      .filter(m => m.source === 'performance')
      .reduce((sum, m) => sum + m.value, 0) / Math.max(recentMetrics.length, 1);
    const errorRate = (errorImpacts.length / Math.max(metrics.length, 1)) * 100;
    const totalROI = roiCalculations.reduce((sum, roi) => sum + roi.roi, 0);

    return {
      users: { value: totalUsers, trend: insights?.trends?.users?.changePercent || 0 },
      pageLoad: { value: avgPageLoad || 0, trend: insights?.trends?.performance?.changePercent || 0 },
      errorRate: { value: errorRate, trend: insights?.trends?.errors?.changePercent || 0 },
      roi: { value: totalROI, trend: 0 }
    };
  }, [metrics, errorImpacts, roiCalculations, insights]);

  return (
    <div className="dashboard-content">
      {/* Key Metrics Row */}
      <div className="metrics-grid">
        <MetricCard
          title="Active Users"
          value={keyMetrics.users.value}
          unit="users"
          trend={keyMetrics.users.trend}
          trendLabel="vs last period"
          icon="👥"
          color="#10B981"
        />
        <MetricCard
          title="Avg Page Load"
          value={keyMetrics.pageLoad.value}
          unit="ms"
          trend={keyMetrics.pageLoad.trend}
          trendLabel="vs last period"
          icon="⚡"
          color="#F59E0B"
        />
        <MetricCard
          title="Error Rate"
          value={keyMetrics.errorRate.value}
          unit="%"
          trend={keyMetrics.errorRate.trend}
          trendLabel="vs last period"
          icon="🚨"
          color="#EF4444"
        />
        <MetricCard
          title="Total ROI"
          value={keyMetrics.roi.value}
          unit="%"
          trend={keyMetrics.roi.trend}
          trendLabel="all initiatives"
          icon="📈"
          color="#8B5CF6"
        />
      </div>

      {/* Alerts Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>Active Alerts</h2>
          {isProcessing && <span className="processing-indicator">Processing...</span>}
        </div>
        <div className="section-content">
          <AlertsList alerts={errorImpacts} />
        </div>
      </div>

      {/* ROI Analysis */}
      {roiCalculations.length > 0 && (
        <div className="dashboard-section">
          <div className="section-header">
            <h2>ROI Analysis</h2>
            <span className="section-count">{roiCalculations.length} calculations</span>
          </div>
          <div className="section-content">
            <div className="roi-grid">
              {roiCalculations.slice(-3).map((roi, index) => (
                <div key={index} className="roi-card">
                  <h4>Investment Analysis #{index + 1}</h4>
                  <div className="roi-metrics">
                    <div className="roi-metric">
                      <span className="roi-label">ROI:</span>
                      <span className="roi-value">{roi.roi.toFixed(1)}%</span>
                    </div>
                    <div className="roi-metric">
                      <span className="roi-label">Payback:</span>
                      <span className="roi-value">{roi.paybackPeriod.toFixed(1)} months</span>
                    </div>
                    <div className="roi-metric">
                      <span className="roi-label">NPV:</span>
                      <span className="roi-value">${roi.netPresentValue.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UX Metrics */}
      {uxMetrics.length > 0 && (
        <div className="dashboard-section">
          <div className="section-header">
            <h2>User Experience</h2>
            <span className="section-count">{uxMetrics.length} sessions</span>
          </div>
          <div className="section-content">
            <div className="ux-summary">
              <p>Latest UX data from {uxMetrics.length} user sessions</p>
              <div className="ux-metrics">
                <div className="ux-metric">
                  <span>Avg Page Load:</span>
                  <span>{(uxMetrics.reduce((sum, m) => sum + m.pageLoadTime, 0) / uxMetrics.length).toFixed(0)}ms</span>
                </div>
                <div className="ux-metric">
                  <span>Avg CLS:</span>
                  <span>{(uxMetrics.reduce((sum, m) => sum + m.cumulativeLayoutShift, 0) / uxMetrics.length).toFixed(3)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>System Status</h2>
          <div className="status-indicators">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">{connectionStatus}</span>
          </div>
        </div>
        <div className="section-content">
          <div className="system-stats">
            <div className="stat">
              <span className="stat-label">Total Metrics:</span>
              <span className="stat-value">{metrics.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Error Impacts:</span>
              <span className="stat-value">{errorImpacts.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Connection:</span>
              <span className="stat-value">{isConnected ? 'Active' : 'Disconnected'}</span>
            </div>
            {lastHeartbeat && (
              <div className="stat">
                <span className="stat-label">Last Heartbeat:</span>
                <span className="stat-value">{formatDuration(Date.now() - lastHeartbeat)} ago</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  title = 'HEYS Analytics Dashboard',
  refreshInterval: _refreshInterval = 5000,
  webSocketUrl = 'ws://localhost:3001',
  className = ''
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');

  return (
    <div className={`analytics-dashboard ${className}`}>
      <WebSocketProvider url={webSocketUrl}>
        <MetricsProvider configuration={{ retentionPeriod: 24 * 60 * 60 * 1000 }}>
          <div className="dashboard-container">
            <DashboardHeader
              title={title}
              isConnected={true} // Will be connected through context
              connectionStatus="Connected"
              lastUpdate={Date.now()}
            />
            
            <div className="dashboard-controls">
              <TimeRangeSelector
                selectedRange={selectedTimeRange}
                onRangeChange={setSelectedTimeRange}
              />
            </div>

            <DashboardContent selectedTimeRange={selectedTimeRange} />
          </div>
        </MetricsProvider>
      </WebSocketProvider>
    </div>
  );
};

export default AnalyticsDashboard;
