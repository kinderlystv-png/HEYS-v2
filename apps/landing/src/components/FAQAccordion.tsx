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
                const buttonId = `faq-button-${i}`
                const panelId = `faq-panel-${i}`

                return (
                    <div
                        key={i}
                        className={`rounded-2xl border transition-all duration-300 ${isOpen
                            ? 'border-blue-200 bg-white shadow-md'
                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100/50'
                            }`}
                    >
                        <button
                            id={buttonId}
                            type="button"
                            onClick={() => toggle(i)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            className="flex w-full cursor-pointer items-center justify-between gap-6 rounded-2xl px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            <span
                                className={`text-base md:text-lg font-semibold transition-colors duration-300 ${isOpen ? 'text-blue-700' : 'text-gray-900'
                                    }`}
                            >
                                {item.q}
                            </span>
                            <span
                                aria-hidden="true"
                                className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'
                                    }`}
                            >
                                ▼
                            </span>
                        </button>
                        <div
                            id={panelId}
                            role="region"
                            aria-labelledby={buttonId}
                            aria-hidden={!isOpen}
                            className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
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
