'use client'

import { useState, useEffect, useCallback } from 'react'

interface TrialCapacityData {
  available_slots: number
  total_slots: number
  queue_size: number
  is_accepting: boolean
  offer_window_minutes: number
  trial_days: number
}

interface TrialCapacityProps {
  className?: string
  compact?: boolean
  onRequestTrial?: () => void
}

const API_URL = 'https://api.heyslab.ru/rpc'

// Fallback данные для localhost разработки (CORS блокирует API)
const LOCALHOST_FALLBACK: TrialCapacityData = {
  available_slots: 2,
  total_slots: 3,
  queue_size: 0,
  is_accepting: true,
  offer_window_minutes: 120,
  trial_days: 7
}

export default function TrialCapacity({ 
  className = '', 
  compact = false,
  onRequestTrial 
}: TrialCapacityProps) {
  const [capacity, setCapacity] = useState<TrialCapacityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCapacity = useCallback(async () => {
    // На localhost используем fallback данные (API блокирует CORS)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      setCapacity(LOCALHOST_FALLBACK)
      setIsLoading(false)
      return
    }
    
    try {
      const response = await fetch(API_URL + '?fn=get_public_trial_capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error.message || 'API error')
      }
      
      setCapacity(data.data || data)
      setError(null)
    } catch {
      // Fallback при ошибке (CORS или сеть)
      setCapacity(LOCALHOST_FALLBACK)
      setError(null) // Не показываем ошибку пользователю
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCapacity()
    // Обновляем каждые 30 секунд
    const interval = setInterval(fetchCapacity, 30000)
    return () => clearInterval(interval)
  }, [fetchCapacity])

  // Loading state
  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 bg-gray-200 rounded w-32 mx-auto"></div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        {error}
      </div>
    )
  }

  if (!capacity) return null

  const { available_slots, total_slots, queue_size, is_accepting } = capacity

  // Определяем статус и мета
  const getMeta = () => {
    if (!is_accepting) {
      return {
        status: 'paused',
        emoji: '⏸️',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-200',
        label: 'Приём на паузе',
        sublabel: 'Скоро откроется',
        actionLabel: 'Купить без ожидания',
      }
    }
    
    if (available_slots > 0) {
      return {
        status: 'available',
        emoji: '🟢',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        label: `Свободно ${available_slots} из ${total_slots}`,
        sublabel: 'Место доступно прямо сейчас!',
        actionLabel: 'Начать триал',
      }
    }
    
    return {
      status: 'full',
      emoji: '🔴',
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      label: 'Мест нет',
      sublabel: queue_size > 0 ? `В очереди: ${queue_size}` : 'Очередь пуста',
      actionLabel: 'Встать в очередь',
    }
  }

  const meta = getMeta()

  // Компактная версия
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${meta.bgColor} ${meta.borderColor} border ${className}`}>
        <span className="text-sm">{meta.emoji}</span>
        <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
      </div>
    )
  }

  // Полная версия
  return (
    <div className={`rounded-xl p-4 ${meta.bgColor} border ${meta.borderColor} ${className}`}>
      {/* Статус */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-xl">{meta.emoji}</span>
        <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
      </div>
      
      {/* Подлейбл */}
      <p className="text-sm text-gray-500 text-center mb-3">
        {meta.sublabel}
      </p>
      
      {/* Прогресс-бар */}
      {is_accepting && (
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
          <div 
            className={`h-full transition-all duration-500 ${
              available_slots > 0 ? 'bg-emerald-500' : 'bg-red-400'
            }`}
            style={{ width: `${((total_slots - available_slots) / total_slots) * 100}%` }}
          />
        </div>
      )}
      
      {/* Кнопка */}
      {onRequestTrial && (
        <button
          onClick={onRequestTrial}
          className={`w-full py-2.5 px-4 rounded-lg font-semibold text-white transition-all ${
            available_slots > 0 
              ? 'bg-emerald-500 hover:bg-emerald-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {meta.actionLabel}
        </button>
      )}
      
      {/* Info */}
      <p className="text-xs text-gray-400 text-center mt-2">
        {capacity.trial_days} дней (0 ₽) • Offer {capacity.offer_window_minutes / 60}ч
      </p>
    </div>
  )
}

// Экспортируем также хук для более гибкого использования
export function useTrialCapacity() {
  const [capacity, setCapacity] = useState<TrialCapacityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API_URL + '?fn=get_public_trial_capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await response.json()
      setCapacity(data.data || data)
    } catch {
      // Silently fail - widget is non-critical
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { capacity, isLoading, refresh }
}
