// Скрипт для проверки экспортов HEYS модулей
console.log('=== ПРОВЕРКА ЭКСПОРТОВ HEYS ===');

console.log('1. HEYS.Reports:', typeof window.HEYS?.Reports);
console.log('   - Reports.ReportsTab:', typeof window.HEYS?.Reports?.ReportsTab);
console.log('   - ReportsManager:', typeof window.HEYS?.ReportsManager);

console.log('2. HEYS.SmartSearchEngine:', typeof window.HEYS?.SmartSearchEngine);
console.log('   - SmartSearch:', typeof window.HEYS?.SmartSearch);

console.log('3. HEYS.IntegrationLayer:', typeof window.HEYS?.IntegrationLayer);

console.log('4. HEYS.serviceWorker:', typeof window.HEYS?.serviceWorker);

console.log('5. modernSearchIntegration:', typeof window.modernSearchIntegration);
console.log('   - loaded:', window.modernSearchIntegration?.loaded);
console.log('   - error:', window.modernSearchIntegration?.error);

console.log('6. Service Worker поддержка:', 'serviceWorker' in navigator);

console.log('=== КОНЕЦ ПРОВЕРКИ ===');
