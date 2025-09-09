// ===== SCRIPT FOR BROWSER CONSOLE =====
// Copy and paste this code into browser console at localhost:3001

console.log('🚀 HEYS Service Worker Force Update v2.1.0');

// 1. Unregister all Service Workers
navigator.serviceWorker.getRegistrations().then(registrations => {
    console.log('📋 Found', registrations.length, 'Service Worker(s)');
    
    registrations.forEach((registration, index) => {
        console.log(`🗑️ Unregistering SW ${index + 1}:`, registration.scope);
        registration.unregister();
    });
    
    // 2. Clear all caches
    return caches.keys();
}).then(cacheNames => {
    console.log('📦 Found', cacheNames.length, 'cache(s):', cacheNames);
    
    return Promise.all(
        cacheNames.map(cacheName => {
            console.log('🧹 Deleting cache:', cacheName);
            return caches.delete(cacheName);
        })
    );
}).then(() => {
    console.log('✨ All caches cleared');
    
    // 3. Force hard refresh
    console.log('🔄 Performing hard refresh...');
    window.location.reload(true);
}).catch(error => {
    console.error('❌ Error during SW update:', error);
});

// Alternative method if above doesn't work:
console.log('📝 Alternative: Manual cache clear');
console.log('1. Open DevTools → Application → Storage');
console.log('2. Click "Clear storage" → "Clear site data"');
console.log('3. Refresh page with Ctrl+Shift+R');
