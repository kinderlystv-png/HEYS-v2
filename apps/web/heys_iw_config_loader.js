// heys_iw_config_loader.js — Insulin Wave config loader
// Version: 1.0.0 | Date: 2026-01-16

(function (global) {
    'use strict';

    const IW = global.HEYS?.InsulinWave;
    const I = IW?.__internals;

    if (!I) {
        console.error('[IW config] Shim required');
        return;
    }

    if (!I._loaded?.shim) {
        console.error('[IW config] Shim must be loaded first');
        return;
    }

    const reviveInfinity = (value) => {
        if (value === 'Infinity') return Infinity;
        if (Array.isArray(value)) return value.map(reviveInfinity);
        if (value && typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([k, v]) => {
                out[k] = reviveInfinity(v);
            });
            return out;
        }
        return value;
    };

    const compileRegex = (patternString) => {
        if (patternString instanceof RegExp) return patternString;
        if (typeof patternString !== 'string') return null;
        const match = patternString.match(/^\/(.*)\/([a-z]*)$/i);
        if (match) {
            try {
                return new RegExp(match[1], match[2] || 'i');
            } catch (e) {
                return null;
            }
        }
        try {
            return new RegExp(patternString, 'i');
        } catch (e) {
            return null;
        }
    };

    const compileRegexList = (list) => {
        if (!Array.isArray(list)) return [];
        return list.map(compileRegex).filter(Boolean);
    };

    const mergePatterns = (cfg) => {
        const patterns = I._configPatterns || {};

        if (patterns.PROTEIN_BONUS_V2?.patterns) {
            cfg.PROTEIN_BONUS_V2 = cfg.PROTEIN_BONUS_V2 || {};
            cfg.PROTEIN_BONUS_V2.patterns = {
                animal: compileRegexList(patterns.PROTEIN_BONUS_V2.patterns.animal),
                whey: compileRegexList(patterns.PROTEIN_BONUS_V2.patterns.whey),
                plant: compileRegexList(patterns.PROTEIN_BONUS_V2.patterns.plant)
            };
        }

        if (patterns.LIQUID_FOOD?.patterns) {
            cfg.LIQUID_FOOD = cfg.LIQUID_FOOD || {};
            cfg.LIQUID_FOOD.patterns = compileRegexList(patterns.LIQUID_FOOD.patterns);
        }

        if (patterns.INSULINOGENIC_BONUS) {
            cfg.INSULINOGENIC_BONUS = cfg.INSULINOGENIC_BONUS || {};
            Object.entries(patterns.INSULINOGENIC_BONUS).forEach(([key, value]) => {
                cfg.INSULINOGENIC_BONUS[key] = cfg.INSULINOGENIC_BONUS[key] || {};
                cfg.INSULINOGENIC_BONUS[key].patterns = compileRegexList(value.patterns || []);
            });
        }

        if (patterns.SPICY_FOOD?.patterns) {
            cfg.SPICY_FOOD = cfg.SPICY_FOOD || {};
            cfg.SPICY_FOOD.patterns = compileRegexList(patterns.SPICY_FOOD.patterns);
        }

        if (patterns.ALCOHOL_BONUS) {
            cfg.ALCOHOL_BONUS = cfg.ALCOHOL_BONUS || {};
            cfg.ALCOHOL_BONUS.patterns = compileRegexList(patterns.ALCOHOL_BONUS.patterns || []);
            cfg.ALCOHOL_BONUS.strong = compileRegexList(patterns.ALCOHOL_BONUS.strong || []);
            cfg.ALCOHOL_BONUS.medium = compileRegexList(patterns.ALCOHOL_BONUS.medium || []);
            cfg.ALCOHOL_BONUS.weak = compileRegexList(patterns.ALCOHOL_BONUS.weak || []);
        }

        if (patterns.CAFFEINE_BONUS?.patterns) {
            cfg.CAFFEINE_BONUS = cfg.CAFFEINE_BONUS || {};
            cfg.CAFFEINE_BONUS.patterns = compileRegexList(patterns.CAFFEINE_BONUS.patterns);
        }

        if (patterns.FOOD_FORM_BONUS) {
            cfg.FOOD_FORM_BONUS = cfg.FOOD_FORM_BONUS || {};
            cfg.FOOD_FORM_BONUS.liquidPatterns = compileRegexList(patterns.FOOD_FORM_BONUS.liquidPatterns || []);
            cfg.FOOD_FORM_BONUS.processedPatterns = compileRegexList(patterns.FOOD_FORM_BONUS.processedPatterns || []);
            cfg.FOOD_FORM_BONUS.wholePatterns = compileRegexList(patterns.FOOD_FORM_BONUS.wholePatterns || []);
        }

        if (patterns.RESISTANT_STARCH_BONUS?.patterns) {
            cfg.RESISTANT_STARCH_BONUS = cfg.RESISTANT_STARCH_BONUS || {};
            cfg.RESISTANT_STARCH_BONUS.patterns = compileRegexList(patterns.RESISTANT_STARCH_BONUS.patterns);
        }

        if (patterns.FOOD_TEMPERATURE_BONUS) {
            cfg.FOOD_TEMPERATURE_BONUS = cfg.FOOD_TEMPERATURE_BONUS || {};
            cfg.FOOD_TEMPERATURE_BONUS.hot = cfg.FOOD_TEMPERATURE_BONUS.hot || {};
            cfg.FOOD_TEMPERATURE_BONUS.cold = cfg.FOOD_TEMPERATURE_BONUS.cold || {};
            cfg.FOOD_TEMPERATURE_BONUS.hot.patterns = compileRegexList(patterns.FOOD_TEMPERATURE_BONUS.hot?.patterns || []);
            cfg.FOOD_TEMPERATURE_BONUS.cold.patterns = compileRegexList(patterns.FOOD_TEMPERATURE_BONUS.cold?.patterns || []);
        }

        return cfg;
    };

    const readInlineConfig = () => {
        try {
            const el = document.getElementById('heys-iw-config');
            if (!el) return null;
            const raw = el.textContent || '';
            if (!raw.trim()) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    };

    const CONFIG_CACHE_KEY = 'heys_iw_config_cache_v1';
    const CONFIG_CACHE_META_KEY = 'heys_iw_config_cache_meta_v1';
    const CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

    const loadConfigFromCache = () => {
        try {
            const cached = localStorage.getItem(CONFIG_CACHE_KEY);
            const metaRaw = localStorage.getItem(CONFIG_CACHE_META_KEY);
            if (!cached || !metaRaw) return null;
            const meta = JSON.parse(metaRaw);
            if (!meta || !meta.ts || !meta.version) return null;
            if (Date.now() - meta.ts > CONFIG_CACHE_TTL_MS) return null;
            const parsed = JSON.parse(cached);
            if (!parsed || parsed.version !== meta.version) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    };

    const inlineConfig = readInlineConfig();
    const cachedConfig = loadConfigFromCache();
    const rawConfig = (global.__IW_CONFIG__ && typeof global.__IW_CONFIG__ === 'object')
        ? global.__IW_CONFIG__
        : (inlineConfig || cachedConfig);

    if (inlineConfig && cachedConfig && inlineConfig.version && cachedConfig.version && inlineConfig.version !== cachedConfig.version) {
        I._loaded.configVersionMismatch = true;
        if (global.HEYS?.analytics?.trackError) {
            global.HEYS.analytics.trackError('IW config version mismatch', {
                inlineVersion: inlineConfig.version,
                cachedVersion: cachedConfig.version
            });
        }
    } else {
        I._loaded.configVersionMismatch = false;
    }

    if (!rawConfig) {
        I._loaded.config = false;
        I._loaded.configError = true;
        I._loaded.configFallback = true;
        I._configSource = null;
        return;
    }

    let config = reviveInfinity(rawConfig);
    config = mergePatterns(config);

    I._configSource = config;
    I._loaded.config = true;
    I._loaded.configError = false;
    try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(rawConfig));
        const meta = { ts: Date.now(), version: rawConfig?.version || 'unknown' };
        localStorage.setItem(CONFIG_CACHE_META_KEY, JSON.stringify(meta));
    } catch (e) {
        // ignore cache write errors
    }
})(typeof window !== 'undefined' ? window : global);
