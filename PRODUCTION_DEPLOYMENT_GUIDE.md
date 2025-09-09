# HEYS EAP 3.0 - Production Deployment Guide

## 📋 Overview

This guide provides comprehensive instructions for deploying HEYS EAP 3.0 to production environment with Next.js 14, Supabase, and TypeScript.

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Next.js 14 (App Router)
- **Backend**: Supabase PostgreSQL
- **Language**: TypeScript
- **Package Manager**: PNPM
- **Deployment**: Blue-Green Strategy
- **Monitoring**: Health Check System

### Deployment Slots
- **Blue Slot**: Current production environment
- **Green Slot**: New deployment target
- **Load Balancer**: Traffic routing between slots

## 🚀 Quick Start

### Prerequisites
```bash
# System Requirements
Node.js >= 18.0.0
PNPM >= 8.0.0
Git >= 2.40.0

# Environment Variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NODE_ENV=production
```

### Basic Deployment
```bash
# Clone repository
git clone <repository-url>
cd heys-v2

# Install dependencies
pnpm install

# Run deployment
node scripts/advanced-deploy.js deploy
```

## 📖 Deployment Process

### Phase 1: Pre-flight Checks
- ✅ System requirements validation
- ✅ Environment variables verification
- ✅ Dependencies security audit
- ✅ Database connectivity test
- ✅ External services health check
- ✅ Git repository status validation

### Phase 2: Environment Preparation
- 📁 Create backup directory
- 💾 Backup current deployment
- 🎯 Setup deployment slots (blue/green)
- ⚖️ Configure load balancer

### Phase 3: Build and Optimization
- 🧹 Clean previous build artifacts
- 📦 Install production dependencies
- 🧪 Run comprehensive test suite
- 🏗️ Build optimized production bundle
- ⚡ Asset optimization and compression
- 📄 Generate deployment manifest

### Phase 4: Slot Deployment
- 📋 Copy build artifacts to target slot
- 🔧 Configure slot environment variables
- 🔌 Start services in target slot
- 🔥 Application warm-up procedures

### Phase 5: Health Validation
- 🏥 Comprehensive health checks
- ⚡ Performance validation
- 🔒 Security vulnerability scan
- 🔗 Integration testing
- 📊 Load testing validation

### Phase 6: Traffic Switch
- 🔄 Blue-green traffic switch
- ✅ Traffic routing verification
- 📈 Real-time monitoring activation

### Phase 7: Post-deployment
- 📝 Update deployment registry
- 🧹 Cleanup old deployments
- 📢 Send deployment notifications
- 📊 Generate deployment report

## 🛠️ Deployment Options

### Standard Deployment
```bash
node scripts/advanced-deploy.js deploy
```

### Canary Deployment (10% traffic)
```bash
node scripts/advanced-deploy.js deploy --canary
```

### Rolling Deployment
```bash
node scripts/advanced-deploy.js deploy --rolling
```

### Deployment without Rollback
```bash
node scripts/advanced-deploy.js deploy --no-rollback
```

## 🔄 Rollback Procedures

### Automatic Rollback
- Triggered automatically on deployment failure
- Switches traffic back to stable slot
- Restores from deployment backup
- Validates rollback success

### Manual Rollback
```bash
node scripts/advanced-deploy.js rollback
```

### Emergency Rollback
```bash
# Stop new deployment immediately
pkill -f "advanced-deploy"

# Manual traffic switch
# Update load balancer configuration
# Point traffic to stable slot
```

## 📊 Health Monitoring

### Health Check Endpoints
```bash
# Application Health
GET /api/health

# Database Health
GET /api/health/database

# Performance Metrics
GET /api/health/performance

# Memory Usage
GET /api/health/memory

# Cache Statistics
GET /api/health/cache
```

### Health Check CLI
```bash
# Run comprehensive health check
node scripts/advanced-deploy.js health-check

# Individual checks
curl http://localhost:3001/api/health
curl http://localhost:4001/health
```

## 🔧 Configuration

### Production Environment Variables
```bash
# Application Configuration
NODE_ENV=production
PORT=3001
API_PORT=4001

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Performance Configuration
NEXT_PUBLIC_PERFORMANCE_MONITORING=true
NEXT_PUBLIC_ERROR_REPORTING=true

# Security Configuration
NEXT_PUBLIC_CSP_ENABLED=true
NEXT_PUBLIC_HSTS_ENABLED=true
```

### Build Configuration
```javascript
// next.config.js
const nextConfig = {
  output: 'standalone',
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@heys/ui', '@heys/utils']
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
}
```

## 📈 Performance Optimization

### Build Optimization
- **Tree Shaking**: Remove unused code
- **Code Splitting**: Lazy load components
- **Bundle Analysis**: Monitor bundle sizes
- **Asset Compression**: Gzip/Brotli compression
- **Image Optimization**: Next.js Image component

### Runtime Optimization
- **Memory Management**: Automated leak detection
- **Cache Strategy**: Multi-layer caching
- **Performance Monitoring**: Real-time metrics
- **Error Tracking**: Comprehensive error logging

## 🔒 Security

### Security Headers
```typescript
// Content Security Policy
'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'"

// HTTP Strict Transport Security
'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'

// X-Frame-Options
'X-Frame-Options': 'DENY'

// X-Content-Type-Options
'X-Content-Type-Options': 'nosniff'
```

### Environment Security
- 🔐 Environment variable encryption
- 🔑 Secure key management
- 🛡️ SQL injection prevention
- 🚫 XSS protection
- 🔒 CSRF protection

## 📊 Monitoring & Logging

### Deployment Logs
```bash
# View deployment logs
tail -f deployment-<deployment-id>.log

# View application logs
tail -f web.log
tail -f api.log
```

### Performance Metrics
- **Response Time**: Average response time < 200ms
- **Throughput**: Requests per second
- **Error Rate**: Error percentage < 1%
- **Memory Usage**: Heap utilization < 80%
- **CPU Usage**: CPU utilization < 70%

### Alerts Configuration
```yaml
alerts:
  response_time:
    threshold: 500ms
    action: notify_team
  
  error_rate:
    threshold: 5%
    action: auto_rollback
  
  memory_usage:
    threshold: 90%
    action: restart_service
```

## 🐛 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache and rebuild
rm -rf .next node_modules
pnpm install
pnpm run build
```

#### Database Connection Issues
```bash
# Check database connectivity
npx supabase status
curl -I $NEXT_PUBLIC_SUPABASE_URL
```

#### Performance Issues
```bash
# Run performance analysis
pnpm run analyze
node scripts/performance-baseline.js
```

#### Memory Leaks
```bash
# Memory profiling
node --inspect scripts/memory-profiler.js
```

### Recovery Procedures

#### Failed Deployment Recovery
1. Stop failed deployment processes
2. Switch traffic to stable slot
3. Investigate deployment logs
4. Fix issues and redeploy

#### Database Recovery
1. Check database backups
2. Verify data integrity
3. Restore from backup if needed
4. Update application configuration

## 📚 Reference

### CLI Commands
```bash
# Deployment
node scripts/advanced-deploy.js deploy          # Standard deployment
node scripts/advanced-deploy.js deploy --canary # Canary deployment
node scripts/advanced-deploy.js rollback        # Manual rollback

# Health Checks
node scripts/healthcheck.js                     # Basic health check
node packages/web/src/utils/healthCheck.js      # Comprehensive check

# Performance
node scripts/performance-baseline.js            # Performance baseline
node scripts/bundle-analysis.js                 # Bundle analysis
```

### File Structure
```
├── scripts/
│   ├── advanced-deploy.js           # Advanced deployment manager
│   ├── deploy.js                    # Basic deployment script
│   └── healthcheck.js               # Health check utilities
├── packages/
│   └── web/
│       ├── src/
│       │   ├── config/
│       │   │   └── production.config.ts    # Production configuration
│       │   └── utils/
│       │       └── healthCheck.ts          # Health check system
│       └── vite.config.production.ts       # Production Vite config
└── deployment-manifest.json        # Deployment metadata
```

### Environment Matrix
| Environment | Port | Database | Monitoring | Security |
|-------------|------|----------|------------|----------|
| Development | 3000 | Local    | Basic      | Disabled |
| Staging     | 3001 | Staging  | Enhanced   | Enabled  |
| Production  | 3001 | Prod     | Full       | Strict   |

## 🎯 Best Practices

### Deployment Strategy
- ✅ Always use blue-green deployment for zero downtime
- ✅ Run comprehensive tests before deployment
- ✅ Monitor health metrics during deployment
- ✅ Keep deployment backups for quick rollback
- ✅ Use canary deployment for risky changes

### Performance
- ⚡ Optimize bundle size with tree shaking
- ⚡ Implement proper caching strategies
- ⚡ Monitor memory usage and prevent leaks
- ⚡ Use CDN for static assets
- ⚡ Implement lazy loading for components

### Security
- 🔒 Keep dependencies updated
- 🔒 Use environment variables for secrets
- 🔒 Implement proper CORS policies
- 🔒 Enable security headers
- 🔒 Regular security audits

### Monitoring
- 📊 Set up comprehensive health checks
- 📊 Monitor key performance metrics
- 📊 Implement error tracking
- 📊 Set up automated alerts
- 📊 Regular performance reviews

## 📞 Support

### Emergency Contacts
- **DevOps Team**: devops@heys.com
- **Backend Team**: backend@heys.com
- **Frontend Team**: frontend@heys.com

### Documentation
- [API Documentation](./API.md)
- [Architecture Guide](./ARCHITECTURE.md)
- [Development Guide](./DEVELOPMENT.md)

---

**HEYS EAP 3.0 Production Deployment Guide v1.0**  
Last Updated: $(date)  
Environment: Production  
Status: Ready for Deployment ✅
