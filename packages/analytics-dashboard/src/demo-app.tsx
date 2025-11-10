import React from 'react';
import { createRoot } from 'react-dom/client';

import { DemoSecurityDashboard } from './components/DemoSecurityDashboard';
import './components/SecurityDashboard.css';

// Mock для browser-совместимости
(window as any).global = window;

const DemoApp = () => {
  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f7fa', minHeight: '100vh' }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '30px',
          borderBottom: '2px solid #e1e8ed',
          paddingBottom: '20px'
        }}>
          <h1 style={{ 
            color: '#2c3e50', 
            fontSize: '2.5em',
            margin: '0 0 10px 0'
          }}>
            🛡️ HEYS Security Analytics Demo
          </h1>
          <p style={{ 
            color: '#7f8c8d', 
            fontSize: '1.2em',
            margin: '0'
          }}>
            Real-time Security Monitoring & Threat Detection
          </p>
          <div style={{ 
            marginTop: '15px',
            fontSize: '0.9em',
            color: '#95a5a6'
          }}>
            Running on: <strong>localhost:3001</strong> | 
            Environment: <strong>Development Demo</strong>
          </div>
        </div>
        
        <DemoSecurityDashboard />
        
        <div style={{ 
          textAlign: 'center', 
          marginTop: '30px',
          paddingTop: '20px',
          borderTop: '1px solid #e1e8ed',
          color: '#7f8c8d',
          fontSize: '0.9em'
        }}>
          <p>
            🔧 <strong>Demo Mode:</strong> Using simulated data for demonstration purposes
          </p>
          <p>
            📡 Real-time events are generated automatically every 3 seconds
          </p>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
);
