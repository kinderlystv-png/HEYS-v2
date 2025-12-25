/**
 * Real-time Monitoring Dashboard
 *
 * Provides real-time monitoring capabilities with WebSocket support,
 * live metrics visualization, and alert management.
 */

import { getGlobalLogger } from './logger';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAlertSeverity = (value: unknown): value is Alert['severity'] =>
  value === 'info' || value === 'warning' || value === 'error' || value === 'critical';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration?: number; // seconds
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: number;
  acknowledged: boolean;
  resolvedAt?: number;
}

export interface LiveMetric {
  name: string;
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  unit: string;
  timestamp: number;
}

export class RealtimeMonitor {
  private ws?: WebSocket | undefined;
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private liveMetrics: Map<string, LiveMetric> = new Map();
  private subscribers: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(private websocketUrl?: string) {
    if (websocketUrl) {
      this.connect();
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connect(): void {
    const logger = getGlobalLogger();
    // Skip WebSocket connection in test environment
    if (typeof globalThis !== 'undefined' && globalThis.process?.env?.NODE_ENV === 'test') {
      return;
    }

    if (!this.websocketUrl || (this.ws && this.ws.readyState === 1)) {
      // 1 = OPEN
      return;
    }

    try {
      // Check if WebSocket is available
      if (typeof WebSocket === 'undefined') {
        logger.warn('WebSocket not available in this environment');
        return;
      }

      this.ws = new WebSocket(this.websocketUrl);

      this.ws.onopen = () => {
        logger.info('Real-time monitoring connected');
        this.emit('connection', { status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { metadata: { error } });
        }
      };

      this.ws.onclose = () => {
        logger.info('Real-time monitoring disconnected');
        this.emit('connection', { status: 'disconnected' });

        // Attempt to reconnect after 5 seconds
        setTimeout(() => this.connect(), 5000);
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error', { metadata: { error } });
        this.emit('error', { error });
      };
    } catch (error) {
      logger.error('Failed to connect to WebSocket', { metadata: { error } });
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }

    const subscribers = this.subscribers.get(event);
    if (subscribers) {
      subscribers.add(callback);
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.get(event)?.delete(callback);
    };
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const alertRule: AlertRule = {
      id: this.generateId(),
      ...rule,
    };

    this.alertRules.push(alertRule);
    this.emit('alert_rule_added', alertRule);

    return alertRule.id;
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(id: string): boolean {
    const index = this.alertRules.findIndex((rule) => rule.id === id);
    if (index >= 0) {
      const rule = this.alertRules.splice(index, 1)[0];
      this.emit('alert_rule_removed', rule);
      return true;
    }
    return false;
  }

  /**
   * Update live metric and check alerts
   */
  updateMetric(name: string, value: number, unit: string = 'ms'): void {
    const previous = this.liveMetrics.get(name);
    const current: LiveMetric = {
      name,
      current: value,
      previous: previous?.current ?? value,
      trend: this.calculateTrend(value, previous?.current),
      unit,
      timestamp: Date.now(),
    };

    this.liveMetrics.set(name, current);
    this.emit('metric_updated', current);

    // Check alerts
    this.checkAlerts(name, value);
  }

  /**
   * Get all live metrics
   */
  getLiveMetrics(): LiveMetric[] {
    return Array.from(this.liveMetrics.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter((alert) => !alert.acknowledged && !alert.resolvedAt);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(id: string): boolean {
    const alert = this.alerts.find((a) => a.id === id);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.emit('alert_acknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Resolve alert
   */
  resolveAlert(id: string): boolean {
    const alert = this.alerts.find((a) => a.id === id);
    if (alert && !alert.resolvedAt) {
      alert.resolvedAt = Date.now();
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Send data through WebSocket
   */
  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: unknown): void {
    if (!isRecord(data)) {
      this.emit('message', data);
      return;
    }

    const messageType = typeof data.type === 'string' ? data.type : 'message';
    switch (messageType) {
      case 'metric':
        if (typeof data.name === 'string' && typeof data.value === 'number') {
          const unit = typeof data.unit === 'string' ? data.unit : undefined;
          this.updateMetric(data.name, data.value, unit);
        } else {
          this.emit('message', data);
        }
        break;
      case 'alert':
        this.handleIncomingAlert(data);
        break;
      case 'system_status':
        this.emit('system_status', data);
        break;
      default:
        this.emit('message', data);
    }
  }

  private handleIncomingAlert(data: Record<string, unknown>): void {
    const alert: Alert = {
      id: typeof data.id === 'string' ? data.id : this.generateId(),
      ruleId: typeof data.ruleId === 'string' ? data.ruleId : 'unknown',
      message: typeof data.message === 'string' ? data.message : 'Alert received',
      severity: isAlertSeverity(data.severity) ? data.severity : 'info',
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
      acknowledged: false,
    };

    this.alerts.push(alert);
    this.emit('alert_triggered', alert);
  }

  private checkAlerts(metricName: string, value: number): void {
    const applicableRules = this.alertRules.filter(
      (rule) => rule.enabled && rule.metric === metricName,
    );

    for (const rule of applicableRules) {
      if (this.evaluateRule(rule, value)) {
        this.triggerAlert(rule, value);
      }
    }
  }

  private evaluateRule(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case 'gt':
        return value > rule.threshold;
      case 'gte':
        return value >= rule.threshold;
      case 'lt':
        return value < rule.threshold;
      case 'lte':
        return value <= rule.threshold;
      case 'eq':
        return value === rule.threshold;
      default:
        return false;
    }
  }

  private triggerAlert(rule: AlertRule, value: number): void {
    // Avoid duplicate alerts for the same rule within a short timeframe
    const recentAlert = this.alerts.find(
      (alert) =>
        alert.ruleId === rule.id &&
        Date.now() - alert.timestamp < (rule.duration || 60) * 1000 &&
        !alert.resolvedAt,
    );

    if (recentAlert) return;

    const alert: Alert = {
      id: this.generateId(),
      ruleId: rule.id,
      message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
      severity: value > rule.threshold * 2 ? 'critical' : 'warning',
      timestamp: Date.now(),
      acknowledged: false,
    };

    this.alerts.push(alert);
    this.emit('alert_triggered', alert);
  }

  private calculateTrend(current: number, previous?: number): 'up' | 'down' | 'stable' {
    if (!previous || previous === current) return 'stable';
    return current > previous ? 'up' : 'down';
  }

  private emit(event: string, data: unknown): void {
    const subscribers = this.subscribers.get(event);
    if (subscribers) {
      const logger = getGlobalLogger();
      subscribers.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in subscriber for event ${event}`, { metadata: { error } });
        }
      });
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Default instance for real-time monitoring
const DEFAULT_WS_URL = (() => {
  if (typeof process !== 'undefined' && process?.env?.MONITORING_WS_URL) {
    return typeof process !== 'undefined' ? process.env?.MONITORING_WS_URL : undefined;
  }
  return undefined;
})();

export const realtimeMonitor = new RealtimeMonitor(DEFAULT_WS_URL);

// Convenient helper functions
export const addAlert = (rule: Omit<AlertRule, 'id'>) => realtimeMonitor.addAlertRule(rule);
export const removeAlert = (id: string) => realtimeMonitor.removeAlertRule(id);
export const updateLiveMetric = (name: string, value: number, unit?: string) =>
  realtimeMonitor.updateMetric(name, value, unit);
export const getLiveMetrics = () => realtimeMonitor.getLiveMetrics();
export const getActiveAlerts = () => realtimeMonitor.getActiveAlerts();
