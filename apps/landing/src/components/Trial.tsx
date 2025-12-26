'use client'

import TrialCapacity from './TrialCapacity'
import TrialForm from './TrialForm'

import { useVariant } from '@/context/VariantContext'

export default function Trial() {
  const { content } = useVariant()
  const trial = content.trial

  return (
    <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-700" id="trial">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Левая часть - текст */}
            <div className="text-center lg:text-left">
              {/* Capacity Widget + Badge */}
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-8">
                <div className="inline-block bg-white/20 backdrop-blur text-white text-sm font-medium px-4 py-2 rounded-full">
                  {trial.badge}
                </div>
                <TrialCapacity compact className="bg-white/10 border-white/20" />
              </div>
              
              {/* Heading */}
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                {trial.title}
              </h2>
              
              <p className="text-xl text-blue-100 mb-8">
                {trial.subtitle}
              </p>
              
              {/* What you get */}
              <div className="space-y-4 mb-8">
                {trial.bullets.map((bullet, i) => (
                  <div key={i} className="flex items-center gap-3 text-white">
                    <span className="text-2xl">{bullet.icon}</span>
                    <span>{bullet.text}</span>
                  </div>
                ))}
              </div>
              
              {/* Trust */}
              <p className="text-blue-200 text-sm whitespace-pre-line">
                {trial.limitation}
              </p>
              
              {/* Purchase link */}
              <div className="mt-8 pt-6 border-t border-white/20">
                <p className="text-white/70 text-sm">
                  {trial.purchaseLinkText}{' '}
                  <a href="#contact" className="text-white font-medium hover:underline">
                    {trial.purchaseLinkCta}
                  </a>
                </p>
              </div>
            </div>
            
            {/* Правая часть - форма */}
            <div>
              <TrialForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
