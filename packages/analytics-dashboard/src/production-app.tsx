import { createRoot } from 'react-dom/client';

import { SecurityDashboard } from './components/SecurityDashboard';
import './components/SecurityDashboard.css';

// РЕАЛЬНАЯ конфигурация для production
const productionConfig = {
  supabaseUrl: process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL',
  supabaseKey: process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY',
  userId: 'real-user-id',
  timeRange: 'day' as const,
  enableRealTime: true,
};

const ProductionApp = () => {
  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f7fa', minHeight: '100vh' }}>
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: '10px',
          padding: '20px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: '30px',
            borderBottom: '2px solid #e1e8ed',
            paddingBottom: '20px',
          }}
        >
          <h1
            style={{
              color: '#2c3e50',
              fontSize: '2.5em',
              margin: '0 0 10px 0',
            }}
          >
            🛡️ HEYS Security Analytics - PRODUCTION
          </h1>
          <p
            style={{
              color: '#7f8c8d',
              fontSize: '1.2em',
              margin: '0',
            }}
          >
            Real-time Security Monitoring & Threat Detection
          </p>
          <div
            style={{
              marginTop: '15px',
              fontSize: '0.9em',
              color: '#95a5a6',
            }}
          >
            Environment: <strong style={{ color: '#e74c3c' }}>PRODUCTION</strong> | Data Source:{' '}
            <strong>Live Supabase Database</strong>
          </div>
        </div>

        {/* НАСТОЯЩИЙ SecurityDashboard с реальными данными */}
        <SecurityDashboard
          userId={productionConfig.userId}
          supabaseUrl={productionConfig.supabaseUrl}
          supabaseKey={productionConfig.supabaseKey}
          timeRange={productionConfig.timeRange}
          enableRealTime={productionConfig.enableRealTime}
        />

        <div
          style={{
            textAlign: 'center',
            marginTop: '30px',
            paddingTop: '20px',
            borderTop: '1px solid #e1e8ed',
            color: '#7f8c8d',
            fontSize: '0.9em',
          }}
        >
          <p style={{ color: '#e74c3c' }}>
            🔴 <strong>PRODUCTION MODE:</strong> Connected to live database
          </p>
          <p>📡 Real-time data from Supabase PostgreSQL</p>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ProductionApp />);
