// heys_user_v12.js — User profile, BMI/BMR calculations, HR zones
(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // 🔍 DEBUG: Проверяем что HEYS.utils загружен
  if (!HEYS.utils || !HEYS.utils.lsGet) {
    console.error('[heys_user_v12] ❌ HEYS.utils.lsGet не определён! Это приведёт к сбросу профиля');
  } else {
    console.log('[heys_user_v12] ✅ HEYS.utils.lsGet определён, __clientScoped:', HEYS.utils.__clientScoped);
  }
  
  const { lsGet, lsSet, toNum, round1, getEmojiStyle, setEmojiStyle } = HEYS.utils || {
    lsGet:(k,d)=>d, lsSet:()=>{}, toNum:(x)=>Number(x)||0, round1:(v)=>Math.round(v*10)/10,
    getEmojiStyle:()=>'android', setEmojiStyle:()=>{}
  };

  // Дефолтный профиль (единый источник)
  const DEFAULT_PROFILE = {
    firstName:'', lastName:'', gender:'Мужской',
    weight:70, height:175, age:30,
    birthDate: '', // YYYY-MM-DD, если заполнено — возраст считается авто
    weightGoal: 0, // целевой вес (кг)
    sleepHours:8, insulinWaveHours:3,
    deficitPctTarget: 0,
    stepsGoal: 10000, // целевая дневная активность по шагам
    cycleTrackingEnabled: false, // ручное включение трекинга цикла (для любого пола)
    profileCompleted: false // флаг заполненности профиля (для wizard первого входа)
  };

  // Валидация полей профиля — мягкая (разрешаем ввод, не форсируем fallback)
  // Fallback применяется только при чтении/использовании, не при вводе
  const PROFILE_VALIDATORS = {
    weight: v => {
      if (v === '' || v === null || v === undefined) return v; // Разрешаем пустое при вводе
      const n = Number(v);
      return isNaN(n) ? v : Math.max(0, Math.min(500, n));
    },
    weightGoal: v => {
      if (v === '' || v === null || v === undefined) return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : Math.max(0, Math.min(500, n));
    },
    height: v => {
      if (v === '' || v === null || v === undefined) return v;
      const n = Number(v);
      return isNaN(n) ? v : Math.max(0, Math.min(300, n));
    },
    age: v => {
      if (v === '' || v === null || v === undefined) return v;
      const n = Number(v);
      return isNaN(n) ? v : Math.max(0, Math.min(150, n));
    },
    sleepHours: v => {
      if (v === '' || v === null || v === undefined) return v;
      const n = Number(v);
      return isNaN(n) ? v : Math.max(0, Math.min(24, n));
    },
    insulinWaveHours: v => {
      if (v === '' || v === null || v === undefined) return v;
      const n = Number(v);
      return isNaN(n) ? v : Math.max(0.5, Math.min(12, n));
    },
    deficitPctTarget: v => {
      if (v === '' || v === null || v === undefined) return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : Math.max(-50, Math.min(50, n));
    },
    stepsGoal: v => {
      if (v === '' || v === null || v === undefined) return 10000;
      const n = Number(v);
      return isNaN(n) ? 10000 : Math.max(0, Math.min(50000, n));
    }
  };

  // Расчёт возраста из даты рождения
  function calcAgeFromBirthDate(birthDate) {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  // Расчёт нормы сна по возрасту и полу (Sleep Foundation + NSF)
  // Возвращает { hours, range, explanation }
  function calcSleepNorm(age, gender) {
    let baseMin, baseMax, explanation;
    
    // Рекомендации по возрасту (Sleep Foundation / AASM)
    if (age < 13) {
      baseMin = 9; baseMax = 12;
      explanation = 'дети 6-12 лет: 9-12ч';
    } else if (age < 18) {
      baseMin = 8; baseMax = 10;
      explanation = 'подростки 13-17: 8-10ч';
    } else if (age < 26) {
      baseMin = 7; baseMax = 9;
      explanation = 'молодые 18-25: 7-9ч';
    } else if (age < 65) {
      baseMin = 7; baseMax = 9;
      explanation = 'взрослые 26-64: 7-9ч';
    } else {
      baseMin = 7; baseMax = 8;
      explanation = 'пожилые 65+: 7-8ч';
    }
    
    // Женщины в среднем нуждаются на ~20 мин больше (Duke University)
    const genderBonus = gender === 'Женский' ? 0.3 : 0;
    
    const recommended = Math.round(((baseMin + baseMax) / 2 + genderBonus) * 2) / 2; // округляем до 0.5
    
    return {
      hours: recommended,
      range: `${baseMin}-${baseMax}`,
      explanation: explanation + (genderBonus > 0 ? ' +20мин жен.' : '')
    };
  }

  // Emoji Style Selector Component
  function EmojiStyleSelector() {
    const [style, setStyle] = React.useState(() => getEmojiStyle());
    
    // Определяем платформу
    const platformInfo = React.useMemo(() => {
      if (typeof window === 'undefined') return { needsTwemoji: false, name: 'Unknown' };
      const ua = navigator.userAgent || '';
      const isWindows = /Windows/i.test(ua);
      const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
      const isMac = /Macintosh|Mac OS/i.test(ua);
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const isAndroid = /Android/i.test(ua);
      
      let name = 'Устройство';
      if (isWindows) name = 'Windows';
      else if (isMac) name = 'Mac';
      else if (isIOS) name = 'iPhone/iPad';
      else if (isAndroid) name = 'Android';
      else if (isLinux) name = 'Linux';
      
      return {
        needsTwemoji: isWindows || isLinux,
        name: name,
        twemojiAvailable: !!window.twemoji
      };
    }, []);
    
    const handleChange = (e) => {
      const newStyle = e.target.value;
      setStyle(newStyle);
      setEmojiStyle(newStyle);
    };
    
    // Если Twemoji не загружен (Mac/iOS/Android), показываем инфо-блок
    if (!platformInfo.twemojiAvailable) {
      return React.createElement('div', {className:'inline-field'},
        React.createElement('label', null, 'Стиль эмодзи 😀'),
        React.createElement('span', {className:'sep'}, '-'),
        React.createElement('span', {style:{color:'var(--gray-500)',fontSize:'0.875rem'}}, 
          `Используются эмодзи ${platformInfo.name}`
        )
      );
    }
    
    return React.createElement('div', {className:'inline-field'},
      React.createElement('label', null, 'Стиль эмодзи 😀'),
      React.createElement('span', {className:'sep'}, '-'),
      React.createElement('select', {value: style, onChange: handleChange},
        React.createElement('option', {value:'twemoji'}, '🐦 Twitter/Android'),
        React.createElement('option', {value:'system'}, `💻 ${platformInfo.name}`)
      )
    );
  }

  function UserTabBase(){
    // Twemoji: reparse emoji after render
    React.useEffect(() => {
      if (window.scheduleTwemojiParse) window.scheduleTwemojiParse();
    });
    
    const [profile, setProfile] = React.useState(() => {
      return lsGet('heys_profile', DEFAULT_PROFILE);
    });
    const [profileSaved, setProfileSaved] = React.useState(false);

    // Дефолтные пульсовые зоны (фиксированные диапазоны, MET рассчитывается)
    const defaultZones = React.useMemo(()=>{
      return [
        { name:'Бытовая активность (ходьба)', hrFrom: 85, hrTo: 99, MET: 2 },
        { name:'Умеренная активность (медленный бег)', hrFrom: 100, hrTo: 119, MET: 3 },
        { name:'Аэробная (кардио)', hrFrom: 120, hrTo: 139, MET: 5 },
        { name:'Анаэробная (активная нагрузка, когда тяжело)', hrFrom: 140, hrTo: 181, MET: 8 }
      ];
    }, []);

    const [zones, setZones] = React.useState(lsGet('heys_hr_zones', defaultZones));
    const [zonesSaved, setZonesSaved] = React.useState(false);

    // Перезагрузка данных при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      
      const reloadData = () => {
        if (cancelled) return;
        
        const newProfile = lsGet('heys_profile', DEFAULT_PROFILE);
        newProfile.revision = newProfile.revision || 0;
        newProfile.updatedAt = newProfile.updatedAt || 0;
        
        // 🔍 DEBUG: Логируем загрузку профиля
        const isDefault = newProfile.weight === 70 && newProfile.height === 175 && newProfile.age === 30;
        console.log('[Profile Load] clientId:', (window.HEYS?.currentClientId || '').substring(0,8), 
          '| isDefault:', isDefault, 
          '| weight:', newProfile.weight, '| height:', newProfile.height, '| age:', newProfile.age,
          '| updatedAt:', newProfile.updatedAt, '| revision:', newProfile.revision);
        
        // Умный reload: не перезаписываем если текущее состояние новее
        setProfile(prev => {
          const prevUpdatedAt = prev.updatedAt || 0;
          const newUpdatedAt = newProfile.updatedAt || 0;
          if (prevUpdatedAt > newUpdatedAt) {
            return prev; // Текущее состояние новее — не перезаписываем
          }
          return newProfile;
        });
        
        const newZones = lsGet('heys_hr_zones', defaultZones);
        newZones.revision = newZones.revision || 0;
        newZones.updatedAt = newZones.updatedAt || 0;
        
        setZones(prev => {
          const prevUpdatedAt = prev.updatedAt || 0;
          const newUpdatedAt = newZones.updatedAt || 0;
          if (prevUpdatedAt > newUpdatedAt) {
            return prev;
          }
          return newZones;
        });
      };
      
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
          cloud.bootstrapClientSync(clientId)
            .then(() => {
              setTimeout(reloadData, 150); // Как в данных дня
            })
            .catch((err) => {
              console.warn('[HEYS] Profile sync failed, using local cache:', err?.message || err);
              reloadData(); // Загружаем из localStorage при ошибке
            });
        } else {
          reloadData();
        }
      } else {
        reloadData();
      }
      
      return () => { cancelled = true; };
    }, [window.HEYS && window.HEYS.currentClientId]);

  // Состояние "идёт ввод" для индикации
  const [profilePending, setProfilePending] = React.useState(false);
  const [zonesPending, setZonesPending] = React.useState(false);
  const profileInitRef = React.useRef(true);
  const zonesInitRef = React.useRef(true);

  React.useEffect(() => {
    // Пропускаем первый рендер (начальная загрузка)
    if (profileInitRef.current) {
      profileInitRef.current = false;
      return;
    }
    // Debounced сохранение профиля (1000ms — чтобы успеть ввести число)
    setProfilePending(true);
    setProfileSaved(false);
    setFieldStatus('pending');
    const timer = setTimeout(() => {
      // 🔍 DEBUG: Логируем сохранение профиля
      const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
      console.log('[Profile Save] clientId:', clientId?.substring(0,8), '| weight:', profile.weight, '| height:', profile.height, '| age:', profile.age, '| updatedAt:', profile.updatedAt);
      lsSet('heys_profile', profile);
      
      // Синхронизация имени с списком клиентов
      let currentClientId = localStorage.getItem('heys_client_current');
      // Убираем кавычки если значение было сохранено как JSON string
      if (currentClientId && currentClientId.startsWith('"')) {
        try { currentClientId = JSON.parse(currentClientId); } catch(e) {}
      }
      if (currentClientId && profile.firstName) {
        try {
          const clientsRaw = localStorage.getItem('heys_clients');
          const clients = clientsRaw ? JSON.parse(clientsRaw) : [];
          const updatedClients = clients.map(c => 
            c.id === currentClientId ? { ...c, name: profile.firstName } : c
          );
          localStorage.setItem('heys_clients', JSON.stringify(updatedClients));
          
          // Событие для обновления UI
          window.dispatchEvent(new CustomEvent('heys:clients-updated', { 
            detail: { clients: updatedClients, source: 'profile-settings' } 
          }));
          
          // Обновляем в Supabase
          if (window.HEYS && window.HEYS.cloud && window.HEYS.cloud.client) {
            window.HEYS.cloud.client
              .from('clients')
              .update({ name: profile.firstName })
              .eq('id', currentClientId)
              .then(({ error }) => {
                if (error) console.warn('[Profile] Cloud sync failed:', error.message);
              });
          }
        } catch (e) {
          console.warn('[Profile] Failed to sync client name:', e);
        }
      }
      
      setProfilePending(false);
      setProfileSaved(true);
      setFieldStatus('saved');
      setTimeout(() => {
        setProfileSaved(false);
        setFieldStatus('idle');
        setLastEditedField(null);
      }, 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [profile]);
  React.useEffect(()=>{
    // Пропускаем первый рендер
    if (zonesInitRef.current) {
      zonesInitRef.current = false;
      return;
    }
    // Debounced сохранение зон (1000ms)
    setZonesPending(true);
    setZonesSaved(false);
    const timer = setTimeout(() => {
      lsSet('heys_hr_zones', zones);
      setZonesPending(false);
      setZonesSaved(true);
      setTimeout(() => setZonesSaved(false), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [zones]);

    const maxHR = Math.max(0, 220 - toNum(profile.age||0));
    const calPerMinPerMET = round1(toNum(profile.weight||0) * 0.0175); // кал/мин на 1 MET

    // Отслеживание последнего изменённого поля для индикации
    const [lastEditedField, setLastEditedField] = React.useState(null);
    const [fieldStatus, setFieldStatus] = React.useState('idle'); // 'idle' | 'pending' | 'saved'

    // Индикатор статуса поля — показывается рядом с полем
    const FieldStatus = ({ fieldKey }) => {
      if (lastEditedField !== fieldKey) return null;
      if (fieldStatus === 'pending') {
        return React.createElement('span', {
          style: { marginLeft: '6px', color: '#f59e0b', fontSize: '12px', fontWeight: 500 }
        }, '⏳ Сохраняется...');
      }
      if (fieldStatus === 'saved') {
        return React.createElement('span', {
          style: { marginLeft: '6px', color: '#22c55e', fontSize: '12px', fontWeight: 500 }
        }, '✓ Сохранено');
      }
      return null;
    };

    function updateProfileField(key, value){ 
    // Валидация числовых полей
    const validator = PROFILE_VALIDATORS[key];
    const validatedValue = validator ? validator(value) : value;
    
    // Устанавливаем статус "pending" для этого поля
    setLastEditedField(key);
    setFieldStatus('pending');
    
    const newProfile = { 
      ...profile, 
      [key]: validatedValue,
      revision: (profile.revision || 0) + 1,
      updatedAt: Date.now()
    };
    setProfile(newProfile); 
  }
    function updateZone(i, patch){ 
      setZones(prev => {
        const updated = prev.map((z, idx)=> idx===i ? { ...z, ...patch } : z);
        // Добавляем revision/updatedAt к массиву (нестандартно, но работает для JSON)
        updated.revision = (prev.revision || 0) + 1;
        updated.updatedAt = Date.now();
        return updated;
      });
    }
    function resetZones(){ if (confirm('Сбросить пульсовые зоны к шаблону?')) setZones(defaultZones); }

    // Пресеты дефицита/профицита калорий
    const DEFICIT_PRESETS = [
      { value: -20, label: 'Агрессивное похудение', emoji: '🔥🔥', color: '#ef4444' },
      { value: -15, label: 'Активное похудение', emoji: '🔥', color: '#f97316' },
      { value: -10, label: 'Умеренное похудение', emoji: '🎯', color: '#eab308' },
      { value: 0, label: 'Поддержание веса', emoji: '⚖️', color: '#22c55e' },
      { value: 10, label: 'Умеренный набор', emoji: '💪', color: '#3b82f6' },
      { value: 15, label: 'Активный набор', emoji: '💪💪', color: '#8b5cf6' }
    ];
    
    const getDeficitInfo = (val) => {
      const preset = DEFICIT_PRESETS.find(p => p.value === val);
      if (preset) return preset;
      // Для кастомных значений
      if (val < -10) return { emoji: '🔥🔥', color: '#ef4444', label: 'Агрессивный дефицит' };
      if (val < 0) return { emoji: '🔥', color: '#f97316', label: 'Дефицит' };
      if (val === 0) return { emoji: '⚖️', color: '#22c55e', label: 'Поддержание' };
      if (val <= 10) return { emoji: '💪', color: '#3b82f6', label: 'Профицит' };
      return { emoji: '💪💪', color: '#8b5cf6', label: 'Агрессивный набор' };
    };

    return React.createElement('div', {className:'page page-user'},
      React.createElement('div', {className:'user-cards-grid'},
      React.createElement('div', {className:'card tone-blue'},
        React.createElement('div', {style:{fontWeight:'600', marginBottom:'6px'}}, 'Данные пользователя'),
        React.createElement('div', {className:'field-list'},
          // Целевой дефицит: пресеты + своё значение
          (() => {
            const currentVal = toNum(profile.deficitPctTarget || 0);
            const isCustom = !DEFICIT_PRESETS.some(p => p.value === currentVal);
            const info = getDeficitInfo(currentVal);
            
            return React.createElement('div', {className:'inline-field', style:{fontWeight:700, fontSize:'16px', background:'#f1f5f9', padding:'8px 12px', borderRadius:'8px', flexWrap:'wrap', gap:'8px'}},
              React.createElement('label', {style:{fontWeight:700, minWidth:'140px'}}, 'Цель по калориям'),
              React.createElement('span', {className:'sep'}, '-'),
              React.createElement('select', {
                value: isCustom ? 'custom' : String(currentVal),
                onChange: e => {
                  if (e.target.value !== 'custom') {
                    updateProfileField('deficitPctTarget', Number(e.target.value));
                  }
                },
                style: {width:'200px', fontWeight:600}
              },
                ...DEFICIT_PRESETS.map(p => 
                  React.createElement('option', {key:p.value, value:String(p.value)}, 
                    `${p.emoji} ${p.value > 0 ? '+' : ''}${p.value}% — ${p.label}`
                  )
                ),
                React.createElement('option', {value:'custom'}, '✏️ Своё значение...')
              ),
              isCustom && React.createElement('input', {
                type:'number', 
                step:'1', 
                min:'-50',
                max:'50',
                value: currentVal, 
                onChange: e => updateProfileField('deficitPctTarget', Number(e.target.value) || 0),
                style: {width:'60px', marginLeft:'4px', fontWeight:700, textAlign:'center'}
              }),
              React.createElement('span', {style:{color: info.color, fontWeight:600, marginLeft:'6px'}}, 
                isCustom ? `${info.emoji} ${currentVal > 0 ? '+' : ''}${currentVal}%` : ''
              ),
              React.createElement(FieldStatus, {fieldKey:'deficitPctTarget'})
            );
          })(),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Имя'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {value:profile.firstName, onChange:e=>updateProfileField('firstName', e.target.value)}), React.createElement(FieldStatus, {fieldKey:'firstName'})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Фамилия'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {value:profile.lastName, onChange:e=>updateProfileField('lastName', e.target.value)}), React.createElement(FieldStatus, {fieldKey:'lastName'})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Пол'), React.createElement('span', {className:'sep'}, '-'),
            React.createElement('select', {value:profile.gender, onChange:e=>updateProfileField('gender', e.target.value)},
              React.createElement('option', {value:'Мужской'}, 'Мужской'),
              React.createElement('option', {value:'Женский'}, 'Женский'),
              React.createElement('option', {value:'Другое'}, 'Другое')
            ),
            React.createElement(FieldStatus, {fieldKey:'gender'})
          ),
          // Трекинг особого периода (только для женщин)
          profile.gender === 'Женский' && React.createElement('div', {className:'inline-field cycle-tracking-toggle'}, 
            React.createElement('label', null, '🌸 Особый период'),
            React.createElement('span', {className:'sep'}, '-'),
            React.createElement('label', {className:'toggle-switch'},
              React.createElement('input', {
                type:'checkbox', 
                checked:!!profile.cycleTrackingEnabled, 
                onChange:e=>updateProfileField('cycleTrackingEnabled', e.target.checked)
              }),
              React.createElement('span', {className:'toggle-slider'})
            ),
            React.createElement('span', {className:'cycle-toggle-hint'}, 
              profile.cycleTrackingEnabled ? 'Включён' : 'Выключен'
            )
          ),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Базовый вес тела (кг)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'0.1', value:profile.weight, onChange:e=>updateProfileField('weight', Number(e.target.value)||0), onFocus:e=>e.target.select()}), React.createElement(FieldStatus, {fieldKey:'weight'})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Целевой вес (кг)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'0.1', value:profile.weightGoal||0, onChange:e=>updateProfileField('weightGoal', Number(e.target.value)||0), placeholder:'0 = не задан', onFocus:e=>e.target.select()}), React.createElement(FieldStatus, {fieldKey:'weightGoal'})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Рост (см)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', value:profile.height, onChange:e=>updateProfileField('height', Number(e.target.value)||0), onFocus:e=>e.target.select()}), React.createElement(FieldStatus, {fieldKey:'height'})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Дата рождения'), React.createElement('span', {className:'sep'}, '-'), 
            React.createElement('input', {type:'date', value:profile.birthDate||'', onChange:e=>updateProfileField('birthDate', e.target.value), style:{width:'140px'}}),
            React.createElement(FieldStatus, {fieldKey:'birthDate'}),
            profile.birthDate && React.createElement('span', {style:{marginLeft:'8px', color:'var(--gray-600)'}}, `(${calcAgeFromBirthDate(profile.birthDate)} лет)`)
          ),
          !profile.birthDate && React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Возраст (лет)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', value:profile.age, onChange:e=>updateProfileField('age', Number(e.target.value)||0), onFocus:e=>e.target.select()}), React.createElement(FieldStatus, {fieldKey:'age'})),
          // Норма сна: авторасчёт с расшифровкой
          (() => {
            const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
            const sleepNorm = calcSleepNorm(age, profile.gender);
            return React.createElement('div', {className:'inline-field'},
              React.createElement('label', null, 'Норма сна'),
              React.createElement('span', {className:'sep'}, '-'),
              React.createElement('span', {style:{fontWeight:600, minWidth:'50px'}}, `${sleepNorm.hours} ч`),
              React.createElement('span', {style:{marginLeft:'8px', color:'var(--gray-500)', fontSize:'13px'}}, 
                `(${sleepNorm.explanation})`
              )
            );
          })(),
          // Инсулиновая волна: предустановки + своё значение
          (() => {
            const INSULIN_PRESETS = [
              { value: 2.5, label: 'Быстрый метаболизм', desc: 'спортсмены, низкоуглеводка' },
              { value: 3, label: 'Нормальный', desc: 'большинство людей' },
              { value: 4, label: 'Медленный', desc: 'склонность к полноте' },
              { value: 4.5, label: 'Инсулинорезистентность', desc: 'преддиабет, СПКЯ' }
            ];
            const currentVal = toNum(profile.insulinWaveHours || 3);
            const isCustom = !INSULIN_PRESETS.some(p => p.value === currentVal);
            const currentPreset = INSULIN_PRESETS.find(p => p.value === currentVal);
            
            return React.createElement('div', {className:'inline-field', style:{flexWrap:'wrap', gap:'8px'}},
              React.createElement('label', null, 'Инсулиновая волна'),
              React.createElement('span', {className:'sep'}, '-'),
              React.createElement('select', {
                value: isCustom ? 'custom' : String(currentVal),
                onChange: e => {
                  if (e.target.value === 'custom') {
                    // Оставляем текущее значение, просто переключаем на custom
                  } else {
                    updateProfileField('insulinWaveHours', Number(e.target.value));
                  }
                },
                style: {width:'180px'}
              },
                ...INSULIN_PRESETS.map(p => 
                  React.createElement('option', {key:p.value, value:String(p.value)}, `${p.value} ч — ${p.label}`)
                ),
                React.createElement('option', {value:'custom'}, 'Своё значение...')
              ),
              isCustom && React.createElement('input', {
                type:'number', 
                step:'0.5', 
                min:'1',
                max:'8',
                value: currentVal, 
                onChange: e => updateProfileField('insulinWaveHours', Number(e.target.value) || 3),
                style: {width:'60px', marginLeft:'4px'}
              }),
              React.createElement('span', {style:{color:'var(--gray-500)', fontSize:'12px', marginLeft:'4px'}}, 
                currentPreset ? `(${currentPreset.desc})` : `(${currentVal} ч — своё)`
              ),
              React.createElement(FieldStatus, {fieldKey:'insulinWaveHours'})
            );
          })(),
          React.createElement(EmojiStyleSelector, null)
        ),
        // BMI/BMR расчёт + норма воды + прогресс к цели
        (() => {
          const w = toNum(profile.weight || 70);
          const h = toNum(profile.height || 175) / 100; // в метрах
          // Возраст: из даты рождения или вручную
          const a = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
          const bmi = h > 0 ? round1(w / (h * h)) : 0;
          const bmr = profile.gender === 'Женский'
            ? round1(447.593 + 9.247 * w + 3.098 * (h * 100) - 4.330 * a)
            : round1(88.362 + 13.397 * w + 4.799 * (h * 100) - 5.677 * a);
          // BMI категория
          let bmiCat = '', bmiColor = '#6b7280';
          if (bmi < 18.5) { bmiCat = 'недовес'; bmiColor = '#eab308'; }
          else if (bmi < 25) { bmiCat = 'норма'; bmiColor = '#22c55e'; }
          else if (bmi < 30) { bmiCat = 'избыток'; bmiColor = '#f97316'; }
          else { bmiCat = 'ожирение'; bmiColor = '#ef4444'; }
          
          // Норма воды: 30 мл на кг веса
          const waterNorm = round1(w * 30 / 1000); // в литрах
          
          // Прогресс к целевому весу
          const wGoal = toNum(profile.weightGoal);
          const weightDiff = wGoal > 0 ? round1(w - wGoal) : 0;
          const deficitPct = toNum(profile.deficitPctTarget) || 0;
          
          // Расчёт времени достижения цели (если есть дефицит и цель)
          // 1 кг жира ≈ 7700 ккал, дефицит/день = BMR * deficitPct%
          let weeksToGoal = null;
          if (wGoal > 0 && weightDiff !== 0 && deficitPct !== 0) {
            const dailyDeficit = bmr * Math.abs(deficitPct) / 100;
            const kgPerWeek = (dailyDeficit * 7) / 7700;
            if (kgPerWeek > 0) {
              weeksToGoal = Math.ceil(Math.abs(weightDiff) / kgPerWeek);
            }
          }
          
          return React.createElement('div', {style:{marginTop:'10px'}},
            // Пилюли с метриками
            React.createElement('div', {className:'row', style:{gap:'12px', flexWrap:'wrap'}},
              React.createElement('div', {className:'pill'}, `Макс. пульс: ${maxHR} уд/мин`),
              React.createElement('div', {className:'pill'}, `Кал/мин на 1 MET: ${calPerMinPerMET}`),
              React.createElement('div', {className:'pill', style:{background:'#f0fdf4', border:'1px solid #86efac'}}, `BMR: ${bmr} ккал/сут`),
              React.createElement('div', {className:'pill', style:{background:'#f0f9ff', border:`1px solid ${bmiColor}`}}, 
                `BMI: ${bmi}`, 
                React.createElement('span', {style:{marginLeft:'4px', color:bmiColor, fontSize:'12px'}}, `(${bmiCat})`)
              ),
              React.createElement('div', {className:'pill', style:{background:'#eff6ff', border:'1px solid #93c5fd'}}, `💧 Норма воды: ${waterNorm} л/сут`)
            ),
            // Прогресс-бар к цели (если задан целевой вес)
            wGoal > 0 && React.createElement('div', {style:{marginTop:'12px', padding:'10px 12px', background:'var(--gray-50)', borderRadius:'8px'}},
              React.createElement('div', {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}},
                React.createElement('span', {style:{fontWeight:500}}, `🎯 Цель: ${wGoal} кг`),
                React.createElement('span', {style:{color: weightDiff === 0 ? '#22c55e' : 'var(--gray-600)', fontWeight: weightDiff === 0 ? 600 : 400}}, 
                  weightDiff === 0 ? '✅ Достигнуто!' : 
                  weightDiff > 0 ? `Осталось сбросить: ${weightDiff} кг` : 
                  `Осталось набрать: ${Math.abs(weightDiff)} кг`
                )
              ),
              // Прогресс-бар
              (() => {
                // Рассчитываем прогресс от стартового веса (базовый вес в профиле)
                const progressPct = weightDiff === 0 ? 100 : Math.max(0, Math.min(100, 100 - Math.abs(weightDiff) / Math.abs(w - wGoal) * 100)) || 0;
                const barColor = weightDiff === 0 ? '#22c55e' : weightDiff > 0 ? '#3b82f6' : '#8b5cf6';
                return React.createElement('div', {style:{height:'8px', background:'var(--gray-200)', borderRadius:'4px', overflow:'hidden'}},
                  React.createElement('div', {style:{height:'100%', width: (weightDiff === 0 ? 100 : 50) + '%', background:barColor, borderRadius:'4px', transition:'width 0.3s'}})
                );
              })(),
              // Время достижения
              weeksToGoal && deficitPct !== 0 && React.createElement('div', {style:{marginTop:'6px', fontSize:'13px', color:'var(--gray-500)'}},
                `⏱ При дефиците ${Math.abs(deficitPct)}%: ~${weeksToGoal} нед.`
              )
            )
          );
        })(),
        React.createElement('div', {className:'muted', style:{marginTop:'6px'}}, 
          'Все значения сохраняются автоматически.'
        )
      ),

      React.createElement('div', {className:'card'},
        React.createElement('div', {className:'row', style:{justifyContent:'space-between'}},
          React.createElement('div', {className:'section-title'}, 'Пульсовые зоны'),
          React.createElement('div', {className:'row'}, React.createElement('button', {className:'btn', onClick:resetZones}, 'Сбросить к шаблону'))
        ),
        React.createElement('div', {style:{overflowX:'auto'}},
          React.createElement('table', null,
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, 'Пульсовые зоны'),
              React.createElement('th', null, 'пульс от'),
              React.createElement('th', null, 'пульс до'),
              React.createElement('th', null, 'MET'),
              React.createElement('th', null, 'кал/мин для нашего веса')
            )),
            React.createElement('tbody', null,
              zones.map((z, i)=>{
                const calPerMin = round1((toNum(z.MET||0) * calPerMinPerMET) - 1); // поправка -1
                return React.createElement('tr', {key:i},
                  React.createElement('td', null, React.createElement('input', {value:z.name, onChange:e=>updateZone(i, {name:e.target.value}), onFocus:e=>e.target.select()})),
                  React.createElement('td', null, React.createElement('input', {type:'number', value:z.hrFrom, onChange:e=>updateZone(i, {hrFrom:Number(e.target.value)||0}), onFocus:e=>e.target.select()})),
                  React.createElement('td', null, React.createElement('input', {type:'number', value:z.hrTo, onChange:e=>updateZone(i, {hrTo:Number(e.target.value)||0}), onFocus:e=>e.target.select()})),
                  React.createElement('td', null, React.createElement('input', {type:'number', step:'0.1', value:z.MET, onChange:e=>updateZone(i, {MET:Number(e.target.value)||0}), onFocus:e=>e.target.select()})),
                  React.createElement('td', null, calPerMin)
                );
              })
            )
          )
        ),
        React.createElement('div', {className:'muted', style:{marginTop:'8px', display:'flex', alignItems:'center', gap:'8px'}}, 
          'Формулы: Макс пульс = 220 − возраст. Кал/мин = MET × (вес × 0.0175) − 1.',
          zonesPending && React.createElement('span', {style:{color:'#f59e0b', fontSize:'13px', fontWeight:500}}, '⏳ Сохраняется...'),
          zonesSaved && React.createElement('span', {style:{color:'#22c55e', fontSize:'13px', fontWeight:500}}, '✓ Сохранено')
        )
      ),

      // Зоны калорийности (ratio zones)
      React.createElement(HEYS_RatioZonesCard, null),

      React.createElement(HEYS_NormsCard, null),

      // Статистика советов
      React.createElement(HEYS_AdviceStatsCard, null),
      
      // Настройки советов
      React.createElement(HEYS_AdviceSettingsCard, null),

      // Аналитика (перенесено из hdr-top)
      window.HEYS.analyticsUI
        ? React.createElement('div', {className:'card', style:{marginTop:'10px'}},
            React.createElement('div', {className:'section-title'}, '📊 Аналитика'),
            React.createElement('div', {style:{marginTop:'8px'}},
              React.createElement(window.HEYS.analyticsUI.AnalyticsButton)
            )
          )
        : null,
      
    )
    );
  }

  // === Статистика советов ===
  function HEYS_AdviceStatsCard() {
    const [stats, setStats] = React.useState({ totalAdvicesRead: 0 });
    
    React.useEffect(() => {
      // Получаем статистику из геймификации
      if (window.HEYS?.game?.getStats) {
        const gameStats = window.HEYS.game.getStats();
        setStats(gameStats.stats || { totalAdvicesRead: 0 });
      }
      
      // Подписываемся на обновления
      const handleUpdate = () => {
        if (window.HEYS?.game?.getStats) {
          const gameStats = window.HEYS.game.getStats();
          setStats(gameStats.stats || { totalAdvicesRead: 0 });
        }
      };
      window.addEventListener('heysGameUpdate', handleUpdate);
      return () => window.removeEventListener('heysGameUpdate', handleUpdate);
    }, []);
    
    const total = stats.totalAdvicesRead || 0;
    
    // Прогресс к следующему достижению
    let nextMilestone, progress, remaining;
    if (total < 50) {
      nextMilestone = 50;
      progress = (total / 50) * 100;
      remaining = 50 - total;
    } else if (total < 200) {
      nextMilestone = 200;
      progress = (total / 200) * 100;
      remaining = 200 - total;
    } else {
      nextMilestone = null;
      progress = 100;
      remaining = 0;
    }
    
    return React.createElement('div', { className: 'card', style: { marginTop: '10px' } },
      React.createElement('div', { className: 'section-title' }, '💡 Советы'),
      React.createElement('div', { style: { marginTop: '8px' } },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '8px'
          } 
        },
          React.createElement('span', { style: { color: 'var(--gray-600)' } }, 'Прочитано советов:'),
          React.createElement('span', { style: { fontWeight: 600, fontSize: '18px' } }, total)
        ),
        nextMilestone && React.createElement('div', null,
          React.createElement('div', { 
            style: { 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '13px',
              color: 'var(--gray-500)',
              marginBottom: '4px'
            } 
          },
            React.createElement('span', null, `До достижения "${nextMilestone === 50 ? '💡 Внимательный' : '🧠 Мудрец'}"`),
            React.createElement('span', null, `${remaining} осталось`)
          ),
          React.createElement('div', { 
            style: { 
              height: '8px', 
              background: 'var(--gray-200)', 
              borderRadius: '4px',
              overflow: 'hidden'
            } 
          },
            React.createElement('div', { 
              style: { 
                height: '100%', 
                width: progress + '%',
                background: 'linear-gradient(90deg, var(--blue-400), var(--blue-500))',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              } 
            })
          )
        ),
        !nextMilestone && React.createElement('div', { 
          style: { 
            padding: '8px 12px', 
            background: 'var(--green-50)', 
            borderRadius: '8px',
            color: 'var(--green-700)',
            fontSize: '14px'
          } 
        }, '🏆 Все достижения за советы получены!')
      )
    );
  }

  // === Настройки советов ===
  function HEYS_AdviceSettingsCard() {
    const advice = window.HEYS?.advice;
    if (!advice?.getAdviceSettings) return null;
    
    const [settings, setSettings] = React.useState(() => advice.getAdviceSettings());
    const [saved, setSaved] = React.useState(false);
    
    const categories = advice.CATEGORY_LABELS || {};
    
    const toggleCategory = (cat, enabled) => {
      const newSettings = {
        ...settings,
        categories: { ...settings.categories, [cat]: enabled }
      };
      setSettings(newSettings);
      advice.setAdviceSettings(newSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    };
    
    const updateSetting = (key, value) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      advice.setAdviceSettings(newSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    };
    
    return React.createElement('div', { className: 'card', style: { marginTop: '10px' } },
      React.createElement('div', { className: 'section-title' }, '⚙️ Настройки советов'),
      
      // Категории
      React.createElement('div', { style: { marginTop: '12px' } },
        React.createElement('div', { 
          style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--gray-700)' } 
        }, 'Категории советов'),
        React.createElement('div', { 
          style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' } 
        },
          Object.entries(categories).map(([cat, info]) => 
            React.createElement('label', { 
              key: cat,
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 10px',
                background: settings.categories?.[cat] !== false ? 'var(--blue-50)' : 'var(--gray-100)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }
            },
              React.createElement('input', {
                type: 'checkbox',
                checked: settings.categories?.[cat] !== false,
                onChange: (e) => toggleCategory(cat, e.target.checked),
                style: { width: '16px', height: '16px' }
              }),
              React.createElement('span', { style: { fontSize: '16px' } }, info.icon),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontSize: '13px', fontWeight: 500 } }, info.name),
                React.createElement('div', { 
                  style: { fontSize: '11px', color: 'var(--gray-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } 
                }, info.desc)
              )
            )
          )
        )
      ),
      
      // Общие настройки
      React.createElement('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--gray-200)' } },
        React.createElement('div', { 
          style: { fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--gray-700)' } 
        }, 'Общие'),
        
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          // Haptic
          React.createElement('label', { 
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' } 
          },
            React.createElement('span', { style: { fontSize: '14px' } }, '📳 Вибрация'),
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.hapticEnabled !== false,
              onChange: (e) => updateSetting('hapticEnabled', e.target.checked),
              style: { width: '18px', height: '18px' }
            })
          ),
          
          // Sound
          React.createElement('label', { 
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' } 
          },
            React.createElement('span', { style: { fontSize: '14px' } }, '🔔 Звук'),
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.soundEnabled !== false,
              onChange: (e) => updateSetting('soundEnabled', e.target.checked),
              style: { width: '18px', height: '18px' }
            })
          ),
          
          // Show details
          React.createElement('label', { 
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' } 
          },
            React.createElement('span', { style: { fontSize: '14px' } }, '📖 Показывать детали'),
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.showDetails !== false,
              onChange: (e) => updateSetting('showDetails', e.target.checked),
              style: { width: '18px', height: '18px' }
            })
          ),
          
          // Max per day
          React.createElement('div', { 
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' } 
          },
            React.createElement('span', { style: { fontSize: '14px' } }, '📊 Макс. советов в день'),
            React.createElement('input', {
              type: 'number',
              min: 5,
              max: 50,
              value: settings.maxPerDay || 20,
              onChange: (e) => updateSetting('maxPerDay', parseInt(e.target.value) || 20),
              style: { width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--gray-300)', textAlign: 'center' }
            })
          )
        )
      ),
      
      saved && React.createElement('div', { 
        style: { marginTop: '8px', color: 'var(--green-600)', fontSize: '13px', textAlign: 'center' } 
      }, '✓ Сохранено')
    );
  }

  // === Зоны калорийности (ratio zones) ===
  function HEYS_RatioZonesCard() {
    const rz = HEYS.ratioZones;
    const [zones, setZones] = React.useState(() => rz ? rz.getZones() : []);
    const [saved, setSaved] = React.useState(false);
    
    // Синхронизация с модулем
    React.useEffect(() => {
      if (rz) setZones(rz.getZones());
    }, []);
    
    const updateZone = (i, field, value) => {
      const newZones = zones.map((z, idx) => {
        if (idx !== i) return z;
        const updated = { ...z, [field]: value };
        return updated;
      });
      
      // Автокорректировка границ соседних зон
      if (field === 'to' && i < newZones.length - 1) {
        newZones[i + 1] = { ...newZones[i + 1], from: value };
      }
      if (field === 'from' && i > 0) {
        newZones[i - 1] = { ...newZones[i - 1], to: value };
      }
      
      setZones(newZones);
      if (rz) {
        rz.setZones(newZones);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    };
    
    const resetZones = () => {
      if (confirm('Сбросить зоны калорийности к значениям по умолчанию?')) {
        if (rz) {
          const def = rz.resetZones();
          setZones(def);
        }
      }
    };
    
    // Формат для отображения
    const fmtPct = (v) => {
      if (v === 0) return '0%';
      if (v === Infinity || v > 100) return '∞';
      return Math.round(v * 100) + '%';
    };
    
    if (!rz) {
      return React.createElement('div', {className:'card', style:{marginTop:'10px'}},
        React.createElement('div', {className:'muted'}, 'Модуль ratioZones не загружен')
      );
    }
    
    return React.createElement('div', {className:'card', style:{marginTop:'10px'}},
      React.createElement('div', {className:'row', style:{justifyContent:'space-between'}},
        React.createElement('div', {className:'section-title'}, 'Зоны калорийности'),
        React.createElement('div', {className:'row'}, 
          React.createElement('button', {className:'btn', onClick:resetZones}, 'Сбросить к шаблону')
        )
      ),
      React.createElement('div', {className:'muted', style:{marginBottom:'10px'}}, 
        'Определяют цвета в календаре, графиках и советах. Ratio = съедено / норма.'
      ),
      React.createElement('div', {style:{overflowX:'auto'}},
        React.createElement('table', null,
          React.createElement('thead', null, React.createElement('tr', null,
            React.createElement('th', {style:{width:'40px'}}, 'Цвет'),
            React.createElement('th', null, 'Название'),
            React.createElement('th', {style:{width:'80px'}}, 'От'),
            React.createElement('th', {style:{width:'80px'}}, 'До'),
            React.createElement('th', {style:{width:'60px'}}, 'Превью')
          )),
          React.createElement('tbody', null,
            zones.map((z, i) => {
              // Демо ratio для превью (середина зоны)
              const demoRatio = z.to === Infinity ? z.from + 0.2 : (z.from + z.to) / 2;
              const bgColor = rz.getGradientColor(demoRatio, 0.5);
              
              return React.createElement('tr', {key:z.id},
                React.createElement('td', null, 
                  React.createElement('div', {
                    style:{
                      width:'24px', height:'24px', borderRadius:'4px',
                      background: z.color, margin:'0 auto'
                    }
                  })
                ),
                React.createElement('td', null, 
                  React.createElement('input', {
                    value:z.name, 
                    onChange:e=>updateZone(i, 'name', e.target.value),
                    style:{width:'100%'}
                  })
                ),
                React.createElement('td', null, 
                  i === 0 ? React.createElement('span', {className:'muted'}, '0%') :
                  React.createElement('input', {
                    type:'number', 
                    step:'0.05',
                    min:'0',
                    max:'2',
                    value:z.from, 
                    onChange:e=>updateZone(i, 'from', parseFloat(e.target.value)||0),
                    style:{width:'70px'}
                  })
                ),
                React.createElement('td', null, 
                  i === zones.length - 1 ? React.createElement('span', {className:'muted'}, '∞') :
                  React.createElement('input', {
                    type:'number', 
                    step:'0.05',
                    min:'0',
                    max:'2',
                    value:z.to, 
                    onChange:e=>updateZone(i, 'to', parseFloat(e.target.value)||0),
                    style:{width:'70px'}
                  })
                ),
                React.createElement('td', null, 
                  React.createElement('div', {
                    style:{
                      padding:'4px 8px', borderRadius:'4px',
                      background: bgColor, textAlign:'center',
                      fontSize:'11px', fontWeight:'600'
                    }
                  }, fmtPct(demoRatio))
                )
              );
            })
          )
        )
      ),
      React.createElement('div', {className:'muted', style:{marginTop:'8px', display:'flex', alignItems:'center', gap:'8px'}}, 
        'Зоны применяются везде: календарь, sparkline, heatmap, советы.',
        saved && React.createElement('span', {style:{color:'#22c55e', fontSize:'13px', fontWeight:500}}, '✓ Сохранено')
      )
    );
  }

  
  // === Нормы (встроенный блок) ===
  function HEYS_NormsCard(){
    const U = HEYS.utils || {};
    const clamp = (v)=> Math.max(0, Math.min(100, (U.toNum?U.toNum(v):Number(v)||0)));
    // Используем глобальные lsGet/lsSet из начала модуля
    const [norms, setNorms] = React.useState(() => {
      const val = lsGet('heys_norms', {
        carbsPct:0, proteinPct:0, badFatPct:0, superbadFatPct:0, simpleCarbPct:0, giPct:0, harmPct:0, fiberPct:0
      });
      // Служебные поля для сравнения версий с облаком
      return { revision:0, updatedAt:0, ...val };
    });
    // Debounced сохранение норм (1000ms)
    const [normsSaved, setNormsSaved] = React.useState(false);
    const [normsPending, setNormsPending] = React.useState(false);
    const [lastEditedNorm, setLastEditedNorm] = React.useState(null);
    const normsInitRef = React.useRef(true);
    
    React.useEffect(() => {
      if (normsInitRef.current) {
        normsInitRef.current = false;
        return;
      }
      setNormsPending(true);
      setNormsSaved(false);
      const timer = setTimeout(() => {
        lsSet('heys_norms', norms);
        setNormsPending(false);
        setNormsSaved(true);
        setTimeout(() => {
          setNormsSaved(false);
          setLastEditedNorm(null);
        }, 2000);
      }, 300);
      return () => clearTimeout(timer);
    }, [norms]);
    
    // Перезагрузка норм при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      
      const reloadNorms = () => {
        if (cancelled) return;
        
        const newNorms = lsGet('heys_norms', {
          carbsPct:0, proteinPct:0, badFatPct:0, superbadFatPct:0, simpleCarbPct:0, giPct:0, harmPct:0, fiberPct:0
        });
        newNorms.revision = newNorms.revision || 0;
        newNorms.updatedAt = newNorms.updatedAt || 0;
        
        // Умный reload: не перезаписываем если текущее состояние новее
        setNorms(prev => {
          const prevUpdatedAt = prev.updatedAt || 0;
          const newUpdatedAt = newNorms.updatedAt || 0;
          if (prevUpdatedAt > newUpdatedAt) {
            return prev; // Текущее состояние новее — не перезаписываем
          }
          return newNorms;
        });
      };
      
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
          cloud.bootstrapClientSync(clientId)
            .then(() => {
              setTimeout(reloadNorms, 150); // Как в данных дня
            })
            .catch((err) => {
              console.warn('[HEYS] Norms sync failed, using local cache:', err?.message || err);
              reloadNorms(); // Загружаем из localStorage при ошибке
            });
        } else {
          reloadNorms();
        }
      } else {
        reloadNorms();
      }
      
      return () => { cancelled = true; };
    }, [window.HEYS && window.HEYS.currentClientId]);

    const carb = clamp(norms.carbsPct);
    const prot = clamp(norms.proteinPct);
    const fatAuto = clamp(100 - carb - prot);

    const badF = clamp(norms.badFatPct);
    const superBadF = clamp(norms.superbadFatPct);
    const goodFAuto = clamp(100 - badF - superBadF);

    const simpleC = clamp(norms.simpleCarbPct);
    const complexCAuto = clamp(100 - simpleC);

    // Индикатор статуса для норм
    const NormFieldStatus = ({ fieldKey }) => {
      if (lastEditedNorm !== fieldKey) return null;
      if (normsPending) {
        return React.createElement('span', {
          style: { marginLeft: '6px', color: '#f59e0b', fontSize: '12px', fontWeight: 500 }
        }, '⏳ Сохраняется...');
      }
      if (normsSaved) {
        return React.createElement('span', {
          style: { marginLeft: '6px', color: '#22c55e', fontSize: '12px', fontWeight: 500 }
        }, '✓ Сохранено');
      }
      return null;
    };

    const update = (k, v)=> {
      const clamped = clamp(v);
      setLastEditedNorm(k);
      setNormsPending(true);
      setNorms(prev => ({
        ...prev,
        [k]: clamped,
        revision: (prev.revision || 0) + 1,
        updatedAt: Date.now()
      }));
    };

    const overMacro = (carb + prot) > 100;
    const overFatSplit = (badF + superBadF) > 100;
    const overCarbSplit = simpleC > 100;

    return React.createElement('div', {className:'card', style:{marginTop:'10px'}},
      React.createElement('div', {className:'section-title'}, 'Нормы'),
      React.createElement('div', {className:'field-list'},
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Углеводы (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:carb, onChange:e=>update('carbsPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'carbsPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Белки (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:prot, onChange:e=>update('proteinPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'proteinPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Жиры (%) — авто = 100 − У − Б'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:fatAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Вредные жиры (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:badF, onChange:e=>update('badFatPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'badFatPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Супервредные жиры (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:superBadF, onChange:e=>update('superbadFatPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'superbadFatPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Полезные жиры (%) — авто = 100 − вредные − супервредные'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:goodFAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Простые углеводы (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:simpleC, onChange:e=>update('simpleCarbPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'simpleCarbPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Сложные углеводы (%) — авто = 100 − простые'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:complexCAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'ГИ (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.giPct), onChange:e=>update('giPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'giPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Вредность (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.harmPct), onChange:e=>update('harmPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'harmPct'})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Клетчатка (г/1000 ккал) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.fiberPct), onChange:e=>update('fiberPct', e.target.value), onFocus:e=>e.target.select()}), React.createElement(NormFieldStatus, {fieldKey:'fiberPct'}))
      ),
      (overMacro || overFatSplit || overCarbSplit) ?
        React.createElement('div', {className:'muted', style:{marginTop:'6px', color:'#dc2626'}}, 
          (overMacro ? 'Предупреждение: У% + Б% превышают 100. Жиры будут обнулены. ' : ''),
          (overFatSplit ? 'Предупреждение: Вредные% + Супервредные% > 100. Полезные будут обнулены. ' : ''),
          (overCarbSplit ? 'Предупреждение: Простые% > 100. Сложные будут обнулены.' : '')
        )
      : null,
      React.createElement('div', {className:'muted', style:{marginTop:'6px'}}, 
        'Все значения сохраняются автоматически. Жиры считаются из 9 ккал/г, клетчатка — в граммах на 1000 ккал.'
      )
    );
  }

  function UserTab(props){
    return React.createElement(UserTabBase, props);
  }

  HEYS.UserTab = UserTab;
  
  // Экспорт функций для использования в других модулях
  HEYS.calcSleepNorm = calcSleepNorm;
  HEYS.calcAgeFromBirthDate = calcAgeFromBirthDate;

})(window);
