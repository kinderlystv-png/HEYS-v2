import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'

// import { ABTestSwitcher } from '@/components/ABTestSwitcher' // временно скрыто
import AnalyticsConsentGate from '@/components/AnalyticsConsentGate'
import CookieInfoBanner from '@/components/CookieInfoBanner'

import '../styles/globals.css'

const openSans = Open_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

// Базовый URL для продакшена
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://heyslab.ru'

export const metadata: Metadata = {
  // Основные мета-теги
  title: {
    default: 'HEYS — Персональное сопровождение питания с куратором',
    template: '%s | HEYS',
  },
  description: 'Не сила воли — а человек рядом. HEYS — экосистема с живым куратором, который ведёт дневник за вас и поддерживает при срывах. Неделя старта (0 ₽, по записи).',
  keywords: [
    'питание',
    'куратор питания',
    'персональный куратор',
    'контроль веса',
    'дневник питания',
    'куратор онлайн',
    'трекер калорий с куратором',
    'сопровождение режима',
    'пищевые привычки',
  ],
  authors: [{ name: 'HEYS Team' }],
  creator: 'HEYS',
  publisher: 'HEYS',

  // Формат телефона и цвет темы
  formatDetection: {
    telephone: true,
    email: true,
  },

  // Канонический URL
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: '/',
  },

  // Open Graph для соцсетей (VK, Facebook, Telegram)
  openGraph: {
    title: 'HEYS — Не сила воли, а человек рядом',
    description: 'Экосистема с живым куратором. Дневник ведём мы. Неделя старта 0 ₽.',
    type: 'website',
    locale: 'ru_RU',
    url: baseUrl,
    siteName: 'HEYS',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'HEYS — Персональное сопровождение питания',
        type: 'image/png',
      },
    ],
  },

  // Twitter Card (также используется Telegram)
  twitter: {
    card: 'summary_large_image',
    title: 'HEYS — Не сила воли, а человек рядом',
    description: 'Экосистема с живым куратором. Неделя старта 0 ₽.',
    images: ['/og-image.png'],
  },

  // Роботы и индексация
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Иконки
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },

  // Манифест для PWA
  manifest: '/manifest.json',

  // Верификация (заполнить при необходимости)
  // verification: {
  //   google: 'google-site-verification-code',
  //   yandex: 'yandex-verification-code',
  // },
}

// Цвет системных полос в мобильных браузерах (область «чёлки» и панель Safari)
// задаётся постранично, не здесь: у главной верх экрана тёмный, у правовых
// страниц — светлый, и общее значение красило бы половину сайта чужой полосой.

// Яндекс.Метрика — российский счётчик, данные в РФ.
// Подключение раскрыто в privacy-policy.md §10. Webvisor отключён,
// чтобы счётчик собирал только обезличенную статистику посещений.
//
// 🛡️ GA4 / Meta Pixel НЕ загружаются — раньше код жил здесь под env-флагом,
// что было миной (включение через env → трансграничная передача ПДн без
// уведомления РКН → ст.12 152-ФЗ). Если когда-либо потребуется — заводить
// заново с отдельным cookie-consent gate (cookie-banner accept_analytics).
const YM_ID = process.env.NEXT_PUBLIC_YM_ID || null;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <head>{/* GA4 / Meta Pixel не загружаются. */}</head>
      <body className={openSans.className}>
        {children}
        {/* <ABTestSwitcher /> — временно скрыт пока обкатываем новое позиционирование Hero */}
        <AnalyticsConsentGate ymId={YM_ID} />
        <CookieInfoBanner />
      </body>
    </html>
  )
}
