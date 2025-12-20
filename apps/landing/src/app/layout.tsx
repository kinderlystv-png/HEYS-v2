import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import Script from 'next/script'
import '../styles/globals.css'

const openSans = Open_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HEYS — Персональное сопровождение питания',
  description: 'HEYS — не трекер калорий, а экосистема с живым куратором. 7 дней Pro бесплатно. Куратор ведёт дневник за вас, поддерживает при срывах.',
  keywords: 'питание, похудение, диетолог, нутрициолог, контроль веса, дневник питания',
  openGraph: {
    title: 'HEYS — Персональное сопровождение питания',
    description: 'Экосистема с живым куратором. 7 дней Pro бесплатно.',
    type: 'website',
    locale: 'ru_RU',
  },
}

// Env variables для аналитики
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <head>
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
