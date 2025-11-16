import React from 'react';

import { debugLogger, type LogEntry } from '../utils/debugLogger';

const LEVEL_COLORS = {
  info: '#2196F3',
  success: '#4CAF50',
  warn: '#FF9800',
  error: '#F44336'
};

const LEVEL_ICONS = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌'
};

export function DebugPanel() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [selectedLog, setSelectedLog] = React.useState<LogEntry | null>(null);

  React.useEffect(() => {
    return debugLogger.subscribe(setLogs);
  }, []);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#2196F3',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          fontSize: '24px',
          cursor: 'pointer',
          zIndex: 9999
        }}
        type="button"
      >
        🐛
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '60vh',
        background: 'rgba(0,0,0,0.95)',
        color: '#fff',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '2px solid #2196F3'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: '#1976D2',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          🐛 Debug Console ({logs.length})
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => debugLogger.clear()}
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '12px',
              cursor: 'pointer'
            }}
            type="button"
          >
            Clear
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '16px',
              cursor: 'pointer'
            }}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {/* Logs List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {logs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
            No logs yet
          </div>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            onClick={() => setSelectedLog(log)}
            style={{
              padding: '8px 12px',
              marginBottom: '4px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '4px',
              borderLeft: `3px solid ${LEVEL_COLORS[log.level]}`,
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>{LEVEL_ICONS[log.level]}</span>
              <span style={{ color: '#999', fontSize: '10px' }}>{log.timestamp}</span>
              <span style={{ flex: 1 }}>{log.message}</span>
            </div>
            {log.data && (
              <div
                style={{
                  marginTop: '4px',
                  fontSize: '10px',
                  color: '#aaa',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span>{LEVEL_ICONS[selectedLog.level]}</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{selectedLog.level.toUpperCase()}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
              {selectedLog.timestamp}
            </div>
            <div style={{ marginBottom: '16px', fontSize: '14px' }}>
              {selectedLog.message}
            </div>
            {selectedLog.data && (
              <div
                style={{
                  background: '#000',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
              >
                {JSON.stringify(selectedLog.data, null, 2)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
