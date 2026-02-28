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
                    className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors border ${premium
                        ? 'bg-white/10 text-white hover:bg-white/20 border-white/10'
                        : featured
                            ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-md'
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
                className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors mt-3 border ${premium
                    ? 'bg-transparent text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white hover:border-slate-600'
                    : featured
                        ? 'bg-transparent text-blue-600 border-blue-200 hover:bg-blue-50'
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