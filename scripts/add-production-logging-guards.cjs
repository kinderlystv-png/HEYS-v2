#!/usr/bin/env node

/**
 * Replace console.log/warn/info/debug with DEV.log/warn/info/debug
 * in legacy HEYS JS files for production safety
 */

const fs = require('fs');
const path = require('path');

const APPS_WEB_DIR = path.join(__dirname, '..', 'apps', 'web');
const FILES_TO_UPDATE = [
  'heys_core_v12.js',
  'heys_simple_analytics.js',
  'heys_day_v12.js',
  'heys_user_v12.js',
  'heys_reports_v12.js',
];

console.log('🔧 Replacing console.* calls with DEV.* in legacy JS files...\n');

let totalReplacements = 0;

FILES_TO_UPDATE.forEach((filename) => {
  const filePath = path.join(APPS_WEB_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${filename} not found, skipping`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Replace console.log → DEV.log
  content = content.replace(/console\.log\(/g, 'DEV.log(');

  // Replace console.warn → DEV.warn
  content = content.replace(/console\.warn\(/g, 'DEV.warn(');

  // Replace console.info → DEV.info
  content = content.replace(/console\.info\(/g, 'DEV.info(');

  // Replace console.debug → DEV.debug
  content = content.replace(/console\.debug\(/g, 'DEV.debug(');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');

    // Count replacements
    const replacements = (originalContent.match(/console\.(log|warn|info|debug)\(/g) || []).length;
    totalReplacements += replacements;

    console.log(`✅ ${filename} - ${replacements} replacements`);
  } else {
    console.log(`   ${filename} - no changes needed`);
  }
});

console.log(`\n✨ Total replacements: ${totalReplacements}`);
console.log('🎉 Production logging guards added successfully!\n');
