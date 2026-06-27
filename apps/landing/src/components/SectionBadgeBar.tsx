import type { ReactNode } from 'react'

interface SectionBadgeBarProps {
  children: ReactNode
}

export default function SectionBadgeBar({ children }: SectionBadgeBarProps) {
  return (
    <div className="mb-10 w-full border-t border-slate-100/80 bg-transparent px-6 py-7 text-center sm:mb-12">
      <span className="inline-flex rounded-full border border-[#DCECF8] bg-[#F8FBFF] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1D70B7] shadow-[0_1px_2px_rgba(29,112,183,0.05)]">
        {children}
      </span>
    </div>
  )
}
