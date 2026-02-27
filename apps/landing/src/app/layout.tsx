import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import Script from 'next/script'
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
    'персональный диетолог',
    'контроль веса',
    'дневник питания',
    'нутрициолог онлайн',
    'трекер калорий с куратором',
    'сопровождение питания',
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

// Env variables для аналитики
// ⚠️ ОТКЛЮЧЕНО 2025-12-24: GA4 + Meta Pixel = трансграничная передача ПДн (ст.12 152-ФЗ)
// Для включения требуется:
// 1. Уведомление РКН о трансграничной передаче (до начала!)
// 2. Обновление Политики конфиденциальности с описанием передачи
// 3. Обновление Cookie-политики (сейчас: "только технические")
// 4. Добавление opt-in cookie consent banner
// 
// TODO: После compliance включить обратно:
// const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
// const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const GA4_ID = null; // disabled for 152-FZ compliance
const META_PIXEL_ID = null; // disabled for 152-FZ compliance

// Яндекс.Метрика — 152-ФЗ safe (данные в РФ)
const YM_ID = process.env.NEXT_PUBLIC_YM_ID || null;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <head>
        {/* Яндекс.Метрика — 152-ФЗ compliant */}
        {YM_ID && (
          <Script id="yandex-metrika" strategy="afterInteractive">
            {`
              (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
              (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
              ym(${YM_ID}, "init", {
                clickmap:true,
                trackLinks:true,
                accurateTrackBounce:true,
                webvisor:true
              });
            `}
          </Script>
        )}

        {/* Google Analytics 4 */}
        {GA4_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA4_ID}', {
                  page_title: document.title,
                  page_location: window.location.href
                });
              `}
            </Script>
          </>
        )}

        {/* Meta Pixel (Facebook) */}
        {META_PIXEL_ID && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
        )}
      </head>
      <body className={openSans.className}>
        {children}

        {/* Яндекс.Метрика noscript fallback */}
        {YM_ID && (
          <noscript>
            <div>
              <img
                src={`https://mc.yandex.ru/watch/${YM_ID}`}
                style={{ position: 'absolute', left: '-9999px' }}
                alt=""
              />
            </div>
          </noscript>
        )}

        {/* Meta Pixel noscript fallback */}
        {META_PIXEL_ID && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}
      </body>
    </html>
  )
}
