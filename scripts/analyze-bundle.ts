import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

interface BundleStats {
  name: string;
  size: number;
  gzipSize?: number;
  brotliSize?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectorySize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let totalSize = 0;

  function calculateSize(path: string) {
    try {
      const stats = statSync(path);
      if (stats.isDirectory()) {
        const { readdirSync } = require('fs');
        const files = readdirSync(path);
        files.forEach((file: string) => {
          calculateSize(join(path, file));
        });
      } else {
        totalSize += stats.size;
      }
    } catch (error) {
      // Ignore errors for inaccessible files
    }
  }

  calculateSize(dirPath);
  return totalSize;
}

function analyzeBundles() {
  console.log(chalk.blue.bold('\n📊 Bundle Analysis Report\n'));

  // Build the project first
  console.log(chalk.yellow('Building project...'));
  try {
    execSync('pnpm run build', { stdio: 'inherit' });
  } catch (error) {
    console.log(chalk.red('❌ Build failed'));
    process.exit(1);
  }

  // Analyze package sizes
  console.log(chalk.blue.bold('\n📦 Package Sizes:\n'));

  const packages = ['core', 'ui', 'search', 'storage', 'shared', 'analytics', 'gaming'];

  const stats: BundleStats[] = [];

  packages.forEach((pkg) => {
    const distPath = join(process.cwd(), `packages/${pkg}/dist`);
    if (existsSync(distPath)) {
      const size = getDirectorySize(distPath);
      stats.push({ name: `@heys/${pkg}`, size });
    } else {
      console.log(chalk.yellow(`   ⚠️  No dist found for ${pkg}`));
    }
  });

  // Check web app bundle
  const webDistPath = join(process.cwd(), 'apps/web/dist');
  if (existsSync(webDistPath)) {
    const size = getDirectorySize(webDistPath);
    stats.push({ name: 'web-app', size });
  }

  // Sort by size
  stats.sort((a, b) => b.size - a.size);

  // Display results
  stats.forEach((stat) => {
    const sizeStr = formatBytes(stat.size);
    const barLength = Math.ceil(stat.size / 10000);
    const bar = '█'.repeat(Math.min(barLength, 50));
    console.log(
      chalk.cyan(`   ${stat.name.padEnd(20)}`),
      chalk.yellow(sizeStr.padStart(10)),
      chalk.gray(bar),
    );
  });

  // Total size
  const totalSize = stats.reduce((acc, stat) => acc + stat.size, 0);
  console.log(chalk.green.bold(`\n   Total: ${formatBytes(totalSize)}`));

  // Performance budget check
  const BUDGET_LIMIT = 500 * 1024; // 500KB
  const webAppSize = stats.find((s) => s.name === 'web-app')?.size || 0;

  if (webAppSize > BUDGET_LIMIT) {
    console.log(
      chalk.red.bold(
        `\n⚠️  Warning: Web app bundle size exceeds budget (${formatBytes(BUDGET_LIMIT)})`,
      ),
    );
  } else {
    console.log(
      chalk.green.bold(`\n✅ Web app bundle size within budget (${formatBytes(BUDGET_LIMIT)})`),
    );
  }

  console.log(chalk.blue.bold('\n🎯 Optimization recommendations:'));
  console.log(chalk.gray('   • Use dynamic imports for code splitting'));
  console.log(chalk.gray('   • Enable tree shaking in production'));
  console.log(chalk.gray('   • Optimize images and assets'));
  console.log(chalk.gray('   • Use CDN for external dependencies'));
}

analyzeBundles();
