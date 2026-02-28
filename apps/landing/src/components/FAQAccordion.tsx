'use client'

import { useState } from 'react';

interface FAQAccordionProps {
    items: { q: string; a: string }[]
}

export default function FAQAccordion({ items }: FAQAccordionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)

    const toggle = (i: number) => {
        setOpenIndex(openIndex === i ? null : i)
    }

    return (
        <div className="space-y-4">
            {items.map((item, i) => {
                const isOpen = openIndex === i

                return (
                    <div
                        key={i}
                        className={`rounded-2xl border transition-all duration-300 ${isOpen
                            ? 'border-blue-200 bg-white shadow-md'
                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100/50'
                            }`}
                    >
                        <button
                            onClick={() => toggle(i)}
                            className="flex w-full cursor-pointer items-center justify-between gap-6 px-6 py-5 text-left focus:outline-none"
                        >
                            <span
                                className={`text-base md:text-lg font-semibold transition-colors duration-300 ${isOpen ? 'text-blue-700' : 'text-gray-900'
                                    }`}
                            >
                                {item.q}
                            </span>
                            <span
                                className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'
                                    }`}
                            >
                                ▼
                            </span>
                        </button>
                        <div
                            className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                }`}
                        >
                            <div className="overflow-hidden">
                                <div
                                    className="px-6 pb-5 text-gray-700 leading-relaxed whitespace-pre-line"
                                    dangerouslySetInnerHTML={{ __html: item.a }}
                                />
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
