/**
 * Скрипт генерации иконок и OG image для PWA и SEO
 * 
 * Запуск: node scripts/generate-icons.js
 * 
 * Требуется: npm install sharp (уже в dev dependencies)
 * 
 * Генерирует:
 * - favicon.ico (32x32)
 * - icon-192.png (192x192)
 * - icon-512.png (512x512)
 * - apple-touch-icon.png (180x180)
 * - og-image.png (1200x630)
 */

const fs = require('fs')
const path = require('path')

const sharp = require('sharp')

const SOURCE_SVG = path.join(__dirname, '../public/icon.svg')
const OG_SVG = path.join(__dirname, '../public/og-image-template.svg')
const OUTPUT_DIR = path.join(__dirname, '../public')

const ICONS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
]

async function generateIcons() {
  console.log('🎨 Генерация иконок из icon.svg...\n')
  
  if (!fs.existsSync(SOURCE_SVG)) {
    console.error('❌ Файл icon.svg не найден!')
    process.exit(1)
  }

  for (const icon of ICONS) {
    const outputPath = path.join(OUTPUT_DIR, icon.name)
    
    await sharp(SOURCE_SVG)
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath)
    
    console.log(`✅ ${icon.name} (${icon.size}x${icon.size})`)
  }

  // Для favicon.ico нужен ICO формат - используем PNG как fallback
  // Современные браузеры поддерживают PNG favicon
  const faviconSource = path.join(OUTPUT_DIR, 'favicon-32.png')
  const faviconDest = path.join(OUTPUT_DIR, 'favicon.ico')
  
  // Копируем 32x32 PNG как ico (браузеры поймут)
  // Для настоящего .ico можно использовать to-ico или png-to-ico
  fs.copyFileSync(faviconSource, faviconDest)
  console.log(`✅ favicon.ico (copied from 32x32 PNG)`)
  
  // OG Image
  console.log('\n🖼️  Генерация OG image...')
  
  if (fs.existsSync(OG_SVG)) {
    const ogOutputPath = path.join(OUTPUT_DIR, 'og-image.png')
    
    await sharp(OG_SVG)
      .resize(1200, 630)
      .png()
      .toFile(ogOutputPath)
    
    console.log(`✅ og-image.png (1200x630)`)
  } else {
    console.log('⚠️  og-image-template.svg не найден, пропускаю OG image')
  }

  console.log('\n🎉 Все иконки сгенерированы!')
  console.log('\nФайлы в public/:')
  ICONS.forEach(i => console.log(`  - ${i.name}`))
  console.log('  - favicon.ico')
  console.log('  - og-image.png')
}

generateIcons().catch(console.error)
