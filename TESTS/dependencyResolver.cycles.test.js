/**
 * Unit tests for DependencyResolver cycle detection
 * Tests the dependency graph analysis functionality
 */

import { DependencyResolver } from '../src/DependencyResolver.js';

describe('DependencyResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('cycle detection', () => {
    test('detects simple cycle', () => {
      const graph = {
        'a': ['b'],
        'b': ['a']
      };
      
      expect(() => resolver.detectCycles(graph)).toThrow('Circular dependency detected');
    });

    test('detects complex cycle', () => {
      const graph = {
        'a': ['b'],
        'b': ['c'],
        'c': ['d'],
        'd': ['a']
      };
      
      expect(() => resolver.detectCycles(graph)).toThrow('Circular dependency detected');
    });

    test('detects self-referencing cycle', () => {
      const graph = {
        'a': ['a']
      };
      
      expect(() => resolver.detectCycles(graph)).toThrow('Circular dependency detected');
    });

    test('allows acyclic graph', () => {
      const graph = {
        'a': ['b', 'c'],
        'b': ['d'],
        'c': ['d'],
        'd': []
      };
      
      expect(() => resolver.detectCycles(graph)).not.toThrow();
    });

    test('handles empty graph', () => {
      const graph = {};
      
      expect(() => resolver.detectCycles(graph)).not.toThrow();
    });

    test('handles single node without dependencies', () => {
      const graph = {
        'a': []
      };
      
      expect(() => resolver.detectCycles(graph)).not.toThrow();
    });

    test('identifies cycle path', () => {
      const graph = {
        'docs/A.md': ['docs/B.md'],
        'docs/B.md': ['docs/C.md'],
        'docs/C.md': ['docs/A.md']
      };
      
      let error;
      try {
        resolver.detectCycles(graph);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toContain('docs/A.md');
      expect(error.cycle).toEqual(['docs/A.md', 'docs/B.md', 'docs/C.md', 'docs/A.md']);
    });
  });

  describe('dependency analysis', () => {
    test('analyzes document dependencies', () => {
      const documents = [
        {
          path: 'docs/README.md',
          dependencies: ['docs/quickstart.md', 'docs/api.md']
        },
        {
          path: 'docs/quickstart.md',
          dependencies: ['docs/installation.md']
        },
        {
          path: 'docs/api.md',
          dependencies: []
        },
        {
          path: 'docs/installation.md',
          dependencies: []
        }
      ];

      const analysis = resolver.analyzeDocumentGraph(documents);
      
      expect(analysis.hasCircularDependencies).toBe(false);
      expect(analysis.topologicalOrder).toContain('docs/installation.md');
      expect(analysis.topologicalOrder).toContain('docs/README.md');
      
      // Installation should come before quickstart
      const installIndex = analysis.topologicalOrder.indexOf('docs/installation.md');
      const quickstartIndex = analysis.topologicalOrder.indexOf('docs/quickstart.md');
      expect(installIndex).toBeLessThan(quickstartIndex);
    });

    test('detects circular dependencies in documents', () => {
      const documents = [
        {
          path: 'docs/A.md',
          dependencies: ['docs/B.md']
        },
        {
          path: 'docs/B.md',
          dependencies: ['docs/A.md']
        }
      ];

      const analysis = resolver.analyzeDocumentGraph(documents);
      
      expect(analysis.hasCircularDependencies).toBe(true);
      expect(analysis.cycles).toHaveLength(1);
      expect(analysis.cycles[0]).toEqual(['docs/A.md', 'docs/B.md', 'docs/A.md']);
    });

    test('finds orphaned documents', () => {
      const documents = [
        {
          path: 'docs/main.md',
          dependencies: ['docs/helper.md']
        },
        {
          path: 'docs/helper.md',
          dependencies: []
        },
        {
          path: 'docs/orphan.md',
          dependencies: []
        }
      ];

      const analysis = resolver.analyzeDocumentGraph(documents);
      
      expect(analysis.orphanedDocuments).toContain('docs/orphan.md');
      expect(analysis.orphanedDocuments).not.toContain('docs/helper.md');
    });

    test('calculates dependency depth', () => {
      const documents = [
        {
          path: 'docs/level0.md',
          dependencies: ['docs/level1.md']
        },
        {
          path: 'docs/level1.md',
          dependencies: ['docs/level2.md']
        },
        {
          path: 'docs/level2.md',
          dependencies: []
        }
      ];

      const analysis = resolver.analyzeDocumentGraph(documents);
      
      expect(analysis.dependencyDepths['docs/level2.md']).toBe(0);
      expect(analysis.dependencyDepths['docs/level1.md']).toBe(1);
      expect(analysis.dependencyDepths['docs/level0.md']).toBe(2);
    });
  });

  describe('performance', () => {
    test('handles large graphs efficiently', () => {
      const largeGraph = {};
      const nodeCount = 1000;
      
      // Create a large acyclic graph
      for (let i = 0; i < nodeCount; i++) {
        largeGraph[`node${i}`] = i < nodeCount - 1 ? [`node${i + 1}`] : [];
      }
      
      const startTime = performance.now();
      expect(() => resolver.detectCycles(largeGraph)).not.toThrow();
      const endTime = performance.now();
      
      // Should complete within reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('handles dense graphs', () => {
      const denseGraph = {};
      const nodeCount = 50;
      
      // Create a dense acyclic graph where each node depends on all previous nodes
      for (let i = 0; i < nodeCount; i++) {
        const dependencies = [];
        for (let j = i + 1; j < nodeCount; j++) {
          dependencies.push(`node${j}`);
        }
        denseGraph[`node${i}`] = dependencies;
      }
      
      expect(() => resolver.detectCycles(denseGraph)).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('handles invalid graph format', () => {
      expect(() => resolver.detectCycles(null)).toThrow();
      expect(() => resolver.detectCycles('invalid')).toThrow();
    });

    test('handles missing dependencies', () => {
      const graph = {
        'a': ['nonexistent']
      };
      
      // Should handle gracefully or throw descriptive error
      expect(() => resolver.detectCycles(graph)).not.toThrow();
    });

    test('provides detailed error information', () => {
      const graph = {
        'docs/README.md': ['docs/guide.md'],
        'docs/guide.md': ['docs/README.md']
      };
      
      try {
        resolver.detectCycles(graph);
        fail('Expected cycle detection to throw');
      } catch (error) {
        expect(error.message).toContain('Circular dependency');
        expect(error).toHaveProperty('cycle');
        expect(error).toHaveProperty('affectedNodes');
      }
    });
  });
});
