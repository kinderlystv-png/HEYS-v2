# HEYS E2E Testing Guide

## Overview

Comprehensive End-to-End testing suite for HEYS using Playwright. This testing infrastructure covers all major user journeys and ensures the application works correctly across different browsers and devices.

## Test Structure

### Test Categories

1. **Authentication** (`user-authentication.spec.ts`)
   - User registration and login
   - Session management
   - Password validation
   - Logout functionality

2. **Food Logging** (`food-logging.spec.ts`)
   - Adding food entries
   - Searching food database
   - Editing and deleting entries
   - Nutritional information display

3. **Search Functionality** (`search-functionality.spec.ts`)
   - Smart search with typo tolerance
   - Search suggestions and filters
   - Search history
   - Performance testing

4. **Gaming System** (`gaming-system.spec.ts`)
   - Achievement unlocking
   - Progress tracking
   - Points system
   - Leaderboards and challenges

5. **UI & Accessibility** (`ui-accessibility.spec.ts`)
   - Keyboard navigation
   - Screen reader compatibility
   - Responsive design
   - Color contrast and themes

6. **Performance & Analytics** (`performance-analytics.spec.ts`)
   - Page load times
   - Core Web Vitals
   - Analytics event tracking
   - Memory usage monitoring

7. **Data Integration** (`data-integration.spec.ts`)
   - Multi-tab synchronization
   - Offline functionality
   - Data persistence
   - Import/export features

8. **Basic Functionality** (`basic.spec.ts`)
   - Smoke tests
   - Basic navigation
   - Service worker registration

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Install Playwright browsers:
   ```bash
   pnpm exec playwright install
   ```

### Commands

```bash
# Run all E2E tests
pnpm test:e2e

# Run tests with UI mode (interactive)
pnpm test:e2e:ui

# Debug tests step by step
pnpm test:e2e:debug

# Run specific test file
pnpm exec playwright test user-authentication.spec.ts

# Run tests in specific browser
pnpm exec playwright test --project=chromium

# Run tests in headed mode (see browser)
pnpm exec playwright test --headed

# Generate test report
pnpm exec playwright show-report
```

### Test Configuration

The E2E tests are configured in `playwright.config.ts`:

- **Base URL**: `http://localhost:5173` (Vite dev server)
- **Browsers**: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari
- **Retries**: 2 retries on CI, 0 locally
- **Reporters**: HTML, JSON, JUnit
- **Screenshots**: On failure
- **Videos**: On failure
- **Traces**: On retry

### Page Object Model

Tests use the Page Object Model pattern with helper classes in `tests/e2e/helpers/`:

```typescript
import { PageHelpers } from './helpers/page-helpers';

// Login helper
const loginPage = new PageHelpers.LoginPage(page);
await loginPage.login('test@example.com', 'password123');

// Food logging helper
const foodLogging = new PageHelpers.FoodLoggingPage(page);
await foodLogging.addFood('Apple', '1', 'piece');

// Search helper
const searchPage = new PageHelpers.SearchPage(page);
await searchPage.performSearch('chicken');
```

## Test Data Strategy

### Authentication
- Test user: `test@example.com` / `password123`
- Authenticated state stored in `.auth/user.json`
- Global setup in `auth.setup.ts`

### Test Data
- Seeds common food items
- Generates unique emails for registration tests
- Clears data between test runs

### Data Attributes
All interactive elements should have `data-testid` attributes:

```html
<!-- Good -->
<button data-testid="login-button">Login</button>
<input data-testid="email-input" type="email" />

<!-- Avoid relying on -->
<button class="btn btn-primary">Login</button>
<input placeholder="Enter email" />
```

## Browser Support

### Desktop Browsers
- ✅ Chrome (Chromium)
- ✅ Firefox
- ✅ Safari (WebKit)

### Mobile Browsers
- ✅ Chrome Mobile (Pixel 5)
- ✅ Safari Mobile (iPhone 12)

## Debugging Tests

### Visual Debugging
```bash
# Run with UI mode
pnpm test:e2e:ui

# Run in headed mode
pnpm exec playwright test --headed

# Debug specific test
pnpm exec playwright test --debug basic.spec.ts
```

### Trace Viewer
```bash
# View traces from failed tests
pnpm exec playwright show-trace test-results/trace.zip
```

### Screenshots and Videos
- Screenshots: `test-results/screenshots/`
- Videos: `test-results/videos/`
- Traces: `test-results/traces/`

## CI/CD Integration

### Environment Variables
```bash
CI=true              # Enables CI mode
PLAYWRIGHT_BROWSERS_PATH=0  # Use system browsers
```

### CI Configuration
- Tests run in headless mode
- 2 retries on failure
- Single worker (parallel disabled)
- JUnit reports for integration

## Best Practices

### Test Writing
1. **Use data-testid attributes** for stable selectors
2. **Wait for elements** explicitly with `expect().toBeVisible()`
3. **Use Page Object Model** for reusable components
4. **Test user journeys** not just individual features
5. **Handle async operations** properly

### Performance
1. **Use beforeEach** for common setup
2. **Reuse authenticated state** via global setup
3. **Parallel execution** where possible
4. **Efficient selectors** to avoid timeouts

### Maintenance
1. **Keep tests independent** - no test dependencies
2. **Use descriptive test names**
3. **Group related tests** in describe blocks
4. **Regular cleanup** of test data

## Troubleshooting

### Common Issues

**Tests timing out**
- Increase timeout in test or config
- Check if dev server is running
- Verify network connectivity

**Element not found**
- Check data-testid attributes exist
- Use browser dev tools to inspect
- Verify timing of element appearance

**Flaky tests**
- Add proper waits (`waitForLoadState`)
- Use expect() assertions instead of direct waits
- Check for race conditions

**Browser installation issues**
```bash
# Reinstall browsers
pnpm exec playwright install --force

# Install system dependencies (Linux)
pnpm exec playwright install-deps
```

### Debug Commands
```bash
# Check Playwright installation
pnpm exec playwright --version

# List available browsers
pnpm exec playwright list-browsers

# Test browser connectivity
pnpm exec playwright test --reporter=list --workers=1
```

## Test Coverage Goals

- ✅ **Authentication flows**: Login, registration, logout
- ✅ **Core features**: Food logging, search, achievements
- ✅ **User interface**: Navigation, responsiveness, accessibility
- ✅ **Performance**: Load times, Core Web Vitals
- ✅ **Data handling**: Sync, persistence, offline mode
- ✅ **Cross-browser**: Chrome, Firefox, Safari
- ✅ **Mobile responsive**: Touch interactions, viewport adaptation

## Contributing

When adding new features:

1. **Add data-testid attributes** to interactive elements
2. **Write E2E tests** covering the happy path
3. **Include error scenarios** and edge cases
4. **Update page helpers** if reusable
5. **Test across browsers** before merging

## Reporting

Test results are available in multiple formats:
- **HTML Report**: `playwright-report/index.html`
- **JSON Report**: `test-results/e2e-results.json`
- **JUnit XML**: `test-results/e2e-results.xml`

View the latest report:
```bash
pnpm exec playwright show-report
```
