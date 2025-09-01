import { test, expect } from '@playwright/test';

// Mock data для тестирования
const mockSecurityAnalytics = {
  overview: {
    total_events: 1250,
    unique_ips: 45,
    error_rate: 0.12,
    avg_response_time: 150,
    failed_attempts: 23,
    event_types: ['login', 'api_call', 'data_access', 'error'],
    risk_score: 65,
    active_incidents: 3,
    total_incidents: 12
  },
  threats: {
    top_threats: [
      {
        ioc_value: '192.168.1.100',
        ioc_type: 'ip',
        threat_actor: 'APT29',
        matches_count: 15,
        last_seen: '2025-09-01T10:30:00Z'
      },
      {
        ioc_value: 'malware.example.com',
        ioc_type: 'domain',
        threat_actor: 'Lazarus Group',
        matches_count: 8,
        last_seen: '2025-09-01T09:15:00Z'
      }
    ],
    threat_distribution: [
      { type: 'login', count: 450 },
      { type: 'api_call', count: 380 },
      { type: 'data_access', count: 280 },
      { type: 'error', count: 140 }
    ]
  },
  incidents: [
    {
      id: '1',
      title: 'Suspicious Login Activity',
      severity: 'high',
      status: 'investigating',
      created_at: '2025-09-01T10:00:00Z',
      ml_confidence: 0.85
    },
    {
      id: '2',
      title: 'Anomalous API Usage',
      severity: 'medium',
      status: 'open',
      created_at: '2025-09-01T09:30:00Z',
      ml_confidence: 0.72
    }
  ],
  trends: {
    events_trend: '+15%',
    incidents_trend: '+3%',
    risk_trend: '-5%',
    response_time_trend: '-10%'
  },
  ml_stats: {
    totalEventsAnalyzed: 10000,
    anomaliesDetected: 45,
    modelAccuracy: 0.94
  }
};

test.describe('Security Dashboard Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('/api/security/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSecurityAnalytics)
      });
    });

    // Navigate to security dashboard
    await page.goto('/security-dashboard');
  });

  test('should display security dashboard layout correctly', async ({ page }) => {
    // Check main dashboard container
    await expect(page.locator('.security-dashboard')).toBeVisible();
    
    // Check header
    await expect(page.locator('.dashboard-header h2')).toContainText('Security Dashboard');
    await expect(page.locator('.time-range-selector')).toBeVisible();
    
    // Take full page screenshot
    await expect(page).toHaveScreenshot('security-dashboard-full.png');
  });

  test('should display metrics grid correctly', async ({ page }) => {
    const metricsGrid = page.locator('.metrics-grid');
    await expect(metricsGrid).toBeVisible();
    
    // Check all metric cards are present
    const metricCards = page.locator('.metric-card');
    await expect(metricCards).toHaveCount(6);
    
    // Check specific metrics
    await expect(page.locator('.metric-card').first()).toContainText('Total Events');
    await expect(page.locator('.metric-card').first()).toContainText('1,250');
    
    // Check risk score styling
    const riskCard = page.locator('.metric-card').filter({ hasText: 'Risk Score' });
    await expect(riskCard.locator('.metric-value')).toHaveClass(/risk-high/);
    
    // Screenshot metrics grid
    await expect(metricsGrid).toHaveScreenshot('metrics-grid.png');
  });

  test('should display threats section correctly', async ({ page }) => {
    const threatsSection = page.locator('.threats-section');
    await expect(threatsSection).toBeVisible();
    
    // Check threats list
    const threatItems = page.locator('.threat-item');
    await expect(threatItems).toHaveCount(2);
    
    // Check first threat
    const firstThreat = threatItems.first();
    await expect(firstThreat).toContainText('IP');
    await expect(firstThreat).toContainText('192.168.1.100');
    await expect(firstThreat).toContainText('APT29');
    await expect(firstThreat).toContainText('15 matches');
    
    // Screenshot threats section
    await expect(threatsSection).toHaveScreenshot('threats-section.png');
  });

  test('should display threat distribution chart', async ({ page }) => {
    const distributionSection = page.locator('.distribution-section');
    await expect(distributionSection).toBeVisible();
    
    // Check distribution items
    const distributionItems = page.locator('.distribution-item');
    await expect(distributionItems).toHaveCount(4);
    
    // Check first distribution item has the longest bar
    const firstItem = distributionItems.first();
    const firstBar = firstItem.locator('.distribution-fill');
    await expect(firstBar).toHaveCSS('width', /100%/);
    
    // Screenshot distribution chart
    await expect(distributionSection).toHaveScreenshot('distribution-chart.png');
  });

  test('should display incidents section correctly', async ({ page }) => {
    const incidentsSection = page.locator('.incidents-section');
    await expect(incidentsSection).toBeVisible();
    
    // Check incidents list
    const incidentItems = page.locator('.incident-item');
    await expect(incidentItems).toHaveCount(2);
    
    // Check first incident
    const firstIncident = incidentItems.first();
    await expect(firstIncident).toHaveClass(/severity-high/);
    await expect(firstIncident).toContainText('Suspicious Login Activity');
    await expect(firstIncident).toContainText('INVESTIGATING');
    await expect(firstIncident).toContainText('ML: 85.0%');
    
    // Screenshot incidents section
    await expect(incidentsSection).toHaveScreenshot('incidents-section.png');
  });

  test('should display ML stats section', async ({ page }) => {
    const mlStatsSection = page.locator('.ml-stats-section');
    await expect(mlStatsSection).toBeVisible();
    
    // Check ML statistics
    await expect(mlStatsSection).toContainText('Events Analyzed: 10000');
    await expect(mlStatsSection).toContainText('Anomalies Detected: 45');
    await expect(mlStatsSection).toContainText('Model Accuracy: 94.0%');
    
    // Screenshot ML stats
    await expect(mlStatsSection).toHaveScreenshot('ml-stats-section.png');
  });

  test('should handle time range selector', async ({ page }) => {
    const timeRangeSelector = page.locator('.time-range-selector select');
    await expect(timeRangeSelector).toBeVisible();
    
    // Check default value
    await expect(timeRangeSelector).toHaveValue('day');
    
    // Check all options are available
    const options = page.locator('.time-range-selector select option');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toContainText('Last Hour');
    await expect(options.nth(1)).toContainText('Last Day');
    await expect(options.nth(2)).toContainText('Last Week');
    await expect(options.nth(3)).toContainText('Last Month');
  });

  test('should display loading state', async ({ page }) => {
    // Mock slow response
    await page.route('/api/security/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSecurityAnalytics)
      });
    });

    await page.goto('/security-dashboard');
    
    // Check loading state
    await expect(page.locator('.security-dashboard.loading')).toBeVisible();
    await expect(page.locator('.security-dashboard.loading')).toContainText('Loading security analytics...');
    
    // Screenshot loading state
    await expect(page.locator('.security-dashboard.loading')).toHaveScreenshot('loading-state.png');
  });

  test('should display error state', async ({ page }) => {
    // Mock error response
    await page.route('/api/security/**', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto('/security-dashboard');
    
    // Check error state
    await expect(page.locator('.security-dashboard.error')).toBeVisible();
    await expect(page.locator('.security-dashboard.error')).toContainText('Security Dashboard Error');
    await expect(page.locator('.security-dashboard.error button')).toContainText('Retry');
    
    // Screenshot error state
    await expect(page.locator('.security-dashboard.error')).toHaveScreenshot('error-state.png');
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check mobile layout
    await expect(page.locator('.security-dashboard')).toBeVisible();
    
    // Check responsive metrics grid
    const metricsGrid = page.locator('.metrics-grid');
    await expect(metricsGrid).toBeVisible();
    
    // Screenshot mobile view
    await expect(page).toHaveScreenshot('security-dashboard-mobile.png');
  });

  test('should handle real-time events', async ({ page }) => {
    // Mock real-time events
    const mockRealTimeEvent = {
      id: 'rt-1',
      event_type: 'login',
      source_ip: '192.168.1.200',
      threat_level: 'medium',
      anomaly_score: 0.65,
      created_at: new Date().toISOString()
    };

    // Navigate and wait for initial load
    await page.goto('/security-dashboard?realtime=true');
    await page.waitForSelector('.security-dashboard:not(.loading)');
    
    // Simulate real-time event
    await page.evaluate((event) => {
      window.dispatchEvent(new CustomEvent('realTimeEvent', { detail: event }));
    }, mockRealTimeEvent);
    
    // Check real-time section appears
    await expect(page.locator('.realtime-section')).toBeVisible();
    await expect(page.locator('.realtime-event').first()).toContainText('login');
    await expect(page.locator('.realtime-event').first()).toContainText('192.168.1.200');
    
    // Screenshot real-time section
    await expect(page.locator('.realtime-section')).toHaveScreenshot('realtime-events.png');
  });

  test('should handle dark theme (if implemented)', async ({ page }) => {
    // Set dark theme preference
    await page.emulateMedia({ colorScheme: 'dark' });
    
    await page.goto('/security-dashboard');
    await page.waitForSelector('.security-dashboard:not(.loading)');
    
    // Screenshot dark theme
    await expect(page).toHaveScreenshot('security-dashboard-dark.png');
  });
});
