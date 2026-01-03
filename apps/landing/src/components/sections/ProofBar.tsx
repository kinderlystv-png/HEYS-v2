// ProofBar.tsx — Proof bar после Hero
// 1 строка с ключевыми фактами: 3–5 минут • 40+ метрик • куратор рядом • 0 ₽ без карты • без автосписаний

export default function ProofBar() {
  const items = [
    '3–5 минут в день',
    '40+ метрик',
    'куратор рядом',
    '0 ₽ без карты',
    'без автосписаний',
  ]

  return (
    <div className="w-full bg-[#f8f9fa] border-y border-[#e5e7eb]">
      <div className="mx-auto max-w-[1024px] px-6 py-4">
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[13px] text-[#6b7280] tracking-wide">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="hidden sm:inline text-[#d1d5db]">•</span>}
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
