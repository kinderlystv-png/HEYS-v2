// Единый источник цен тарифов.
// При изменении цены: меняем здесь — лендинг, user-agreement и refund-страница
// подтянут автоматически. docs/legal/*.md держим вручную в синхроне —
// pre-commit hook check-pricing-sync.cjs ругается на расхождение.

export interface PricingPlan {
  name: string
  price: string // '2 990' (с неразрывным пробелом для тысяч)
  period: string // '₽/мес'
}

export const PRICING = {
  base: { name: 'Base', price: '2 990', period: '₽/мес' },
  pro: { name: 'Pro', price: '7 990', period: '₽/мес' },
  proPlus: { name: 'Pro+', price: '14 990', period: '₽/мес' },
} as const satisfies Record<string, PricingPlan>

export type PricingPlanId = keyof typeof PRICING
