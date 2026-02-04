/**
 * Тест RPC get_curator_clients через HTTP с JWT
 */

const https = require('https');

// JWT секрет из Cloud Function (должен совпадать!)
const JWT_SECRET = 'A3jKm9$hZ!pQw2vLc8xR';

// Простой JWT encoder
function base64url(str) {
    return Buffer.from(str).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createJwt(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const segments = [
        base64url(JSON.stringify(header)),
        base64url(JSON.stringify(payload))
    ];

    const crypto = require('crypto');
    const signature = crypto.createHmac('sha256', secret)
        .update(segments.join('.'))
        .digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return segments.join('.') + '.' + signature;
}

// Создаём JWT токен куратора
const token = createJwt({
    sub: '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c',
    email: 'poplanton@mail.ru',
    exp: Math.floor(Date.now() / 1000) + 3600
}, JWT_SECRET);

console.log('JWT Token:', token.substring(0, 50) + '...');

// Делаем запрос
const data = JSON.stringify({});

const options = {
    hostname: 'api.heyslab.ru',
    path: '/rpc?fn=get_curator_clients',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://app.heyslab.ru',
        'Content-Length': data.length
    }
};

console.log('\n=== Запрос к RPC ===');
console.log('URL:', `https://${options.hostname}${options.path}`);
console.log('Headers:', JSON.stringify(options.headers, null, 2));

const req = https.request(options, (res) => {
    console.log('\n=== Ответ ===');
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));

    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('\nBody:', body);
        try {
            const parsed = JSON.parse(body);
            console.log('\nParsed:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('(не JSON)');
        }
    });
});

req.on('error', (e) => {
    console.error('Ошибка:', e.message);
});

req.write(data);
req.end();
