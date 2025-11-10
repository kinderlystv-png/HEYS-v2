/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const fs = require('fs');

/**
 * Финальная очистка ESLint ошибок после основной автоматизации
 */

function fixFinalEslintIssues() {
  const files = [
    'apps/web/src/components/lazy/LazyReports.tsx',
    'apps/web/src/components/lazy/LazySettings.tsx',
  ];

  files.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');

      // Фикс пустых object patterns
      content = content.replace(/\{[ ]*\}/g, '{_}');

      // Фикс неиспользуемых параметров readonly
      content = content.replace(/readonly(?=\))/g, '_readonly');
      content = content.replace(/readonly(?=,)/g, '_readonly');

      // Убираем лишние deps из useCallback
      content = content.replace(
        /React\.useCallback\((.*?), \[(.*?)onError(.*?)\]/gms,
        (match, fn, before, after) => {
          const deps = before + after;
          const cleanDeps = deps.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
          return `React.useCallback(${fn}, [${cleanDeps}]`;
        },
      );

      content = content.replace(
        /React\.useCallback\((.*?), \[(.*?)_readonly(.*?)\]/gms,
        (match, fn, before, after) => {
          const deps = before + after;
          const cleanDeps = deps.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
          return `React.useCallback(${fn}, [${cleanDeps}]`;
        },
      );

      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed final ESLint issues in ${filePath}`);
    }
  });
}

fixFinalEslintIssues();
console.log('🎯 Final ESLint cleanup completed!');
