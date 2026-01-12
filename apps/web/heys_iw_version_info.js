// heys_iw_version_info.js — InsulinWave Module Version Information
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Утилита для получения информации о версиях всех модулей InsulinWave.
// Полезно для отладки и проверки загрузки модулей.

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  /**
   * Получить информацию о всех загруженных модулях InsulinWave
   * @returns {Object} информация о модулях
   */
  const getModulesInfo = () => {
    const IW = HEYS.InsulinWave || {};
    
    const modules = {
      main: {
        name: 'Main Orchestrator',
        version: IW.VERSION || 'unknown',
        loaded: !!IW.calculate && !!IW.useInsulinWave,
        file: 'heys_insulin_wave_v1.js'
      },
      calc: {
        name: IW.Calc?.__name || 'Calc',
        version: IW.Calc?.__version || 'unknown',
        loaded: !!IW.Calc?.calculateMealNutrients,
        file: 'heys_iw_calc.js'
      },
      orchestrator: {
        name: IW.Orchestrator?.__name || 'Orchestrator',
        version: IW.Orchestrator?.__version || 'unknown',
        loaded: !!IW.Orchestrator?.prepareWaveData,
        file: 'heys_iw_orchestrator.js'
      },
      v30: {
        name: 'v3.0 Features',
        version: IW.V30?.__version || '3.0.0',
        loaded: !!IW.V30?.calculateContinuousGLMultiplier,
        file: 'heys_iw_v30.js'
      },
      v41: {
        name: 'v4.1 Features',
        version: IW.V41?.__version || '4.1.0',
        loaded: !!IW.V41?.calculateMetabolicFlexibility,
        file: 'heys_iw_v41.js'
      },
      ui: {
        name: 'UI Components',
        version: IW.UI?.__version || '1.0.0',
        loaded: !!IW.UI?.MealWaveExpandSection,
        file: 'heys_iw_ui.js'
      },
      graph: {
        name: 'Graph',
        version: IW.Graph?.__version || '1.0.0',
        loaded: !!IW.Graph?.renderWaveChart,
        file: 'heys_iw_graph.js'
      },
      ndte: {
        name: 'NDTE',
        version: IW.NDTE?.__version || '1.0.0',
        loaded: !!IW.NDTE?.renderNDTEBadge,
        file: 'heys_iw_ndte.js'
      },
      lipolysis: {
        name: 'Lipolysis',
        version: IW.Lipolysis?.__version || '1.0.0',
        loaded: !!IW.Lipolysis?.getLipolysisRecord,
        file: 'heys_iw_lipolysis.js'
      },
      utils: {
        name: 'Utils',
        version: IW.utils?.__version || '1.0.0',
        loaded: !!IW.utils?.timeToMinutes,
        file: 'heys_iw_utils.js'
      },
      constants: {
        name: 'Constants',
        version: IW.__internals?.__version || '1.0.0',
        loaded: !!IW.__internals?.GI_CATEGORIES,
        file: 'heys_iw_constants.js'
      }
    };
    
    const summary = {
      totalModules: Object.keys(modules).length,
      loadedModules: Object.values(modules).filter(m => m.loaded).length,
      failedModules: Object.values(modules).filter(m => !m.loaded).length
    };
    
    return { modules, summary };
  };
  
  /**
   * Вывести информацию о модулях в консоль (красиво отформатированная)
   */
  const printModulesInfo = () => {
    const info = getModulesInfo();
    
    console.log('%c InsulinWave Modules Info ', 'background: #3b82f6; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('');
    
    console.table(
      Object.entries(info.modules).map(([key, mod]) => ({
        Module: mod.name,
        Version: mod.version,
        Status: mod.loaded ? '✅ Loaded' : '❌ Not loaded',
        File: mod.file
      }))
    );
    
    console.log('');
    console.log(`%c Summary: ${info.summary.loadedModules}/${info.summary.totalModules} modules loaded `, 
      info.summary.failedModules === 0 
        ? 'background: #22c55e; color: white; padding: 2px 6px; border-radius: 3px;'
        : 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px;'
    );
    
    if (info.summary.failedModules > 0) {
      console.warn('⚠️ Some modules failed to load. Check the network tab for errors.');
    }
    
    return info;
  };
  
  /**
   * Проверить, все ли модули загружены
   * @returns {boolean} true если все модули загружены
   */
  const checkAllModulesLoaded = () => {
    const info = getModulesInfo();
    return info.summary.failedModules === 0;
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.VersionInfo = {
    getModulesInfo,
    printModulesInfo,
    checkAllModulesLoaded,
    __version: '1.0.0',
    __name: 'InsulinWave.VersionInfo'
  };
  
  // Автоматически выводим информацию в dev режиме
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    // Ждём загрузки всех модулей
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => printModulesInfo(), 500);
      });
    }
  }
  
})(typeof window !== 'undefined' ? window : global);
