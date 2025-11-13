const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL не задан в .env');

export const apiClient = {
  async post<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...options,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
};
