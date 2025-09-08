/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './apps/**/*.{html,js,svelte,ts}',
    './packages/**/*.{html,js,svelte,ts}',
    './apps/web/src/**/*.{html,js,svelte,ts}'
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem'
      }
    },
  },
  plugins: [
    '@tailwindcss/forms'
  ],
}
