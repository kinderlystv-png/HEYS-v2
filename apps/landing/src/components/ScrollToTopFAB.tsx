'use client'

import { useEffect, useState } from 'react'

export function ScrollToTopFAB() {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const toggleVisibility = () => {
            // Показываем кнопку, если проскроллили больше 500px
            if (window.scrollY > 500) {
                setIsVisible(true)
            } else {
                setIsVisible(false)
            }
        }

        window.addEventListener('scroll', toggleVisibility)
        return () => window.removeEventListener('scroll', toggleVisibility)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        })
    }

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-6 right-6 z-[9998] p-3 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 transition-all duration-300 hover:bg-slate-50 hover:shadow-lg active:scale-95 flex items-center justify-center ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
                }`}
            aria-label="Наверх"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-5 h-5"
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
        </button>
    )
}
