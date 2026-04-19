#!/usr/bin/env node
// filepath: scripts/version-alignment.js
/**
 * Version Alignment Script
 * Выравнивает версии конфликтующих зависимостей
 * Performance Sprint Day 2 - Component 1B
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Version Alignment Starting...\n');

// Целевые версии для выравнивания
const targetVersions = {
  typescript: '^5.9.2',
  vitest: '^3.2.4',
  '@vitest/coverage-v8': '^3.2.4',
  '@vitest/ui': '^3.2.4',
  zod: '^3.25.76',
};

const packagePaths = [
  'packages/core/package.json',
  'packages/ui/package.json',
  'packages/shared/package.json',
  'packages/search/package.json',
];

/**
 * Обновление версий в package.json
 */
function updatePackageVersions(packagePath) {
  if (!fs.existsSync(packagePath)) {
    console.log(`⚠️  Package not found: ${packagePath}`);
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    let updated = false;

    // Обновляем dependencies
    if (packageJson.dependencies) {
      Object.keys(targetVersions).forEach((dep) => {
        if (packageJson.dependencies[dep]) {
          const oldVersion = packageJson.dependencies[dep];
          const newVersion = targetVersions[dep];

          if (oldVersion !== newVersion) {
            packageJson.dependencies[dep] = newVersion;
            console.log(`  📦 ${dep}: ${oldVersion} → ${newVersion}`);
            updated = true;
          }
        }
      });
    }

    // Обновляем devDependencies
    if (packageJson.devDependencies) {
      Object.keys(targetVersions).forEach((dep) => {
        if (packageJson.devDependencies[dep]) {
          const oldVersion = packageJson.devDependencies[dep];
          const newVersion = targetVersions[dep];

          if (oldVersion !== newVersion) {
            packageJson.devDependencies[dep] = newVersion;
            console.log(`  🛠️  ${dep}: ${oldVersion} → ${newVersion}`);
            updated = true;
          }
        }
      });
    }

    if (updated) {
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`✅ Updated: ${packagePath}\n`);
    } else {
      console.log(`✅ No changes needed: ${packagePath}\n`);
    }

    return updated;
  } catch (error) {
    console.log(`❌ Error updating ${packagePath}:`, error.message);
    return false;
  }
}

/**
 * Главная функция
 */
function main() {
  console.log('🎯 Aligning dependency versions across workspace\n');

  let totalUpdated = 0;

  packagePaths.forEach((packagePath) => {
    console.log(`🔍 Checking: ${packagePath}`);
    const updated = updatePackageVersions(packagePath);
    if (updated) totalUpdated++;
  });

  console.log('📋 VERSION ALIGNMENT SUMMARY:');
  console.log('═'.repeat(50));
  console.log(`📦 Packages checked: ${packagePaths.length}`);
  console.log(`✅ Packages updated: ${totalUpdated}`);
  console.log(`🎯 Target versions:`);

  Object.entries(targetVersions).forEach(([dep, version]) => {
    console.log(`  ${dep}: ${version}`);
  });

  if (totalUpdated > 0) {
    console.log('\n🔄 Next steps:');
    console.log('1. Run: pnpm install');
    console.log('2. Run: pnpm run build');
    console.log('3. Test applications');
  }

  console.log('\n✅ Version alignment completed!');
}

main();
