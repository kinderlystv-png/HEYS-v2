'use client'

import { useState } from 'react'
import PurchaseModal from './modals/PurchaseModal'

interface PurchaseButtonProps {
    planName: string
    planPrice: string
    featured?: boolean
    ctaText?: string
}

export default function PurchaseButton({ planName, planPrice, featured = false, ctaText = 'Оплатить сразу' }: PurchaseButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors mt-3 ${featured
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
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