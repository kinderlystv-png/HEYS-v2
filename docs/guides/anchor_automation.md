# Anchor Automation System Guide

> **Version: 1.3.0** | Module: `universal-anchor-automation.js`

## Quick Start

```javascript
import { AnchorAutomation } from '../automation/universal-anchor-automation.js';

// Initialize automation
const automation = new AnchorAutomation({
  baseSelector: '@ANCHOR',
  autoUpdate: true,
});

// Auto-generate navigation
automation.generateNavigation();
```

## Overview

The Anchor Automation System provides intelligent navigation and
cross-referencing for HEYS documentation and code. It automatically detects
`@ANCHOR` markers and creates dynamic navigation maps.

## Core Concepts

### Anchor Markers

Place anchor markers in your code or documentation:

```javascript
// @ANCHOR:CORE:STORAGE - Main storage interface
class StorageLayer {
  // Implementation
}

// @ANCHOR:UI:VIRTUAL_LIST - Virtual scrolling component
class VirtualList {
  // Implementation
}
```

```markdown
<!-- @ANCHOR:DOCS:API_GUIDE - Complete API documentation -->

# API Reference

<!-- @ANCHOR:DOCS:QUICK_START - Getting started guide -->

## Quick Start
```

### Navigation Generation

The system automatically creates:

- Table of contents
- Cross-references
- Dependency graphs
- Navigation maps

## API Reference

### Constructor Options

| Option           | Type    | Default   | Description             |
| ---------------- | ------- | --------- | ----------------------- |
| `baseSelector`   | string  | '@ANCHOR' | Anchor marker pattern   |
| `autoUpdate`     | boolean | true      | Auto-refresh on changes |
| `generateMaps`   | boolean | true      | Create navigation maps  |
| `crossReference` | boolean | true      | Link related anchors    |

### Methods

#### `generateNavigation()`

Scan files and generate navigation structure.

**Returns:** Promise resolving to navigation object

```javascript
const nav = await automation.generateNavigation();
console.log(nav.structure);
```

#### `updateAnchor(anchorId, metadata)`

Update specific anchor with new metadata.

**Parameters:**

- `anchorId` (string): Anchor identifier
- `metadata` (object): Updated anchor data

```javascript
automation.updateAnchor('CORE:STORAGE', {
  description: 'Updated storage interface',
  lastModified: new Date(),
});
```

#### `findRelated(anchorId)`

Find anchors related to given anchor.

**Parameters:**

- `anchorId` (string): Source anchor ID

**Returns:** Array of related anchor objects

```javascript
const related = automation.findRelated('UI:VIRTUAL_LIST');
```

#### `generateMap(options?)`

Create visual navigation map.

**Parameters:**

- `options` (object, optional): Map generation options

**Returns:** HTML string for navigation map

```javascript
const mapHTML = automation.generateMap({
  format: 'mermaid',
  includeOrphans: true,
});
```

## Anchor Syntax

### Basic Syntax

```
@ANCHOR:<CATEGORY>:<IDENTIFIER> - <Description>
```

### Categories

| Category | Purpose            | Example                 |
| -------- | ------------------ | ----------------------- |
| `CORE`   | Core functionality | `@ANCHOR:CORE:DATABASE` |
| `UI`     | User interface     | `@ANCHOR:UI:COMPONENTS` |
| `API`    | API endpoints      | `@ANCHOR:API:USERS`     |
| `DOCS`   | Documentation      | `@ANCHOR:DOCS:GUIDE`    |
| `TEST`   | Test cases         | `@ANCHOR:TEST:UNIT`     |
| `UTIL`   | Utilities          | `@ANCHOR:UTIL:HELPERS`  |

### Examples

```javascript
// @ANCHOR:CORE:AUTHENTICATION - User authentication system
class AuthService {
  // @ANCHOR:CORE:AUTH:LOGIN - User login functionality
  async login(credentials) {
    // Implementation
  }

  // @ANCHOR:CORE:AUTH:LOGOUT - User logout functionality
  logout() {
    // Implementation
  }
}

// @ANCHOR:UI:AUTH:FORMS - Authentication UI components
class LoginForm extends React.Component {
  // Implementation
}
```

## Integration Examples

### With HEYS Core

```javascript
import { HeysCore } from '../heys_core_v12.js';
import { AnchorAutomation } from '../automation/universal-anchor-automation.js';

const core = new HeysCore();
const anchors = new AnchorAutomation();

// Generate navigation for current project
const navigation = await anchors.generateNavigation();

// Store in HEYS for quick access
await core.storage.set('project_navigation', navigation);
```

### With Documentation System

```javascript
// Auto-update docs when code changes
anchors.on('anchorUpdated', (anchor) => {
  updateDocumentation(anchor);
});

// Generate markdown TOC
const toc = anchors.generateMap({
  format: 'markdown',
  category: 'DOCS',
});
```

## Configuration

### File Scanning

```javascript
const automation = new AnchorAutomation({
  scanPaths: ['src/**/*.js', 'docs/**/*.md', 'tests/**/*.js'],
  exclude: ['node_modules', '.git', 'dist'],
});
```

### Map Generation

```javascript
const mapOptions = {
  format: 'mermaid', // 'html', 'markdown', 'mermaid'
  theme: 'default', // Visual theme
  includeOrphans: true, // Show unlinked anchors
  maxDepth: 3, // Relationship depth
  groupByCategory: true, // Group by anchor category
};
```

## Best Practices

### Naming Conventions

1. **Use descriptive identifiers**

   ```javascript
   // Good
   @ANCHOR:UI:USER_PROFILE_FORM

   // Avoid
   @ANCHOR:UI:FORM1
   ```

2. **Maintain hierarchy**

   ```javascript
   @ANCHOR:CORE:DATABASE
   @ANCHOR:CORE:DATABASE:USERS
   @ANCHOR:CORE:DATABASE:USERS:CREATE
   ```

3. **Include descriptions**

   ```javascript
   // Good
   @ANCHOR:API:USERS:CREATE - Create new user endpoint

   // Minimal
   @ANCHOR:API:USERS:CREATE
   ```

### Maintenance

- Review anchors during code reviews
- Update descriptions when functionality changes
- Remove anchors for deleted code
- Run `generateNavigation()` regularly

## Troubleshooting

### Common Issues

1. **Anchors not detected**
   - Check syntax format
   - Verify file paths in config
   - Ensure proper encoding

2. **Broken navigation**
   - Validate anchor relationships
   - Check for circular dependencies
   - Review category structure

3. **Performance issues**
   - Limit scan paths
   - Use exclude patterns
   - Cache navigation results

### Debug Mode

```javascript
const automation = new AnchorAutomation({
  debug: true,
  logLevel: 'verbose',
});

// View anchor detection process
automation.on('debug', (message) => {
  console.log('Anchor Debug:', message);
});
```

## Related Documentation

- [Anchor System Guide](../ANCHOR_SYSTEM_GUIDE.md)
- [Navigation Maps Demo](../NAVIGATION_MAPS_DEMO.md)
- [Integration Guide](INTEGRATION_GUIDE_IMPROVEMENTS.md)

---

**Version History:**

- v1.0: Initial implementation
- v1.1: Added cross-referencing
- v1.2: Performance improvements
- v1.3: Multi-format map generation
