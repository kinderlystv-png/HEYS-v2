import FAQ from '@/components/FAQ'
import Footer from '@/components/Footer'
import Hero from '@/components/Hero'
import HowItWorks from '@/components/HowItWorks'
import Pricing from '@/components/Pricing'
import Problem from '@/components/Problem'
import PurchaseSection from '@/components/PurchaseSection'
import Solution from '@/components/Solution'
import Trial from '@/components/Trial'

export default function Home() {
  return (
    <main>
      <Hero />
      {/* Якорь для стрелки вниз в Hero ("следующий экран") */}
      <div id="what-is-heys">
        <Problem />
      </div>
      <Solution />
      <HowItWorks />
      <Pricing />
      {/* Бесплатный триал — для тех, кто хочет попробовать без оплаты */}
      <Trial />
      {/* Форма покупки — для тех, кто готов оплатить сразу */}
      <PurchaseSection />
      <FAQ />
      <Footer />
    </main>
  )
}
