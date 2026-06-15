import type { Metadata } from 'next'

import CalculatorsClient from '@/components/CalculatorsClient'

export const metadata: Metadata = {
  title: 'Калькулятор калорий, TDEE и BMI',
  description:
    'Рассчитайте ориентир калорий, TDEE, BMI, умеренный дефицит и калорийность блюда. Справочные расчёты HEYS для спокойного старта дневника питания.',
  alternates: {
    canonical: '/calculators/',
  },
  openGraph: {
    title: 'Калькулятор калорий, TDEE и BMI — HEYS',
    description:
      'Справочные расчёты калорий, дефицита и калорийности блюда для старта дневника питания.',
    url: '/calculators/',
  },
}

export default function CalculatorsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Калькулятор калорий HEYS',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'RUB',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CalculatorsClient />
    </>
  )
}
