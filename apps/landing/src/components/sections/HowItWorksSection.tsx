// HowItWorksSection.tsx — «4 шага к предсказуемому результату»
// COPY_FINAL v3.0, Секция 3
// Заменяет 4 тяжёлых блока: ContextSection, DecisionsSection, SupportSection, ControlSection

'use client'

import { useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

// Phosphor Duotone icon paths (MIT-licensed).
const stepIcons = {
    handshake: {
        duotone: 'M200,152l-40,40L96,176,40,136,72.68,70.63,128,56l55.32,14.63.28,1.37H144L98.34,116.29a8,8,0,0,0,1.38,12.42C117.23,139.9,141,139.13,160,120Z',
        main: 'M254.3,107.91,228.78,56.85a16,16,0,0,0-21.47-7.15L182.44,62.13,130.05,48.27a8.14,8.14,0,0,0-4.1,0L73.56,62.13,48.69,49.7a16,16,0,0,0-21.47,7.15L1.7,107.9a16,16,0,0,0,7.15,21.47l27,13.51,55.49,39.63a8.06,8.06,0,0,0,2.71,1.25l64,16a8,8,0,0,0,7.6-2.1l55.07-55.08,26.42-13.21a16,16,0,0,0,7.15-21.46Zm-54.89,33.37L165,113.72a8,8,0,0,0-10.68.61C136.51,132.27,116.66,130,104,122L147.24,80h31.81l27.21,54.41ZM41.53,64,62,74.22,36.43,125.27,16,115.06Zm116,119.13L99.42,168.61l-49.2-35.14,28-56L128,64.28l9.8,2.59-45,43.68-.08.09a16,16,0,0,0,2.72,24.81c20.56,13.13,45.37,11,64.91-5L188,152.66Zm62-57.87-25.52-51L214.47,64,240,115.06Zm-87.75,92.67a8,8,0,0,1-7.75,6.06,8.13,8.13,0,0,1-1.95-.24L80.41,213.33a7.89,7.89,0,0,1-2.71-1.25L51.35,193.26a8,8,0,0,1,9.3-13l25.11,17.94L126,208.24A8,8,0,0,1,131.82,217.94Z',
    },
    camera: {
        duotone: 'M208,64H176L160,40H96L80,64H48A16,16,0,0,0,32,80V192a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V80A16,16,0,0,0,208,64ZM128,168a36,36,0,1,1,36-36A36,36,0,0,1,128,168Z',
        main: 'M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z',
    },
    lightbulb: {
        duotone: 'M208,104a79.86,79.86,0,0,1-30.59,62.92A24.29,24.29,0,0,0,168,186v6a8,8,0,0,1-8,8H96a8,8,0,0,1-8-8v-6a24.11,24.11,0,0,0-9.3-19A79.87,79.87,0,0,1,48,104.45C47.76,61.09,82.72,25,126.07,24A80,80,0,0,1,208,104Z',
        main: 'M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h64v-6a32.15,32.15,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Zm-16.11-9.34a57.6,57.6,0,0,0-46.56-46.55,8,8,0,0,0-2.66,15.78c16.57,2.79,30.63,16.85,33.44,33.45A8,8,0,0,0,176,104a9,9,0,0,0,1.35-.11A8,8,0,0,0,183.89,94.66Z',
    },
    target: {
        duotone: 'M176,128a48,48,0,1,1-48-48A48,48,0,0,1,176,128Z',
        main: 'M221.87,83.16A104.1,104.1,0,1,1,195.67,49l22.67-22.68a8,8,0,0,1,11.32,11.32l-96,96a8,8,0,0,1-11.32-11.32l27.72-27.72a40,40,0,1,0,17.87,31.09,8,8,0,1,1,16-.9,56,56,0,1,1-22.38-41.65L184.3,60.39a87.88,87.88,0,1,0,23.13,29.67,8,8,0,0,1,14.44-6.9Z',
    },
} as const

type StepIconName = keyof typeof stepIcons

function StepIcon({ name }: { name: StepIconName }) {
    const icon = stepIcons[name]

    return (
        <svg viewBox="0 0 256 256" fill="currentColor" className="h-6 w-6" aria-hidden="true">
            <path d={icon.duotone} opacity="0.2" />
            <path d={icon.main} />
        </svg>
    )
}

const STEPS = [
    {
        number: '01',
        label: 'ДЕНЬ 1',
        headline: 'Куратор знакомится с вами и помогает начать',
        body: 'После заявки куратор связывается с вами в выбранном канале, уточняет цель, прошлый опыт, режим, сон, нагрузку и ограничения. Вы не остаётесь один на один с приложением: вместе планируете первую неделю и договариваетесь, как будет удобно оставаться на связи.',
        icon: 'handshake',
        accent: 'bg-blue-50 border-blue-100',
        badgeColor: 'bg-blue-600 text-white',
    },
    {
        number: '02',
        label: 'ДНИ 2–7',
        headline: 'Дневник ведёт куратор — не вы',
        body: 'От вас — фото еды на весах, короткое сообщение или голосовое. Куратор аккуратно переносит данные в дневник, фиксирует тренировки и активность, добавляет новые продукты в вашу базу. К концу недели у вас есть дневник, который не пришлось собирать вручную.',
        icon: 'camera',
        accent: 'bg-green-50 border-green-100',
        badgeColor: 'bg-green-600 text-white',
    },
    {
        number: '03',
        label: 'НЕДЕЛЯ 2',
        headline: 'Свои причины, а не советы из интернета',
        body: 'Куратор смотрит не отдельный день, а неделю: где пропускается еда, как сон связан с вечерней тягой, что меняется после нагрузки или поездки. И вместо очередного совета «для всех» у вас есть человек, который понимает, как проходит именно ваша неделя.',
        icon: 'lightbulb',
        accent: 'bg-orange-50 border-orange-100',
        badgeColor: 'bg-orange-500 text-white',
    },
    {
        number: '04',
        label: 'МЕСЯЦ +',
        headline: 'Режим, который выдерживает обычную жизнь',
        body: 'К концу месяца у вас — не диета с датой окончания, а понятный ритм с поправками на поездки, усталость, тренировки и семейные ужины. Если день пошёл не по плану, куратор разбирается, что изменилось, и помогает выбрать простой следующий шаг.',
        icon: 'target',
        accent: 'bg-purple-50 border-purple-100',
        badgeColor: 'bg-purple-600 text-white',
    },
] as const

export default function HowItWorksSection() {
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
            { threshold: 0.05 }
        )
        if (sectionRef.current) observer.observe(sectionRef.current)
        return () => observer.disconnect()
    }, [])

    return (
        <section ref={sectionRef} id="how-it-works" className="pb-16 md:pb-20 bg-white relative">
            <SectionBadgeBar>03 — ВАШ ПЕРВЫЙ МЕСЯЦ</SectionBadgeBar>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <div
                        className={`text-center mb-10 md:mb-14 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    >
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                            Как выглядит ваш{' '}
                            <span className="text-blue-600">первый месяц с HEYS</span>
                        </h2>
                        <p className="text-gray-500 text-base md:text-lg max-w-xl mx-auto">
                            От заявки до первой устойчивой недели — без ощущения, что вас бросили разбираться в приложении
                        </p>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4 md:space-y-5">
                        {STEPS.map((step, index) => (
                            <div
                                key={step.number}
                                className={`rounded-2xl border ${step.accent} p-5 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                                style={{ transitionDelay: `${150 + index * 120}ms` }}
                            >
                                <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 md:grid-cols-[48px_minmax(0,1fr)] md:gap-x-5">
                                    <div className="col-start-2 row-start-1 mb-2 flex items-center gap-3">
                                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">
                                            {step.number}
                                        </span>
                                        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">
                                            —
                                        </span>
                                        <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                                            {step.label}
                                        </span>
                                    </div>

                                    <div
                                        className={`col-start-1 row-start-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl md:h-12 md:w-12 ${step.badgeColor}`}
                                    >
                                        <StepIcon name={step.icon} />
                                    </div>

                                    <h3 className="col-start-2 row-start-2 self-center text-lg font-bold leading-snug text-gray-900 md:text-xl">
                                        {step.headline}
                                    </h3>

                                    <p className="col-span-2 row-start-3 mt-4 text-[15px] leading-relaxed text-gray-600 md:col-start-2 md:col-span-1 md:mt-2">
                                        {step.body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
