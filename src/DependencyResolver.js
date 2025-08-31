/**
 * DependencyResolver class for analyzing dependency graphs
 * Provides cycle detection and dependency analysis functionality
 */

export class DependencyResolver {
  constructor() {
    this.visitedNodes = new Set();
    this.recursionStack = new Set();
  }

  /**
   * Detects cycles in a dependency graph using DFS
   * @param {Object} graph - Object where keys are nodes and values are arrays of dependencies
   * @throws {Error} If circular dependency is detected
   */
  detectCycles(graph) {
    if (!graph || typeof graph !== 'object') {
      throw new Error('Invalid graph format: expected object');
    }

    this.visitedNodes.clear();
    this.recursionStack.clear();

    for (const node in graph) {
      if (!this.visitedNodes.has(node)) {
        const cycle = this._dfsDetectCycle(graph, node, []);
        if (cycle) {
          const error = new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
          error.cycle = cycle;
          error.affectedNodes = cycle.slice(0, -1); // Remove duplicate last node
          throw error;
        }
      }
    }
  }

  /**
   * Depth-first search for cycle detection
   * @param {Object} graph - Dependency graph
   * @param {string} node - Current node
   * @param {Array} path - Current path in DFS
   * @returns {Array|null} Cycle path if found, null otherwise
   */
  _dfsDetectCycle(graph, node, path) {
    if (this.recursionStack.has(node)) {
      // Found cycle - construct cycle path
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }

    if (this.visitedNodes.has(node)) {
      return null; // Already processed
    }

    this.visitedNodes.add(node);
    this.recursionStack.add(node);
    path.push(node);

    const dependencies = graph[node] || [];
    for (const dependency of dependencies) {
      const cycle = this._dfsDetectCycle(graph, dependency, path);
      if (cycle) {
        return cycle;
      }
    }

    this.recursionStack.delete(node);
    path.pop();
    return null;
  }

  /**
   * Analyzes a document dependency graph
   * @param {Array} documents - Array of document objects with path and dependencies
   * @returns {Object} Analysis results
   */
  analyzeDocumentGraph(documents) {
    const graph = {};
    const allNodes = new Set();

    // Build graph from documents
    documents.forEach(doc => {
      graph[doc.path] = doc.dependencies || [];
      allNodes.add(doc.path);
      doc.dependencies?.forEach(dep => allNodes.add(dep));
    });

    const analysis = {
      hasCircularDependencies: false,
      cycles: [],
      topologicalOrder: [],
      orphanedDocuments: [],
      dependencyDepths: {},
    };

    // Check for cycles
    try {
      this.detectCycles(graph);
    } catch (error) {
      analysis.hasCircularDependencies = true;
      analysis.cycles.push(error.cycle);
    }

    // Calculate topological order if no cycles
    if (!analysis.hasCircularDependencies) {
      analysis.topologicalOrder = this._topologicalSort(graph);
    }

    // Find orphaned documents (not referenced by others)
    const referencedNodes = new Set();
    Object.values(graph).forEach(deps => {
      deps.forEach(dep => referencedNodes.add(dep));
    });

    analysis.orphanedDocuments = Array.from(allNodes).filter(
      node => !referencedNodes.has(node) && graph[node]?.length === 0
    );

    // Calculate dependency depths
    analysis.dependencyDepths = this._calculateDependencyDepths(graph);

    return analysis;
  }

  /**
   * Performs topological sort on acyclic graph
   * @param {Object} graph - Dependency graph
   * @returns {Array} Topologically sorted nodes
   */
  _topologicalSort(graph) {
    const visited = new Set();
    const result = [];

    const visit = node => {
      if (visited.has(node)) return;
      visited.add(node);

      const dependencies = graph[node] || [];
      dependencies.forEach(dep => visit(dep));

      result.push(node);
    };

    Object.keys(graph).forEach(node => visit(node));

    return result;
  }

  /**
   * Calculates dependency depth for each node
   * @param {Object} graph - Dependency graph
   * @returns {Object} Node depths
   */
  _calculateDependencyDepths(graph) {
    const depths = {};
    const visited = new Set();

    const calculateDepth = node => {
      if (visited.has(node)) return depths[node] || 0;
      visited.add(node);

      const dependencies = graph[node] || [];
      if (dependencies.length === 0) {
        depths[node] = 0;
        return 0;
      }

      const maxDepth = Math.max(...dependencies.map(dep => calculateDepth(dep)));
      depths[node] = maxDepth + 1;
      return depths[node];
    };

    Object.keys(graph).forEach(node => calculateDepth(node));

    return depths;
  }
}
