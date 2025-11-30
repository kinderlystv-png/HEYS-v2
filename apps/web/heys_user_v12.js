// heys_user_v12.js — User profile, BMI/BMR calculations, HR zones
(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const { lsGet, lsSet, toNum, round1 } = HEYS.utils || {
    lsGet:(k,d)=>d, lsSet:()=>{}, toNum:(x)=>Number(x)||0, round1:(v)=>Math.round(v*10)/10
  };

  function UserTabBase(){
    const [profile, setProfile] = React.useState(() => {
      return lsGet('heys_profile', {
        firstName:'', lastName:'', gender:'Мужской',
        weight:70, height:175, age:30,
        sleepHours:8, insulinWaveHours:3
      });
    });

    const defaultZones = React.useMemo(()=>{
      const maxHR = Math.max(0, 220 - toNum(profile.age||0));
      const z = (fromPct, toPct) => ({ hrFrom: Math.round(maxHR * fromPct), hrTo: Math.round(maxHR * toPct) });
      return [
        { name:'Бытовая активность (ходьба)', ...z(0.5,0.6), MET:2.5 },
        { name:'Умеренная активность (медленный бег)', ...z(0.6,0.75), MET:6 },
        { name:'Аэробная (кардио)', ...z(0.75,0.85), MET:8 },
        { name:'Анаэробная (активная нагрузка, когда тяжело)', ...z(0.85,0.95), MET:10 }
      ];
    }, [profile.age]);

    const [zones, setZones] = React.useState(lsGet('heys_hr_zones', defaultZones));

    // Перезагрузка данных при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      
      const reloadData = () => {
        if (cancelled) return;
        // Тихая перезагрузка данных профиля
        
        const newProfile = lsGet('heys_profile', {
          firstName:'', lastName:'', gender:'Мужской',
          weight:70, height:175, age:30,
          sleepHours:8, insulinWaveHours:3
        });
        // Тихая загрузка профиля
        setProfile(newProfile);
        
        const newZones = lsGet('heys_hr_zones', defaultZones);
        // Тихая загрузка зон
        setZones(newZones);
      };
      
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
          cloud.bootstrapClientSync(clientId).then(() => {
            setTimeout(reloadData, 150); // Как в данных дня
          });
        } else {
          reloadData();
        }
      } else {
        reloadData();
      }
      
      return () => { cancelled = true; };
    }, [window.HEYS && window.HEYS.currentClientId]);

  React.useEffect(() => {
    // Тихое сохранение профиля без логов
    lsSet('heys_profile', profile);
  }, [profile]);
  React.useEffect(()=>{
    // Тихое сохранение зон без логов
    lsSet('heys_hr_zones', zones);
  }, [zones]);

    const maxHR = Math.max(0, 220 - toNum(profile.age||0));
    const calPerMinPerMET = round1(toNum(profile.weight||0) * 0.0175); // кал/мин на 1 MET

    function updateProfileField(key, value){ 
    const newProfile = { ...profile, [key]: value };
    setProfile(newProfile); 
    
    // Minimal logging for critical updates only
    if (key === 'height' || key === 'weight' || key === 'firstName' || key === 'lastName') {
      DEV.log(`[Profile] ${key} updated:`, value);
    }
  }
    function updateZone(i, patch){ setZones(zones.map((z, idx)=> idx===i ? { ...z, ...patch } : z)); }
    function resetZones(){ if (confirm('Сбросить пульсовые зоны к шаблону?')) setZones(defaultZones); }

    return React.createElement('div', {className:'page page-user'},
      React.createElement('div', {className:'user-cards-grid'},
      React.createElement('div', {className:'card tone-blue'},
        React.createElement('div', {style:{fontWeight:'600', marginBottom:'6px'}}, 'Данные пользователя'),
        React.createElement('div', {className:'field-list'},
            React.createElement('div', {className:'inline-field', style:{fontWeight:700,fontSize:'16px',background:'#f1f5f9',padding:'6px 10px',borderRadius:'8px'}}, React.createElement('label', {style:{fontWeight:700,minWidth:'180px'}}, 'Целевой дефицит (%)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'1', value:profile.deficitPctTarget||0, onChange:e=>updateProfileField('deficitPctTarget', Number(e.target.value)||0), style:{width:'70px',fontWeight:700,fontSize:'16px',textAlign:'center'}})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Имя'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {value:profile.firstName, onChange:e=>updateProfileField('firstName', e.target.value)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Фамилия'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {value:profile.lastName, onChange:e=>updateProfileField('lastName', e.target.value)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Пол'), React.createElement('span', {className:'sep'}, '-'),
            React.createElement('select', {value:profile.gender, onChange:e=>updateProfileField('gender', e.target.value)},
              React.createElement('option', {value:'Мужской'}, 'Мужской'),
              React.createElement('option', {value:'Женский'}, 'Женский'),
              React.createElement('option', {value:'Другое'}, 'Другое')
            )
          ),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Базовый вес тела (кг)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'0.1', value:profile.weight, onChange:e=>updateProfileField('weight', Number(e.target.value)||0)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Рост (см)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', value:profile.height, onChange:e=>updateProfileField('height', Number(e.target.value)||0)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Возраст (лет)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', value:profile.age, onChange:e=>updateProfileField('age', Number(e.target.value)||0)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Норма сна (часов)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'0.5', value:profile.sleepHours, onChange:e=>updateProfileField('sleepHours', Number(e.target.value)||0)})),
          React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Инсулиновая волна (часов)'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', step:'0.5', value:profile.insulinWaveHours, onChange:e=>updateProfileField('insulinWaveHours', Number(e.target.value)||0)}))
        ),
        React.createElement('div', {className:'row', style:{marginTop:'10px', gap:'20px'}},
          React.createElement('div', {className:'pill'}, `Максимальный пульс: ${maxHR} уд/мин (220 - возраст)`),
          React.createElement('div', {className:'pill'}, `Кал/мин на 1 MET: ${calPerMinPerMET}`)
        ),
        React.createElement('div', {className:'muted', style:{marginTop:'6px'}}, 'Все значения сохраняются автоматически.')
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
                  React.createElement('td', null, React.createElement('input', {value:z.name, onChange:e=>updateZone(i, {name:e.target.value})})),
                  React.createElement('td', null, React.createElement('input', {type:'number', value:z.hrFrom, onChange:e=>updateZone(i, {hrFrom:Number(e.target.value)||0})})),
                  React.createElement('td', null, React.createElement('input', {type:'number', value:z.hrTo, onChange:e=>updateZone(i, {hrTo:Number(e.target.value)||0})})),
                  React.createElement('td', null, React.createElement('input', {type:'number', step:'0.1', value:z.MET, onChange:e=>updateZone(i, {MET:Number(e.target.value)||0})})),
                  React.createElement('td', null, calPerMin)
                );
              })
            )
          )
        ),
        React.createElement('div', {className:'muted', style:{marginTop:'8px'}}, 'Формулы: Макс пульс = 220 − возраст. Кал/мин = MET × (вес × 0.0175) − 1.')
      ),

      // Зоны калорийности (ratio zones)
      React.createElement(HEYS_RatioZonesCard, null),

      React.createElement(HEYS_NormsCard, null),
      
    )
    );
  }

  // === Зоны калорийности (ratio zones) ===
  function HEYS_RatioZonesCard() {
    const rz = HEYS.ratioZones;
    const [zones, setZones] = React.useState(() => rz ? rz.getZones() : []);
    
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
      if (rz) rz.setZones(newZones);
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
      React.createElement('div', {className:'muted', style:{marginTop:'8px'}}, 
        'Зоны применяются везде: календарь, sparkline, heatmap, советы. Границы соседних зон автоматически синхронизируются.'
      )
    );
  }

  
  // === Нормы (встроенный блок) ===
  function HEYS_NormsCard(){
    const U = HEYS.utils || {};
    const clamp = (v)=> Math.max(0, Math.min(100, (U.toNum?U.toNum(v):Number(v)||0)));
    const lsGet = U.lsGet || ((k,d)=>d);
    const lsSet = U.lsSet || (()=>{});
    const [norms, setNorms] = React.useState(() => {
      const val = lsGet('heys_norms', {
        carbsPct:0, proteinPct:0, badFatPct:0, superbadFatPct:0, simpleCarbPct:0, giPct:0, harmPct:0, fiberPct:0
      });
      return val;
    });
    // Больше не подгружаем нормы из облака при каждом рендере — только при смене клиента (bootstrapClientSync вызывается в index.html)
    React.useEffect(() => {
      // Тихое сохранение норм без логов
      lsSet('heys_norms', norms);
    }, [norms]);
    
    // Перезагрузка норм при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      
      const reloadNorms = () => {
        if (cancelled) return;
        // Тихая перезагрузка норм
        
        const newNorms = lsGet('heys_norms', {
          carbsPct:0, proteinPct:0, badFatPct:0, superbadFatPct:0, simpleCarbPct:0, giPct:0, harmPct:0, fiberPct:0
        });
        // Тихая загрузка норм
        setNorms(newNorms);
      };
      
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
          cloud.bootstrapClientSync(clientId).then(() => {
            setTimeout(reloadNorms, 150); // Как в данных дня
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

    const update = (k, v)=> setNorms({...norms, [k]: clamp(v)});

    const overMacro = (carb + prot) > 100;
    const overFatSplit = (badF + superBadF) > 100;
    const overCarbSplit = simpleC > 100;

    return React.createElement('div', {className:'card', style:{marginTop:'10px'}},
      React.createElement('div', {className:'section-title'}, 'Нормы'),
      React.createElement('div', {className:'field-list'},
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Углеводы (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:carb, onChange:e=>update('carbsPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Белки (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:prot, onChange:e=>update('proteinPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Жиры (%) — авто = 100 − У − Б'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:fatAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Вредные жиры (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:badF, onChange:e=>update('badFatPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Супервредные жиры (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:superBadF, onChange:e=>update('superbadFatPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Полезные жиры (%) — авто = 100 − вредные − супервредные'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:goodFAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Простые углеводы (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:simpleC, onChange:e=>update('simpleCarbPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Сложные углеводы (%) — авто = 100 − простые'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {className:'readOnly', readOnly:true, value:complexCAuto})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'ГИ (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.giPct), onChange:e=>update('giPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Вредность (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.harmPct), onChange:e=>update('harmPct', e.target.value)})),
        React.createElement('div', {className:'inline-field'}, React.createElement('label', null, 'Клетчатка (%) — вручную'), React.createElement('span', {className:'sep'}, '-'), React.createElement('input', {type:'number', min:0, max:100, step:'1', value:clamp(norms.fiberPct), onChange:e=>update('fiberPct', e.target.value)}))
      ),
      (overMacro || overFatSplit || overCarbSplit) ?
        React.createElement('div', {className:'muted', style:{marginTop:'6px', color:'#dc2626'}}, 
          (overMacro ? 'Предупреждение: У% + Б% превышают 100. Жиры будут обнулены. ' : ''),
          (overFatSplit ? 'Предупреждение: Вредные% + Супервредные% > 100. Полезные будут обнулены. ' : ''),
          (overCarbSplit ? 'Предупреждение: Простые% > 100. Сложные будут обнулены.' : '')
        )
      : null,
      React.createElement('div', {className:'muted', style:{marginTop:'6px'}}, 'Все значения — в процентах, сохраняются автоматически.')
    );
  }

  function UserTab(props){
    return React.createElement(UserTabBase, props);
  }

  HEYS.UserTab = UserTab;

})(window);
