'use client'

import { useMemo, useState } from 'react'

type Sex = 'female' | 'male'
type ActivityKey = 'low' | 'light' | 'moderate' | 'high'
type PaceKey = 'slow' | 'steady' | 'active'

type Ingredient = {
  id: number
  name: string
  grams: number
  kcalPer100: number
}

const ACTIVITY: Record<ActivityKey, { label: string; factor: number }> = {
  low: { label: 'Мало движения', factor: 1.2 },
  light: { label: 'Лёгкая активность', factor: 1.375 },
  moderate: { label: 'Тренировки 3-4 раза', factor: 1.55 },
  high: { label: 'Высокая нагрузка', factor: 1.725 },
}

const PACE: Record<PaceKey, { label: string; kgPerWeek: number }> = {
  slow: { label: 'Мягко', kgPerWeek: 0.25 },
  steady: { label: 'Умеренно', kgPerWeek: 0.5 },
  active: { label: 'Быстрее', kgPerWeek: 0.75 },
}

function clampPositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function round(value: number) {
  return Math.round(value)
}

function formatKcal(value: number) {
  return `${round(value).toLocaleString('ru-RU')} ккал`
}

export default function CalculatorsClient() {
  const [sex, setSex] = useState<Sex>('female')
  const [age, setAge] = useState(35)
  const [height, setHeight] = useState(168)
  const [weight, setWeight] = useState(72)
  const [activity, setActivity] = useState<ActivityKey>('light')
  const [pace, setPace] = useState<PaceKey>('steady')
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: 1, name: 'Творог', grams: 180, kcalPer100: 121 },
    { id: 2, name: 'Ягоды', grams: 80, kcalPer100: 45 },
    { id: 3, name: 'Орехи', grams: 15, kcalPer100: 610 },
  ])

  const physiology = useMemo(() => {
    const safeAge = clampPositive(age, 35)
    const safeHeight = clampPositive(height, 168)
    const safeWeight = clampPositive(weight, 72)
    const heightM = safeHeight / 100
    const bmi = safeWeight / (heightM * heightM)
    const bmr =
      10 * safeWeight + 6.25 * safeHeight - 5 * safeAge + (sex === 'male' ? 5 : -161)
    const tdee = bmr * ACTIVITY[activity].factor
    const deficit = (PACE[pace].kgPerWeek * 7700) / 7
    const target = Math.max(0, tdee - deficit)
    const supportMin = Math.max(0, tdee - 250)
    const supportMax = tdee + 150

    return { bmi, bmr, tdee, target, supportMin, supportMax, deficit }
  }, [activity, age, height, pace, sex, weight])

  const dish = useMemo(() => {
    const totalGrams = ingredients.reduce((sum, item) => sum + clampPositive(item.grams, 0), 0)
    const totalKcal = ingredients.reduce(
      (sum, item) => sum + (clampPositive(item.grams, 0) * clampPositive(item.kcalPer100, 0)) / 100,
      0,
    )
    const kcalPer100 = totalGrams > 0 ? (totalKcal / totalGrams) * 100 : 0
    return { totalGrams, totalKcal, kcalPer100 }
  }, [ingredients])

  const updateIngredient = (id: number, patch: Partial<Ingredient>) => {
    setIngredients((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const addIngredient = () => {
    setIngredients((items) => [
      ...items,
      { id: Date.now(), name: '', grams: 100, kcalPer100: 100 },
    ])
  }

  const removeIngredient = (id: number) => {
    setIngredients((items) => (items.length > 1 ? items.filter((item) => item.id !== id) : items))
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
          <a className="text-xl font-bold tracking-normal" href="/">
            HEYS
          </a>
          <a
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            href="/#trial"
          >
            Бесплатная неделя
          </a>
        </div>
      </header>

      <main>
        <section className="bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.05fr_0.95fr] md:px-6 md:py-16">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">
                Калькуляторы питания
              </p>
              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-normal text-slate-950 md:text-5xl">
                Рассчитайте ориентир калорий без жёстких обещаний
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                TDEE, индекс массы тела, дефицит и калорийность блюда помогают увидеть
                начальную картину. В HEYS куратор затем сверяет эти числа с вашим режимом,
                контекстом недели и фактическим дневником.
              </p>
            </div>

            <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <span className="text-sm font-semibold text-slate-500">Расчёт поддержки</span>
                <span className="text-2xl font-bold text-slate-950">{formatKcal(physiology.tdee)}</span>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <span className="text-sm font-semibold text-slate-500">Умеренный дефицит</span>
                <span className="text-2xl font-bold text-emerald-700">{formatKcal(physiology.target)}</span>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Это справочный расчёт. Если питание связано с заболеванием, беременностью,
                РПП, лекарствами или восстановлением, ориентир нужно обсуждать со специалистом.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-2xl font-bold tracking-normal">TDEE и дефицит</h2>
            <div className="mt-6 grid gap-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                {(['female', 'male'] as Sex[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      sex === option ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                    }`}
                    onClick={() => setSex(option)}
                  >
                    {option === 'female' ? 'Женщина' : 'Мужчина'}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Возраст
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal"
                    min={18}
                    max={90}
                    type="number"
                    value={age}
                    onChange={(event) => setAge(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Рост, см
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal"
                    min={120}
                    max={230}
                    type="number"
                    value={height}
                    onChange={(event) => setHeight(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Вес, кг
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal"
                    min={35}
                    max={250}
                    type="number"
                    value={weight}
                    onChange={(event) => setWeight(Number(event.target.value))}
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Активность
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal"
                  value={activity}
                  onChange={(event) => setActivity(event.target.value as ActivityKey)}
                >
                  {Object.entries(ACTIVITY).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="text-sm font-semibold text-slate-700">Темп дефицита</span>
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
                  {Object.entries(PACE).map(([key, item]) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded-md px-2 py-2 text-sm font-semibold transition ${
                        pace === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                      }`}
                      onClick={() => setPace(key as PaceKey)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Result testId="bmr-result" label="BMR" value={formatKcal(physiology.bmr)} detail="Базовый обмен по Mifflin-St Jeor" />
              <Result testId="tdee-result" label="TDEE" value={formatKcal(physiology.tdee)} detail="Ориентир поддержки с активностью" />
              <Result testId="bmi-result" label="BMI" value={physiology.bmi.toFixed(1)} detail="Индекс массы тела, без диагноза" />
              <Result
                testId="support-range-result"
                label="Коридор поддержки"
                value={`${formatKcal(physiology.supportMin)} - ${formatKcal(physiology.supportMax)}`}
                detail="Рабочая зона для наблюдения"
              />
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-800">
                Ориентир для снижения
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">{formatKcal(physiology.target)}</p>
              <p className="mt-3 text-sm leading-6 text-emerald-900">
                Дефицит около {formatKcal(physiology.deficit)} в день. В HEYS такой расчёт
                не используется как приказ: куратор смотрит, как он переносится в реальной неделе.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 md:px-6 md:pb-16">
          <div className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-[1fr_0.8fr]">
            <div>
              <h2 className="text-2xl font-bold tracking-normal">Калорийность блюда</h2>
              <div className="mt-6 grid gap-3">
                {ingredients.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_110px_130px_40px]">
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Ингредиент"
                      value={item.name}
                      onChange={(event) => updateIngredient(item.id, { name: event.target.value })}
                    />
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      min={0}
                      type="number"
                      value={item.grams}
                      onChange={(event) => updateIngredient(item.id, { grams: Number(event.target.value) })}
                      aria-label="Граммы"
                    />
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      min={0}
                      type="number"
                      value={item.kcalPer100}
                      onChange={(event) => updateIngredient(item.id, { kcalPer100: Number(event.target.value) })}
                      aria-label="Ккал на 100 г"
                    />
                    <button
                      className="rounded-lg border border-slate-300 text-slate-500 transition hover:border-red-300 hover:text-red-700"
                      type="button"
                      onClick={() => removeIngredient(item.id)}
                      aria-label="Удалить ингредиент"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-4 rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-500"
                type="button"
                onClick={addIngredient}
              >
                Добавить ингредиент
              </button>
            </div>

            <div className="grid content-start gap-4 rounded-lg bg-slate-950 p-5 text-white">
              <ResultDark testId="dish-grams-result" label="Вес блюда" value={`${round(dish.totalGrams)} г`} />
              <ResultDark testId="dish-total-result" label="Всего" value={formatKcal(dish.totalKcal)} />
              <ResultDark testId="dish-per-100-result" label="На 100 г" value={formatKcal(dish.kcalPer100)} />
              <p className="text-sm leading-6 text-slate-300">
                Для дневника важна не только цифра, но и повторяемость: одинаковые блюда
                удобно сохранить и сравнивать по неделям.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function Result({
  testId,
  label,
  value,
  detail,
}: {
  testId: string
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5" data-testid={testId}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  )
}

function ResultDark({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div className="border-b border-white/10 pb-4" data-testid={testId}>
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  )
}
