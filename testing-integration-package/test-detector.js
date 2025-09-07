console.log('🚀 Testing Integration Package');
console.log('✅ Script is working!');

import fs from 'fs';
import path from 'path';

// Простая функция для теста
function detectProject() {
  const currentDir = process.cwd();
  console.log(`📁 Current directory: ${currentDir}`);

  const packageJsonPath = path.join(currentDir, 'package.json');
  console.log(`📦 Looking for package.json at: ${packageJsonPath}`);

  if (fs.existsSync(packageJsonPath)) {
    console.log('✅ Found package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`📋 Project name: ${pkg.name || 'Unknown'}`);

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.next) {
      console.log('🎯 Detected: Next.js');
      return 'next.js';
    } else if (deps.react) {
      console.log('🎯 Detected: React');
      return 'react';
    } else if (deps.vue) {
      console.log('🎯 Detected: Vue');
      return 'vue';
    } else if (deps.svelte) {
      console.log('🎯 Detected: Svelte');
      return 'svelte';
    } else {
      console.log('❓ Unknown project type');
      return 'unknown';
    }
  } else {
    console.log('❌ No package.json found');
    return 'no-package';
  }
}

// Запуск
const result = detectProject();
console.log(`\n🎉 Final result: ${result}`);
console.log('\n📋 Next steps:');
console.log('1. Install dependencies');
console.log('2. Setup testing configuration');
console.log('3. Run tests');
