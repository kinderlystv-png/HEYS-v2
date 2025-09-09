#!/usr/bin/env node

/**
 * Migration script to replace legacy error handling with modern components
 * Run with: node scripts/migrate-error-handling.js
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Configuration
const config = {
  rootDir: process.cwd(),
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  skipDirs: ['node_modules', 'dist', 'build', '.git', 'coverage'],
  backupDir: path.join(process.cwd(), '.migration-backup'),
  dryRun: process.argv.includes('--dry-run'),
};

// Migration rules
const migrations = [
  {
    name: 'Replace legacy ErrorBoundary import',
    pattern: /import.*from.*['"`].*heys_error_boundary_v1['"`]/g,
    replacement: "import { ErrorBoundary } from '@heys/shared';",
  },
  {
    name: 'Replace legacy error logging',
    pattern: /window\.HEYS\.logError\(/g,
    replacement: 'errorLogger.logError(',
  },
  {
    name: 'Add error logger import',
    pattern: /(import.*from.*['"`]@heys\/shared['"`];?)/,
    replacement: '$1\nimport { errorLogger } from \'@heys/shared\';',
    condition: (content) => content.includes('errorLogger.logError(') && !content.includes('import { errorLogger }'),
  },
  {
    name: 'Replace class component with hooks',
    pattern: /class\s+(\w+)\s+extends\s+React\.Component/g,
    replacement: 'function $1(props)',
    manual: true, // Requires manual review
  },
];

class MigrationRunner {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      migrationsApplied: 0,
      errors: [],
    };
  }

  async run() {
    console.log('🚀 Starting EAP 3.0 Error Handling Migration...\n');
    
    if (config.dryRun) {
      console.log('📝 Running in DRY RUN mode - no files will be modified\n');
    }

    try {
      await this.createBackupDir();
      await this.processDirectory(config.rootDir);
      this.printSummary();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  async createBackupDir() {
    if (!config.dryRun && !fs.existsSync(config.backupDir)) {
      fs.mkdirSync(config.backupDir, { recursive: true });
      console.log(`📁 Created backup directory: ${config.backupDir}`);
    }
  }

  async processDirectory(dir) {
    try {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          if (!config.skipDirs.includes(entry)) {
            await this.processDirectory(fullPath);
          }
        } else if (this.shouldProcessFile(fullPath)) {
          await this.processFile(fullPath);
        }
      }
    } catch (error) {
      this.stats.errors.push(`Error processing directory ${dir}: ${error.message}`);
    }
  }

  shouldProcessFile(filePath) {
    const ext = path.extname(filePath);
    return config.extensions.includes(ext);
  }

  async processFile(filePath) {
    try {
      this.stats.filesProcessed++;
      
      const content = await readFile(filePath, 'utf8');
      let modifiedContent = content;
      let hasChanges = false;
      
      // Apply migrations
      for (const migration of migrations) {
        if (migration.manual) {
          // Just detect manual migrations
          if (migration.pattern.test(content)) {
            console.log(`⚠️  Manual migration required in ${filePath}: ${migration.name}`);
          }
          continue;
        }
        
        if (migration.condition && !migration.condition(content)) {
          continue;
        }
        
        const newContent = modifiedContent.replace(migration.pattern, migration.replacement);
        if (newContent !== modifiedContent) {
          modifiedContent = newContent;
          hasChanges = true;
          this.stats.migrationsApplied++;
          console.log(`✅ Applied "${migration.name}" to ${filePath}`);
        }
      }
      
      // Write changes
      if (hasChanges) {
        this.stats.filesModified++;
        
        if (!config.dryRun) {
          // Create backup
          const backupPath = path.join(config.backupDir, path.relative(config.rootDir, filePath));
          const backupDir = path.dirname(backupPath);
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          await writeFile(backupPath, content);
          
          // Write modified file
          await writeFile(filePath, modifiedContent);
        }
        
        console.log(`📝 Modified: ${filePath}`);
      }
      
    } catch (error) {
      this.stats.errors.push(`Error processing file ${filePath}: ${error.message}`);
    }
  }

  printSummary() {
    console.log('\n📊 Migration Summary:');
    console.log('═'.repeat(50));
    console.log(`Files processed: ${this.stats.filesProcessed}`);
    console.log(`Files modified: ${this.stats.filesModified}`);
    console.log(`Migrations applied: ${this.stats.migrationsApplied}`);
    console.log(`Errors: ${this.stats.errors.length}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (!config.dryRun && this.stats.filesModified > 0) {
      console.log(`\n💾 Backup created in: ${config.backupDir}`);
    }
    
    console.log('\n🎉 Migration completed!');
    
    if (this.stats.filesModified > 0) {
      console.log('\n📝 Next steps:');
      console.log('1. Review the changes in your files');
      console.log('2. Update imports to use new error handling components');
      console.log('3. Test your application thoroughly');
      console.log('4. Remove legacy error handling files');
    }
  }
}

// Run migration
const runner = new MigrationRunner();
runner.run().catch(console.error);
