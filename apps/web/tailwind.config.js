/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,js,ts,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        heys: {
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#0891b2',
          success: '#059669',
          warning: '#d97706',
          error: '#dc2626',
          surface: '#f8fafc',
          'surface-dark': '#1e293b'
        }
      }
    },
  },
  plugins: [],
}
