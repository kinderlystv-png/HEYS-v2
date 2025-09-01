# 🏗️ HEYS Platform Architecture

> **System Architecture Overview**  
> **Version:** 14.0.0  
> **Last Updated:** September 1, 2025

## 📊 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      🌐 CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  📱 Web App        📱 Mobile App       🖥️ Desktop App         │
│  (React 18)        (React Native)     (Electron)              │
│  ├─ PWA            ├─ iOS/Android     ├─ Windows/macOS/Linux  │
│  ├─ Service Worker ├─ Native Bridge   ├─ System Integration   │
│  └─ Offline First  └─ Push Notifs     └─ Auto-updater        │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 HTTPS/WSS
                                │
┌─────────────────────────────────────────────────────────────────┐
│                     🚀 APPLICATION LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ 🧠 Core Logic │  │ 🔐 Security   │  │ 🔌 Integration│      │
│  │               │  │               │  │               │      │
│  │ • User Mgmt   │  │ • Auth Layer  │  │ • Supabase    │      │
│  │ • Nutrition   │  │ • Validation  │  │ • REST APIs   │      │
│  │ • Training    │  │ • XSS Guard   │  │ • WebSockets  │      │
│  │ • Analytics   │  │ • Input San.  │  │ • File System │      │
│  │ • Reports     │  │ • Rate Limit  │  │ • External    │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🎯 SMART FEATURES ENGINE                                 │ │
│  │                                                           │ │
│  │ • 🔍 Smart Search (typo correction, fuzzy matching)     │ │
│  │ • 🎮 Gamification (achievements, progress tracking)     │ │
│  │ • 🚀 Universal Anchors (auto-navigation system)        │ │
│  │ • 📊 Enhanced Analytics (real-time insights)           │ │
│  │ • 🤖 AI-powered Recommendations                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 API Calls
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      💾 DATA LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐           ┌─────────────────┐              │
│  │ 🏛️ Legacy Core   │◄─────────►│ ☁️ Modern Cloud │              │
│  │ (localStorage)  │  Sync     │ (Supabase)      │              │
│  │                 │           │                 │              │
│  │ • Fast Access   │           │ • PostgreSQL    │              │
│  │ • Offline Mode  │           │ • Real-time     │              │
│  │ • Client Cache  │           │ • Auth System   │              │
│  │ • Day Records   │           │ • Row Security  │              │
│  │ • Settings      │           │ • Backups       │              │
│  └─────────────────┘           └─────────────────┘              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 📋 DATABASE SCHEMA                                          │ │
│  │                                                             │ │
│  │ Tables:                                                     │ │
│  │ • clients (id, name, curator_id, timestamps)               │ │
│  │ • kv_store (id, user_id, k, v, timestamps)                 │ │
│  │ • client_kv_store (id, user_id, client_id, k, v, ...)      │ │
│  │ • user_profiles (nutrition, training, preferences)         │ │
│  │ • food_database (nutritional information)                  │ │
│  │ • training_plans (workout routines, exercises)             │ │
│  │ • analytics_data (performance metrics, reports)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    USER     │───►│   CLIENT    │───►│ APPLICATION │───►│   DATABASE  │
│ Interaction │    │    LAYER    │    │    LAYER    │    │    LAYER    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ UI Component│    │ Core Logic  │    │ Data Store  │
                   │ State Mgmt  │    │ Validation  │    │ Sync Layer  │
                   │ User Events │    │ Business    │    │ Persistence │
                   └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ Service     │    │ Integration │    │ External    │
                   │ Worker      │    │ Layer       │    │ Services    │
                   │ Cache       │    │ API Calls   │    │ Third-party │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

## 🎯 Module Architecture

### 1. Core Modules

```
packages/core/
├── src/
│   ├── models/          # Data models (User, Food, Training)
│   ├── services/        # Business logic services
│   ├── security/        # Security & validation
│   └── integration/     # External service connectors
```

### 2. Application Modules

```
apps/
├── web/                 # React web application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Application pages
│   │   ├── hooks/       # Custom React hooks
│   │   └── utils/       # Utility functions
│   └── public/          # Static assets
├── mobile/              # React Native mobile app
└── desktop/             # Electron desktop app
```

### 3. Shared Packages

```
packages/
├── shared/              # Shared utilities and types
├── ui/                  # Reusable UI components
├── storage/             # Data persistence layer
├── analytics/           # Analytics and tracking
├── search/              # Smart search engine
└── gaming/              # Gamification features
```

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    🛡️ SECURITY LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🌐 Network Layer                                               │
│  ├── HTTPS/TLS Encryption                                      │
│  ├── CORS Policy                                               │
│  ├── Rate Limiting                                             │
│  └── DDoS Protection                                           │
│                                                                 │
│  🔐 Authentication Layer                                        │
│  ├── Supabase Auth (JWT tokens)                               │
│  ├── Session Management                                        │
│  ├── Multi-factor Authentication                               │
│  └── OAuth Integration                                         │
│                                                                 │
│  ✅ Validation Layer                                           │
│  ├── Input Sanitization                                        │
│  ├── Schema Validation                                         │
│  ├── XSS Prevention                                            │
│  └── SQL Injection Protection                                  │
│                                                                 │
│  🗃️ Data Protection Layer                                      │
│  ├── Row Level Security (RLS)                                  │
│  ├── Encrypted Storage                                         │
│  ├── Data Anonymization                                        │
│  └── GDPR Compliance                                           │
└─────────────────────────────────────────────────────────────────┘
```

## ⚡ Performance Architecture

### Caching Strategy

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Browser     │    │ Service     │    │ Application │    │ Database    │
│ Cache       │    │ Worker      │    │ Cache       │    │ Cache       │
├─────────────┤    ├─────────────┤    ├─────────────┤    ├─────────────┤
│ • Static    │    │ • API Resp. │    │ • Memory    │    │ • Query     │
│ • Assets    │    │ • Offline   │    │ • Redis     │    │ • Indexes   │
│ • Images    │    │ • Background│    │ • Sessions  │    │ • Views     │
│ • Scripts   │    │ • Sync      │    │ • Objects   │    │ • Triggers  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                    │                    │                    │
      └────────────────────┼────────────────────┼────────────────────┘
                           │                    │
                    ⚡ Fast Access        💾 Persistent Storage
```

### Load Balancing

```
        ┌─────────────┐
        │ Load        │
        │ Balancer    │
        └─────────────┘
               │
        ┌──────┴──────┐
        │             │
  ┌─────────┐   ┌─────────┐
  │ Server  │   │ Server  │
  │ Node 1  │   │ Node 2  │
  └─────────┘   └─────────┘
        │             │
        └──────┬──────┘
               │
    ┌─────────────────┐
    │   Database      │
    │   Cluster       │
    └─────────────────┘
```

## 🔄 Synchronization Architecture

### Dual-Layer Sync

```
┌─────────────────────────────────────────────────────────────────┐
│                 💾 LOCAL STORAGE (Legacy Core)                 │
├─────────────────────────────────────────────────────────────────┤
│ • Instant Access          • Offline Capability                 │
│ • Client Caching          • Fast Read/Write                    │
│ • Day Records             • Settings Storage                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 Bidirectional Sync
                                │
┌─────────────────────────────────────────────────────────────────┐
│                  ☁️ CLOUD STORAGE (Supabase)                   │
├─────────────────────────────────────────────────────────────────┤
│ • Multi-device Access     • Real-time Updates                  │
│ • Backup & Recovery        • Collaborative Features            │
│ • Analytics & Reporting    • Admin Dashboard                   │
└─────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution

```
Local Change    Cloud Change    Resolution Strategy
─────────────   ─────────────   ──────────────────
Timestamp A  ┌─ Timestamp B  ─► Last Writer Wins
Value X      │  Value Y
             │
User Action  └─ Server Action ─► User Priority

Offline Mode ┌─ Online Sync  ─► Merge Strategy
Queue        │  Real-time
```

## 🚀 Deployment Architecture

### Development Environment

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Development │    │ Staging     │    │ Production  │
│ Environment │    │ Environment │    │ Environment │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ • Hot Reload│    │ • Testing   │    │ • Optimized │
│ • Debug     │    │ • QA        │    │ • Monitoring│
│ • Local DB  │    │ • Review    │    │ • Scaling   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                   ┌─────────────┐
                   │   CI/CD     │
                   │  Pipeline   │
                   │             │
                   │ • Tests     │
                   │ • Build     │
                   │ • Deploy    │
                   └─────────────┘
```

### Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      🐳 DOCKER CONTAINERS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    Web      │  │   Mobile    │  │  Desktop    │             │
│  │    App      │  │    App      │  │    App      │             │
│  │  (React)    │  │ (RN Bundle) │  │ (Electron)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   API       │  │   Worker    │  │   Monitor   │             │
│  │  Server     │  │  Services   │  │  Services   │             │
│  │  (Node.js)  │  │ (Background)│  │ (Analytics) │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🗄️ Shared Volumes (Config, Logs, Cache)                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Monitoring & Observability

### System Health Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    📈 SYSTEM METRICS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Performance Metrics   │  Error Tracking      │  User Analytics │
│ ├── Response Time     │  ├── Error Rate      │  ├── DAU/MAU    │
│ ├── Throughput        │  ├── Error Types     │  ├── Retention  │
│ ├── CPU Usage         │  ├── Stack Traces    │  ├── Features   │
│ └── Memory Usage      │  └── Resolution      │  └── Conversion │
│                       │                      │                 │
│ Database Metrics      │  Security Metrics    │  Business KPIs  │
│ ├── Query Time        │  ├── Failed Logins   │  ├── Revenue    │
│ ├── Connection Pool   │  ├── Blocked IPs     │  ├── Growth     │
│ ├── Storage Usage     │  ├── Vulnerability   │  ├── Engagement │
│ └── Backup Status     │  └── Compliance      │  └── Support    │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Development Tools & Workflows

### Build Pipeline

```
📝 Code → 🔍 Lint → 🧪 Test → 📦 Build → 🚀 Deploy
   │         │         │         │         │
   │         │         │         │         └── Production
   │         │         │         └── Bundle Optimization
   │         │         └── Unit/Integration Tests
   │         └── ESLint + Prettier
   └── TypeScript + React
```

### Quality Gates

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Code Review │    │   Testing   │    │ Performance │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ • PR Review │    │ • Unit      │    │ • Lighthouse│
│ • Standards │    │ • E2E       │    │ • Bundle    │
│ • Security  │    │ • Visual    │    │ • Memory    │
└─────────────┘    └─────────────┘    └─────────────┘
```

## 🎯 Future Architecture Considerations

### Microservices Evolution

```
Current Monolith          Future Microservices
┌─────────────┐          ┌───┐ ┌───┐ ┌───┐ ┌───┐
│             │          │API│ │USR│ │NUT│ │TRN│
│    HEYS     │    ───►  │GW │ │SVC│ │SVC│ │SVC│
│   Platform  │          └───┘ └───┘ └───┘ └───┘
│             │              │     │     │     │
└─────────────┘              └─────┼─────┼─────┘
                                   │     │
                             ┌───┐ │ ┌───┐ ┌───┐
                             │ANA│ │ │GAM│ │INT│
                             │SVC│ │ │SVC│ │SVC│
                             └───┘   └───┘ └───┘
```

### Scalability Roadmap

- **Phase 1**: Optimize current monolith
- **Phase 2**: Extract core services
- **Phase 3**: Implement microservices
- **Phase 4**: Auto-scaling infrastructure
- **Phase 5**: Global CDN deployment

---

## 📚 Additional Documentation

- [**API Documentation**](./API_DOCUMENTATION.md) - Comprehensive API reference
- [**Security Guide**](../SECURITY.md) - Security implementation details
- [**Development Guide**](../CONTRIBUTING.md) - Development setup and guidelines
- [**Deployment Guide**](./guides/DEPLOYMENT.md) - Production deployment
  instructions

---

**© 2025 HEYS Development Team** | Architecture by @system-architects
