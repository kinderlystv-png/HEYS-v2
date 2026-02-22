// heys_iw_config_loader.js — Insulin Wave config loader
// Version: 1.1.0 | Date: 2026-01-16
// v1.1.0: Inline JSON removed → async fetch from /heys-iw-config.json + localStorage cache

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

    const CONFIG_CACHE_KEY = 'heys_iw_config_cache_v1';
    const CONFIG_CACHE_META_KEY = 'heys_iw_config_cache_meta_v1';
    const CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
    const CONFIG_JSON_URL = '/heys-iw-config.json';

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

    const saveConfigToCache = (rawConfig) => {
        try {
            localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(rawConfig));
            const meta = { ts: Date.now(), version: rawConfig?.version || 'unknown' };
            localStorage.setItem(CONFIG_CACHE_META_KEY, JSON.stringify(meta));
        } catch (e) {
            // ignore cache write errors
        }
    };

    const applyConfig = (rawConfig, source) => {
        let config = reviveInfinity(rawConfig);
        config = mergePatterns(config);

        I._configSource = config;
        I._loaded.config = true;
        I._loaded.configError = false;
        I._loaded.configFallback = false;
        saveConfigToCache(rawConfig);
        console.info('[HEYS.IW] ✅ Config loaded:', { source, version: rawConfig?.version });

        // Notify modules waiting for async config
        if (typeof CustomEvent !== 'undefined') {
            document.dispatchEvent(new CustomEvent('heys-iw-config-ready', {
                detail: { source, version: rawConfig?.version }
            }));
        }
    };

    const fetchConfigFromNetwork = () => {
        fetch(CONFIG_JSON_URL)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
                applyConfig(data, 'network');
            })
            .catch(function (err) {
                console.warn('[HEYS.IW] ⚠️ Config fetch failed:', err.message);
                I._loaded.config = false;
                I._loaded.configError = true;
                I._loaded.configFallback = true;
                I._configSource = null;
            });
    };

    // Priority: global override → localStorage cache → async fetch
    const cachedConfig = loadConfigFromCache();
    const rawConfig = (global.__IW_CONFIG__ && typeof global.__IW_CONFIG__ === 'object')
        ? global.__IW_CONFIG__
        : cachedConfig;

    I._loaded.configVersionMismatch = false;

    if (rawConfig) {
        applyConfig(rawConfig, global.__IW_CONFIG__ ? 'global' : 'cache');
    } else {
        // No cached config — fetch async from network
        I._loaded.config = false;
        I._loaded.configError = false;
        I._loaded.configFallback = true;
        I._configSource = null;
        console.info('[HEYS.IW] ✅ No cached config, fetching from network...');
        fetchConfigFromNetwork();
    }
})(typeof window !== 'undefined' ? window : global);
