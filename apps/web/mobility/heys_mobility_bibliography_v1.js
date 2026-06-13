// heys_mobility_bibliography_v1.js — источники и honest effect map.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__bibliographyRegistered) return;
  Mobility.__bibliographyRegistered = true;

  const BIBLIOGRAPHY = {
    jeffreys2007: { id: 'jeffreys2007', label: 'Jeffreys RAMP warm-up', strength: 'B', topic: 'warmup' },
    behm2016: { id: 'behm2016', label: 'Behm et al. stretching and performance review', strength: 'A', topic: 'stretching' },
    blazevich2014: { id: 'blazevich2014', label: 'Blazevich stretching mechanisms', strength: 'A', topic: 'mechanisms' },
    warneke2025delphi: { id: 'warneke2025delphi', label: 'Stretching Delphi consensus', strength: 'A', topic: 'definitions' },
    warneke2024posture: { id: 'warneke2024posture', label: 'Stretching and posture review', strength: 'A', topic: 'posture' },
    konrad2023: { id: 'konrad2023', label: 'Konrad stretching ROM meta-analysis', strength: 'A', topic: 'rom' },
    cook_boyle_jbj: { id: 'cook_boyle_jbj', label: 'Cook/Boyle joint-by-joint model', strength: 'B', topic: 'assessment' },
    spina_frc: { id: 'spina_frc', label: 'Functional Range Conditioning', strength: 'C', topic: 'cars_endrange' },
    behmwilke2019: { id: 'behmwilke2019', label: 'Behm & Wilke self-myofascial release', strength: 'A', topic: 'smr' },
    dupuy2018: { id: 'dupuy2018', label: 'Dupuy recovery meta-analysis', strength: 'A', topic: 'recovery' },
    vanhooren2018: { id: 'vanhooren2018', label: 'Cool-down review', strength: 'A', topic: 'cooldown' },
    roberts2015: { id: 'roberts2015', label: 'Cold water immersion and adaptation', strength: 'A', topic: 'cwi' },
    eccflex2022: { id: 'eccflex2022', label: 'Eccentric training for flexibility', strength: 'A', topic: 'eccentric_rom' },
    fifa11plus: { id: 'fifa11plus', label: 'FIFA 11+ injury prevention', strength: 'A', topic: 'injury_prevention' },
    slowbreath2022: { id: 'slowbreath2022', label: 'Slow breathing review', strength: 'A', topic: 'breath' },
    spiegel2023: { id: 'spiegel2023', label: 'Cyclic sighing trial', strength: 'A', topic: 'breath' },
    bisconti2020: { id: 'bisconti2020', label: 'Passive stretching and vascular function', strength: 'A', topic: 'vascular' },
    magnusson1996: { id: 'magnusson1996', label: 'Stretch tolerance mechanism', strength: 'A', topic: 'mechanisms' },
    aaos_rom: { id: 'aaos_rom', label: 'AAOS ROM reference values', strength: 'C', topic: 'rom_norms' },
    cook2009: { id: 'cook2009', label: 'Tendon rehab loading frame', strength: 'B', topic: 'rehab' },
    rio2015: { id: 'rio2015', label: 'Isometric loading and pain modulation', strength: 'B', topic: 'rehab' }
  };

  const EFFECT_MAP = {
    rom: { id: 'rom', verdict: 'positive', confidence: 'A', msg: 'ROM растёт остро и хронически; методы сопоставимы по приросту амплитуды' },
    acute_strength: { id: 'acute_strength', verdict: 'caution', confidence: 'A', msg: 'длинная статика перед мощностью может дать малый обратимый дефицит' },
    chronic_strength: { id: 'chronic_strength', verdict: 'limited', confidence: 'A', msg: 'для силы нужен силовой тренинг; растяжка слабый инструмент силы' },
    hypertrophy: { id: 'hypertrophy', verdict: 'no_practical_effect', confidence: 'B', msg: 'при практических человеческих дозах рост мышц от растяжки не обещаем' },
    tissue_stiffness: { id: 'tissue_stiffness', verdict: 'positive', confidence: 'A', msg: 'хроническая растяжка может снижать пассивную жёсткость' },
    injury: { id: 'injury', verdict: 'caution', confidence: 'A', msg: 'одна статика ненадёжна; динамическая разминка + эксцентрика сильнее' },
    recovery: { id: 'recovery', verdict: 'limited', confidence: 'A', msg: 'заминка даёт комфорт, но не ускоряет суперкомпенсацию' },
    posture: { id: 'posture', verdict: 'no_effect', confidence: 'A', msg: 'изолированная растяжка не исправляет осанку' },
    vascular: { id: 'vascular', verdict: 'positive', confidence: 'A', msg: 'пассивная растяжка может улучшать сосудистые маркеры' }
  };

  function getSource(id) { return BIBLIOGRAPHY[id] || null; }
  function resolveSources(ids) {
    return (Array.isArray(ids) ? ids : []).map(getSource).filter(Boolean);
  }
  function missingSources(ids) {
    return (Array.isArray(ids) ? ids : []).filter(function (id) { return !BIBLIOGRAPHY[id]; });
  }
  function getEffect(id) { return EFFECT_MAP[id] || null; }

  Mobility.bibliography = {
    __registered: true,
    BIBLIOGRAPHY: BIBLIOGRAPHY,
    EFFECT_MAP: EFFECT_MAP,
    getSource: getSource,
    resolveSources: resolveSources,
    missingSources: missingSources,
    getEffect: getEffect
  };
})(typeof window !== 'undefined' ? window : globalThis);
