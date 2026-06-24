'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface GenderSelectModalProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (gender: 'male' | 'female') => void
}

export default function GenderSelectModal({ isOpen, onClose, onSelect }: GenderSelectModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    if (!isOpen) return null

    const handleSelect = (gender: 'male' | 'female') => {
        onSelect(gender)
        onClose()
    }

    const modalContent = (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор пола для приложения"
        >
            <div
                className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
                    aria-label="Закрыть"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>

                <h2 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] mb-2 pr-8">
                    Показать приложение под вашу цель
                </h2>
                <p className="text-[14px] text-[#6b7280] mb-6 leading-relaxed">
                    Загрузим пример дня и продукты подходящего рациона. Всё, что вы сделаете,
                    останется только в этом окне.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => handleSelect('male')}
                        className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-[#e5e7eb] hover:border-blue-500 hover:bg-blue-50 active:scale-95 transition-all"
                    >
                        <span className="text-[40px] leading-none">👨</span>
                        <span className="text-[15px] font-medium text-[#111827]">Мужской</span>
                    </button>
                    <button
                        onClick={() => handleSelect('female')}
                        className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-[#e5e7eb] hover:border-pink-500 hover:bg-pink-50 active:scale-95 transition-all"
                    >
                        <span className="text-[40px] leading-none">👩</span>
                        <span className="text-[15px] font-medium text-[#111827]">Женский</span>
                    </button>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return null
    return createPortal(modalContent, document.body)
}
