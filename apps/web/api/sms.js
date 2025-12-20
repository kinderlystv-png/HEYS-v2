// Vercel Serverless Function — SMS.ru Proxy
// Обходит CORS для отправки SMS

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, msg, api_id } = req.body;

    if (!to || !msg || !api_id) {
      return res.status(400).json({ error: 'Missing required fields: to, msg, api_id' });
    }

    // Формируем URL для SMS.ru
    const params = new URLSearchParams({
      api_id,
      to,
      msg,
      json: '1',
      from: 'HEYS' // Одобренный отправитель
    });

    const smsResponse = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    const result = await smsResponse.json();

    return res.status(200).json(result);

  } catch (error) {
    console.error('[SMS Proxy] Error:', error);
    return res.status(500).json({ error: 'SMS proxy error', details: error.message });
  }
}
