// Advanced search service with Fuse.js, indexing, and filtering
import Fuse from 'fuse.js';
import { z } from 'zod';

export interface SearchItem {
  id: string;
  type: 'food' | 'workout' | 'recipe' | 'exercise' | 'user' | 'content';
  title: string;
  description?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  category?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SearchQuery {
  q: string;
  type?: SearchItem['type'] | SearchItem['type'][];
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult<T = SearchItem> {
  item: T;
  score: number;
  matches?: Fuse.FuseResultMatch[];
  highlighted?: Partial<T>;
}

export interface SearchResponse<T = SearchItem> {
  results: SearchResult<T>[];
  total: number;
  query: SearchQuery;
  took: number;
  facets?: Record<string, { value: string; count: number }[]>;
}

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  type: z
    .union([
      z.enum(['food', 'workout', 'recipe', 'exercise', 'user', 'content']),
      z.array(z.enum(['food', 'workout', 'recipe', 'exercise', 'user', 'content'])),
    ])
    .optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['relevance', 'date', 'title']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class ModernSearch {
  private indices = new Map<string, Fuse<SearchItem>>();
  private items = new Map<string, SearchItem>();

  private defaultFuseOptions: Fuse.IFuseOptions<SearchItem> = {
    includeScore: true,
    includeMatches: true,
    threshold: 0.3,
    location: 0,
    distance: 100,
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'description', weight: 0.3 },
      { name: 'content', weight: 0.2 },
      { name: 'tags', weight: 0.1 },
    ],
  };

  constructor(options?: Partial<Fuse.IFuseOptions<SearchItem>>) {
    if (options) {
      this.defaultFuseOptions = { ...this.defaultFuseOptions, ...options };
    }
  }

  // Index management
  addItems(items: SearchItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
    }
    this.rebuildIndices();
  }

  addItem(item: SearchItem): void {
    this.items.set(item.id, item);
    this.rebuildIndices();
  }

  removeItem(id: string): void {
    this.items.delete(id);
    this.rebuildIndices();
  }

  updateItem(id: string, updates: Partial<SearchItem>): void {
    const existing = this.items.get(id);
    if (existing) {
      this.items.set(id, { ...existing, ...updates, id });
      this.rebuildIndices();
    }
  }

  clear(): void {
    this.items.clear();
    this.indices.clear();
  }

  private rebuildIndices(): void {
    this.indices.clear();

    const itemsByType = new Map<string, SearchItem[]>();
    const allItems: SearchItem[] = [];

    for (const item of this.items.values()) {
      allItems.push(item);

      if (!itemsByType.has(item.type)) {
        itemsByType.set(item.type, []);
      }
      itemsByType.get(item.type)!.push(item);
    }

    // Create global index
    this.indices.set('all', new Fuse(allItems, this.defaultFuseOptions));

    // Create type-specific indices
    for (const [type, items] of itemsByType) {
      this.indices.set(type, new Fuse(items, this.defaultFuseOptions));
    }
  }

  // Main search method
  async search<T extends SearchItem = SearchItem>(
    query: SearchQuery,
    customOptions?: Partial<Fuse.IFuseOptions<T>>,
  ): Promise<SearchResponse<T>> {
    const start = Date.now();

    // Validate query
    const validatedQuery = SearchQuerySchema.parse(query);

    // Get appropriate index
    let searchIndex = this.indices.get('all');

    if (validatedQuery.type) {
      const types = Array.isArray(validatedQuery.type)
        ? validatedQuery.type
        : [validatedQuery.type];

      if (types.length === 1) {
        const typeIndex = this.indices.get(types[0]);
        if (typeIndex) {
          searchIndex = typeIndex;
        }
      } else {
        // Multiple types - filter results later
        searchIndex = this.indices.get('all');
      }
    }

    if (!searchIndex) {
      return {
        results: [],
        total: 0,
        query: validatedQuery,
        took: Date.now() - start,
      };
    }

    // Perform search
    const fuseOptions = customOptions
      ? { ...this.defaultFuseOptions, ...customOptions }
      : this.defaultFuseOptions;

    const fuseResults = searchIndex.search(validatedQuery.q, fuseOptions);

    // Apply additional filters
    let filteredResults = fuseResults.filter((result) => {
      const item = result.item;

      // Type filter (for multiple types)
      if (validatedQuery.type && Array.isArray(validatedQuery.type)) {
        if (!validatedQuery.type.includes(item.type)) {
          return false;
        }
      }

      // Category filter
      if (validatedQuery.category && item.category !== validatedQuery.category) {
        return false;
      }

      // Tags filter
      if (validatedQuery.tags && validatedQuery.tags.length > 0) {
        if (!item.tags || !validatedQuery.tags.some((tag) => item.tags!.includes(tag))) {
          return false;
        }
      }

      return true;
    });

    // Sort results
    if (validatedQuery.sortBy !== 'relevance') {
      filteredResults = this.sortResults(
        filteredResults,
        validatedQuery.sortBy,
        validatedQuery.sortOrder,
      );
    }

    // Apply pagination
    const total = filteredResults.length;
    const paginatedResults = filteredResults.slice(
      validatedQuery.offset,
      validatedQuery.offset + validatedQuery.limit,
    );

    // Transform to SearchResult format
    const results: SearchResult<T>[] = paginatedResults.map((fuseResult) => ({
      item: fuseResult.item as T,
      score: fuseResult.score || 0,
      matches: fuseResult.matches,
      highlighted: this.highlightMatches(fuseResult.item, fuseResult.matches) as Partial<T>,
    }));

    // Generate facets
    const facets = this.generateFacets(filteredResults.map((r) => r.item));

    return {
      results,
      total,
      query: validatedQuery,
      took: Date.now() - start,
      facets,
    };
  }

  // Quick search for autocomplete
  async quickSearch(
    query: string,
    limit: number = 5,
    types?: SearchItem['type'][],
  ): Promise<SearchResult[]> {
    if (query.length < 2) return [];

    const searchQuery: SearchQuery = {
      q: query,
      limit,
      ...(types && { type: types }),
    };

    const response = await this.search(searchQuery);
    return response.results;
  }

  // Search suggestions
  async getSuggestions(query: string, limit: number = 5): Promise<string[]> {
    const suggestions = new Set<string>();

    // Get quick search results
    const results = await this.quickSearch(query, limit * 2);

    for (const result of results) {
      suggestions.add(result.item.title);

      if (result.item.tags) {
        for (const tag of result.item.tags) {
          if (tag.toLowerCase().includes(query.toLowerCase())) {
            suggestions.add(tag);
          }
        }
      }

      if (suggestions.size >= limit) break;
    }

    return Array.from(suggestions).slice(0, limit);
  }

  // Analytics and insights
  getIndexStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.items.size,
    };

    for (const [type, index] of this.indices) {
      if (type !== 'all') {
        stats[type] = index.getIndex().size;
      }
    }

    return stats;
  }

  getMostSearchedTerms(): Record<string, number> {
    // In a real implementation, this would track search queries
    // For now, return empty object
    return {};
  }

  // Helper methods
  private sortResults(
    results: Fuse.FuseResult<SearchItem>[],
    sortBy: 'date' | 'title',
    order: 'asc' | 'desc',
  ): Fuse.FuseResult<SearchItem>[] {
    return results.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'date') {
        const dateA = a.item.updatedAt || a.item.createdAt;
        const dateB = b.item.updatedAt || b.item.createdAt;
        comparison = dateA.getTime() - dateB.getTime();
      } else if (sortBy === 'title') {
        comparison = a.item.title.localeCompare(b.item.title);
      }

      return order === 'desc' ? -comparison : comparison;
    });
  }

  private highlightMatches(
    item: SearchItem,
    matches?: Fuse.FuseResultMatch[],
  ): Partial<SearchItem> {
    if (!matches) return {};

    const highlighted: Partial<SearchItem> = {};

    for (const match of matches) {
      const key = match.key as keyof SearchItem;
      const value = item[key];

      if (typeof value === 'string') {
        let highlightedValue = value;

        // Apply highlights in reverse order to maintain indices
        for (let i = match.indices.length - 1; i >= 0; i--) {
          const [start, end] = match.indices[i];
          highlightedValue =
            highlightedValue.slice(0, start) +
            `<mark>${highlightedValue.slice(start, end + 1)}</mark>` +
            highlightedValue.slice(end + 1);
        }

        (highlighted as any)[key] = highlightedValue;
      }
    }

    return highlighted;
  }

  private generateFacets(items: SearchItem[]): Record<string, { value: string; count: number }[]> {
    const facets: Record<string, Map<string, number>> = {
      type: new Map(),
      category: new Map(),
      tags: new Map(),
    };

    for (const item of items) {
      // Type facet
      facets.type.set(item.type, (facets.type.get(item.type) || 0) + 1);

      // Category facet
      if (item.category) {
        facets.category.set(item.category, (facets.category.get(item.category) || 0) + 1);
      }

      // Tags facet
      if (item.tags) {
        for (const tag of item.tags) {
          facets.tags.set(tag, (facets.tags.get(tag) || 0) + 1);
        }
      }
    }

    // Convert to the expected format
    const result: Record<string, { value: string; count: number }[]> = {};

    for (const [facetName, facetMap] of Object.entries(facets)) {
      result[facetName] = Array.from(facetMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }

    return result;
  }
}

// Create modern search instance
export const modernSearch = new ModernSearch();

export default modernSearch;
