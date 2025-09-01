import chalk from 'chalk';
import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

async function optimizeImages(dir: string) {
  console.log(chalk.blue.bold('\n🖼️  Optimizing images...\n'));

  if (!existsSync(dir)) {
    console.log(chalk.yellow(`Directory ${dir} does not exist, skipping image optimization`));
    return;
  }

  let totalSaved = 0;
  let processedCount = 0;

  async function processDirectory(dirPath: string) {
    try {
      const files = await readdir(dirPath, { withFileTypes: true });

      for (const file of files) {
        const fullPath = join(dirPath, file.name);

        if (file.isDirectory()) {
          await processDirectory(fullPath);
        } else if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
          await processImage(fullPath);
        }
      }
    } catch (error) {
      console.log(chalk.red(`Error processing directory ${dirPath}:`, error));
    }
  }

  async function processImage(filePath: string) {
    try {
      const stats = await stat(filePath);
      const originalSize = stats.size;

      // Convert to optimized WebP
      const outputPath = filePath.replace(/\.(jpg|jpeg|png)$/i, '.webp');

      await sharp(filePath).webp({ quality: 85, effort: 6 }).toFile(outputPath);

      const newStats = await stat(outputPath);
      const saved = originalSize - newStats.size;
      totalSaved += saved;
      processedCount++;

      console.log(
        chalk.green('   ✓'),
        chalk.cyan(filePath.replace(process.cwd(), '')),
        chalk.gray(`(saved ${formatBytes(saved)})`),
      );
    } catch (error) {
      console.log(
        chalk.red('   ✗'),
        chalk.cyan(filePath.replace(process.cwd(), '')),
        chalk.gray('(failed)'),
      );
    }
  }

  await processDirectory(dir);

  console.log(chalk.green.bold(`\n✅ Optimized ${processedCount} images`));
  if (totalSaved > 0) {
    console.log(chalk.yellow(`   Total saved: ${formatBytes(totalSaved)}`));
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run optimization
const publicDir = join(process.cwd(), 'apps/web/public');
optimizeImages(publicDir).catch(console.error);
