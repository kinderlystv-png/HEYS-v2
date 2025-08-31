# Smart Search with Typos Guide

> **Version: 1.3.0** | Module: `heys_smart_search_with_typos_v1.js`

## Quick Start

```javascript
import { SmartSearch } from '../heys_smart_search_with_typos_v1.js';

// Basic usage
const search = new SmartSearch({
  threshold: 0.8, // Typo tolerance (0-1)
  maxResults: 10,
});

// Index your data
search.index([
  { id: 1, title: 'Project Documentation', content: 'How to write docs' },
  { id: 2, title: 'API Reference', content: 'REST API endpoints' },
]);

// Search with typo tolerance
const results = search.query('documentatoin'); // Will find "documentation"
console.log(results);
```

## API Reference

### Constructor Options

| Option          | Type    | Default | Description                |
| --------------- | ------- | ------- | -------------------------- |
| `threshold`     | number  | 0.8     | Similarity threshold (0-1) |
| `maxResults`    | number  | 50      | Maximum results to return  |
| `enableFuzzy`   | boolean | true    | Enable fuzzy matching      |
| `caseSensitive` | boolean | false   | Case-sensitive search      |

### Methods

#### `index(documents)`

Index documents for searching.

**Parameters:**

- `documents` (Array): Array of document objects

**Example:**

```javascript
search.index([
  { id: 1, title: 'Hello', content: 'World' },
  { id: 2, title: 'Foo', content: 'Bar' },
]);
```

#### `query(searchTerm, options?)`

Perform search with typo tolerance.

**Parameters:**

- `searchTerm` (string): Search query
- `options` (object, optional): Override default options

**Returns:** Array of matching documents with relevance scores

**Example:**

```javascript
const results = search.query('helo world', {
  threshold: 0.7,
  maxResults: 5,
});
```

#### `suggest(term)`

Get spelling suggestions for a term.

**Parameters:**

- `term` (string): Term to get suggestions for

**Returns:** Array of suggested corrections

## Integration Examples

### With HEYS Core

```javascript
import { HeysCore } from '../heys_core_v12.js';
import { SmartSearch } from '../heys_smart_search_with_typos_v1.js';

const core = new HeysCore();
const search = new SmartSearch();

// Index entries from HEYS storage
const entries = await core.storage.getAllEntries();
search.index(
  entries.map(entry => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    tags: entry.tags?.join(' ') || '',
  }))
);

// Search with user input
const searchResults = search.query(userInput);
```

### With Virtual List

```javascript
import { VirtualList } from '../heys_virtual_list_v1.js';

const virtualList = new VirtualList({
  container: document.getElementById('search-results'),
  itemHeight: 60,
});

search.query('user input').then(results => {
  virtualList.setData(results);
});
```

## Configuration

### Typo Tolerance Levels

| Threshold | Tolerance   | Use Case                |
| --------- | ----------- | ----------------------- |
| 0.9-1.0   | Very strict | Exact matches preferred |
| 0.7-0.9   | Moderate    | Balance typos/precision |
| 0.5-0.7   | Loose       | Maximum typo tolerance  |

### Performance Tuning

```javascript
// For large datasets
const search = new SmartSearch({
  threshold: 0.8,
  maxResults: 20,
  useWebWorker: true, // Process in background
  cacheResults: true, // Cache frequent queries
});
```

## Troubleshooting

### Common Issues

1. **No results found**
   - Lower threshold value
   - Check data indexing
   - Verify search term format

2. **Slow performance**
   - Reduce maxResults
   - Enable web worker mode
   - Consider result caching

3. **Unexpected matches**
   - Increase threshold
   - Review indexed content
   - Check for special characters

### Debug Mode

```javascript
const search = new SmartSearch({
  debug: true, // Enables console logging
});

search.query('test').forEach(result => {
  console.log(`Score: ${result.score}, Match: ${result.title}`);
});
```

## Related Modules

- [`heys_core_v12.js`](../heys_core_v12.js) - Core functionality
- [`heys_virtual_list_v1.js`](../heys_virtual_list_v1.js) - Results display
- [`heys_storage_layer_v1.js`](../heys_storage_layer_v1.js) - Data persistence

---

**Need help?** Check the [Integration Guide](INTEGRATION_GUIDE_IMPROVEMENTS.md)
or create an issue.
