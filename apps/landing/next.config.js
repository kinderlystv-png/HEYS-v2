/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export for Yandex Object Storage
  images: {
    unoptimized: true, // For static export
  },
  devIndicators: false,
  trailingSlash: true,
  // Отключаем Turbopack, используем Webpack для стабильности в monorepo
};

module.exports = nextConfig;
