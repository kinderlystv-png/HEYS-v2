/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export for Vercel
  images: {
    unoptimized: true, // For static export
  },
  trailingSlash: true,
  // Отключаем Turbopack, используем Webpack для стабильности в monorepo
}

module.exports = nextConfig
