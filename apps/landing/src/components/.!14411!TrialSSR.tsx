// TrialSSR.tsx — Server Component версия секции Trial
// Рендерится на сервере для SEO

import TrialForm from '@/components/TrialForm'
import type { LandingVariant, VariantContent } from '@/config/landing-variants'

interface TrialSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function TrialSSR({ content, variant: _variant }: TrialSSRProps) {
  const trial = content.trial

  return (
    <section className="relative py-16 md:py-24 bg-slate-900 border-t border-slate-800" id="trial">
      {/* Background Glows to match the premium theme */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
      <div className="absolute -top-40 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px]      <div className="absolute top-1/2 left-0 w-64 h-64adge */}
      <div className="sticky top-0 z-[100] bg-slate-900/80 backdrop-blur-md border-b border-white/5 py-3 mb-10 px-6 text-center shadow-sm w-full">
        <span className="inline-block px-3 py-1 bg-indigo-500/10 text-indigo-300 text-[11px] font-bold tracking-widest uppercase rounded-full ring-1 ring-indigo-500/20">
          09 — БЕСПЛАТНЫЙ ТЕСТ
        </span>
      </div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-5xl mx-auto bg-slate-800/40 rounded-3xl border border-white/10 p-6 md:p-10 shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            
            {/* Левая часть - текст (Strictly left aligned) */}
            <div className="text-left order-2 lg:order-1">
              {/* Badge */}
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 text-sm font-medium px-4 py-2 rounded-full border border-indigo-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  {trial.badge}
                </div>
              </div>

              {/* Heading */}
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
                {trial.title}
              </h2>
              
              {/* Subtitle Sub-block */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
                <p className="text-base md:text-lg text-slate-300 leading-relaxed mb-4">
                  {trial.subtitle}
                                                          flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-xl">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="curreз                    <sрты
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-xl">
                    <svg className="w-4 h                    <svg"0 0 24 24" stroke="curren              strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
