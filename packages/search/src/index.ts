// HEYS Search Engine - Modern TypeScript implementation
// Migrated from heys_smart_search_with_typos_v1.js

export interface SearchConfig {
  maxTypoDistance: number;
  minQueryLength: number;
  maxSuggestions: number;
  cacheEnabled: boolean;
  cacheTimeout: number;
  enablePhonetic: boolean;
  enableSynonyms: boolean;
  debugMode: boolean;
}

export interface SearchResult<T = Record<string, unknown>> {
  items: T[];
  query: string;
  suggestions: string[];
  searchTime: number;
  total: number;
  typosCorrected: boolean;
}

export interface SearchMetrics {
  totalSearches: number;
  averageSearchTime: number;
  cacheHitRate: number;
  typoCorrections: number;
}

export class SmartSearchEngine<TItem extends Record<string, unknown> = Record<string, unknown>> {
  private config: SearchConfig;
  private cache = new Map<string, { result: SearchResult<TItem>; timestamp: number }>();
  private metrics: SearchMetrics = {
    totalSearches: 0,
    averageSearchTime: 0,
    cacheHitRate: 0,
    typoCorrections: 0,
  };

  // Common words dictionary for improved search
  private commonWords = new Set([
    'хлеб',
    'молоко',
    'мясо',
    'рыба',
    'овощи',
    'фрукты',
    'крупа',
    'макароны',
    'сыр',
    'масло',
    'яйца',
    'курица',
    'говядина',
    'свинина',
    'картофель',
    'морковь',
    'лук',
    'помидор',
    'огурец',
    'яблоко',
    'банан',
    'апельсин',
  ]);

  // Synonyms dictionary
  private synonyms = new Map([
    ['хлеб', ['батон', 'буханка', 'булка', 'багет']],
    ['молоко', ['молочко', 'молочный']],
    ['мясо', ['мясной', 'мясные']],
    ['курица', ['куриный', 'цыпленок', 'птица']],
    ['говядина', ['говяжий', 'телятина']],
    ['свинина', ['свиной', 'поросенок']],
    ['картофель', ['картошка', 'картофельный']],
    ['помидор', ['томат', 'томатный']],
    ['масло', ['маслице', 'сливочное']],
  ]);

  // Phonetic rules for Russian language
  private phoneticRules = [
    { from: /[её]/g, to: 'е' },
    { from: /[ии]/g, to: 'и' },
    { from: /[оё]/g, to: 'о' },
    { from: /[ъь]/g, to: '' },
    { from: /тс/g, to: 'ц' },
    { from: /дс/g, to: 'ц' },
  ];

  constructor(config: Partial<SearchConfig> = {}) {
    this.config = {
      maxTypoDistance: 2,
      minQueryLength: 2,
      maxSuggestions: 5,
      cacheEnabled: true,
      cacheTimeout: 300000, // 5 minutes
      enablePhonetic: true,
      enableSynonyms: true,
      debugMode: false,
      ...config,
    };
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array.from({ length: str2.length + 1 }, () =>
      Array<number>(str1.length + 1).fill(0),
    );

    for (let i = 0; i <= str1.length; i += 1) {
      const firstRow = matrix[0];
      if (!firstRow) {
        throw new Error('Levenshtein matrix initialization failed');
      }
      firstRow[i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
      const row = matrix[j];
      if (!row) {
        throw new Error('Levenshtein matrix initialization failed');
      }
      row[0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const row = matrix[j];
        const prevRow = matrix[j - 1];
        if (!row || !prevRow) {
          throw new Error('Levenshtein matrix access failed');
        }
        row[i] = Math.min(
          (row[i - 1] ?? 0) + 1, // deletion
          (prevRow[i] ?? 0) + 1, // insertion
          (prevRow[i - 1] ?? 0) + indicator, // substitution
        );
      }
    }

    const lastRow = matrix[str2.length];
    if (!lastRow) {
      throw new Error('Levenshtein matrix access failed');
    }
    return lastRow[str1.length] ?? 0;
  }

  /**
   * Normalize query string
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Apply phonetic transformation
   */
  private phoneticTransform(text: string): string {
    if (!this.config.enablePhonetic) return text;

    let result = text;
    for (const rule of this.phoneticRules) {
      result = result.replace(rule.from, rule.to);
    }
    return result;
  }

  /**
   * Find synonyms for a word
   */
  private findSynonyms(word: string): string[] {
    if (!this.config.enableSynonyms) return [];

    const synonymList = this.synonyms.get(word) || [];

    // Also check if word is a synonym of another word
    for (const [key, values] of this.synonyms) {
      if (values.includes(word)) {
        synonymList.push(key, ...values.filter((v) => v !== word));
      }
    }

    return [...new Set(synonymList)];
  }

  /**
   * Calculate relevance score for a match
   */
  private calculateRelevance(query: string, target: string, distance: number): number {
    const maxLength = Math.max(query.length, target.length);
    const similarity = 1 - distance / maxLength;

    // Boost score for exact matches
    if (distance === 0) return 1.0;

    // Boost score for common words
    if (this.commonWords.has(target.toLowerCase())) {
      return similarity * 1.2;
    }

    return similarity;
  }

  /**
   * Search function with fuzzy matching
   */
  search(
    items: TItem[],
    query: string,
    searchFields: (keyof TItem)[],
  ): SearchResult<TItem> {
    const startTime = Date.now();
    const normalizedQuery = this.normalizeQuery(query);

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedResult(normalizedQuery) as SearchResult<TItem> | null;
      if (cached) {
        this.metrics.cacheHitRate =
          (this.metrics.cacheHitRate * this.metrics.totalSearches + 1) /
          (this.metrics.totalSearches + 1);
        this.updateMetrics(Date.now() - startTime);
        return cached;
      }
    }

    if (normalizedQuery.length < this.config.minQueryLength) {
      const emptyResult: SearchResult<TItem> = {
        items: items.slice(0, this.config.maxSuggestions),
        query: normalizedQuery,
        suggestions: [],
        searchTime: Date.now() - startTime,
        total: items.length,
        typosCorrected: false,
      };
      return emptyResult;
    }

    const phoneticQuery = this.phoneticTransform(normalizedQuery);
    const synonyms = this.findSynonyms(normalizedQuery);
    const maxDistance = this.getMaxTypoDistance(normalizedQuery.length);

    const matches: Array<{ item: TItem; score: number; field: keyof TItem }> = [];

    for (const item of items) {
      for (const field of searchFields) {
        const rawFieldValue = item[field];
        if (rawFieldValue === undefined || rawFieldValue === null) {
          continue;
        }

        const fieldValue = String(rawFieldValue).toLowerCase();
        const phoneticValue = this.phoneticTransform(fieldValue);

        // Direct match
        let distance = this.levenshteinDistance(normalizedQuery, fieldValue);
        let score = this.calculateRelevance(normalizedQuery, fieldValue, distance);

        // Phonetic match
        const phoneticDistance = this.levenshteinDistance(phoneticQuery, phoneticValue);
        const phoneticScore = this.calculateRelevance(
          phoneticQuery,
          phoneticValue,
          phoneticDistance,
        );

        if (phoneticScore > score) {
          distance = phoneticDistance;
          score = phoneticScore;
        }

        // Synonym match
        for (const synonym of synonyms) {
          const synonymDistance = this.levenshteinDistance(synonym, fieldValue);
          const synonymScore = this.calculateRelevance(synonym, fieldValue, synonymDistance);

          if (synonymScore > score) {
            distance = synonymDistance;
            score = synonymScore;
          }
        }

        // Partial match (contains)
        if (fieldValue.includes(normalizedQuery)) {
          score = Math.max(score, 0.8);
        }

        if (distance <= maxDistance || score > 0.3) {
          matches.push({ item, score, field });
        }
      }
    }

    // Sort by score and remove duplicates
    const uniqueMatches = Array.from(new Map(matches.map((m) => [m.item, m])).values()).sort(
      (a, b) => b.score - a.score,
    );

    const resultItems = uniqueMatches.slice(0, this.config.maxSuggestions).map((m) => m.item);
    const suggestions = this.generateSuggestions(normalizedQuery, uniqueMatches);

    const result: SearchResult<TItem> = {
      items: resultItems,
      query: normalizedQuery,
      suggestions,
      searchTime: Date.now() - startTime,
      total: uniqueMatches.length,
      typosCorrected: suggestions.length > 0,
    };

    // Cache result
    if (this.config.cacheEnabled) {
      this.cacheResult(normalizedQuery, result);
    }

    this.updateMetrics(result.searchTime);
    if (result.typosCorrected) {
      this.metrics.typoCorrections++;
    }

    return result;
  }

  private getMaxTypoDistance(queryLength: number): number {
    if (queryLength <= 4) return 1;
    if (queryLength <= 6) return 2;
    return 3;
  }

  private generateSuggestions(
    query: string,
    matches: Array<{ item: TItem; score: number; field: keyof TItem }>,
  ): string[] {
    // Extract unique suggestions from field values
    const suggestions = new Set<string>();

    for (const match of matches.slice(0, this.config.maxSuggestions)) {
      if (match.score < 1.0) {
        // Only suggest if not exact match
        const rawValue = match.item[match.field];
        if (rawValue === undefined || rawValue === null) {
          continue;
        }

        const fieldValue = String(rawValue);
        if (fieldValue.toLowerCase() !== query) {
          suggestions.add(fieldValue);
        }
      }
    }

    return Array.from(suggestions).slice(0, this.config.maxSuggestions);
  }

  private getCachedResult(query: string): SearchResult<TItem> | null {
    const cached = this.cache.get(query);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.config.cacheTimeout;
    if (isExpired) {
      this.cache.delete(query);
      return null;
    }

    return cached.result;
  }

  private cacheResult(query: string, result: SearchResult<TItem>): void {
    this.cache.set(query, {
      result,
      timestamp: Date.now(),
    });

    // Cleanup old cache entries
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 500).forEach(([key]) => this.cache.delete(key));
    }
  }

  private updateMetrics(searchTime: number): void {
    this.metrics.totalSearches++;
    this.metrics.averageSearchTime =
      (this.metrics.averageSearchTime * (this.metrics.totalSearches - 1) + searchTime) /
      this.metrics.totalSearches;
  }

  /**
   * Get search statistics
   */
  getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SearchConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
