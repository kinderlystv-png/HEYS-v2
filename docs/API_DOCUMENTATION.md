# 🚀 HEYS API Documentation

> **Version:** 14.0.0  
> **Last Updated:** September 1, 2025  
> **Maintainer:** @development-team

## 📋 Overview

HEYS Platform provides a comprehensive API for nutrition tracking, training
management, and data synchronization. The API is built on a dual-layer
architecture combining Legacy Core and Modern Web Technologies.

## 🏗️ Architecture

### Core Components

- **Legacy Core** - LocalStorage-based data management
- **Modern Layer** - TypeScript/React with Supabase integration
- **Security Layer** - Input validation and XSS protection
- **Integration Layer** - Multi-service connectors

## 🔐 Authentication

### Supabase Authentication

All authenticated endpoints require a valid Supabase session.

```javascript
// Sign in
const { user, error } = await cloud.signIn(email, password);

// Get current user
const user = cloud.getUser();

// Sign out
cloud.signOut();
```

## 📊 Core APIs

### 1. User Management

#### Authentication

```javascript
// POST /auth/signin
cloud.signIn(email, password);
// Returns: { user?, error? }

// POST /auth/signout
cloud.signOut();
// Returns: void

// GET /auth/user
cloud.getUser();
// Returns: SupabaseUser | null
```

#### User Data

```javascript
// GET /users/profile
HEYS.User.getProfile();
// Returns: UserProfile

// PUT /users/profile
HEYS.User.updateProfile(data);
// Returns: boolean
```

### 2. Client Management

#### Client CRUD Operations

```javascript
// GET /clients
fetchClientsFromCloud(curatorId);
// Returns: Client[]

// POST /clients
addClientToCloud(name);
// Returns: Client

// PUT /clients/:id
renameClient(id, name);
// Returns: boolean

// DELETE /clients/:id
removeClient(id);
// Returns: boolean
```

### 3. Data Synchronization

#### Key-Value Storage

```javascript
// Global Storage
cloud.saveKey(key, value); // POST /kv/global
cloud.getKey(key); // GET /kv/global/:key
cloud.deleteKey(key); // DELETE /kv/global/:key

// Client-specific Storage
cloud.saveClientKey(clientId, key, value); // POST /kv/client
cloud.getClientKey(clientId, key); // GET /kv/client/:clientId/:key
cloud.deleteClientKey(clientId, key); // DELETE /kv/client/:clientId/:key
```

#### Sync Operations

```javascript
// Full Bootstrap Sync
cloud.bootstrapSync(); // GET /sync/bootstrap
cloud.bootstrapClientSync(clientId); // GET /sync/client/:clientId

// Incremental Sync
cloud.syncToCloud(); // POST /sync/push
cloud.syncFromCloud(); // POST /sync/pull
```

### 4. Nutrition Management

#### Food Database

```javascript
// GET /nutrition/foods
HEYS.Food.search(query, options);
// Returns: Food[]

// GET /nutrition/foods/:id
HEYS.Food.getById(id);
// Returns: Food

// POST /nutrition/foods
HEYS.Food.create(foodData);
// Returns: Food
```

#### Meal Tracking

```javascript
// POST /nutrition/meals
HEYS.Nutrition.addMeal(mealData)
// Returns: Meal

// GET /nutrition/meals
HEYS.Nutrition.getMeals(date?, clientId?)
// Returns: Meal[]

// GET /nutrition/summary
HEYS.Nutrition.getDailySummary(date, clientId?)
// Returns: NutritionSummary
```

### 5. Training Management

#### Training Plans

```javascript
// GET /training/plans
HEYS.Training.getPlans(clientId?)
// Returns: TrainingPlan[]

// POST /training/plans
HEYS.Training.createPlan(planData)
// Returns: TrainingPlan

// PUT /training/plans/:id
HEYS.Training.updatePlan(id, planData)
// Returns: TrainingPlan
```

#### Workout Sessions

```javascript
// POST /training/sessions
HEYS.Training.startSession(planId)
// Returns: WorkoutSession

// PUT /training/sessions/:id
HEYS.Training.updateSession(id, sessionData)
// Returns: WorkoutSession

// GET /training/sessions
HEYS.Training.getSessions(clientId?, date?)
// Returns: WorkoutSession[]
```

### 6. Analytics & Reporting

#### Progress Tracking

```javascript
// GET /analytics/progress
HEYS.Analytics.getProgress(clientId, period);
// Returns: ProgressData

// GET /analytics/reports
HEYS.Analytics.generateReport(type, filters);
// Returns: Report

// GET /analytics/metrics
HEYS.Analytics.getMetrics(clientId);
// Returns: MetricsData
```

## 🔌 Integration Layer

### External Service Connectors

#### Supabase Integration

```javascript
// Connection Management
IntegrationLayer.connectSupabase(credentials);
IntegrationLayer.testSupabaseConnection(connection);
IntegrationLayer.syncSupabase(connection, direction, filters);
```

#### REST API Integration

```javascript
// Generic REST API
IntegrationLayer.connectRestAPI(credentials);
IntegrationLayer.syncRestAPI(connection, direction, filters);
IntegrationLayer.testRestAPIConnection(connection);
```

#### WebSocket Integration

```javascript
// Real-time Connections
IntegrationLayer.connectWebSocket(credentials);
IntegrationLayer.handleWebSocketMessage(connection, message);
```

#### File System Integration

```javascript
// Local File Operations
IntegrationLayer.connectFileSystem(credentials);
IntegrationLayer.syncFileSystem(connection, direction, filters);
```

## 🛡️ Security & Validation

### Request Validation

```javascript
// Secure API Handler
SecureHeysCore.handleApiRequest(request);
// Validates and sanitizes all API requests

// Input Validation
SecurityValidator.validateInput(data, schema);
SecurityValidator.sanitizeInput(data);
```

### Security Headers

- **XSS Protection** - Automatic content sanitization
- **CSRF Protection** - Token-based validation
- **Input Validation** - Schema-based validation
- **Rate Limiting** - Automatic throttling

## 📱 Platform-Specific APIs

### Web Application

- **Service Worker** - Offline functionality
- **LocalStorage** - Client-side caching
- **Progressive Web App** - Install capabilities

### Mobile Application

- **Native Bridge** - Platform integration
- **Push Notifications** - Real-time updates
- **Offline Sync** - Background synchronization

### Desktop Application

- **System Integration** - File system access
- **Background Services** - System tray functionality
- **Auto-updater** - Seamless updates

## 🔍 Search & Discovery

### Smart Search Engine

```javascript
// Advanced Search with Typo Correction
HEYS.Search.smartSearch(query, options);
// Returns: SearchResults

// Auto-complete
HEYS.Search.suggest(partialQuery, context);
// Returns: Suggestion[]

// Search Analytics
HEYS.Search.getSearchMetrics();
// Returns: SearchMetrics
```

## 📈 Monitoring & Diagnostics

### Health Checks

```javascript
// System Health
HEYS.Diagnostics.getSystemHealth();
// Returns: HealthStatus

// Performance Metrics
HEYS.Performance.getMetrics();
// Returns: PerformanceData

// Error Tracking
HEYS.ErrorLogger.getRecentErrors();
// Returns: ErrorLog[]
```

## 🚀 Usage Examples

### Complete User Flow Example

```javascript
// 1. Authentication
const { user } = await cloud.signIn('user@example.com', 'password');

// 2. Load client data
const clients = await fetchClientsFromCloud(user.id);
const clientId = clients[0].id;

// 3. Add nutrition data
const meal = await HEYS.Nutrition.addMeal({
  clientId,
  foodId: 'food_123',
  quantity: 150,
  mealType: 'breakfast',
});

// 4. Track training
const session = await HEYS.Training.startSession('plan_456');
await HEYS.Training.updateSession(session.id, {
  exercises: [{ name: 'Push-ups', sets: 3, reps: 15 }],
});

// 5. Generate report
const report = await HEYS.Analytics.generateReport('weekly', {
  clientId,
  startDate: '2025-08-25',
  endDate: '2025-09-01',
});
```

## 🔧 Error Handling

### Standard Error Format

```javascript
{
  error: true,
  code: 'VALIDATION_ERROR',
  message: 'Invalid input data',
  details: ['Field "email" is required'],
  timestamp: '2025-09-01T12:00:00Z'
}
```

### Common Error Codes

- `AUTH_REQUIRED` - Authentication needed
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT` - Too many requests
- `SERVER_ERROR` - Internal server error
- `SYNC_CONFLICT` - Data synchronization conflict

## 📚 Additional Resources

- [**Architecture Guide**](./guides/ARCHITECTURE.md) - System architecture
  overview
- [**Security Guide**](./guides/SECURITY.md) - Security implementation details
- [**Integration Guide**](./guides/INTEGRATION.md) - External service
  integration
- [**Testing Guide**](./guides/TESTING.md) - API testing strategies

## 🔄 Versioning

API follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes (backward compatible)

Current version: **14.0.0**

## 📞 Support

For API support and questions:

- **Documentation**: [HEYS Docs](./README.md)
- **Issues**: [GitHub Issues](https://github.com/kinderlystv-png/HEYS-v2/issues)
- **Contributing**: [Contributing Guide](../CONTRIBUTING.md)

---

**© 2025 HEYS Development Team** | Licensed under [MIT License](../LICENSE)
