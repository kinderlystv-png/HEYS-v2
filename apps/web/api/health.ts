// Simple health check endpoint
export const config = {
  runtime: 'edge',
};

export default function handler(request: Request): Response {
  return new Response(
    JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      path: new URL(request.url).pathname
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
