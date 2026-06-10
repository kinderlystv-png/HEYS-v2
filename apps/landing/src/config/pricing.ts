// Единый источник цен тарифов.
// При изменении цены: меняем здесь — лендинг, user-agreement и refund-страница
// подтянут автоматически. docs/legal/*.md держим вручную в синхроне —
// pre-commit hook check-pricing-sync.cjs ругается на расхождение.

export interface PricingPlan {
  name: string
  price: string // '2 990' (с неразрывным пробелом для тысяч)
  period: string // '₽/мес'
}

// Pro-first Фаза 0 (метод. 19, решение 2026-06-09): Self — бюджетный якорь
// без куратора, Pro — главный оффер. Внутренний ключ 'base' сохранён, чтобы
// не трогать plan-id в paywall/subscriptions/payments — меняется только
// отображаемое имя и цена.
export const PRICING = {
  base: { name: 'Self', price: '490', period: '₽/мес' },
  pro: { name: 'Pro', price: '7 990', period: '₽/мес' },
  proPlus: { name: 'Pro+', price: '14 990', period: '₽/мес' },
} as const satisfies Record<string, PricingPlan>

export type PricingPlanId = keyof typeof PRICING
