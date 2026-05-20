// AuthorSection.tsx — Личное обращение от создателя
// Anchor: #author
// Размещается между Trust и Objections — голос человека перед commitment

'use client'

import { useEffect, useRef, useState } from 'react'

export default function AuthorSection() {
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
            id="author"
            className="py-16 md:py-20 bg-amber-50/30 relative"
        >
            <div className="container mx-auto px-6 sm:px-8">
                <div className="max-w-2xl mx-auto">
                    <div
                        className={`text-center transition-all duration-700 ease-out ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                    >
                        <div className="space-y-5 text-[15px] sm:text-base text-gray-700 leading-relaxed">
                            <p>HEYS появился из нашей собственной потребности в таком формате.</p>
                            <p>
                                В обычных приложениях никто не смотрит в ваш дневник каждый день, не разбирает прогрессию в тренировках раз в неделю, не пишет первым, когда замечает что вы три дня не спите. Нам был нужен именно такой формат — поэтому мы и сделали HEYS.
                            </p>
                            <p>
                                Сейчас берём ограниченное число людей одновременно — иначе не сохранить вовлечённость в каждую жизнь: график, тренировки, сон, контекст.
                            </p>
                            <p className="text-blue-600 font-medium pt-2">
                                Если этот формат — то что вы искали, давайте знакомиться.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
