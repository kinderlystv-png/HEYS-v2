import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AlertDefinition, AnalyticsData, MetricDefinition, SystemStatus } from '../types';

interface WebSocketContextType {
  socket: WebSocket | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastHeartbeat: number | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  emit: (event: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  options?: {
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    heartbeatInterval?: number;
  };
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url = 'ws://localhost:3001',
  options = {},
}) => {
  const {
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000,
  } = options;

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);

  const reconnectAttempts = useRef(0);
  const heartbeatTimer = useRef<NodeJS.Timeout>();
  const subscriptions = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const connect = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    try {
      const newSocket = new WebSocket(url);

      newSocket.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        setLastHeartbeat(Date.now());
        reconnectAttempts.current = 0;

        // Start heartbeat
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
        }

        heartbeatTimer.current = setInterval(() => {
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            setLastHeartbeat(Date.now());
          }
        }, heartbeatInterval);
      };

      newSocket.onclose = (_event) => {
        console.log('❌ WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');

        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
        }

        // Auto reconnect
        if (autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
          setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, reconnectInterval);
        }
      };

      newSocket.onerror = (_error) => {
        console.error('🔥 WebSocket connection error');
        setConnectionStatus('error');
        reconnectAttempts.current++;

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          newSocket.close();
        }
      };

      newSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle heartbeat response
          if (message.type === 'pong') {
            setLastHeartbeat(Date.now());
            return;
          }

          // Emit to subscribers
          const eventCallbacks = subscriptions.current.get(message.type);
          if (eventCallbacks) {
            eventCallbacks.forEach((callback) => {
              try {
                callback(message.data);
              } catch (error) {
                console.error('Error in event callback:', error);
              }
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      setSocket(newSocket);
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [url, autoReconnect, reconnectInterval, maxReconnectAttempts, heartbeatInterval]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
      setConnectionStatus('disconnected');

      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
    }
  }, [socket]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!subscriptions.current.has(event)) {
      subscriptions.current.set(event, new Set());
    }

    subscriptions.current.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const eventCallbacks = subscriptions.current.get(event);
      if (eventCallbacks) {
        eventCallbacks.delete(callback);
        if (eventCallbacks.size === 0) {
          subscriptions.current.delete(event);
        }
      }
    };
  }, []);

  const emit = useCallback(
    (event: string, data: any) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: event, data }));
      } else {
        console.warn('Cannot emit event: WebSocket not connected');
      }
    },
    [socket],
  );

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const contextValue: WebSocketContextType = {
    socket,
    isConnected,
    connectionStatus,
    lastHeartbeat,
    connect,
    disconnect,
    subscribe,
    emit,
  };

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

// Hook for specific event subscriptions
export const useWebSocketEvent = <T = any,>(
  event: string,
  callback: (data: T) => void,
  dependencies: React.DependencyList = [],
) => {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(event, callback);
    return unsubscribe;
  }, [event, subscribe, callback, ...dependencies]);
};

// Hook for real-time analytics data
export const useRealTimeAnalytics = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    status: 'unknown',
    uptime: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    diskUsage: 0,
    activeConnections: 0,
    lastHealthCheck: Date.now(),
  });

  useWebSocketEvent<AnalyticsData>('analytics:data', (data) => {
    setAnalyticsData((prev) => [...prev.slice(-999), data]); // Keep last 1000 entries
  });

  useWebSocketEvent<SystemStatus>('system:status', (status) => {
    setSystemStatus(status);
  });

  return {
    analyticsData,
    systemStatus,
  };
};

// Hook for real-time alerts
export const useRealTimeAlerts = () => {
  const [activeAlerts, setActiveAlerts] = useState<AlertDefinition[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertDefinition[]>([]);

  useWebSocketEvent<AlertDefinition>('alert:triggered', (alert) => {
    setActiveAlerts((prev) => [...prev, alert]);
    setAlertHistory((prev) => [...prev.slice(-99), alert]); // Keep last 100 alerts
  });

  useWebSocketEvent<{ alertId: string }>('alert:resolved', ({ alertId }) => {
    setActiveAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  });

  useWebSocketEvent<AlertDefinition[]>('alerts:sync', (alerts) => {
    setActiveAlerts(alerts);
  });

  return {
    activeAlerts,
    alertHistory,
  };
};

// Hook for metric definitions
export const useMetricDefinitions = () => {
  const [metricDefinitions, setMetricDefinitions] = useState<MetricDefinition[]>([]);

  useWebSocketEvent<MetricDefinition[]>('metrics:definitions', (definitions) => {
    setMetricDefinitions(definitions);
  });

  useWebSocketEvent<MetricDefinition>('metric:definition:updated', (definition) => {
    setMetricDefinitions((prev) =>
      prev.map((def) => (def.id === definition.id ? definition : def)),
    );
  });

  useWebSocketEvent<MetricDefinition>('metric:definition:added', (definition) => {
    setMetricDefinitions((prev) => [...prev, definition]);
  });

  useWebSocketEvent<{ metricId: string }>('metric:definition:removed', ({ metricId }) => {
    setMetricDefinitions((prev) => prev.filter((def) => def.id !== metricId));
  });

  return {
    metricDefinitions,
  };
};
