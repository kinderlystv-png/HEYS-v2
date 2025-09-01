/**
 * HEYS Bundle Analyzer
 * Advanced bundle analysis and optimization recommendations
 * 
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { BundleAnalysis, ModuleInfo, ChunkInfo, DependencyInfo, DuplicateInfo, TreeshakingInfo } from './profiler';

/**
 * Bundle optimization recommendations
 */
export interface OptimizationRecommendation {
  type: 'size' | 'performance' | 'duplication' | 'dependency' | 'treeshaking';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: {
    sizeSaving?: number;
    performanceGain?: number;
    complexity: 'low' | 'medium' | 'high';
  };
  actions: string[];
  examples?: string[];
}

/**
 * Bundle analyzer class
 */
export class BundleAnalyzer {
  private bundleData: BundleAnalysis | null = null;

  /**
   * Analyze bundle from webpack stats
   */
  analyzeBundleFromStats(stats: any): BundleAnalysis {
    const modules = this.extractModules(stats);
    const chunks = this.extractChunks(stats);
    const dependencies = this.extractDependencies(stats);
    const duplicates = this.findDuplicates(modules);
    const treeshaking = this.analyzeTreeshaking(stats);

    this.bundleData = {
      totalSize: this.calculateTotalSize(modules),
      gzippedSize: this.estimateGzippedSize(modules),
      modules,
      chunks,
      dependencies,
      duplicates,
      treeshaking,
    };

    return this.bundleData;
  }

  /**
   * Extract module information
   */
  private extractModules(stats: any): ModuleInfo[] {
    const modules: ModuleInfo[] = [];

    if (stats.modules) {
      stats.modules.forEach((module: any) => {
        modules.push({
          name: this.cleanModuleName(module.name || module.identifier),
          size: module.size || 0,
          gzippedSize: this.estimateModuleGzippedSize(module.size || 0),
          path: module.name || module.identifier || '',
          reasons: module.reasons?.map((r: any) => r.moduleName) || [],
          chunks: module.chunks || [],
        });
      });
    }

    return modules.sort((a, b) => b.size - a.size);
  }

  /**
   * Extract chunk information
   */
  private extractChunks(stats: any): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];

    if (stats.chunks) {
      stats.chunks.forEach((chunk: any) => {
        chunks.push({
          name: chunk.name || `chunk-${chunk.id}`,
          size: chunk.size || 0,
          modules: chunk.modules?.map((m: any) => m.name || m.identifier) || [],
          entry: chunk.entry || false,
          async: !chunk.entry,
        });
      });
    }

    return chunks.sort((a, b) => b.size - a.size);
  }

  /**
   * Extract dependency information
   */
  private extractDependencies(stats: any): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
    const packageSizes = new Map<string, number>();

    // Extract from modules
    if (stats.modules) {
      stats.modules.forEach((module: any) => {
        const packageName = this.extractPackageName(module.name || module.identifier);
        if (packageName && packageName.startsWith('node_modules')) {
          const cleanName = packageName.replace(/.*node_modules\/(@[^/]+\/[^/]+|[^/]+).*/, '$1');
          const currentSize = packageSizes.get(cleanName) || 0;
          packageSizes.set(cleanName, currentSize + (module.size || 0));
        }
      });
    }

    // Convert to dependency info
    packageSizes.forEach((size, name) => {
      dependencies.push({
        name,
        version: 'unknown',
        size,
        used: size > 0,
        treeshakeable: this.isTreeshakeable(name),
      });
    });

    return dependencies.sort((a, b) => b.size - a.size);
  }

  /**
   * Find duplicate modules
   */
  private findDuplicates(modules: ModuleInfo[]): DuplicateInfo[] {
    const duplicates: DuplicateInfo[] = [];
    const moduleMap = new Map<string, ModuleInfo[]>();

    // Group modules by name
    modules.forEach(module => {
      const baseName = this.getBaseName(module.name);
      if (!moduleMap.has(baseName)) {
        moduleMap.set(baseName, []);
      }
      moduleMap.get(baseName)!.push(module);
    });

    // Find duplicates
    moduleMap.forEach((moduleGroup, baseName) => {
      if (moduleGroup.length > 1) {
        duplicates.push({
          module: baseName,
          occurrences: moduleGroup.length,
          totalSize: moduleGroup.reduce((sum, m) => sum + m.size, 0),
          locations: moduleGroup.map(m => m.path),
        });
      }
    });

    return duplicates.sort((a, b) => b.totalSize - a.totalSize);
  }

  /**
   * Analyze tree shaking effectiveness
   */
  private analyzeTreeshaking(stats: any): TreeshakingInfo {
    const eliminatedModules: string[] = [];
    let eliminatedSize = 0;

    // This is a simplified analysis
    // In real implementation, you'd compare with and without tree shaking
    if (stats.modules) {
      stats.modules.forEach((module: any) => {
        if (module.providedExports && module.usedExports) {
          const providedCount = Array.isArray(module.providedExports) ? module.providedExports.length : 0;
          const usedCount = Array.isArray(module.usedExports) ? module.usedExports.length : 0;
          
          if (providedCount > usedCount && usedCount > 0) {
            const estimatedEliminated = (module.size || 0) * ((providedCount - usedCount) / providedCount);
            eliminatedSize += estimatedEliminated;
            eliminatedModules.push(module.name || module.identifier);
          }
        }
      });
    }

    const totalSize = this.calculateTotalSize(this.extractModules(stats));
    const efficiency = totalSize > 0 ? (eliminatedSize / totalSize) * 100 : 0;

    return {
      eliminatedModules,
      eliminatedSize,
      efficiency,
    };
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(): OptimizationRecommendation[] {
    if (!this.bundleData) {
      throw new Error('No bundle data available. Run analyzeBundleFromStats first.');
    }

    const recommendations: OptimizationRecommendation[] = [];

    // Check bundle size
    if (this.bundleData.totalSize > 500 * 1024) {
      recommendations.push({
        type: 'size',
        severity: 'high',
        title: 'Large Bundle Size',
        description: `Bundle size is ${this.formatBytes(this.bundleData.totalSize)}, which exceeds recommended 500KB`,
        impact: {
          sizeSaving: this.bundleData.totalSize - 500 * 1024,
          performanceGain: 20,
          complexity: 'medium',
        },
        actions: [
          'Implement code splitting',
          'Use dynamic imports for non-critical code',
          'Remove unused dependencies',
          'Enable tree shaking',
        ],
        examples: [
          'const LazyComponent = lazy(() => import("./LazyComponent"))',
          'Use webpack-bundle-analyzer for detailed analysis',
        ],
      });
    }

    // Check for large chunks
    const largeChunks = this.bundleData.chunks.filter(chunk => chunk.size > 100 * 1024);
    if (largeChunks.length > 0) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        title: 'Large Chunks',
        description: `Found ${largeChunks.length} chunks larger than 100KB`,
        impact: {
          sizeSaving: largeChunks.reduce((sum, chunk) => sum + chunk.size - 100 * 1024, 0),
          performanceGain: 15,
          complexity: 'low',
        },
        actions: [
          'Split large chunks into smaller ones',
          'Use dynamic imports for route-based splitting',
          'Consider vendor chunk separation',
        ],
        examples: [
          'optimization: { splitChunks: { chunks: "all" } }',
        ],
      });
    }

    // Check for duplicates
    if (this.bundleData.duplicates.length > 0) {
      const totalDuplicateSize = this.bundleData.duplicates.reduce((sum, dup) => sum + dup.totalSize, 0);
      recommendations.push({
        type: 'duplication',
        severity: 'high',
        title: 'Duplicate Modules',
        description: `Found ${this.bundleData.duplicates.length} duplicate modules wasting ${this.formatBytes(totalDuplicateSize)}`,
        impact: {
          sizeSaving: totalDuplicateSize * 0.8, // Assume 80% can be eliminated
          performanceGain: 10,
          complexity: 'medium',
        },
        actions: [
          'Configure webpack to avoid duplicates',
          'Use peerDependencies for shared libraries',
          'Implement proper module resolution',
        ],
        examples: [
          'resolve: { alias: { "react": path.resolve("./node_modules/react") } }',
        ],
      });
    }

    // Check for unused dependencies
    const unusedDeps = this.bundleData.dependencies.filter(dep => !dep.used);
    if (unusedDeps.length > 0) {
      recommendations.push({
        type: 'dependency',
        severity: 'medium',
        title: 'Unused Dependencies',
        description: `Found ${unusedDeps.length} unused dependencies`,
        impact: {
          sizeSaving: unusedDeps.reduce((sum, dep) => sum + dep.size, 0),
          performanceGain: 5,
          complexity: 'low',
        },
        actions: [
          'Remove unused dependencies from package.json',
          'Use depcheck tool to identify unused packages',
          'Implement proper dependency audit process',
        ],
        examples: [
          'npm uninstall unused-package',
          'pnpm remove unused-package',
        ],
      });
    }

    // Check tree shaking efficiency
    if (this.bundleData.treeshaking.efficiency < 30) {
      recommendations.push({
        type: 'treeshaking',
        severity: 'medium',
        title: 'Poor Tree Shaking',
        description: `Tree shaking efficiency is only ${this.bundleData.treeshaking.efficiency.toFixed(1)}%`,
        impact: {
          sizeSaving: this.bundleData.totalSize * 0.2, // Estimate 20% improvement
          performanceGain: 15,
          complexity: 'high',
        },
        actions: [
          'Use ES modules instead of CommonJS',
          'Configure webpack for better tree shaking',
          'Use production mode builds',
          'Avoid importing entire libraries',
        ],
        examples: [
          'import { debounce } from "lodash-es"',
          'mode: "production" in webpack config',
        ],
      });
    }

    return recommendations.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(): string {
    if (!this.bundleData) {
      throw new Error('No bundle data available');
    }

    const recommendations = this.generateRecommendations();

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Bundle Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; }
        .recommendation { background: white; padding: 20px; margin: 10px 0; border-left: 4px solid #ddd; border-radius: 4px; }
        .critical { border-left-color: #dc3545; }
        .high { border-left-color: #fd7e14; }
        .medium { border-left-color: #ffc107; }
        .low { border-left-color: #198754; }
        .modules, .chunks { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .size { font-family: monospace; }
    </style>
</head>
<body>
    <h1>Bundle Analysis Report</h1>
    
    <div class="summary">
        <div class="summary-card">
            <h3>Total Size</h3>
            <h2>${this.formatBytes(this.bundleData.totalSize)}</h2>
        </div>
        <div class="summary-card">
            <h3>Gzipped Size</h3>
            <h2>${this.formatBytes(this.bundleData.gzippedSize)}</h2>
        </div>
        <div class="summary-card">
            <h3>Modules</h3>
            <h2>${this.bundleData.modules.length}</h2>
        </div>
        <div class="summary-card">
            <h3>Chunks</h3>
            <h2>${this.bundleData.chunks.length}</h2>
        </div>
        <div class="summary-card">
            <h3>Tree Shaking</h3>
            <h2>${this.bundleData.treeshaking.efficiency.toFixed(1)}%</h2>
        </div>
    </div>

    <h2>Optimization Recommendations</h2>
    ${recommendations.map(rec => `
        <div class="recommendation ${rec.severity}">
            <h3>${rec.title}</h3>
            <p>${rec.description}</p>
            <h4>Impact:</h4>
            <ul>
                ${rec.impact.sizeSaving ? `<li>Size saving: ${this.formatBytes(rec.impact.sizeSaving)}</li>` : ''}
                ${rec.impact.performanceGain ? `<li>Performance gain: ${rec.impact.performanceGain}%</li>` : ''}
                <li>Implementation complexity: ${rec.impact.complexity}</li>
            </ul>
            <h4>Actions:</h4>
            <ul>
                ${rec.actions.map(action => `<li>${action}</li>`).join('')}
            </ul>
            ${rec.examples ? `
                <h4>Examples:</h4>
                <ul>
                    ${rec.examples.map(example => `<li><code>${example}</code></li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `).join('')}

    <h2>Largest Modules</h2>
    <table>
        <thead>
            <tr>
                <th>Module</th>
                <th>Size</th>
                <th>Gzipped</th>
                <th>Chunks</th>
            </tr>
        </thead>
        <tbody>
            ${this.bundleData.modules.slice(0, 20).map(module => `
                <tr>
                    <td>${module.name}</td>
                    <td class="size">${this.formatBytes(module.size)}</td>
                    <td class="size">${this.formatBytes(module.gzippedSize)}</td>
                    <td>${module.chunks.length}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>Chunks</h2>
    <table>
        <thead>
            <tr>
                <th>Chunk</th>
                <th>Size</th>
                <th>Modules</th>
                <th>Type</th>
            </tr>
        </thead>
        <tbody>
            ${this.bundleData.chunks.map(chunk => `
                <tr>
                    <td>${chunk.name}</td>
                    <td class="size">${this.formatBytes(chunk.size)}</td>
                    <td>${chunk.modules.length}</td>
                    <td>${chunk.entry ? 'Entry' : 'Async'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    ${this.bundleData.duplicates.length > 0 ? `
        <h2>Duplicate Modules</h2>
        <table>
            <thead>
                <tr>
                    <th>Module</th>
                    <th>Occurrences</th>
                    <th>Total Size</th>
                </tr>
            </thead>
            <tbody>
                ${this.bundleData.duplicates.map(dup => `
                    <tr>
                        <td>${dup.module}</td>
                        <td>${dup.occurrences}</td>
                        <td class="size">${this.formatBytes(dup.totalSize)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : ''}
</body>
</html>
    `;
  }

  // Helper methods
  private cleanModuleName(name: string): string {
    return name.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  private extractPackageName(path: string): string {
    const match = path.match(/node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^/\\]+)/);
    return match?.[1] || '';
  }

  private getBaseName(name: string): string {
    return name.split('/').pop() || name;
  }

  private isTreeshakeable(packageName: string): boolean {
    // Known tree-shakeable packages
    const treeshakeablePackages = ['lodash-es', 'ramda', 'date-fns'];
    return treeshakeablePackages.some(pkg => packageName.includes(pkg));
  }

  private calculateTotalSize(modules: ModuleInfo[]): number {
    return modules.reduce((sum, module) => sum + module.size, 0);
  }

  private estimateGzippedSize(modules: ModuleInfo[]): number {
    // Rough estimation: gzipped is usually 25-30% of original
    return Math.round(this.calculateTotalSize(modules) * 0.3);
  }

  private estimateModuleGzippedSize(size: number): number {
    return Math.round(size * 0.3);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Default bundle analyzer instance
 */
export const defaultBundleAnalyzer = new BundleAnalyzer();
