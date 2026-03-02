function normalize(items) {
    var uMap = new Map();
    items.forEach(function(item) {
        var name = (item.name || '').trim().toLowerCase();
        var fallbackId = String(item.product_id || item.id);
        var key = name || fallbackId;
        if (!uMap.has(key)) {
            uMap.set(key, item);
        }
    });

    var uniqueItems = Array.from(uMap.values());
    uniqueItems.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
    });

    var signature = uniqueItems.map(function(i) {
        return (i.name || '').trim().toLowerCase() || String(i.product_id || i.id);
    }).join('|');
    
    return { signature, uniqueItems };
}

console.log(normalize([{name: 'Кофе', product_id: 1}, {name: 'молоко', product_id: 2}]).signature);
console.log(normalize([{name: 'Молоко', product_id: 3}, {name: 'Кофе', product_id: 1}]).signature);
