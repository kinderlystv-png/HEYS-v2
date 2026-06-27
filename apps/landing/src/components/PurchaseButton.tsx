'use client'

import { useState } from 'react'

import PurchaseModal from './modals/PurchaseModal'

interface PurchaseButtonProps {
    planName: string
    planPrice: string
    featured?: boolean
    premium?: boolean
    ctaText?: string
    isPrimary?: boolean
}

export default function PurchaseButton({ planName, planPrice, featured = false, premium = false, ctaText = 'Оформить подписку', isPrimary = false }: PurchaseButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)

    if (isPrimary) {
        return (
            <>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className={`flex min-h-[46px] w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-[13px] font-semibold leading-snug transition-colors sm:text-sm ${premium
                        ? 'bg-white/10 text-white hover:bg-white/20 border-white/10'
                        : featured
                            ? 'bg-[#1D70B7] text-white hover:bg-[#185F9D] border-[#1D70B7] shadow-[0_10px_22px_rgba(29,112,183,0.18)]'
                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200 border-gray-100'
                        }`}
                >
                    {ctaText}
                </button>

                <PurchaseModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    planName={planName}
                    planPrice={planPrice}
                />
            </>
        )
    }

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className={`mt-3 flex min-h-[46px] w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-[13px] font-semibold leading-snug transition-colors sm:text-sm ${premium
                    ? 'bg-transparent text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white hover:border-slate-600'
                    : featured
                        ? 'bg-transparent text-[#1D70B7] border-[#DCECF8] hover:bg-[#F8FBFF]'
                        : 'bg-transparent text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
            >
                {ctaText}
            </button>

            <PurchaseModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                planName={planName}
                planPrice={planPrice}
            />
        </>
    )
}
