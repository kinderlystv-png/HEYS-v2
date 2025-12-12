/** @type {import('tailwindcss').Config} */
export default {
  // Важно: legacy web app живёт в корне apps/web и использует Tailwind className прямо в heys_*.js
  content: ['./index.html', './src/**/*.{html,js,ts,tsx}', './heys_*.js'],
  // Legacy тема переключается через data-theme="dark" (см. index.html)
  darkMode: ['class', '[data-theme="dark"]'],
  // Preflight может ломать legacy CSS каскад. Оставляем утилиты без reset.
  corePlugins: {
    preflight: false,
  },
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
          'surface-dark': '#1e293b',
        },
      },
    },
  },
  plugins: [],
};
