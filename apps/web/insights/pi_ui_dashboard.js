// pi_ui_dashboard.js — Dashboard & Prediction UI Components v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 9b)
// Дашборд, предиктивная панель, прогнозы веса и риска
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  
  // React imports
  const { createElement: h, useState, useEffect, useMemo } = window.React || {};
  
  // Зависимости
  const U = HEYS.utils || {};
  const piAdvanced = HEYS.InsightsPI?.advanced || window.piAdvanced || {};
  const piAnalyticsAPI = HEYS.InsightsPI?.analyticsAPI || window.piAnalyticsAPI || {};
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};
  
  // Import functions
  const predictWeight = piAdvanced.predictWeight || function() { return { available: false }; };
  const calculatePredictiveRisk = piAnalyticsAPI.calculatePredictiveRisk || function() { return { available: false }; };
  const forecastEnergy = piAnalyticsAPI.forecastEnergy || function() { return { available: false }; };

  function WeightPrediction({ prediction }) {
    if (!prediction || !prediction.available) return null;
    
    const changeClass = prediction.weeklyChange < -0.1 ? 'down' 
      : prediction.weeklyChange > 0.1 ? 'up' 
      : 'stable';
    const changeSign = prediction.weeklyChange > 0 ? '+' : '';
    
    return h('div', { className: 'insights-weight' },
      h('div', { className: 'insights-weight__header' },
        h('span', null, '⚖️ Прогноз веса'),
        h(InfoButton, {
          infoKey: 'WEIGHT_PREDICTION',
          debugData: {
            currentWeight: prediction.currentWeight,
            projectedWeight: prediction.projectedWeight,
            weeklyChange: prediction.weeklyChange,
            slope: prediction.slope,
            dataPoints: prediction.dataPoints
          }
        })
      ),
      h('div', { className: 'insights-weight__body' },
        h('div', { className: 'insights-weight__current' },
          h('div', { className: 'insights-weight__label' }, 'Сейчас'),
          h('div', { className: 'insights-weight__value' }, prediction.currentWeight, ' кг')
        ),
        h('div', { className: 'insights-weight__arrow' },
          '→',
          h('div', { className: `insights-weight__change insights-weight__change--${changeClass}` },
            changeSign, Math.round(prediction.weeklyChange * 10) / 10, ' кг/нед'
          )
        ),
        h('div', { className: 'insights-weight__projected' },
          h('div', { className: 'insights-weight__label' }, 'Через неделю'),
          h('div', { className: 'insights-weight__value' }, prediction.projectedWeight, ' кг')
        )
      )
    );
  }

  /**
   * Weekly Wrap — итоги недели (v2.0: с InfoButton)
   */
  /**
   * WeeklyWrap — итоги недели
   * v3.22.0: Интеграция Extended Analytics summary
   */
    // Подсчёт метрик в каждой категории
    const categoryCounts = useMemo(() => {
      const counts = {};
      for (const cat of Object.keys(CATEGORIES)) {
        counts[cat] = metrics?.filter(m => m.category === cat).length || 0;
      }
      return counts;
    }, [metrics]);
    
    return h('div', { className: 'category-filter-bar' },
      // All button
      h('button', {
        className: `category-filter-bar__btn ${!selectedCategory ? 'active' : ''}`,
        onClick: () => onCategoryChange(null)
      },
        h('span', { className: 'category-filter-bar__emoji' }, '📊'),
        h('span', { className: 'category-filter-bar__label' }, 'Все'),
        h('span', { className: 'category-filter-bar__count' }, metrics?.length || 0)
      ),
      
      // Category buttons
      Object.entries(CATEGORIES).map(([key, config]) => {
        const count = categoryCounts[key];
        if (count === 0) return null;
        
        return h('button', {
          key,
          className: `category-filter-bar__btn ${selectedCategory === key ? 'active' : ''}`,
          onClick: () => onCategoryChange(key),
          style: { '--cat-color': config.color }
        },
          h('span', { className: 'category-filter-bar__emoji' }, config.emoji),
          h('span', { className: 'category-filter-bar__label' }, config.name),
          h('span', { className: 'category-filter-bar__count' }, count)
        );
      })
    );
  }

  /**
   * PriorityFilterBar — фильтры по приоритету
   */
    // Подсчёт метрик в каждом приоритете
    const priorityCounts = useMemo(() => {
      const counts = {};
      for (const pri of Object.keys(PRIORITY_LEVELS)) {
        counts[pri] = metrics?.filter(m => m.priority === pri).length || 0;
      }
      return counts;
    }, [metrics]);
    
    return h('div', { className: 'priority-filter-bar' },
      // All button
      h('button', {
        className: `priority-filter-bar__btn ${!selectedPriority ? 'active' : ''}`,
        onClick: () => onPriorityChange(null)
      },
        '🔮 Всё'
      ),
      
      // Priority buttons (только CRITICAL, HIGH, MEDIUM — остальные редко нужны как фильтр)
      ['CRITICAL', 'HIGH', 'MEDIUM'].map(key => {
        const config = PRIORITY_LEVELS[key];
        const count = priorityCounts[key];
        if (count === 0) return null;
        
        return h('button', {
          key,
          className: `priority-filter-bar__btn ${selectedPriority === key ? 'active' : ''}`,
          onClick: () => onPriorityChange(key),
          style: { '--pri-color': config.color }
        },
          h('span', null, config.emoji),
          h('span', null, ` ${config.name}`),
          h('span', { className: 'priority-filter-bar__count' }, count)
        );
      })
    );
  }

  /**
   * SectionHeader — заголовок секции с приоритетом
   */
    const [activeTab, setActiveTab] = useState('today');
  function PillarBreakdownBars({ pillars }) {
    if (!pillars || Object.keys(pillars).length === 0) return null;
    
    const pillarConfig = {
      nutrition: { label: 'Питание', icon: '🍽️', color: '#22c55e' },
      timing: { label: 'Тайминг', icon: '⏰', color: '#3b82f6' },
      activity: { label: 'Активность', icon: '🏃', color: '#f59e0b' },
      recovery: { label: 'Восстановление', icon: '😴', color: '#8b5cf6' }
    };
    
    return h('div', { className: 'pillar-breakdown-bars' },
      Object.entries(pillars).map(([key, value]) => {
        const config = pillarConfig[key] || { label: key, icon: '📊', color: '#64748b' };
        const pct = Math.min(100, Math.max(0, value));
        
        return h('div', { key, className: 'pillar-breakdown-bars__item' },
          h('div', { className: 'pillar-breakdown-bars__header' },
            h('span', { className: 'pillar-breakdown-bars__icon' }, config.icon),
            h('span', { className: 'pillar-breakdown-bars__label' }, config.label),
            h('span', { className: 'pillar-breakdown-bars__value' }, `${Math.round(pct)}%`)
          ),
          h('div', { className: 'pillar-breakdown-bars__track' },
            h('div', { 
              className: 'pillar-breakdown-bars__fill',
              style: { 
                width: `${pct}%`,
                backgroundColor: config.color
              }
            })
          )
        );
      })
    );
  }
  
  /**
   * ConfidenceBadge — бейдж уверенности (low/medium/high)
   */
    const status = useMemo(() => {
  function DualRiskPanel({ predictionToday, predictionTomorrow, riskColors }) {
    // Определяем какой риск выше для акцента
    const todayRisk = predictionToday?.risk || 0;
    const tomorrowRisk = predictionTomorrow?.risk || 0;
    const maxRisk = Math.max(todayRisk, tomorrowRisk);
    
    // Активный прогноз для деталей (показываем тот где риск выше, если оба есть)
    const [activePrediction, setActivePrediction] = useState(tomorrowRisk > todayRisk ? 'tomorrow' : 'today');
    
    // 🆕 v3.22.0: Extended Analytics для emotional risk
    const extendedAnalytics = useMemo(() => {
      const U = window.HEYS?.utils;
      const lsGet = U?.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const profile = lsGet('heys_profile', {});
      const todayDate = new Date().toISOString().split('T')[0];
      const dayKey = `heys_dayv2_${todayDate}`;
      const day = lsGet(dayKey, {});
      
      // Emotional Risk (Epel 2001, PMID: 11070333)
      const stressAvg = day.stressAvg || 0;
      const factors = [];
      let bingeRisk = 0;
      
      if (stressAvg >= 6) {
        factors.push('Высокий стресс');
        bingeRisk += 35;
      } else if (stressAvg >= 4) {
        factors.push('Умеренный стресс');
        bingeRisk += 15;
      }
      
      const hour = new Date().getHours();
      if (hour >= 20) {
        factors.push('Вечер');
        bingeRisk += 20;
      } else if (hour >= 18) {
        bingeRisk += 10;
      }
      
      const sleepDeficit = (profile.sleepHours || 8) - (day.sleepHours || 0);
      if (sleepDeficit > 2) {
        factors.push('Недосып');
        bingeRisk += 15;
      }
      
      // День дефицита? (недобор калорий)
      const deficitDays = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        const pastDay = lsGet(`heys_dayv2_${d.toISOString().split('T')[0]}`, {});
        const optimum = 2000; // примерно
        const eaten = pastDay.meals?.reduce((sum, m) => {
          return sum + (m.items?.reduce((s, item) => s + (item.kcal || 0), 0) || 0);
        }, 0) || 0;
        if (eaten > 0 && eaten < optimum * 0.75) deficitDays.push(i);
      }
      if (deficitDays.length >= 2) {
        factors.push('Калорийный долг');
        bingeRisk += 20;
      }
      
      const emotionalRisk = {
        hasRisk: bingeRisk >= 30 || factors.length >= 2,
        level: bingeRisk >= 60 ? 'high' : bingeRisk >= 40 ? 'medium' : 'low',
        bingeRisk: Math.min(90, bingeRisk),
        factors,
        stressLevel: stressAvg,
        pmid: '11070333'
      };
      
      // Training Context (Aragon 2013, PMID: 23360586)
      const trainings = day.trainings || [];
      const isTrainingDay = trainings.length > 0;
      let trainingType = null;
      let trainingIntensity = 'moderate';
      
      if (isTrainingDay) {
        const t = trainings[0];
        trainingType = t.type || 'cardio';
        const totalMins = (t.z || []).reduce((a, b) => a + b, 0);
        const highZoneMins = (t.z?.[2] || 0) + (t.z?.[3] || 0);
        if (highZoneMins > totalMins * 0.4) trainingIntensity = 'high';
        else if (totalMins < 30) trainingIntensity = 'light';
      }
      
      return { emotionalRisk, isTrainingDay, trainingType, trainingIntensity };
    }, []);
    
    // Расширяем factors emotionalRisk если есть риск
    const getEnhancedFactors = (prediction) => {
      if (!prediction?.factors) return [];
      const factors = [...prediction.factors];
      
      // Добавляем emotionalRisk если высокий
      if (extendedAnalytics.emotionalRisk.hasRisk) {
        const { bingeRisk, factors: riskFactors } = extendedAnalytics.emotionalRisk;
        factors.push({
          label: `🧠 Эмоц. риск: ${riskFactors.slice(0, 2).join(', ')}`,
          weight: Math.round(bingeRisk * 0.3), // переводим в +weight
          pmid: '11070333',
          isEmotional: true
        });
      }
      
      // Добавляем training context как защитный фактор (отрицательный вес)
      if (extendedAnalytics.isTrainingDay) {
        const typeLabels = { strength: '💪 Силовая', cardio: '🏃 Кардио', hobby: '⚽ Хобби' };
        factors.push({
          label: `${typeLabels[extendedAnalytics.trainingType] || '🏋️ Трен.'} сегодня`,
          weight: extendedAnalytics.trainingIntensity === 'high' ? -15 : -10,
          isProtective: true
        });
      }
      
      return factors;
    };
    
    const basePredictionData = activePrediction === 'today' ? predictionToday : predictionTomorrow;
    const activePredictionData = basePredictionData ? {
      ...basePredictionData,
      factors: getEnhancedFactors(basePredictionData)
    } : null;
    const activeLabel = activePrediction === 'today' ? 'Сегодня' : 'Завтра';
    
    const getRiskLevel = (risk) => risk < 30 ? 'low' : risk < 60 ? 'medium' : 'high';
    
    return h('div', { className: 'dual-risk-panel' },
      // Два полукруга рядом
      h('div', { className: 'dual-risk-panel__meters' },
        // Сегодня
        h('div', { 
          className: `dual-risk-panel__meter-card ${activePrediction === 'today' ? 'dual-risk-panel__meter-card--active' : ''}`,
          onClick: () => setActivePrediction('today')
        },
          h('div', { className: 'dual-risk-panel__meter-label' }, 'Сегодня'),
          h(MiniRiskMeter, { 
            risk: todayRisk, 
            riskLevel: getRiskLevel(todayRisk),
            size: 120
          }),
          todayRisk < 30 && h('div', { className: 'dual-risk-panel__ok-badge' }, '✅')
        ),
        
        // Завтра
        h('div', { 
          className: `dual-risk-panel__meter-card ${activePrediction === 'tomorrow' ? 'dual-risk-panel__meter-card--active' : ''}`,
          onClick: () => setActivePrediction('tomorrow')
        },
          h('div', { className: 'dual-risk-panel__meter-label' }, 'Завтра'),
          h(MiniRiskMeter, { 
            risk: tomorrowRisk, 
            riskLevel: getRiskLevel(tomorrowRisk),
            size: 120
          }),
          tomorrowRisk >= 30 && h('div', { className: 'dual-risk-panel__warning-badge' }, '⚠️')
        )
      ),
      
      // Статус строка
      h('div', { className: 'dual-risk-panel__status' },
        maxRisk < 30 
          ? h('span', { className: 'dual-risk-panel__status-ok' }, '✅ Всё под контролем')
          : tomorrowRisk > todayRisk 
            ? h('span', { className: 'dual-risk-panel__status-warn' }, '🔮 Прогноз на будущее')
            : h('span', { className: 'dual-risk-panel__status-warn' }, '⚠️ Требует внимания')
      ),
      
      // Детали активного прогноза
      activePredictionData && h('div', { className: 'dual-risk-panel__details' },
        // Hint - какой день показываем
        h('div', { className: 'dual-risk-panel__details-hint' }, 
          `Детали: ${activeLabel} (нажми на полукруг для переключения)`
        ),
        
        // Primary Trigger
        activePredictionData.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
          h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
          h('div', { className: 'risk-panel__trigger-value' }, activePredictionData.primaryTrigger.label)
        ),
        
        // Prevention Strategies
        activePredictionData.preventionStrategy && activePredictionData.preventionStrategy.length > 0 && 
        h('div', { className: 'risk-panel__prevention' },
          h('div', { className: 'risk-panel__prevention-header' },
            h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
            h(InfoButton, { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
          ),
          activePredictionData.preventionStrategy.slice(0, 3).map((strategy, idx) =>
            h('div', { key: idx, className: 'risk-panel__strategy' },
              h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
              h('div', { className: 'risk-panel__strategy-content' },
                h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
                h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
              )
            )
          )
        ),
        
        // Risk Factors — 🆕 v3.22.0: улучшенный рендеринг с PMID и защитными факторами
        activePredictionData.factors && activePredictionData.factors.length > 0 && 
        h('div', { className: 'risk-panel__factors' },
          h('div', { className: 'risk-panel__factors-header' },
            h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
            h(InfoButton, { infoKey: 'RISK_FACTORS', size: 'small' })
          ),
          activePredictionData.factors.slice(0, 6).map((factor, idx) =>
            h('div', { 
              key: idx, 
              className: `risk-panel__factor ${factor.isProtective ? 'risk-panel__factor--protective' : ''} ${factor.isEmotional ? 'risk-panel__factor--emotional' : ''}`
            },
              h('span', { className: 'risk-panel__factor-label' }, factor.label),
              h('span', { 
                className: `risk-panel__factor-weight ${factor.weight < 0 ? 'risk-panel__factor-weight--negative' : ''}`
              }, factor.weight < 0 ? factor.weight : `+${factor.weight || factor.impact}`),
              factor.pmid && h('a', {
                href: `https://pubmed.ncbi.nlm.nih.gov/${factor.pmid}/`,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'risk-panel__factor-pmid',
                title: `PMID: ${factor.pmid}`,
                onClick: (e) => e.stopPropagation()
              }, '🔬')
            )
          )
        )
      )
    );
  }
  
  /**
   * MiniRiskMeter — компактный полукруг для dual view
   */
  function RiskPanel({ prediction, riskColors, isPast, isFuture }) {
  function RiskPanel({ prediction, riskColors, isPast, isFuture }) {
    const riskLevel = prediction.riskLevel || (prediction.risk < 30 ? 'low' : prediction.risk < 60 ? 'medium' : 'high');
    
    // Генерируем predictionId для feedback
    const predictionId = prediction.id || `risk_${prediction.date || Date.now()}`;
    
    return h('div', { className: 'risk-panel' },
      // Risk Meter (gauge) with InfoButton
      h('div', { className: 'risk-panel__meter-wrapper' },
        h('div', { className: 'risk-panel__meter' },
          h(RiskMeter, { risk: prediction.risk, riskLevel })
        ),
        h('div', { className: 'risk-panel__meter-info' },
          h(InfoButton, { 
            infoKey: 'CRASH_RISK', 
            size: 'small',
            debugData: { 
              risk: prediction.risk, 
              riskLevel, 
              factors: prediction.factors?.length || 0 
            } 
          })
        )
      ),
      
      // Status with inline feedback
      h('div', { className: 'risk-panel__status-row' },
        h('div', { className: 'risk-panel__status' },
          isPast ? '📊 Анализ прошлого дня' :
          isFuture ? '🔮 Прогноз на будущее' :
          prediction.risk >= 30 ? '⚠️ Требует внимания' : '✅ Всё под контролем'
        ),
        // Inline feedback для прошлых дней
        isPast && h(FeedbackPrompt, { predictionId, type: 'risk', compact: true })
      ),
      
      // Primary Trigger
      prediction.primaryTrigger && h('div', { className: 'risk-panel__trigger' },
        h('div', { className: 'risk-panel__trigger-label' }, 'Главный триггер:'),
        h('div', { className: 'risk-panel__trigger-value' }, prediction.primaryTrigger.label)
      ),
      
      // Prevention Strategies
      prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'risk-panel__prevention' },
        h('div', { className: 'risk-panel__prevention-header' },
          h('span', { className: 'risk-panel__prevention-title' }, '🛡️ Профилактика'),
          h(InfoButton, { infoKey: 'PREVENTION_STRATEGY', size: 'small' })
        ),
        prediction.preventionStrategy.slice(0, 3).map((strategy, idx) =>
          h('div', { key: idx, className: 'risk-panel__strategy' },
            h('span', { className: 'risk-panel__strategy-num' }, idx + 1),
            h('div', { className: 'risk-panel__strategy-content' },
              h('div', { className: 'risk-panel__strategy-action' }, strategy.action),
              h('div', { className: 'risk-panel__strategy-reason' }, strategy.reason)
            )
          )
        )
      ),
      
      // Risk Factors
      prediction.factors && prediction.factors.length > 0 && h('div', { className: 'risk-panel__factors' },
        h('div', { className: 'risk-panel__factors-header' },
          h('span', { className: 'risk-panel__factors-title' }, '📋 Факторы риска'),
          h(InfoButton, { infoKey: 'RISK_FACTORS', size: 'small' })
        ),
        prediction.factors.slice(0, 5).map((factor, idx) =>
          h('div', { key: idx, className: 'risk-panel__factor' },
            h('span', { className: 'risk-panel__factor-label' }, factor.label),
            h('span', { className: 'risk-panel__factor-weight' }, `+${factor.weight || factor.impact}`)
          )
        )
      ),
      
      // Full feedback widget for past days
      isPast && prediction.risk >= 30 && h(FeedbackWidget, { 
        predictionType: 'crash_risk',
        predictionId
      })
    );
  }
  
  /**
   * RiskMeter — визуальный спидометр риска 0-100%
   */
  function RiskMeter({ risk, riskLevel }) {
  function RiskMeter({ risk, riskLevel }) {
    // 🔧 FIX: защита от NaN
    const safeRisk = typeof risk === 'number' && !isNaN(risk) ? Math.min(100, Math.max(0, risk)) : 0;
    const size = 160;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    // Полукруг (180 градусов)
    const halfCircumference = Math.PI * radius;
    const progress = (safeRisk / 100) * halfCircumference;
    const offset = halfCircumference - progress;
    
    const colors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'risk-meter', style: { width: size, height: size / 2 + 30 } },
      h('svg', {
        viewBox: `0 0 ${size} ${size / 2 + 20}`,
        className: 'risk-meter__svg'
      },
        // Background arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          strokeWidth: strokeWidth,
          strokeLinecap: 'round'
        }),
        // Progress arc
        h('path', {
          d: `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`,
          fill: 'none',
          stroke: colors[riskLevel] || colors.medium,
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeDasharray: halfCircumference,
          strokeDashoffset: offset,
          style: { transition: 'stroke-dashoffset 0.6s ease' }
        }),
        // Value text
        h('text', {
          x: size / 2,
          y: size / 2 - 5,
          textAnchor: 'middle',
          className: 'risk-meter__value',
          style: { 
            fontSize: 36,
            fontWeight: 700,
            fill: colors[riskLevel] || 'var(--text-primary)'
          }
        }, `${safeRisk}%`),
        // Label
        h('text', {
          x: size / 2,
          y: size / 2 + 20,
          textAnchor: 'middle',
          className: 'risk-meter__label',
          style: { fontSize: 12, fill: 'var(--text-secondary, #64748b)' }
        }, 'Риск срыва')
      )
    );
  }
  
  /**
   * ForecastPanel — содержимое таба Forecast
   * Интегрирован с InsulinWave для показа окон еды
   */
  function ForecastPanel({ forecast, isPast }) {
  function ForecastPanel({ forecast, isPast }) {
    // 🆕 Получаем данные инсулиновой волны для более точного прогноза
    const [insulinWaveData, setInsulinWaveData] = useState(null);
    
    useEffect(() => {
      if (window.HEYS?.InsulinWave?.calculate) {
        try {
          // Получаем текущее состояние волны
          const waveData = window.HEYS.InsulinWave.getLatestWaveData?.() || null;
          setInsulinWaveData(waveData);
        } catch (e) {
          // Игнорируем ошибки
        }
      }
    }, []);
    
    // Форматирование времени окончания волны
    const getWaveEndInfo = () => {
      if (!insulinWaveData) return null;
      
      const { status, remaining, endTime, currentPhase } = insulinWaveData;
      
      if (status === 'lipolysis') {
        return { 
          status: 'burning', 
          label: '🔥 Липолиз активен',
          desc: 'Сейчас идёт активное жиросжигание',
          color: '#22c55e'
        };
      }
      
      if (status === 'active' && remaining > 0) {
        return {
          status: 'wave',
          label: `⏳ ${remaining} мин до окончания волны`,
          desc: `Окончание в ${endTime}${currentPhase ? ` • Фаза: ${currentPhase}` : ''}`,
          color: '#f59e0b'
        };
      }
      
      if (status === 'almost') {
        return {
          status: 'almost',
          label: `⚡ ${remaining} мин до липолиза`,
          desc: 'Скоро начнётся жиросжигание',
          color: '#3b82f6'
        };
      }
      
      return null;
    };
    
    const waveEndInfo = getWaveEndInfo();
    
    return h('div', { className: 'forecast-panel' },
      isPast && h('div', { className: 'forecast-panel__note' },
        '📊 Анализ прошлого дня'
      ),
      
      // 🆕 Insulin Wave Status
      waveEndInfo && h('div', { 
        className: 'forecast-panel__wave-status',
        style: { borderColor: waveEndInfo.color }
      },
        h('div', { className: 'forecast-panel__wave-header' },
          h('div', { className: 'forecast-panel__wave-label', style: { color: waveEndInfo.color } }, 
            waveEndInfo.label
          ),
          h(InfoButton, { infoKey: 'INSULIN_WAVE_STATUS', size: 'small' })
        ),
        h('div', { className: 'forecast-panel__wave-desc' }, waveEndInfo.desc)
      ),
      
      // Energy Windows
      forecast.energyWindows && forecast.energyWindows.length > 0 && h('div', { className: 'forecast-panel__section' },
        h('div', { className: 'forecast-panel__section-header' },
          h('span', { className: 'forecast-panel__section-title' }, '⚡ Окна энергии'),
          h(InfoButton, { infoKey: 'ENERGY_WINDOWS', size: 'small' })
        ),
        h('div', { className: 'forecast-panel__windows' },
          forecast.energyWindows.map((window, idx) =>
            h('div', { 
              key: idx, 
              className: `forecast-panel__window ${window.optimal ? 'forecast-panel__window--optimal' : ''}`
            },
              h('div', { className: 'forecast-panel__window-period' }, window.period),
              h('div', { className: 'forecast-panel__window-label' }, window.label),
              window.optimal && h('span', { className: 'forecast-panel__window-badge' }, '⭐ Оптимально'),
              h('div', { className: 'forecast-panel__window-rec' }, window.recommendation)
            )
          )
        )
      ),
      
      // Training Window
    // Статистика точности
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    const handleFeedback = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        const details = detailText ? { comment: detailText } : {};
        HEYS.Metabolic.submitFeedback(predictionId, correct, {
          ...details,
          type: predictionType
        });
      }
      setSubmitted(true);
      if (onSubmit) onSubmit(correct);
    };
    
    if (submitted) {
      return h('div', { className: 'feedback-widget feedback-widget--submitted' },
        h('span', { className: 'feedback-widget__thanks' }, '✅ Спасибо за отзыв!'),
        stats.total > 5 && h('span', { className: 'feedback-widget__accuracy' },
          `Точность прогнозов: ${stats.accuracy}%`
        )
      );
    }
    
    return h('div', { className: 'feedback-widget' },
      h('div', { className: 'feedback-widget__question' },
        '🎯 Прогноз оказался точным?'
      ),
      
      h('div', { className: 'feedback-widget__buttons' },
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--yes',
          onClick: () => handleFeedback(true)
        }, '👍 Да'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--no',
          onClick: () => setShowDetails(true)
        }, '👎 Нет'),
        h('button', {
          className: 'feedback-widget__btn feedback-widget__btn--skip',
          onClick: () => setSubmitted(true)
        }, 'Пропустить')
      ),
      
      showDetails && h('div', { className: 'feedback-widget__details' },
        h('textarea', {
          className: 'feedback-widget__textarea',
          placeholder: 'Что пошло не так? (опционально)',
          value: detailText,
          onChange: (e) => setDetailText(e.target.value),
          rows: 2
        }),
        h('button', {
          className: 'feedback-widget__submit',
          onClick: () => handleFeedback(false)
        }, 'Отправить')
      ),
      
      stats.total > 0 && h('div', { className: 'feedback-widget__stats' },
        `📊 Отзывов: ${stats.total} • Точность: ${stats.accuracy}%`
      )
    );
  }
  
  /**
   * FeedbackPrompt — inline prompt для конкретного прогноза
   * Меньше чем FeedbackWidget, встраивается в карточки
   */
  function FeedbackPrompt({ predictionId, type, compact = false }) {
  function FeedbackPrompt({ predictionId, type, compact = false }) {
    const [voted, setVoted] = useState(false);
    
    const handleVote = (correct) => {
      if (HEYS.Metabolic?.submitFeedback) {
        HEYS.Metabolic.submitFeedback(predictionId, correct, { type });
      }
      setVoted(true);
    };
    
    if (voted) {
      return h('span', { className: 'feedback-prompt feedback-prompt--voted' }, '✓');
    }
    
    return h('div', { className: `feedback-prompt ${compact ? 'feedback-prompt--compact' : ''}` },
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--up',
        onClick: () => handleVote(true),
        title: 'Прогноз точный'
      }, '👍'),
      h('button', {
        className: 'feedback-prompt__btn feedback-prompt__btn--down',
        onClick: () => handleVote(false),
        title: 'Прогноз неточный'
      }, '👎')
    );
  }
  
  /**
   * AccuracyBadge — бейдж с точностью системы
   */
  function AccuracyBadge() {
  function AccuracyBadge() {
    const stats = useMemo(() => {
      if (HEYS.Metabolic?.getFeedbackStats) {
        return HEYS.Metabolic.getFeedbackStats();
      }
      return { total: 0, accuracy: 0 };
    }, []);
    
    if (stats.total < 5) return null;
    
    const color = stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 60 ? '#eab308' : '#ef4444';
    
    return h('div', { 
      className: 'accuracy-badge',
      style: { borderColor: color },
      title: `На основе ${stats.total} отзывов`
    },
      h('span', { className: 'accuracy-badge__icon' }, '🎯'),
      h('span', { className: 'accuracy-badge__value', style: { color } }, `${stats.accuracy}%`),
      h('span', { className: 'accuracy-badge__label' }, 'точность')
    );
  }
  
  // Legacy PredictiveDashboard wrapper for backward compatibility
  function PredictiveDashboardLegacy({ lsGet, profile, selectedDate }) {
  function PredictiveDashboardLegacy({ lsGet, profile, selectedDate }) {
    const [showForecast, setShowForecast] = useState(false);
    
    const prediction = useMemo(() => {
      if (!HEYS.Metabolic?.calculateCrashRisk24h) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculateCrashRisk24h(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    const forecast = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(30) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!prediction || prediction.risk < 30) {
      // Не показываем если риск низкий
      return null;
    }
    
    const riskColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444'
    };
    
    return h('div', { className: 'predictive-dashboard' },
      // Crash Risk Alert
      h('div', { 
        className: `crash-risk-alert crash-risk-alert--${prediction.riskLevel}`,
        style: { borderColor: riskColors[prediction.riskLevel] }
      },
        h('div', { className: 'crash-risk-alert__header' },
          h('span', { className: 'crash-risk-alert__icon' }, '🚨'),
          h('span', { className: 'crash-risk-alert__title' }, 'Прогноз риска срыва'),
          h('span', { 
            className: 'crash-risk-alert__risk',
            style: { color: riskColors[prediction.riskLevel] }
          }, `${prediction.risk}%`)
        ),
        
        prediction.primaryTrigger && h('div', { className: 'crash-risk-alert__trigger' },
          h('strong', null, 'Главный триггер: '),
          prediction.primaryTrigger.label
        ),
        
        prediction.preventionStrategy && prediction.preventionStrategy.length > 0 && h('div', { className: 'crash-risk-alert__prevention' },
          h('div', { className: 'crash-risk-alert__prevention-title' }, '🛡️ Профилактика:'),
          prediction.preventionStrategy.slice(0, 2).map((strategy, idx) =>
            h('div', { key: idx, className: 'crash-risk-alert__strategy' },
              `${idx + 1}. ${strategy.action} — ${strategy.reason}`
            )
          )
        )
      ),
      
      // Tomorrow Forecast (collapsible)
      forecast && h('div', { className: 'tomorrow-forecast' },
        h('div', {
          className: 'tomorrow-forecast__header',
          onClick: () => setShowForecast(!showForecast)
        },
          h('span', { className: 'tomorrow-forecast__title' }, '🔮 Прогноз на завтра'),
          h('span', { className: 'tomorrow-forecast__chevron' }, showForecast ? '▼' : '▶')
        ),
        
        showForecast && h('div', { className: 'tomorrow-forecast__content' },
          // Energy Windows
          forecast.energyWindows && h('div', { className: 'tomorrow-forecast__windows' },
            h('div', { className: 'tomorrow-forecast__windows-title' }, '⚡ Окна энергии'),
            forecast.energyWindows.map((window, idx) =>
              h('div', { 
                key: idx, 
                className: `energy-window ${window.optimal ? 'energy-window--optimal' : ''}`
              },
                h('div', { className: 'energy-window__period' }, window.period),
                h('div', { className: 'energy-window__label' }, window.label),
                h('div', { className: 'energy-window__recommendation' }, window.recommendation)
              )
            )
          ),
          
          // Training Window
          forecast.trainingWindow && h('div', { className: 'tomorrow-forecast__training' },
            h('div', { className: 'tomorrow-forecast__training-title' }, '🏋️ Лучшее время для тренировки'),
            h('div', { className: 'tomorrow-forecast__training-time' }, forecast.trainingWindow.time),
            h('div', { className: 'tomorrow-forecast__training-reason' }, forecast.trainingWindow.reason)
          )
        )
      )
    );
  }
  
  // === METABOLIC STATE RING — кольцевая визуализация фаз ===
  
  /**
   * MetabolicStateRing — визуализация текущей метаболической фазы
   * Показывает: анаболическая → переходная → катаболическая (липолиз)
   */
    return h('div', { className: `risk-traffic-light risk-traffic-light--${currentLevel}` },
      // Светофор
      h('div', { className: 'risk-traffic-light__housing' },
        lights.map(light => 
          h('div', { 
            key: light.level,
            className: `risk-traffic-light__light risk-traffic-light__light--${light.level}`,
            style: { 
              backgroundColor: light.level === currentLevel ? light.color : '#374151',
              boxShadow: light.level === currentLevel ? `0 0 20px ${light.color}` : 'none',
              opacity: light.level === currentLevel ? 1 : 0.3
            }
          })
        )
      ),
      // Детали
      h('div', { className: 'risk-traffic-light__details' },
        h('div', { className: 'risk-traffic-light__header' },
          h('span', { className: 'risk-traffic-light__emoji' }, currentLight.emoji),
          h('span', { className: 'risk-traffic-light__title' }, 'Риск срыва'),
          h('span', { className: 'risk-traffic-light__level', style: { color: currentLight.color } }, 
            currentLight.label
          ),
          riskValue !== undefined && h('span', { className: 'risk-traffic-light__percent' }, `${riskValue}%`)
        ),
        // Факторы (если есть)
        factors && factors.length > 0 && h('div', { className: 'risk-traffic-light__factors' },
          factors.slice(0, 3).map((factor, idx) =>
            h('div', { key: idx, className: 'risk-traffic-light__factor' },
              h('span', { className: 'risk-traffic-light__factor-label' }, factor.label),
              h('span', { className: 'risk-traffic-light__factor-impact' }, `+${factor.impact}`)
            )
          )
        ),
        // Совет по снижению
        currentLevel !== 'low' && h('div', { className: 'risk-traffic-light__tip' },
          h('span', { className: 'risk-traffic-light__tip-icon' }, '💡'),
          h('span', { className: 'risk-traffic-light__tip-text' },
            currentLevel === 'high' 
              ? 'Сделай refeed день или высыпись'
              : 'Добавь прогулку или лёгкий перекус'
          )
        )
      )
    );
  }
  
  // === DATA COMPLETENESS UI ===
  
  /**
   * DataCompletenessCard — карточка полноты данных
   * Показывает прогресс заполнения и что разблокируется
   */
  /**
   * DataCompletenessCard — показывает прогресс сбора данных и разблокировку фичей
   * v3.22.0: Добавлена Extended Analytics как премиум-фича (7+ дней)
   */
  function DataCompletenessCard({ lsGet, profile, daysRequired = 30 }) {
  function DataCompletenessCard({ lsGet, profile, daysRequired = 30 }) {
    const completeness = useMemo(() => {
      if (!HEYS.Metabolic?.getDaysHistory) return null;
      
      const history = HEYS.Metabolic.getDaysHistory(daysRequired);
      const daysWithData = history.length;
      const percentage = Math.round((daysWithData / daysRequired) * 100);
      const daysRemaining = Math.max(0, daysRequired - daysWithData);
      
      // Проверяем полноту последнего дня (сегодня)
      const today = new Date().toISOString().split('T')[0];
      const inventory = HEYS.Metabolic.inventoryData ? HEYS.Metabolic.inventoryData(today) : null;
      const todayCompleteness = inventory ? HEYS.Metabolic.calculateDataCompleteness(inventory) : 0;
      
      // 🆕 v3.22.0: Extended Analytics features с научными обоснованиями
      const features = [
        { name: 'Базовый статус', required: 1, emoji: '📊', unlocked: daysWithData >= 1 },
        { name: 'Риск срыва', required: 3, emoji: '⚠️', unlocked: daysWithData >= 3 },
        { name: 'Паттерны', required: 7, emoji: '🔍', unlocked: daysWithData >= 7 },
        { 
          name: '🧠 Эмоц. риск', 
          required: 7, 
          emoji: '🧠', 
          unlocked: daysWithData >= 7,
          pmid: '11070333',
          science: 'Epel 2001 — стресс-переедание'
        },
        { 
          name: '🥩 Белковый долг', 
          required: 7, 
          emoji: '🥩', 
          unlocked: daysWithData >= 7,
          pmid: '20095013',
          science: 'Mettler 2010 — белок при дефиците'
        },
        { name: 'Персональные пороги', required: 14, emoji: '🎯', unlocked: daysWithData >= 14 },
        { 
          name: '🔬 Циркадный контекст', 
          required: 14, 
          emoji: '🌅', 
          unlocked: daysWithData >= 14,
          pmid: '9331550',
          science: 'Van Cauter 1997 — циркадные ритмы'
        },
        { name: 'Метаболический фенотип', required: 30, emoji: '🧬', unlocked: daysWithData >= 30 }
      ];
      
      const nextFeature = features.find(f => !f.unlocked);
      
      // 🆕 Считаем сколько extended analytics разблокировано
      const extendedFeatures = features.filter(f => f.pmid);
      const extendedUnlocked = extendedFeatures.filter(f => f.unlocked).length;
      const extendedTotal = extendedFeatures.length;
      
      return {
        daysWithData,
        daysRequired,
        percentage,
        daysRemaining,
        todayCompleteness,
        features,
        nextFeature,
        extendedUnlocked,
        extendedTotal
      };
    }, [lsGet, daysRequired]);
    
    if (!completeness) {
      return null;
    }
    
    return h('div', { className: 'data-completeness-card' },
      h('div', { className: 'data-completeness-card__header' },
        h('span', { className: 'data-completeness-card__icon' }, '📊'),
        h('span', { className: 'data-completeness-card__title' }, 'Данные'),
        h('span', { className: 'data-completeness-card__count' },
          `${completeness.daysWithData}/${completeness.daysRequired} дней`
        )
      ),
      
      // Прогресс-бар
      h('div', { className: 'data-completeness-card__progress' },
        h('div', { className: 'data-completeness-card__progress-bar' },
          h('div', { 
            className: 'data-completeness-card__progress-fill',
            style: { width: `${completeness.percentage}%` }
          })
        ),
        h('span', { className: 'data-completeness-card__progress-text' }, `${completeness.percentage}%`)
      ),
      
      // Сегодняшняя полнота
      h('div', { className: 'data-completeness-card__today' },
        h('span', { className: 'data-completeness-card__today-label' }, 'Сегодня: '),
        h('span', { 
          className: 'data-completeness-card__today-value',
          style: { color: completeness.todayCompleteness >= 80 ? '#22c55e' : completeness.todayCompleteness >= 50 ? '#eab308' : '#ef4444' }
        }, `${completeness.todayCompleteness}% заполнено`)
      ),
      
      // 🆕 v3.22.0: Extended Analytics Status
      h('div', { className: 'data-completeness-card__extended' },
        h('span', { className: 'data-completeness-card__extended-label' }, '🧠 Extended Analytics: '),
        h('span', { 
          className: 'data-completeness-card__extended-value',
          style: { color: completeness.extendedUnlocked === completeness.extendedTotal ? '#22c55e' : '#6366f1' }
        }, `${completeness.extendedUnlocked}/${completeness.extendedTotal}`),
        completeness.extendedUnlocked === completeness.extendedTotal && h('span', { className: 'data-completeness-card__extended-badge' }, '✓')
      ),
      
      // Следующая разблокировка
      completeness.nextFeature && h('div', { className: 'data-completeness-card__next' },
        h('span', { className: 'data-completeness-card__next-emoji' }, completeness.nextFeature.emoji),
        h('span', { className: 'data-completeness-card__next-text' },
          `${completeness.nextFeature.name} через ${completeness.nextFeature.required - completeness.daysWithData} дн.`
        ),
        completeness.nextFeature.pmid && h('a', {
          href: `https://pubmed.ncbi.nlm.nih.gov/${completeness.nextFeature.pmid}/`,
          target: '_blank',
          className: 'data-completeness-card__next-pmid',
          title: completeness.nextFeature.science
        }, '🔬')
      ),
      
      // Разблокированные фичи (иконки) — 🆕 с tooltip для extended
      h('div', { className: 'data-completeness-card__features' },
        completeness.features.map((feature, idx) =>
          h('div', { 
            key: idx,
            className: `data-completeness-card__feature ${feature.unlocked ? 'data-completeness-card__feature--unlocked' : ''} ${feature.pmid ? 'data-completeness-card__feature--science' : ''}`,
            title: `${feature.name} (${feature.required} дней)${feature.science ? '\n' + feature.science : ''}`
          }, feature.emoji)
        )
      )
    );
  }
  
  // === MEAL TIMING RECOMMENDATIONS (v2 — Premium Design) ===
  
  /**
   * MealTimingCard v2 — WOW дизайн с timeline и иконками
   */
  function MealTimingCard({ lsGet, profile, selectedDate }) {
  function MealTimingCard({ lsGet, profile, selectedDate }) {
    const timing = useMemo(() => {
      if (!HEYS.Metabolic?.calculatePerformanceForecast) return null;
      
      const history = HEYS.Metabolic.getDaysHistory ? HEYS.Metabolic.getDaysHistory(7) : [];
      
      return HEYS.Metabolic.calculatePerformanceForecast(
        selectedDate || new Date().toISOString().split('T')[0],
        profile || window.HEYS?.utils?.lsGet?.('heys_profile', {}),
        history
      );
    }, [lsGet, profile, selectedDate]);
    
    if (!timing || !timing.optimalMeals) {
      return null;
    }
    
    // Конфиг иконок и цветов для типов приёмов
    const mealConfig = {
      'Завтрак': { icon: '🌅', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', lightBg: '#fef3c7' },
      'Обед': { icon: '☀️', gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', lightBg: '#d1fae5' },
      'Ужин': { icon: '🌙', gradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)', lightBg: '#e0e7ff' },
      'Перекус': { icon: '🍎', gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)', lightBg: '#fce7f3' }
    };
    
    const getMealConfig = (name) => {
      for (const [key, config] of Object.entries(mealConfig)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return config;
      }
      return { icon: '🍽️', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', lightBg: '#f1f5f9' };
    };
    
    // Вычисляем текущее время для индикатора "сейчас"
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    return h('div', { className: 'meal-timing-v2' },
      // Header с градиентом
      h('div', { className: 'meal-timing-v2__header' },
        h('div', { className: 'meal-timing-v2__header-icon' }, '⏰'),
        h('div', { className: 'meal-timing-v2__header-content' },
          h('h3', { className: 'meal-timing-v2__title' }, 'Твой идеальный день'),
          h('p', { className: 'meal-timing-v2__subtitle' }, 'Персональное расписание на основе твоего ритма')
        )
      ),
      
      // Timeline с приёмами
      h('div', { className: 'meal-timing-v2__timeline' },
        timing.optimalMeals.filter(m => m.priority !== 'low').map((meal, idx, arr) => {
          const config = getMealConfig(meal.name);
          const [startHour] = meal.time.split('-')[0].split(':').map(Number);
          const isNow = currentHour >= startHour && currentHour < startHour + 2;
          const isPast = currentHour > startHour + 2;
          
          return h('div', { 
            key: idx, 
            className: `meal-timing-v2__item ${isNow ? 'meal-timing-v2__item--active' : ''} ${isPast ? 'meal-timing-v2__item--past' : ''}`
          },
            // Timeline connector
            idx < arr.length - 1 && h('div', { className: 'meal-timing-v2__connector' }),
            
            // Time badge
            h('div', { className: 'meal-timing-v2__time-badge', style: { background: config.gradient } },
              h('span', { className: 'meal-timing-v2__time' }, meal.time.split('-')[0])
            ),
            
            // Card content
            h('div', { className: 'meal-timing-v2__card', style: { '--accent-bg': config.lightBg } },
              h('div', { className: 'meal-timing-v2__card-header' },
                h('span', { className: 'meal-timing-v2__card-icon' }, config.icon),
                h('div', { className: 'meal-timing-v2__card-title' },
                  h('span', { className: 'meal-timing-v2__card-name' }, meal.name),
                  isNow && h('span', { className: 'meal-timing-v2__now-badge' }, '● СЕЙЧАС')
                )
              ),
              h('div', { className: 'meal-timing-v2__card-body' },
                h('p', { className: 'meal-timing-v2__card-focus' }, meal.focus),
                h('div', { className: 'meal-timing-v2__card-meta' },
                  h('span', { className: 'meal-timing-v2__card-pct' }, 
                    h('span', { className: 'meal-timing-v2__pct-value' }, `${meal.caloriesPct}%`),
                    ' дневных ккал'
                  ),
                  meal.priority === 'high' && h('span', { className: 'meal-timing-v2__priority-badge' }, '⭐ Важно')
                )
              )
            )
          );
        })
      ),
      
      // Тренировочное окно (если есть)
      timing.trainingWindow && h('div', { className: 'meal-timing-v2__training' },
        h('div', { className: 'meal-timing-v2__training-icon' }, '💪'),
        h('div', { className: 'meal-timing-v2__training-content' },
          h('div', { className: 'meal-timing-v2__training-title' }, 'Пик силы и выносливости'),
          h('div', { className: 'meal-timing-v2__training-time' }, timing.trainingWindow.time),
          h('div', { className: 'meal-timing-v2__training-reason' }, timing.trainingWindow.reason)
        )
      ),
      
      // Sleep impact chip
      h('div', { className: `meal-timing-v2__sleep meal-timing-v2__sleep--${timing.sleepImpact}` },
        h('span', { className: 'meal-timing-v2__sleep-icon' }, 
          timing.sleepImpact === 'positive' ? '😴' : '⚠️'
        ),
        h('span', { className: 'meal-timing-v2__sleep-text' },
          timing.sleepImpact === 'positive' 
            ? 'Сон в норме — энергия стабильна весь день'
            : 'Недосып — рекомендуем лёгкий день'
        ),
        ),
        
        // Content
        h('div', { className: 'weekly-wrap-card__content' },
          
          // Tab: Summary
          activeTab === 'summary' && h(React.Fragment, null,
            // Main score
            h('div', { className: 'weekly-wrap-card__main-score' },
              h('div', { 
                className: 'weekly-wrap-card__score-value',
                style: { color: getScoreColor(summary.avgScore) }
              }, summary.avgScore),
              h('div', { className: 'weekly-wrap-card__score-label' }, 'Средний score'),
              comparison && h('div', { 
                className: `weekly-wrap-card__comparison ${comparison.improved ? 'weekly-wrap-card__comparison--up' : 'weekly-wrap-card__comparison--down'}`
              },
                comparison.improved ? '↑' : '↓',
                ` ${Math.abs(comparison.delta)} vs прошлая неделя`
              )
            ),
            
            // Stats grid
            h('div', { className: 'weekly-wrap-card__stats' },
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.goodDays),
                h('div', { className: 'weekly-wrap-card__stat-label' }, 'Хороших дней')
              ),
              h('div', { className: 'weekly-wrap-card__stat' },
                h('div', { className: 'weekly-wrap-card__stat-value' }, summary.lowRiskDays),

  // === ЭКСПОРТ ===
  HEYS.InsightsPI.uiDashboard = {
    WeightPrediction,
    PriorityFilterBar,
    PillarBreakdownBars,
    DualRiskPanel,
    RiskPanel,
    RiskMeter,
    ForecastPanel,
    FeedbackPrompt,
    AccuracyBadge,
    PredictiveDashboardLegacy,
    DataCompletenessCard,
    MealTimingCard
  };
  
  // Fallback для прямого доступа
  global.piUIDashboard = HEYS.InsightsPI.uiDashboard;
  
  if (typeof console !== 'undefined' && console.log) {
    console.log('[PI UI Dashboard] v3.0.0 loaded — 12 dashboard components');
  }
  
})(typeof window !== 'undefined' ? window : global);
