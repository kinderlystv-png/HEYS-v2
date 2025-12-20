/**
 * HEYS Health Check — Yandex Cloud Function
 * Простая проверка работоспособности API
 */

module.exports.handler = async function (event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: 'ok',
      service: 'HEYS API',
      region: 'ru-central1',
      timestamp: new Date().toISOString()
    })
  };
};
