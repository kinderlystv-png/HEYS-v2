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
                        ? 'border-[#434587] bg-[#434587] text-white shadow-[0_10px_22px_rgba(67,69,135,0.16)] hover:bg-[#37396F]'
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
                className={`mt-3 flex min-h-[44px] w-full items-center justify-center px-3 text-center text-[13px] font-medium leading-snug transition-colors sm:text-sm ${premium
                    ? 'text-[#434587] hover:text-[#37396F]'
                    : featured
                        ? 'text-[#1D70B7] hover:text-[#185F9D]'
                        : 'text-gray-500 hover:text-gray-800'
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
