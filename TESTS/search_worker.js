// Simple test search worker for TESTS
self.addEventListener('message', function(e) {
    const { type, data, taskId } = e.data;
    
    if (type === 'ping') {
        self.postMessage({ type: 'pong', success: true });
        return;
    }
    
    if (type === 'search') {
        // Simple search simulation
        const query = data.query.toLowerCase();
        const results = data.products.filter(product => 
            product.name.toLowerCase().includes(query)
        );
        
        self.postMessage({
            type: 'search_result',
            taskId,
            success: true,
            data: { results, source: 'worker' }
        });
        return;
    }
    
    self.postMessage({
        type: 'error',
        taskId,
        error: 'Unknown task type: ' + type
    });
});

console.log('[Search Worker] Test worker initialized');
