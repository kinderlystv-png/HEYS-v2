/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        heys: {
          primary: '#3B82F6',    // Синий из логотипа
          secondary: '#10B981',  // Зелёный
          accent: '#F97316',     // Оранжевый для CTA
          dark: '#1E293B',
          light: '#F8FAFC',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
