// PainSection.tsx — Секция "Знакомо?"
// Anchor: #pain
// 4 болевые точки + переход к решению

'use client'

import { useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

// Phosphor Duotone icon paths (MIT-licensed).
const painIcons = {
    energy: {
        duotone: 'M216,80v96a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V80A16,16,0,0,1,32,64H200A16,16,0,0,1,216,80Z',
        main: 'M200,56H32A24,24,0,0,0,8,80v96a24,24,0,0,0,24,24H200a24,24,0,0,0,24-24V80A24,24,0,0,0,200,56Zm8,120a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H200a8,8,0,0,1,8,8ZM64,96v64a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0Zm192,0v64a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0Z',
    },
    weight: {
        duotone: 'M56,88l32,80c0,17.67-20,24-32,24s-32-6.33-32-24ZM200,56l-32,80c0,17.67,20,24,32,24s32-6.33,32-24Z',
        main: 'M239.43,133l-32-80a8,8,0,0,0-9.16-4.84L136,62V40a8,8,0,0,0-16,0V65.58L54.26,80.19A8,8,0,0,0,48.57,85L16.57,165A7.92,7.92,0,0,0,16,168c0,23.31,24.54,32,40,32s40-8.69,40-32a7.92,7.92,0,0,0-.57-3L66.92,93.77,120,82V208H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16H136V78.42L187,67.1,160.57,133A7.92,7.92,0,0,0,160,136c0,23.31,24.54,32,40,32s40-8.69,40-32A7.92,7.92,0,0,0,239.43,133ZM56,184c-7.53,0-22.76-3.61-23.93-14.64L56,109.54l23.93,59.82C78.76,180.39,63.53,184,56,184Zm144-32c-7.53,0-22.76-3.61-23.93-14.64L200,77.54l23.93,59.82C222.76,148.39,207.53,152,200,152Z',
    },
    cycle: {
        duotone: 'M216,128a88,88,0,1,1-88-88A88,88,0,0,1,216,128Z',
        main: 'M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z',
    },
    entry: {
        duotone: 'M200,88l-72,72H96V128l72-72Z',
        main: 'M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z',
    },
} as const

type PainIconName = keyof typeof painIcons

function PainIcon({ name }: { name: PainIconName }) {
    const icon = painIcons[name]

    return (
        <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#E2ECF2] text-[#434587]"
        >
            <svg viewBox="0 0 256 256" fill="currentColor" className="h-[26px] w-[26px]">
                <path d={icon.duotone} opacity="0.2" />
                <path d={icon.main} />
            </svg>
        </span>
    )
}

const painPoints = [
    {
        icon: 'energy',
        text: 'Утром нет сил, хотя спали 8 часов',
    },
    {
        icon: 'weight',
        text: 'Вес не меняется, хотя кажется, что с питанием всё нормально',
    },
    {
        icon: 'cycle',
        text: 'Начинаете диету — держитесь 2 недели — срываетесь — вините себя',
    },
    {
        icon: 'entry',
        text: 'Пробовали приложения — бросили через неделю, потому что надоело всё считать',
    },
] satisfies Array<{ icon: PainIconName; text: string }>

export default function PainSection() {
    const [isVisible, setIsVisible] = useState(false)
    const sectionRef = useRef<HTMLElement>(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.1 }
        )
        if (sectionRef.current) observer.observe(sectionRef.current)
        return () => observer.disconnect()
    }, [])

    return (
        <section
            ref={sectionRef}
            id="pain"
            className="pb-12 sm:pb-20 bg-slate-50 border-y border-slate-200 relative"
        >
            <SectionBadgeBar>02 — ВАША СИТУАЦИЯ</SectionBadgeBar>

            <div className="container mx-auto px-6 sm:px-8">
                <div className="max-w-3xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-[26px] sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6 sm:mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Знакомо?
                    </h2>

                    {/* Pain points */}
                    <div className="space-y-3 sm:space-y-4">
                        {painPoints.map((point, index) => (
                            <div
                                key={index}
                                className={`flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-gray-50/80 border border-gray-100 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <PainIcon name={point.icon} />
                                <p className="text-[#374151] text-[15px] sm:text-lg leading-snug">{point.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* Transition text */}
                    <div
                        className={`mt-10 sm:mt-12 px-6 sm:px-8 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '800ms' }}
                    >
                        <p className="text-[18px] sm:text-xl md:text-2xl font-semibold text-gray-900 leading-snug">
                            Сила воли тут ни при чём.<br />
                            <span className="text-blue-600 inline-block mt-2">Рядом нужен человек, которому не всё равно.</span>
                        </p>
                    </div>

                    <div
                        className={`mt-8 sm:mt-10 rounded-3xl border border-blue-100 bg-[#F4FAFF] px-5 py-6 sm:px-8 sm:py-7 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '900ms' }}
                    >
                        <p className="text-[18px] sm:text-xl font-semibold text-gray-900 leading-snug">
                            Если узнали себя — начните с недели Pro.
                        </p>
                        <p className="mt-2 text-[14px] sm:text-[15px] text-[#6b7280] leading-relaxed">
                            За неделю куратор перенесёт первые приёмы в дневник, посмотрит ваш ритм и покажет, где день начинает сбиваться.
                        </p>
                        <a
                            href="#trial"
                            className="mt-5 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[#1D70B7] px-6 py-3 text-[14px] font-semibold tracking-wide text-white shadow-[0_10px_22px_rgba(29,112,183,0.16)] transition-all hover:bg-[#185F9D] active:scale-95"
                        >
                            Оставить заявку на неделю Pro (0 ₽)
                            <span aria-hidden="true">→</span>
                        </a>
                        <p className="mt-3 text-[12px] text-[#8b95a1]">
                            Без карты и автосписаний
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
