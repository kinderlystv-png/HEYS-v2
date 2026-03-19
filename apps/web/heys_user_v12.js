// heys_user_v12.js — proxy to heys_user_tab_impl_v1.js
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.UserTabImpl && typeof HEYS.UserTabImpl.createUserTab === 'function') {
    HEYS.UserTab = HEYS.UserTabImpl.createUserTab();
    HEYS.calcSleepNorm = HEYS.calcSleepNorm || HEYS.UserTabImpl.calcSleepNorm;
    HEYS.calcAgeFromBirthDate = HEYS.calcAgeFromBirthDate || HEYS.UserTabImpl.calcAgeFromBirthDate;
    return;
  }
  const React = global.React;

  // 🔍 DEBUG: Проверяем что HEYS.utils загружен
  if (!HEYS.utils || !HEYS.utils.lsGet) {
    console.error('[heys_user_v12] ❌ HEYS.utils.lsGet не определён! Это приведёт к сбросу профиля');
  }
  // else { console.log('[heys_user_v12] ✅ HEYS.utils.lsGet определён, __clientScoped:', HEYS.utils.__clientScoped); }

  const { lsGet, lsSet, toNum, round1, getEmojiStyle, setEmojiStyle } = HEYS.utils || {
    lsGet: (k, d) => d, lsSet: () => { }, toNum: (x) => Number(x) || 0, round1: (v) => Math.round(v * 10) / 10,
    getEmojiStyle: () => 'android', setEmojiStyle: () => { }
  };

  // Дефолтный профиль (единый источник)
  const DEFAULT_PROFILE = {
    firstName: '', lastName: '', gender: 'Мужской',
    weight: 70, height: 175, age: 30,
    birthDate: '', // YYYY-MM-DD, если заполнено — возраст считается авто
    weightGoal: 0, // целевой вес (кг)
    sleepHours: 8, insulinWaveHours: 3,
    deficitPctTarget: 0,
    stepsGoal: 10000, // целевая дневная активность по шагам
    cycleTrackingEnabled: false, // ручное включение трекинга цикла (для любого пола)
    profileCompleted: false, // флаг заполненности профиля (для wizard первого входа)
    desktopAllowed: false, // 🖥️ Разрешён ли доступ с десктопа (куратор может включить)

    // 💊 Витамины / добавки
    // plannedSupplements остаётся string[] — критично для совместимости текущего UI
    plannedSupplements: [],
    // supplementSettings — карта настроек по ID добавки (форма, дозировка, override тайминга)
    supplementSettings: {},
    // supplementHistory — лёгкая история приёма (например, список дат) для предупреждений по курсу/лимитам
    supplementHistory: {}
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

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const readStoredValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      if (typeof lsGet === 'function') {
        const legacy = lsGet(key, fallback);
        if (legacy !== null && legacy !== undefined) return legacy;
      }
      const raw = localStorage.getItem(key);
      return tryParseStoredValue(raw, fallback);
    } catch (_) {
      return fallback;
    }
  };

  const readGlobalValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      return tryParseStoredValue(raw, fallback);
    } catch (_) {
      return fallback;
    }
  };

  const writeStoredValue = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      if (typeof lsSet === 'function') {
        lsSet(key, value);
        return;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (_) { }
  };

  const writeGlobalValue = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (_) { }
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
      return React.createElement('div', { className: 'inline-field' },
        React.createElement('label', null, 'Стиль эмодзи 😀'),
        React.createElement('span', { className: 'sep' }, '-'),
        React.createElement('span', { style: { color: 'var(--gray-500)', fontSize: '0.875rem' } },
          `Используются эмодзи ${platformInfo.name}`
        )
      );
    }

    return React.createElement('div', { className: 'inline-field' },
      React.createElement('label', null, 'Стиль эмодзи 😀'),
      React.createElement('span', { className: 'sep' }, '-'),
      React.createElement('select', { value: style, onChange: handleChange },
        React.createElement('option', { value: 'twemoji' }, '🐦 Twitter/Android'),
        React.createElement('option', { value: 'system' }, `💻 ${platformInfo.name}`)
      )
    );
  }

  // === SubscriptionStatusSection — отображение статуса подписки ===
  function SubscriptionStatusSection() {
    const [statusData, setStatusData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
      if (!window.HEYS?.Subscription) {
        setLoading(false);
        return;
      }

      window.HEYS.Subscription.getStatus(true).then(data => {
        setStatusData(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, []);

    if (loading) {
      return React.createElement('div', { className: 'profile-section__fields' },
        React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'var(--gray-500)' } },
          'Загрузка...'
        )
      );
    }

    if (!window.HEYS?.Subscription) {
      return React.createElement('div', { className: 'profile-section__fields' },
        React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'var(--gray-500)' } },
          'Модуль подписок не загружен'
        )
      );
    }

    const status = statusData?.status || 'none';
    const meta = window.HEYS.Subscription.getStatusMeta(status);
    const daysLeft = statusData?.days_left || 0;

    return React.createElement('div', { className: 'profile-section__fields' },
      // Статус карточка
      React.createElement('div', {
        className: 'profile-field-group',
        style: {
          backgroundColor: meta?.bg || 'var(--gray-100)',
          borderRadius: '12px',
          padding: '16px',
          border: `2px solid ${meta?.color || 'var(--gray-300)'}`
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
          React.createElement('span', { style: { fontSize: '32px' } }, meta?.emoji || '💎'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '18px', fontWeight: '600', color: meta?.color || 'inherit' } },
              meta?.label || 'Подписка'
            ),
            React.createElement('div', { style: { fontSize: '14px', color: 'var(--gray-600)' } },
              meta?.desc || ''
            )
          )
        ),

        // Дни до окончания
        (status === 'trial' || status === 'active') && daysLeft > 0 &&
        React.createElement('div', {
          style: {
            backgroundColor: 'rgba(0,0,0,0.05)',
            borderRadius: '8px',
            padding: '12px',
            textAlign: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('div', { style: { fontSize: '24px', fontWeight: '700', color: meta?.color } },
            daysLeft
          ),
          React.createElement('div', { style: { fontSize: '12px', color: 'var(--gray-600)' } },
            daysLeft === 1 ? 'день осталось' : (daysLeft < 5 ? 'дня осталось' : 'дней осталось')
          )
        ),

        // Кнопка оплаты (для read_only или none)
        (status === 'read_only' || status === 'none') &&
        React.createElement('button', {
          className: 'btn btn-primary',
          style: { width: '100%', marginTop: '8px' },
          onClick: () => {
            if (window.HEYS?.Paywall?.show) {
              window.HEYS.Paywall.show();
            } else {
              alert('Оплата скоро будет доступна! 💎');
            }
          }
        }, status === 'read_only' ? '🔓 Продлить подписку' : '🚀 Начать пробный период')
      )
    );
  }

  // === ProfileSection — FAQ-style collapsible section ===
  function ProfileSection({
    id,
    icon,
    title,
    subtitle,
    badge,
    tone = 'blue',
    expanded,
    onToggle,
    children
  }) {
    const handleClick = () => {
      if (onToggle) onToggle(id);
    };

    const sectionClass = [
      'profile-section',
      `tone-${tone}`,
      expanded ? 'profile-section--expanded' : 'profile-section--collapsed'
    ].join(' ');

    return React.createElement('div', { className: sectionClass },
      // Header (always visible)
      React.createElement('div', {
        className: 'profile-section__header',
        onClick: handleClick
      },
        React.createElement('div', { className: 'profile-section__header-left' },
          React.createElement('div', { className: 'profile-section__icon' }, icon),
          React.createElement('div', null,
            React.createElement('div', { className: 'profile-section__title' }, title),
            subtitle && React.createElement('div', { className: 'profile-section__subtitle' }, subtitle)
          )
        ),
        React.createElement('div', { className: 'profile-section__header-right' },
          badge && React.createElement('span', { className: 'profile-section__badge' }, badge),
          React.createElement('span', { className: 'profile-section__chevron' }, '▼')
        )
      ),
      // Content (only when expanded)
      expanded && React.createElement('div', { className: 'profile-section__content' }, children)
    );
  }

  // === Компонент группы полей (плашка внутри секции) ===
  function ProfileFieldGroup({ icon, title, children }) {
    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header' },
        React.createElement('span', { className: 'profile-field-group__icon' }, icon),
        React.createElement('span', { className: 'profile-field-group__title' }, title)
      ),
      children
    );
  }

  function UserTabBase() {
    // Twemoji: reparse emoji after render
    React.useEffect(() => {
      if (window.scheduleTwemojiParse) window.scheduleTwemojiParse();
    });

    const [profile, setProfile] = React.useState(() => {
      return readStoredValue('heys_profile', DEFAULT_PROFILE);
    });
    const [profileSaved, setProfileSaved] = React.useState(false);

    // Смена PIN
    const [pinForm, setPinForm] = React.useState({ pin: '', confirm: '' });
    const [pinStatus, setPinStatus] = React.useState('idle'); // idle | pending | success | error
    const [pinMessage, setPinMessage] = React.useState('');

    // === Accordion state (с сохранением в localStorage) ===
    const SECTIONS_KEY = 'heys_profile_sections';
    const [expandedSections, setExpandedSections] = React.useState(() => {
      try {
        return readStoredValue(SECTIONS_KEY, { basic: true }) || { basic: true };
      } catch { return { basic: true }; }
    });
    const toggleSection = (id) => {
      setExpandedSections(prev => {
        const next = { ...prev, [id]: !prev[id] };
        writeStoredValue(SECTIONS_KEY, next);
        return next;
      });
    };

    const getCurrentClientId = () => {
      let cid = (window.HEYS && window.HEYS.currentClientId) || readGlobalValue('heys_client_current', '') || '';
      if (cid && typeof cid === 'string' && cid.startsWith('"')) {
        try { cid = JSON.parse(cid); } catch (_) { }
      }
      return cid || '';
    };

    const getShortClientId = (id) => id ? String(id).slice(0, 8) : '—';

    const handlePinUpdate = async () => {
      const auth = window.HEYS && window.HEYS.auth;
      const clientId = getCurrentClientId();
      setPinMessage('');

      if (!clientId) {
        setPinStatus('error');
        setPinMessage('Клиент не выбран. Выберите клиента в шапке.');
        return;
      }

      if (!auth || typeof auth.resetClientPin !== 'function' || typeof auth.validatePin !== 'function') {
        setPinStatus('error');
        setPinMessage('Модуль авторизации не загружен.');
        return;
      }

      if (!auth.validatePin(pinForm.pin) || !auth.validatePin(pinForm.confirm)) {
        setPinStatus('error');
        setPinMessage('PIN должен состоять из 4 цифр.');
        return;
      }

      if (pinForm.pin !== pinForm.confirm) {
        setPinStatus('error');
        setPinMessage('PIN и подтверждение не совпадают.');
        return;
      }

      setPinStatus('pending');
      try {
        const res = await auth.resetClientPin({ clientId, newPin: pinForm.pin });
        if (!res || !res.ok) {
          const msg = res && res.message ? res.message : 'Не удалось обновить PIN';
          setPinStatus('error');
          setPinMessage(msg);
          if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.trackError) {
            window.HEYS.analytics.trackError('pin_change_failed', { clientId: getShortClientId(clientId), message: msg });
          }
          return;
        }
        setPinStatus('success');
        setPinMessage('PIN обновлён. Не забудьте сообщить его клиенту.');
        setPinForm({ pin: '', confirm: '' });
        setTimeout(() => { setPinStatus('idle'); setPinMessage(''); }, 2000);
      } catch (e) {
        setPinStatus('error');
        setPinMessage(e?.message || 'Ошибка при обновлении PIN');
        if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.trackError) {
          window.HEYS.analytics.trackError('pin_change_exception', { clientId: getShortClientId(clientId), message: e?.message });
        }
      }
    };

    // Дефолтные пульсовые зоны (фиксированные диапазоны, MET рассчитывается)
    const defaultZones = React.useMemo(() => {
      return [
        { name: 'Бытовая активность (ходьба)', hrFrom: 85, hrTo: 99, MET: 2 },
        { name: 'Умеренная активность (медленный бег)', hrFrom: 100, hrTo: 119, MET: 3 },
        { name: 'Аэробная (кардио)', hrFrom: 120, hrTo: 139, MET: 5 },
        { name: 'Анаэробная (активная нагрузка, когда тяжело)', hrFrom: 140, hrTo: 181, MET: 8 }
      ];
    }, []);

    const [zones, setZones] = React.useState(readStoredValue('heys_hr_zones', defaultZones));
    const [zonesSaved, setZonesSaved] = React.useState(false);

    // Перезагрузка данных при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;

      const reloadData = () => {
        if (cancelled) return;

        const newProfile = readStoredValue('heys_profile', DEFAULT_PROFILE);
        newProfile.revision = newProfile.revision || 0;
        newProfile.updatedAt = newProfile.updatedAt || 0;

        // Умный reload: не перезаписываем если текущее состояние новее
        setProfile(prev => {
          const prevUpdatedAt = prev.updatedAt || 0;
          const newUpdatedAt = newProfile.updatedAt || 0;
          if (prevUpdatedAt > newUpdatedAt) {
            return prev; // Текущее состояние новее — не перезаписываем
          }
          return newProfile;
        });

        const newZones = readStoredValue('heys_hr_zones', defaultZones);
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

    // Подписка на обновления профиля из wizard'а
    React.useEffect(() => {
      const handleProfileUpdate = (e) => {
        const newProfile = readStoredValue('heys_profile', DEFAULT_PROFILE);
        setProfile(newProfile);
      };

      window.addEventListener('heys:profile-updated', handleProfileUpdate);
      return () => window.removeEventListener('heys:profile-updated', handleProfileUpdate);
    }, []);

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
        writeStoredValue('heys_profile', profile);

        // Синхронизация имени с списком клиентов
        let currentClientId = readGlobalValue('heys_client_current', '');
        // Убираем кавычки если значение было сохранено как JSON string
        if (currentClientId && currentClientId.startsWith('"')) {
          try { currentClientId = JSON.parse(currentClientId); } catch (e) { }
        }
        if (currentClientId && profile.firstName) {
          try {
            const clients = readGlobalValue('heys_clients', []);
            const safeClients = Array.isArray(clients) ? clients : [];
            const updatedClients = safeClients.map(c =>
              c.id === currentClientId ? { ...c, name: profile.firstName } : c
            );
            writeGlobalValue('heys_clients', updatedClients);

            // Событие для обновления UI
            window.dispatchEvent(new CustomEvent('heys:clients-updated', {
              detail: { clients: updatedClients, source: 'profile-settings' }
            }));

            // ⚠️ Cloud sync имени отключён:
            // - REST API read-only (PATCH блокируется CORS)
            // - clients.name устанавливается куратором при создании клиента
            // - Локальные изменения сохраняются в localStorage
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
    React.useEffect(() => {
      // Пропускаем первый рендер
      if (zonesInitRef.current) {
        zonesInitRef.current = false;
        return;
      }
      // Debounced сохранение зон (1000ms)
      setZonesPending(true);
      setZonesSaved(false);
      const timer = setTimeout(() => {
        writeStoredValue('heys_hr_zones', zones);
        setZonesPending(false);
        setZonesSaved(true);
        setTimeout(() => setZonesSaved(false), 2000);
      }, 1000);
      return () => clearTimeout(timer);
    }, [zones]);

    const maxHR = Math.max(0, 220 - toNum(profile.age || 0));
    const calPerMinPerMET = round1(toNum(profile.weight || 0) * 0.0175); // кал/мин на 1 MET

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

    function updateProfileField(key, value) {
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
    function updateZone(i, patch) {
      setZones(prev => {
        const updated = prev.map((z, idx) => idx === i ? { ...z, ...patch } : z);
        // Добавляем revision/updatedAt к массиву (нестандартно, но работает для JSON)
        updated.revision = (prev.revision || 0) + 1;
        updated.updatedAt = Date.now();
        return updated;
      });
    }
    function resetZones() { if (confirm('Сбросить пульсовые зоны к шаблону?')) setZones(defaultZones); }

    // Пресеты дефицита/профицита калорий
    const DEFICIT_PRESETS = [
      { value: -20, label: 'Агрессивное похудение', emoji: '🔥🔥', color: '#ef4444' },
      { value: -15, label: 'Активное похудение', emoji: '🔥', color: '#f97316' },
      { value: -10, label: 'Умеренное похудение', emoji: '🎯', color: '#eab308' },
      { value: 0, label: 'Поддержание веса', emoji: '⚖️', color: '#22c55e' },
      { value: 10, label: 'Умеренный набор', emoji: '💪', color: '#3b82f6' },
      { value: 15, label: 'Активный набор', emoji: '💪💪', color: '#3b82f6' }
    ];

    const getDeficitInfo = (val) => {
      const preset = DEFICIT_PRESETS.find(p => p.value === val);
      if (preset) return preset;
      // Для кастомных значений
      if (val < -10) return { emoji: '🔥🔥', color: '#ef4444', label: 'Агрессивный дефицит' };
      if (val < 0) return { emoji: '🔥', color: '#f97316', label: 'Дефицит' };
      if (val === 0) return { emoji: '⚖️', color: '#22c55e', label: 'Поддержание' };
      if (val <= 10) return { emoji: '💪', color: '#3b82f6', label: 'Профицит' };
      return { emoji: '💪💪', color: '#3b82f6', label: 'Агрессивный набор' };
    };

    return React.createElement('div', { className: 'page page-user' },
      React.createElement('div', { className: 'profile-accordion' },

        // === СЕКЦИЯ 1: Базовые параметры ===
        React.createElement(ProfileSection, {
          id: 'basic',
          icon: '👤',
          title: 'Базовые параметры',
          subtitle: 'Рост, вес, возраст, цели',
          tone: 'blue',
          expanded: expandedSections.basic,
          onToggle: () => toggleSection('basic')
        },
          React.createElement('div', { className: 'profile-section__fields' },

            // === ГРУППА 1: Личные данные ===
            React.createElement(ProfileFieldGroup, { icon: '👤', title: 'Личные данные' },
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Имя'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { value: profile.firstName, onChange: e => updateProfileField('firstName', e.target.value) }), React.createElement(FieldStatus, { fieldKey: 'firstName' })),
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Фамилия'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { value: profile.lastName, onChange: e => updateProfileField('lastName', e.target.value) }), React.createElement(FieldStatus, { fieldKey: 'lastName' })),
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Пол'), React.createElement('span', { className: 'sep' }, '-'),
                React.createElement('select', { value: profile.gender, onChange: e => updateProfileField('gender', e.target.value) },
                  React.createElement('option', { value: 'Мужской' }, 'Мужской'),
                  React.createElement('option', { value: 'Женский' }, 'Женский'),
                  React.createElement('option', { value: 'Другое' }, 'Другое')
                ),
                React.createElement(FieldStatus, { fieldKey: 'gender' })
              ),
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Дата рождения'), React.createElement('span', { className: 'sep' }, '-'),
                React.createElement('input', { type: 'date', value: profile.birthDate || '', onChange: e => updateProfileField('birthDate', e.target.value), style: { width: '140px' } }),
                React.createElement(FieldStatus, { fieldKey: 'birthDate' }),
                profile.birthDate && React.createElement('span', { style: { marginLeft: '8px', color: 'var(--gray-600)' } }, `(${calcAgeFromBirthDate(profile.birthDate)} лет)`)
              ),
              !profile.birthDate && React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Возраст (лет)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', value: profile.age, onChange: e => updateProfileField('age', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'age' })),
              // Трекинг особого периода (только для женщин)
              profile.gender === 'Женский' && React.createElement('div', { className: 'inline-field cycle-tracking-toggle' },
                React.createElement('label', null, '🌸 Особый период'),
                React.createElement('span', { className: 'sep' }, '-'),
                React.createElement('label', { className: 'toggle-switch' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: !!profile.cycleTrackingEnabled,
                    onChange: e => updateProfileField('cycleTrackingEnabled', e.target.checked)
                  }),
                  React.createElement('span', { className: 'toggle-slider' })
                ),
                React.createElement('span', { className: 'cycle-toggle-hint' },
                  profile.cycleTrackingEnabled ? 'Включён' : 'Выключен'
                )
              )
            ),

            // === ГРУППА 2: Параметры тела ===
            React.createElement(ProfileFieldGroup, { icon: '📏', title: 'Параметры тела' },
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Рост (см)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', value: profile.height, onChange: e => updateProfileField('height', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'height' })),
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Базовый вес (кг)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', step: '1', value: profile.baseWeight || profile.weight, onChange: e => updateProfileField('baseWeight', Number(e.target.value) || 0), onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'baseWeight' })),
              // Текущий вес (из последнего чек-ина)
              (() => {
                // Ищем последний день с весом за последние 30 дней
                let currentWeight = null;
                let weightDate = null;
                const today = new Date();
                for (let i = 0; i < 30; i++) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - i);
                  const key = 'heys_dayv2_' + d.toISOString().slice(0, 10);
                  const dayData = readStoredValue(key, null);
                  if (dayData && dayData.weightMorning > 0) {
                    currentWeight = dayData.weightMorning;
                    weightDate = d.toISOString().slice(0, 10);
                    break;
                  }
                }
                const baseWeight = profile.baseWeight || profile.weight;
                const diff = currentWeight && baseWeight ? round1(currentWeight - baseWeight) : null;
                return React.createElement('div', { className: 'inline-field' },
                  React.createElement('label', null, '⚖️ Текущий вес'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  currentWeight
                    ? React.createElement('span', { style: { fontWeight: 600 } },
                      `${currentWeight} кг`,
                      diff !== null && diff !== 0 && React.createElement('span', { style: { marginLeft: '8px', fontSize: '13px', color: diff < 0 ? '#22c55e' : diff > 0 ? '#f97316' : 'var(--gray-500)' } },
                        diff > 0 ? `+${diff}` : diff, ' от базы'
                      )
                    )
                    : React.createElement('span', { style: { color: 'var(--gray-400)', fontStyle: 'italic' } }, 'нет данных'),
                  weightDate && React.createElement('span', { style: { marginLeft: '8px', fontSize: '12px', color: 'var(--gray-400)' } },
                    `(${new Date(weightDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})`
                  )
                );
              })(),
              React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Целевой вес (кг)'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', step: '1', value: profile.weightGoal || 0, onChange: e => updateProfileField('weightGoal', Number(e.target.value) || 0), placeholder: '0 = не задан', onFocus: e => e.target.select() }), React.createElement(FieldStatus, { fieldKey: 'weightGoal' })),

              // === ПРОДВИНУТЫЙ РАСЧЁТ ДОСТИЖЕНИЯ ЦЕЛИ ===
              (() => {
                const startWeight = toNum(profile.baseWeight || profile.weight || 70);
                const goalWeight = toNum(profile.weightGoal);
                const deficitPct = toNum(profile.deficitPctTarget) || 0;
                const height = toNum(profile.height || 175) / 100;
                const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
                const gender = profile.gender;

                // Если нет цели или уже достигнута — не показываем
                if (!goalWeight || goalWeight <= 0) return null;

                // Получаем текущий вес из последнего чек-ина
                let currentWeight = startWeight;
                for (let i = 0; i < 30; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  const key = 'heys_dayv2_' + d.toISOString().slice(0, 10);
                  const dayData = readStoredValue(key, null);
                  if (dayData && dayData.weightMorning > 0) {
                    currentWeight = dayData.weightMorning;
                    break;
                  }
                }

                const weightToLose = round1(currentWeight - goalWeight);
                if (weightToLose <= 0) {
                  return React.createElement('div', {
                    className: 'goal-calculator', style: {
                      marginTop: '12px', padding: '12px 14px', background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
                      borderRadius: '10px', border: '1px solid #86efac'
                    }
                  },
                    React.createElement('div', { style: { fontWeight: 600, color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' } },
                      '🎉 Цель достигнута!',
                      React.createElement('span', { style: { fontWeight: 400, fontSize: '13px', color: '#166534' } },
                        weightToLose < 0 ? `Вы на ${Math.abs(weightToLose)} кг ниже цели` : 'Поздравляем!'
                      )
                    )
                  );
                }

                // === НАУЧНЫЙ РАСЧЁТ ===
                // BMR по Mifflin-St Jeor (Mifflin MD et al., Am J Clin Nutr 1990)
                // Рекомендован ADA как наиболее точный для здоровых людей
                const bmr = gender === 'Женский'
                  ? round1(447.593 + 9.247 * currentWeight + 3.098 * (height * 100) - 4.330 * age)
                  : round1(88.362 + 13.397 * currentWeight + 4.799 * (height * 100) - 5.677 * age);

                // === АДАПТИВНЫЙ TDEE ===
                // Сначала ищем реальные данные активности за последние 7 дней
                // Если достаточно данных (≥3 дней) — используем реальный TDEE
                // Иначе — теоретический по множителю активности

                // Собираем данные активности за 7 дней
                const activityDays = [];
                for (let i = 0; i < 7; i++) {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  const dateKey = d.toISOString().split('T')[0];
                  const dayData = readStoredValue(`heys_dayv2_${dateKey}`, null);
                  if (dayData) {
                    // Калории от тренировок (упрощённый расчёт без MET)
                    const trainings = dayData.trainings || [];
                    let trainKcal = 0;
                    trainings.forEach(t => {
                      const zones = t.z || [0, 0, 0, 0];
                      const mets = [2.5, 6, 8, 10]; // Дефолтные MET по зонам
                      zones.forEach((min, zi) => {
                        trainKcal += (min || 0) * ((mets[zi] * currentWeight * 0.0175) - 1);
                      });
                    });

                    // Калории от шагов
                    const stepsKcal = (dayData.steps || 0) * 0.7 / 1000 * currentWeight * (gender === 'Женский' ? 0.5 : 0.57);

                    // Калории от бытовой активности
                    const householdMin = (dayData.householdActivities || []).reduce((s, h) => s + (+h.minutes || 0), dayData.householdMin || 0);
                    const householdKcal = householdMin * ((2.5 * currentWeight * 0.0175) - 1);

                    const totalActivityKcal = Math.round(trainKcal + stepsKcal + householdKcal);

                    // Считаем только дни с хоть какой-то активностью или данными
                    if (dayData.steps > 0 || trainings.length > 0 || householdMin > 0) {
                      activityDays.push({
                        date: dateKey,
                        activityKcal: totalActivityKcal,
                        tdee: bmr + totalActivityKcal
                      });
                    }
                  }
                }

                // Определяем TDEE
                let tdee, tdeeSource;
                const MIN_DAYS_FOR_REAL_TDEE = 3;

                if (activityDays.length >= MIN_DAYS_FOR_REAL_TDEE) {
                  // Используем реальные данные — средний TDEE за доступные дни
                  const avgTdee = activityDays.reduce((s, d) => s + d.tdee, 0) / activityDays.length;
                  tdee = round1(avgTdee);
                  tdeeSource = 'real';
                } else {
                  // Теоретический TDEE по множителю активности (FAO/WHO/UNU 2001)
                  const activityMultipliers = {
                    'sedentary': 1.2,       // Сидячий (офис, нет тренировок)
                    'light': 1.375,         // Лёгкая (1-3 трен/нед)
                    'moderate': 1.55,       // Умеренная (3-5 трен/нед)
                    'active': 1.725,        // Высокая (6-7 трен/нед)
                    'very_active': 1.9      // Очень высокая (атлеты)
                  };
                  const profileActivity = profile?.activityLevel || 'moderate';
                  const activityMultiplier = activityMultipliers[profileActivity] || 1.55;
                  tdee = round1(bmr * activityMultiplier);
                  tdeeSource = 'theoretical';
                }

                // Дневной дефицит калорий
                const dailyDeficit = Math.abs(deficitPct) > 0 ? round1(tdee * Math.abs(deficitPct) / 100) : 0;

                // === СОСТАВ ПОТЕРИ ВЕСА ===
                // Forbes GB (1987, 2000): состав потери зависит от дефицита и тренировок
                // Lean mass = мышцы + гликоген + связанная вода
                // При умеренном дефиците + силовые: до 90% жира возможно
                // Без силовых: 75-80% жир, 20-25% lean mass (из которых ~50% вода гликогена)
                const isAggressive = Math.abs(deficitPct) > 20; // Порог снижен до 20% (научно обоснован)
                const isVeryAggressive = Math.abs(deficitPct) > 30;

                // Корректировка: разделяем на жир, гликоген+воду, и чистые мышцы
                // При потере веса сначала уходит гликоген (с 3-4г воды на 1г гликогена)
                let fatPercent, glycogenWaterPercent, leanMusclePercent;
                if (isVeryAggressive) {
                  fatPercent = 0.55;           // Сильный дефицит: больше мышц теряется
                  glycogenWaterPercent = 0.25; // Гликоген + связанная вода
                  leanMusclePercent = 0.20;    // Чистая мышечная ткань
                } else if (isAggressive) {
                  fatPercent = 0.65;
                  glycogenWaterPercent = 0.22;
                  leanMusclePercent = 0.13;
                } else {
                  fatPercent = 0.77;           // Hall KD (2008): ~77% при умеренном дефиците
                  glycogenWaterPercent = 0.18; // ~400г гликогена + 1.2-1.6кг воды
                  leanMusclePercent = 0.05;    // Минимум при правильном питании + тренировках
                }

                // Калорийность компонентов (ккал/кг) — научные данные
                const KCAL_PER_KG_FAT = 7700;           // Hall KD (2008): жировая ткань ~7700 ккал/кг
                const KCAL_PER_KG_LEAN_MUSCLE = 1100;   // Forbes GB (2000): ~20% белок, ~75% вода
                const KCAL_PER_KG_GLYCOGEN_WATER = 700; // Гликоген 4ккал/г, но 1г гликогена связывает 3-4г воды

                // Сколько каждого компонента нужно потерять
                const fatToLose = round1(weightToLose * fatPercent);
                const glycogenWaterToLose = round1(weightToLose * glycogenWaterPercent);
                const leanMuscleToLose = round1(weightToLose * leanMusclePercent);

                // Общий дефицит калорий нужный (Hall KD, 2011)
                // Жир: 7700 ккал/кг, мышцы: 1100 ккал/кг, гликоген+вода: ~700 ккал/кг
                const totalKcalDeficit = Math.round(
                  fatToLose * KCAL_PER_KG_FAT +
                  leanMuscleToLose * KCAL_PER_KG_LEAN_MUSCLE +
                  glycogenWaterToLose * KCAL_PER_KG_GLYCOGEN_WATER
                );

                // Дней до цели
                const daysToGoal = dailyDeficit > 0 ? Math.ceil(totalKcalDeficit / dailyDeficit) : null;
                const weeksToGoal = daysToGoal ? Math.ceil(daysToGoal / 7) : null;
                const monthsToGoal = daysToGoal ? round1(daysToGoal / 30) : null;

                // Скорость потери веса (комбинированная формула)
                // Учитываем, что не вся потеря = жир
                const effectiveKcalPerKg = fatPercent * KCAL_PER_KG_FAT +
                  glycogenWaterPercent * KCAL_PER_KG_GLYCOGEN_WATER +
                  leanMusclePercent * KCAL_PER_KG_LEAN_MUSCLE;
                const kgPerWeek = dailyDeficit > 0 ? round1((dailyDeficit * 7) / effectiveKcalPerKg) : 0;

                // Предупреждения (ACSM Position Stand 2009)
                const warnings = [];
                if (isVeryAggressive) {
                  warnings.push({ icon: '⚠️', text: 'Дефицит >30% — высокий риск потери мышц и метаболической адаптации', color: '#dc2626' });
                } else if (isAggressive) {
                  warnings.push({ icon: '⚡', text: 'Дефицит >20% — добавьте силовые тренировки для сохранения мышц', color: '#f97316' });
                }
                if (kgPerWeek > 1) {
                  warnings.push({ icon: '🏃', text: `${kgPerWeek} кг/нед — рекомендация ACSM: 0.5-0.9 кг/нед`, color: '#eab308' });
                }
                if (kgPerWeek > 1.5) {
                  warnings.push({ icon: '🚨', text: 'Потеря >1.5 кг/нед увеличивает потерю мышц на 20-30%', color: '#dc2626' });
                }
                if (deficitPct === 0) {
                  warnings.push({ icon: '📊', text: 'Установите дефицит в "Цели и метаболизм" для расчёта', color: '#6b7280' });
                }

                // Дата достижения цели
                const targetDate = daysToGoal ? new Date(Date.now() + daysToGoal * 24 * 60 * 60 * 1000) : null;

                return React.createElement('div', {
                  className: 'goal-calculator', style: {
                    marginTop: '12px', padding: '14px 16px',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
                    borderRadius: '12px', border: '1px solid #bfdbfe',
                    position: 'relative'
                  }
                },
                  // Заголовок
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
                    React.createElement('span', {
                      style: { fontWeight: 600, color: '#1e40af', fontSize: '14px' },
                      title: 'Источники: Mifflin (1990), Hall KD (2008), Forbes GB (2000), ACSM (2009)'
                    }, '📐 Расчёт достижения цели'),
                    daysToGoal && React.createElement('span', {
                      style: {
                        padding: '4px 10px', background: '#3b82f6', color: '#fff', borderRadius: '12px', fontSize: '12px', fontWeight: 600
                      }
                    },
                      weeksToGoal <= 4 ? `~${weeksToGoal} нед.` :
                        monthsToGoal <= 12 ? `~${monthsToGoal} мес.` :
                          `~${round1(monthsToGoal / 12)} г.`
                    )
                  ),

                  // Индикатор источника TDEE
                  React.createElement('div', {
                    style: {
                      display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px',
                      padding: '6px 10px', borderRadius: '8px',
                      background: tdeeSource === 'real' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                      border: `1px solid ${tdeeSource === 'real' ? '#10b981' : '#eab308'}`
                    }
                  },
                    React.createElement('span', { style: { fontSize: '12px' } },
                      tdeeSource === 'real' ? '📊' : '📐'
                    ),
                    React.createElement('span', {
                      style: {
                        fontSize: '12px',
                        color: tdeeSource === 'real' ? '#059669' : '#b45309'
                      }
                    },
                      tdeeSource === 'real'
                        ? `TDEE ${tdee} ккал — по вашим данным (${activityDays.length} дней)`
                        : `TDEE ${tdee} ккал — теория (нужно ≥3 дня активности)`
                    )
                  ),

                  // Разбивка потери веса (научная модель: жир + гликоген/вода + мышцы)
                  React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' } },
                    React.createElement('div', { style: { textAlign: 'center', padding: '8px', background: 'rgba(251, 191, 36, 0.15)', borderRadius: '8px' } },
                      React.createElement('div', { style: { fontSize: '18px', fontWeight: 700, color: '#b45309' } }, `${fatToLose} кг`),
                      React.createElement('div', { style: { fontSize: '11px', color: '#92400e' } }, `🔥 Жир (${Math.round(fatPercent * 100)}%)`)
                    ),
                    React.createElement('div', { style: { textAlign: 'center', padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '8px' } },
                      React.createElement('div', { style: { fontSize: '18px', fontWeight: 700, color: '#1d4ed8' } }, `${glycogenWaterToLose} кг`),
                      React.createElement('div', { style: { fontSize: '11px', color: '#1e40af' } }, `💧 Гликоген+вода`)
                    ),
                    React.createElement('div', { style: { textAlign: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '8px' } },
                      React.createElement('div', { style: { fontSize: '18px', fontWeight: 700, color: '#dc2626' } }, `${leanMuscleToLose} кг`),
                      React.createElement('div', { style: { fontSize: '11px', color: '#b91c1c' } }, `💪 Мышцы (${Math.round(leanMusclePercent * 100)}%)`)
                    )
                  ),

                  // Калории и сроки
                  React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } },
                    React.createElement('span', { className: 'pill', style: { fontSize: '12px' } },
                      `🔋 Нужно сжечь: ${(totalKcalDeficit / 1000).toFixed(0)}к ккал`
                    ),
                    dailyDeficit > 0 && React.createElement('span', { className: 'pill', style: { fontSize: '12px' } },
                      `📉 Дефицит: ${dailyDeficit} ккал/день`
                    ),
                    kgPerWeek > 0 && React.createElement('span', { className: 'pill', style: { fontSize: '12px', background: kgPerWeek > 1 ? '#fef3c7' : '#dcfce7' } },
                      `⚖️ ~${kgPerWeek} кг/нед`
                    ),
                    targetDate && React.createElement('span', { className: 'pill', style: { fontSize: '12px' } },
                      `📅 ${targetDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    )
                  ),

                  // Предупреждения
                  warnings.length > 0 && React.createElement('div', { style: { marginTop: '8px' } },
                    warnings.map((w, i) =>
                      React.createElement('div', { key: i, style: { fontSize: '12px', color: w.color, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' } },
                        w.icon, w.text
                      )
                    )
                  ),

                  // Формула
                  React.createElement('div', { style: { marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: '11px', color: 'var(--gray-500)' } },
                    `Формула: TDEE ${tdee} ккал × ${Math.abs(deficitPct)}% дефицит = ${dailyDeficit} ккал/день. `,
                    `Жир 7700 ккал/кг, мышцы 1100 ккал/кг.`
                  )
                );
              })()
            ),

            // === ГРУППА 3: Цели и метаболизм ===
            React.createElement(ProfileFieldGroup, { icon: '🎯', title: 'Цели и метаболизм' },
              // Целевой дефицит: пресеты + своё значение
              (() => {
                const currentVal = toNum(profile.deficitPctTarget || 0);
                const isCustom = !DEFICIT_PRESETS.some(p => p.value === currentVal);
                const info = getDeficitInfo(currentVal);

                return React.createElement('div', { className: 'inline-field', style: { flexWrap: 'wrap', gap: '8px' } },
                  React.createElement('label', { style: { fontWeight: 600 } }, 'Цель по калориям'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  React.createElement('select', {
                    value: isCustom ? 'custom' : String(currentVal),
                    onChange: e => {
                      if (e.target.value !== 'custom') {
                        updateProfileField('deficitPctTarget', Number(e.target.value));
                      }
                    },
                    style: { width: '200px', fontWeight: 600 }
                  },
                    ...DEFICIT_PRESETS.map(p =>
                      React.createElement('option', { key: p.value, value: String(p.value) },
                        `${p.emoji} ${p.value > 0 ? '+' : ''}${p.value}% — ${p.label}`
                      )
                    ),
                    React.createElement('option', { value: 'custom' }, '✏️ Своё значение...')
                  ),
                  isCustom && React.createElement('input', {
                    type: 'number',
                    step: '1',
                    min: '-50',
                    max: '50',
                    value: currentVal,
                    onChange: e => updateProfileField('deficitPctTarget', Number(e.target.value) || 0),
                    style: { width: '60px', marginLeft: '4px', fontWeight: 700, textAlign: 'center' }
                  }),
                  React.createElement('span', { style: { color: info.color, fontWeight: 600, marginLeft: '6px' } },
                    isCustom ? `${info.emoji} ${currentVal > 0 ? '+' : ''}${currentVal}%` : ''
                  ),
                  React.createElement(FieldStatus, { fieldKey: 'deficitPctTarget' })
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

                return React.createElement('div', { className: 'inline-field', style: { flexWrap: 'wrap', gap: '8px' } },
                  React.createElement('label', null, 'Инсулиновая волна'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  React.createElement('select', {
                    value: isCustom ? 'custom' : String(currentVal),
                    onChange: e => {
                      if (e.target.value === 'custom') {
                        // Оставляем текущее значение, просто переключаем на custom
                      } else {
                        updateProfileField('insulinWaveHours', Number(e.target.value));
                      }
                    },
                    style: { width: '180px' }
                  },
                    ...INSULIN_PRESETS.map(p =>
                      React.createElement('option', { key: p.value, value: String(p.value) }, `${p.value} ч — ${p.label}`)
                    ),
                    React.createElement('option', { value: 'custom' }, 'Своё значение...')
                  ),
                  isCustom && React.createElement('input', {
                    type: 'number',
                    step: '0.5',
                    min: '1',
                    max: '8',
                    value: currentVal,
                    onChange: e => updateProfileField('insulinWaveHours', Number(e.target.value) || 3),
                    style: { width: '60px', marginLeft: '4px' }
                  }),
                  React.createElement('span', { style: { color: 'var(--gray-500)', fontSize: '12px', marginLeft: '4px' } },
                    currentPreset ? `(${currentPreset.desc})` : `(${currentVal} ч — своё)`
                  ),
                  React.createElement(FieldStatus, { fieldKey: 'insulinWaveHours' })
                );
              })(),
              // Норма сна: авторасчёт с расшифровкой
              (() => {
                const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : toNum(profile.age || 30);
                const sleepNorm = calcSleepNorm(age, profile.gender);
                return React.createElement('div', { className: 'inline-field' },
                  React.createElement('label', null, 'Норма сна'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  React.createElement('span', { style: { fontWeight: 600, minWidth: '50px' } }, `${sleepNorm.hours} ч`),
                  React.createElement('span', { style: { marginLeft: '8px', color: 'var(--gray-500)', fontSize: '13px' } },
                    `(${sleepNorm.explanation})`
                  )
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

              return React.createElement('div', { style: { marginTop: '10px' } },
                // Пилюли с метриками
                React.createElement('div', { className: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
                  React.createElement('div', { className: 'pill' }, `Макс. пульс: ${maxHR} уд/мин`),
                  React.createElement('div', { className: 'pill' }, `Кал/мин на 1 MET: ${calPerMinPerMET}`),
                  React.createElement('div', { className: 'pill', style: { background: '#f0fdf4', border: '1px solid #86efac' } }, `BMR: ${bmr} ккал/сут`),
                  React.createElement('div', { className: 'pill', style: { background: '#f0f9ff', border: `1px solid ${bmiColor}` } },
                    `BMI: ${bmi}`,
                    React.createElement('span', { style: { marginLeft: '4px', color: bmiColor, fontSize: '12px' } }, `(${bmiCat})`)
                  ),
                  React.createElement('div', { className: 'pill', style: { background: '#eff6ff', border: '1px solid #93c5fd' } }, `💧 Норма воды: ${waterNorm} л/сут`)
                ),
                // Прогресс-бар к цели (если задан целевой вес)
                wGoal > 0 && React.createElement('div', { style: { marginTop: '12px', padding: '10px 12px', background: 'var(--gray-50)', borderRadius: '8px' } },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
                    React.createElement('span', { style: { fontWeight: 500 } }, `🎯 Цель: ${wGoal} кг`),
                    React.createElement('span', { style: { color: weightDiff === 0 ? '#22c55e' : 'var(--gray-600)', fontWeight: weightDiff === 0 ? 600 : 400 } },
                      weightDiff === 0 ? '✅ Достигнуто!' :
                        weightDiff > 0 ? `Осталось сбросить: ${weightDiff} кг` :
                          `Осталось набрать: ${Math.abs(weightDiff)} кг`
                    )
                  ),
                  // Прогресс-бар
                  (() => {
                    // Рассчитываем прогресс от стартового веса (базовый вес в профиле)
                    const progressPct = weightDiff === 0 ? 100 : Math.max(0, Math.min(100, 100 - Math.abs(weightDiff) / Math.abs(w - wGoal) * 100)) || 0;
                    const barColor = weightDiff === 0 ? '#22c55e' : weightDiff > 0 ? '#3b82f6' : '#3b82f6';
                    return React.createElement('div', { style: { height: '8px', background: 'var(--gray-200)', borderRadius: '4px', overflow: 'hidden' } },
                      React.createElement('div', { style: { height: '100%', width: (weightDiff === 0 ? 100 : 50) + '%', background: barColor, borderRadius: '4px', transition: 'width 0.3s' } })
                    );
                  })(),
                  // Время достижения
                  weeksToGoal && deficitPct !== 0 && React.createElement('div', { style: { marginTop: '6px', fontSize: '13px', color: 'var(--gray-500)' } },
                    `⏱ При дефиците ${Math.abs(deficitPct)}%: ~${weeksToGoal} нед.`
                  )
                )
              );
            })(),
            React.createElement('div', { className: 'muted', style: { marginTop: '6px' } },
              'Все значения сохраняются автоматически.'
            )
          ) // end profile-section__fields
        ), // end ProfileSection basic

        // === СЕКЦИЯ 2: Пульсовые зоны ===
        React.createElement(ProfileSection, {
          id: 'hrZones',
          icon: '💓',
          title: 'Пульсовые зоны',
          subtitle: 'Настройка зон для тренировок',
          badge: `${zones.length} зон`,
          tone: 'rose',
          expanded: expandedSections.hrZones,
          onToggle: () => toggleSection('hrZones')
        },
          React.createElement('div', { className: 'profile-section__fields' },
            React.createElement('div', { className: 'row', style: { justifyContent: 'flex-end', marginBottom: '8px' } },
              React.createElement('button', { className: 'btn btn-sm', onClick: resetZones }, 'Сбросить')
            ),
            // Карточки пульсовых зон
            React.createElement('div', { className: 'hr-zones-list' },
              zones.map((z, i) => {
                const calPerMin = round1((toNum(z.MET || 0) * calPerMinPerMET) - 1);
                return React.createElement('div', {
                  key: i, className: 'hr-zone-row', style: {
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    padding: '12px 14px', marginBottom: '8px',
                    background: 'rgba(255,255,255,0.7)', borderRadius: '12px',
                    border: '1px solid rgba(244,63,94,0.15)'
                  }
                },
                  // Название зоны
                  React.createElement('input', {
                    value: z.name,
                    onChange: e => updateZone(i, { name: e.target.value }),
                    onFocus: e => e.target.select(),
                    style: {
                      width: '100%', padding: '8px 12px', fontSize: '14px', fontWeight: 600,
                      border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px',
                      background: 'rgba(255,255,255,0.9)'
                    }
                  }),
                  // Параметры в ряд
                  React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } },
                    // Пульс от-до
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'rgba(244,63,94,0.08)', borderRadius: '8px' } },
                      React.createElement('span', { style: { fontSize: '12px', color: 'var(--gray-500)' } }, '💓'),
                      React.createElement('input', {
                        type: 'number', value: z.hrFrom, onChange: e => updateZone(i, { hrFrom: Number(e.target.value) || 0 }), onFocus: e => e.target.select(),
                        style: { width: '50px', padding: '4px 6px', fontSize: '13px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '6px' }
                      }),
                      React.createElement('span', { style: { color: 'var(--gray-400)' } }, '—'),
                      React.createElement('input', {
                        type: 'number', value: z.hrTo, onChange: e => updateZone(i, { hrTo: Number(e.target.value) || 0 }), onFocus: e => e.target.select(),
                        style: { width: '50px', padding: '4px 6px', fontSize: '13px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '6px' }
                      }),
                      React.createElement('span', { style: { fontSize: '11px', color: 'var(--gray-400)' } }, 'уд/мин')
                    ),
                    // MET
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'rgba(59,130,246,0.08)', borderRadius: '8px' } },
                      React.createElement('span', { style: { fontSize: '12px', color: 'var(--gray-500)' } }, '⚡'),
                      React.createElement('span', { style: { fontSize: '12px', color: 'var(--gray-500)' } }, 'MET'),
                      React.createElement('input', {
                        type: 'number', step: '0.1', value: z.MET, onChange: e => updateZone(i, { MET: Number(e.target.value) || 0 }), onFocus: e => e.target.select(),
                        style: { width: '45px', padding: '4px 6px', fontSize: '13px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '6px' }
                      })
                    ),
                    // Калории в минуту (computed)
                    React.createElement('div', { style: { padding: '6px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', marginLeft: 'auto' } },
                      React.createElement('span', { style: { fontSize: '13px', fontWeight: 600, color: '#15803d' } }, `${calPerMin} кал/мин`)
                    )
                  )
                );
              })
            ),
            React.createElement('div', { className: 'muted', style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
              'Макс пульс = 220 − возраст. Кал/мин = MET × (вес × 0.0175) − 1.',
              zonesPending && React.createElement('span', { style: { color: '#f59e0b', fontSize: '13px', fontWeight: 500 } }, '⏳ Сохраняется...'),
              zonesSaved && React.createElement('span', { style: { color: '#22c55e', fontSize: '13px', fontWeight: 500 } }, '✓ Сохранено')
            )
          ) // end profile-section__fields
        ), // end ProfileSection hrZones

        // === СЕКЦИЯ 3: Нормы и зоны ===
        React.createElement(ProfileSection, {
          id: 'norms',
          icon: '📊',
          title: 'Нормы питания',
          subtitle: 'Зоны калорийности и распределение БЖУ',
          tone: 'violet',
          expanded: expandedSections.norms,
          onToggle: () => toggleSection('norms')
        },
          React.createElement('div', { className: 'profile-section__fields' },
            // Зоны калорийности (ratio zones)
            React.createElement(HEYS_RatioZonesCard, null),
            React.createElement(HEYS_NormsCard, null)
          )
        ), // end ProfileSection norms

        // === СЕКЦИЯ 4: Безопасность (PIN) ===
        React.createElement(ProfileSection, {
          id: 'security',
          icon: '🔒',
          title: 'Безопасность',
          subtitle: 'Смена PIN для входа',
          tone: 'amber',
          expanded: expandedSections.security,
          onToggle: () => toggleSection('security')
        },
          React.createElement('div', { className: 'profile-section__fields' },
            React.createElement('div', { className: 'profile-field-group' },
              React.createElement('div', { className: 'profile-field-group__header', style: { alignItems: 'center', gap: '8px' } },
                React.createElement('span', { className: 'profile-field-group__icon' }, '📞'),
                React.createElement('span', { className: 'profile-field-group__title' }, 'PIN клиента'),
                React.createElement('span', { className: 'profile-field-group__badge' }, `Client ID: ${getShortClientId(getCurrentClientId())}`)
              ),
              React.createElement('div', { className: 'muted', style: { marginBottom: '8px' } }, 'Новый PIN должен состоять из 4 цифр. Старый PIN не требуется — изменение доступно только куратору.'),
              React.createElement('div', { className: 'field-list' },
                React.createElement('div', { className: 'inline-field' },
                  React.createElement('label', null, 'Новый PIN'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  React.createElement('input', {
                    type: 'password',
                    inputMode: 'numeric',
                    pattern: '\\d*',
                    maxLength: 4,
                    value: pinForm.pin,
                    onChange: e => setPinForm(prev => ({ ...prev, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })),
                    placeholder: '4 цифры',
                    style: { width: '120px' }
                  })
                ),
                React.createElement('div', { className: 'inline-field' },
                  React.createElement('label', null, 'Подтверждение'),
                  React.createElement('span', { className: 'sep' }, '-'),
                  React.createElement('input', {
                    type: 'password',
                    inputMode: 'numeric',
                    pattern: '\\d*',
                    maxLength: 4,
                    value: pinForm.confirm,
                    onChange: e => setPinForm(prev => ({ ...prev, confirm: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })),
                    placeholder: 'Ещё раз',
                    style: { width: '120px' }
                  })
                )
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' } },
                React.createElement('button', {
                  className: 'btn',
                  onClick: handlePinUpdate,
                  disabled: pinStatus === 'pending',
                  style: { minWidth: '140px' }
                }, pinStatus === 'pending' ? 'Сохраняю…' : 'Обновить PIN'),
                pinStatus === 'pending' && React.createElement('span', { style: { color: '#f59e0b' } }, '⏳'),
                pinStatus === 'success' && React.createElement('span', { style: { color: '#22c55e' } }, '✓ Готово'),
                pinStatus === 'error' && React.createElement('span', { style: { color: '#ef4444' } }, '⚠️ Ошибка')
              ),
              pinMessage && React.createElement('div', { className: 'muted', style: { marginTop: '6px', color: pinStatus === 'error' ? '#ef4444' : 'var(--gray-600)' } }, pinMessage)
            )
          )
        ), // end ProfileSection security

        // === СЕКЦИЯ 5: Подписка (новый модуль HEYS.Subscription) ===
        React.createElement(ProfileSection, {
          id: 'subscription',
          icon: '💎',
          title: 'Подписка',
          subtitle: (() => {
            const cached = window.HEYS?.Subscription?.getCachedStatus?.();
            if (!cached) return 'Загрузка...';
            const meta = window.HEYS.Subscription.getStatusMeta(cached.status);
            return meta?.label || 'Тариф и оплата';
          })(),
          tone: 'emerald',
          expanded: expandedSections.subscription,
          onToggle: () => toggleSection('subscription')
        },
          // Простой компонент статуса подписки
          React.createElement(SubscriptionStatusSection)
        ),

        // === СЕКЦИЯ 6: Система и аналитика ===
        React.createElement(ProfileSection, {
          id: 'system',
          icon: '⚙️',
          title: 'Система',
          subtitle: 'Советы, достижения и аналитика',
          tone: 'slate',
          expanded: expandedSections.system,
          onToggle: () => toggleSection('system')
        },
          React.createElement('div', { className: 'profile-section__fields' },
            // 🖥️ Доступ с компьютера
            React.createElement('div', { className: 'profile-field-group' },
              React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, '🖥️'),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Доступ с компьютера')
              ),
              React.createElement('div', { style: { marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                React.createElement('span', { style: { color: 'var(--gray-600)' } },
                  'Разрешить вход с десктопа'
                ),
                React.createElement('label', { className: 'toggle-switch' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: !!profile.desktopAllowed,
                    onChange: e => updateProfileField('desktopAllowed', e.target.checked)
                  }),
                  React.createElement('span', { className: 'toggle-slider' })
                )
              ),
              React.createElement('div', { className: 'muted', style: { marginTop: '6px', fontSize: '13px' } },
                profile.desktopAllowed
                  ? '✓ Можно открывать на компьютере'
                  : 'Приложение работает только на телефоне'
              )
            ),
            // Перезапуск обучения (Onboarding Tour)
            React.createElement('div', { className: 'profile-field-group' },
              React.createElement('div', { className: 'profile-field-group__header' },
                React.createElement('span', { className: 'profile-field-group__icon' }, '🎓'),
                React.createElement('span', { className: 'profile-field-group__title' }, 'Обучение')
              ),
              React.createElement('div', { style: { marginTop: 8 } },
                React.createElement('button', {
                  className: 'btn btn--secondary btn--full',
                  style: { justifyContent: 'center' },
                  onClick: () => {
                    if (window.HEYS.OnboardingTour) {
                      window.HEYS.OnboardingTour.start({ force: true });
                    } else {
                      window.alert('Модуль обучения не загружен');
                    }
                  }
                }, 'Запустить обучение заново')
              )
            ),

            // 🔊 Звуковые эффекты
            React.createElement(SoundSettingsCard, null),

            // 🚫 Скрытые продукты (игнор-лист)
            React.createElement(DeletedProductsCard, null),

            // Статистика советов
            React.createElement(HEYS_AdviceStatsCard, null),
            // Настройки советов
            React.createElement(HEYS_AdviceSettingsCard, null),
            // Аналитика (перенесено из hdr-top)
            window.HEYS.analyticsUI
              ? React.createElement('div', { className: 'profile-field-group' },
                React.createElement('div', { className: 'profile-field-group__header' },
                  React.createElement('span', { className: 'profile-field-group__icon' }, '📊'),
                  React.createElement('span', { className: 'profile-field-group__title' }, 'Аналитика')
                ),
                React.createElement('div', { style: { marginTop: '8px' } },
                  React.createElement(window.HEYS.analyticsUI.AnalyticsButton)
                )
              )
              : null
          ) // end profile-section__fields
        ) // end ProfileSection system

      ) // end profile-accordion
    );
  }

  // === 🔊 Настройки звуков ===
  function SoundSettingsCard() {
    const [settings, setSettings] = React.useState(() => {
      return window.HEYS?.audio?.getSettings?.() || {
        masterEnabled: true,
        volume: 0.12,
        hapticEnabled: true,
        quietHoursEnabled: true
      };
    });

    const handleMasterToggle = (e) => {
      const newSettings = { ...settings, masterEnabled: e.target.checked };
      setSettings(newSettings);
      window.HEYS?.audio?.saveSettings?.({ masterEnabled: e.target.checked });
    };

    const handleHapticToggle = (e) => {
      const newSettings = { ...settings, hapticEnabled: e.target.checked };
      setSettings(newSettings);
      window.HEYS?.audio?.saveSettings?.({ hapticEnabled: e.target.checked });
    };

    const handleQuietToggle = (e) => {
      const newSettings = { ...settings, quietHoursEnabled: e.target.checked };
      setSettings(newSettings);
      window.HEYS?.audio?.saveSettings?.({ quietHoursEnabled: e.target.checked });
    };

    const handleVolumeChange = (e) => {
      const volume = parseFloat(e.target.value);
      const newSettings = { ...settings, volume };
      setSettings(newSettings);
      window.HEYS?.audio?.saveSettings?.({ volume });
    };

    const previewReward = () => {
      window.HEYS?.audio?.preview?.('reward');
    };

    const previewSuccess = () => {
      window.HEYS?.audio?.preview?.('success');
    };

    const previewTriumph = () => {
      window.HEYS?.audio?.preview?.('triumph');
    };

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header' },
        React.createElement('span', { className: 'profile-field-group__icon' }, '🔊'),
        React.createElement('span', { className: 'profile-field-group__title' }, 'Звук и вибрация')
      ),
      React.createElement('div', { className: 'sound-settings-card' },

        // Master toggle
        React.createElement('div', { className: 'sound-settings-card__row' },
          React.createElement('span', { className: 'sound-settings-card__label sound-settings-card__label--strong' }, 'Звуки включены'),
          React.createElement('label', { className: 'toggle-switch' },
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.masterEnabled !== false,
              onChange: handleMasterToggle
            }),
            React.createElement('span', { className: 'toggle-slider' })
          )
        ),

        // Expanded controls (visible when master is on)
        settings.masterEnabled !== false && React.createElement(React.Fragment, null,

          // Volume
          React.createElement('div', { className: 'sound-settings-card__slider-row' },
            React.createElement('span', { className: 'sound-settings-card__slider-label' }, 'Громкость'),
            React.createElement('input', {
              type: 'range',
              min: '0.04',
              max: '0.3',
              step: '0.02',
              value: settings.volume ?? 0.12,
              onChange: handleVolumeChange,
              className: 'sound-settings-card__slider-input'
            }),
            React.createElement('span', { className: 'sound-settings-card__slider-value' },
              `${Math.round((settings.volume ?? 0.12) * 100)}%`
            )
          ),

          // Haptic toggle
          React.createElement('div', { className: 'sound-settings-card__row' },
            React.createElement('span', { className: 'sound-settings-card__label' }, 'Вибрация'),
            React.createElement('label', { className: 'toggle-switch' },
              React.createElement('input', {
                type: 'checkbox',
                checked: settings.hapticEnabled !== false,
                onChange: handleHapticToggle
              }),
              React.createElement('span', { className: 'toggle-slider' })
            )
          ),

          // Quiet hours toggle
          React.createElement('div', { className: 'sound-settings-card__row' },
            React.createElement('div', { className: 'sound-settings-card__hint-group' },
              React.createElement('div', { className: 'sound-settings-card__label' }, 'Тихие часы'),
              React.createElement('div', { className: 'sound-settings-card__hint-subtitle' }, '23:00 – 07:00')
            ),
            React.createElement('label', { className: 'toggle-switch' },
              React.createElement('input', {
                type: 'checkbox',
                checked: settings.quietHoursEnabled !== false,
                onChange: handleQuietToggle
              }),
              React.createElement('span', { className: 'toggle-slider' })
            )
          ),

          // Preview buttons
          React.createElement('div', null,
            React.createElement('div', { className: 'sound-settings-card__preview-title' }, 'Предпрослушивание'),
            React.createElement('div', { className: 'sound-settings-card__preview-actions' },
              React.createElement('button', {
                className: 'btn-secondary sound-settings-card__preview-button',
                onClick: previewReward
              }, '✨ XP'),
              React.createElement('button', {
                className: 'btn-secondary sound-settings-card__preview-button',
                onClick: previewSuccess
              }, '✅ Цель'),
              React.createElement('button', {
                className: 'btn-secondary sound-settings-card__preview-button',
                onClick: previewTriumph
              }, '🏆 Уровень')
            )
          )
        ),

        // Status hint
        React.createElement('div', { className: 'muted sound-settings-card__status' },
          settings.masterEnabled !== false
            ? '✓ Звуки активны — XP, еда, достижения, советы'
            : 'Звуки и вибрация отключены'
        )
      )
    );
  }

  // Шим для старых вызовов window.playXPSound (обратная совместимость)
  if (typeof window !== 'undefined') {
    window.playXPSound = (isLevelUp) => {
      window.HEYS?.audio?.play?.(isLevelUp ? 'levelUp' : 'xpGained');
    };
  }

  // === 🚫 Скрытые (удалённые) продукты ===
  function DeletedProductsCard() {
    const [products, setProducts] = React.useState([]);
    const [expanded, setExpanded] = React.useState(false);

    // Загружаем список удалённых продуктов
    const loadProducts = React.useCallback(() => {
      if (window.HEYS?.deletedProducts?.getAll) {
        const all = window.HEYS.deletedProducts.getAll();
        setProducts(all);
      }
    }, []);

    React.useEffect(() => {
      loadProducts();
      // Подписываемся на изменения
      const handleChange = () => loadProducts();
      window.addEventListener('heys:deleted-products-changed', handleChange);
      return () => window.removeEventListener('heys:deleted-products-changed', handleChange);
    }, [loadProducts]);

    // Восстановить продукт (убрать из игнор-листа)
    const handleRestore = (entry) => {
      if (!window.HEYS?.deletedProducts?.remove) return;

      if (!confirm(`Восстановить "${entry.name}" из скрытых?\n\nПродукт снова будет появляться в поиске и синхронизироваться с облаком.`)) {
        return;
      }

      window.HEYS.deletedProducts.remove(entry.name, entry.id, entry.fingerprint);
      loadProducts();

      // Haptic feedback
      if (window.HEYS?.dayUtils?.haptic) {
        window.HEYS.dayUtils.haptic('light');
      }
    };

    // Очистить весь список
    const handleClearAll = () => {
      if (products.length === 0) return;
      if (!confirm(`Восстановить все ${products.length} скрытых продуктов?\n\nОни снова будут появляться в поиске.`)) {
        return;
      }
      if (window.HEYS?.deletedProducts?.clear) {
        window.HEYS.deletedProducts.clear();
        loadProducts();
      }
    };

    const count = products.length;
    const ttlDays = window.HEYS?.deletedProducts?.TTL_DAYS || 90;

    // Форматирование даты удаления
    const formatDeletedDate = (timestamp) => {
      if (!timestamp) return '';
      const now = Date.now();
      const daysAgo = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));
      if (daysAgo === 0) return 'сегодня';
      if (daysAgo === 1) return 'вчера';
      if (daysAgo < 7) return `${daysAgo} дн. назад`;
      if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} нед. назад`;
      return `${Math.floor(daysAgo / 30)} мес. назад`;
    };

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', {
        className: 'profile-field-group__header',
        style: { cursor: count > 0 ? 'pointer' : 'default' },
        onClick: () => count > 0 && setExpanded(!expanded)
      },
        React.createElement('span', { className: 'profile-field-group__icon' }, '🚫'),
        React.createElement('span', { className: 'profile-field-group__title' }, 'Скрытые продукты'),
        count > 0 && React.createElement('span', {
          style: {
            marginLeft: 'auto',
            background: 'var(--gray-200)',
            color: 'var(--gray-600)',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: '500'
          }
        }, count),
        count > 0 && React.createElement('span', {
          style: {
            marginLeft: '8px',
            color: 'var(--gray-400)',
            fontSize: '16px',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),
      React.createElement('div', { style: { marginTop: '8px' } },
        count === 0
          ? React.createElement('div', {
            className: 'muted',
            style: { fontSize: '13px' }
          }, '✓ Нет скрытых продуктов')
          : React.createElement(React.Fragment, null,
            React.createElement('div', {
              className: 'muted',
              style: { fontSize: '13px', marginBottom: '8px' }
            }, `Продукты, которые вы удалили. Они не будут восстанавливаться из облака. Автоочистка через ${ttlDays} дней.`),
            expanded && React.createElement('div', {
              style: {
                maxHeight: '200px',
                overflowY: 'auto',
                marginBottom: '8px',
                borderRadius: '8px',
                border: '1px solid var(--gray-200)'
              }
            },
              products.map((entry, i) =>
                React.createElement('div', {
                  key: entry.name + i,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: i < products.length - 1 ? '1px solid var(--gray-100)' : 'none',
                    background: i % 2 === 0 ? 'var(--gray-50)' : 'white'
                  }
                },
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', {
                      style: {
                        fontSize: '14px',
                        color: 'var(--gray-700)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }
                    }, entry.name),
                    React.createElement('div', {
                      style: { fontSize: '11px', color: 'var(--gray-400)' }
                    }, `Удалён ${formatDeletedDate(entry.deletedAt)}`)
                  ),
                  React.createElement('button', {
                    style: {
                      background: 'var(--green-50)',
                      border: '1px solid var(--green-200)',
                      color: 'var(--green-600)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      marginLeft: '8px',
                      whiteSpace: 'nowrap'
                    },
                    onClick: (e) => {
                      e.stopPropagation();
                      handleRestore(entry);
                    }
                  }, '↩ Вернуть')
                )
              )
            ),
            expanded && count > 1 && React.createElement('button', {
              style: {
                width: '100%',
                background: 'var(--gray-100)',
                border: '1px solid var(--gray-200)',
                color: 'var(--gray-600)',
                padding: '8px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              },
              onClick: handleClearAll
            }, `↩ Восстановить все (${count})`)
          )
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

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header' },
        React.createElement('span', { className: 'profile-field-group__icon' }, '💡'),
        React.createElement('span', { className: 'profile-field-group__title' }, 'Советы')
      ),
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

    const [settings, setSettings] = React.useState(function () { return advice.getAdviceSettings(); });
    const [saved, setSaved] = React.useState(false);

    const categories = advice.CATEGORY_LABELS || {};

    var toggleCategory = function (cat, enabled) {
      var newSettings = {
        ...settings,
        categories: { ...settings.categories, [cat]: enabled }
      };
      setSettings(newSettings);
      advice.setAdviceSettings(newSettings);
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 1500);
    };

    var updateSetting = function (key, value) {
      var newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      advice.setAdviceSettings(newSettings);
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 1500);
    };

    var catEntries = Object.entries(categories);

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header' },
        React.createElement('span', { className: 'profile-field-group__icon' }, '⚙️'),
        React.createElement('span', { className: 'profile-field-group__title' }, 'Настройки советов')
      ),

      // Категории — компактный grid 3 колонки
      React.createElement('div', {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '12px'
        }
      },
        catEntries.map(function (entry) {
          var cat = entry[0];
          var info = entry[1];
          var isEnabled = settings.categories?.[cat] !== false;

          return React.createElement('div', {
            key: cat,
            title: info.desc,
            onClick: function () { toggleCategory(cat, !isEnabled); },
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: isEnabled ? 'rgba(59, 130, 246, 0.08)' : 'var(--gray-50)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '14px',
              fontWeight: 500,
              color: isEnabled ? 'var(--blue-600)' : 'var(--gray-500)',
              border: isEnabled ? '2px solid var(--blue-400)' : '2px solid var(--gray-200)',
              userSelect: 'none'
            }
          },
            React.createElement('span', { style: { fontSize: '16px' } }, info.icon),
            React.createElement('span', null, info.name)
          );
        })
      ),

      // Общие настройки — горизонтальная строка
      React.createElement('div', {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '16px',
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--gray-200)'
        }
      },
        // Haptic
        React.createElement('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: settings.hapticEnabled !== false,
            onChange: function (e) { updateSetting('hapticEnabled', e.target.checked); },
            style: { width: '16px', height: '16px' }
          }),
          React.createElement('span', null, '📳 Вибрация')
        ),

        // Sound
        React.createElement('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: settings.soundEnabled !== false,
            onChange: function (e) { updateSetting('soundEnabled', e.target.checked); },
            style: { width: '16px', height: '16px' }
          }),
          React.createElement('span', null, '🔔 Звук')
        ),

        // Show details
        React.createElement('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: settings.showDetails !== false,
            onChange: function (e) { updateSetting('showDetails', e.target.checked); },
            style: { width: '16px', height: '16px' }
          }),
          React.createElement('span', null, '📖 Детали')
        ),

        // Max per day
        React.createElement('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px'
          }
        },
          React.createElement('span', null, '📊 Макс:'),
          React.createElement('input', {
            type: 'number',
            min: 5,
            max: 50,
            value: settings.maxPerDay || 20,
            onChange: function (e) { updateSetting('maxPerDay', parseInt(e.target.value) || 20); },
            style: {
              width: '50px',
              padding: '4px 6px',
              borderRadius: '6px',
              border: '1px solid var(--gray-300)',
              textAlign: 'center',
              fontSize: '13px'
            }
          })
        )
      ),

      saved && React.createElement('div', {
        style: { marginTop: '8px', color: 'var(--green-600)', fontSize: '12px', textAlign: 'center' }
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
      return React.createElement('div', { className: 'profile-field-group' },
        React.createElement('div', { className: 'muted' }, 'Модуль ratioZones не загружен')
      );
    }

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header', style: { justifyContent: 'space-between' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'profile-field-group__icon' }, '🎨'),
          React.createElement('span', { className: 'profile-field-group__title' }, 'Зоны калорийности')
        ),
        React.createElement('button', { className: 'btn btn-sm', onClick: resetZones, style: { marginLeft: 'auto' } }, 'Сбросить')
      ),
      React.createElement('div', { className: 'muted', style: { marginBottom: '12px' } },
        'Определяют цвета в календаре, графиках и советах. Ratio = съедено / норма.'
      ),
      React.createElement('div', { className: 'ratio-zones-list' },
        zones.map((z, i) => {
          const demoRatio = z.to === Infinity ? z.from + 0.2 : (z.from + z.to) / 2;
          const bgColor = rz.getGradientColor(demoRatio, 0.5);
          const fromVal = i === 0 ? null : z.from;
          const toVal = i === zones.length - 1 ? null : z.to;

          return React.createElement('div', {
            key: z.id,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              marginBottom: '6px',
              background: 'rgba(255,255,255,0.6)',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.05)'
            }
          },
            React.createElement('div', {
              style: {
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: z.color,
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }
            }),
            React.createElement('input', {
              value: z.name,
              onChange: function (e) { updateZone(i, 'name', e.target.value); },
              style: {
                flex: 1,
                minWidth: 0,
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.8)',
                fontWeight: 500
              }
            }),
            React.createElement('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }
            },
              fromVal === null
                ? React.createElement('span', { style: { width: '45px', textAlign: 'center', fontSize: '12px', color: 'var(--gray-400)' } }, '0%')
                : React.createElement('input', {
                  type: 'number',
                  step: '0.05',
                  min: '0',
                  max: '2',
                  value: fromVal,
                  onChange: function (e) { updateZone(i, 'from', parseFloat(e.target.value) || 0); },
                  style: { width: '45px', padding: '5px', fontSize: '12px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '5px' }
                }),
              React.createElement('span', { style: { color: 'var(--gray-400)', fontSize: '11px' } }, '→'),
              toVal === null
                ? React.createElement('span', { style: { width: '45px', textAlign: 'center', fontSize: '12px', color: 'var(--gray-400)' } }, '∞')
                : React.createElement('input', {
                  type: 'number',
                  step: '0.05',
                  min: '0',
                  max: '2',
                  value: toVal,
                  onChange: function (e) { updateZone(i, 'to', parseFloat(e.target.value) || 0); },
                  style: { width: '45px', padding: '5px', fontSize: '12px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '5px' }
                })
            ),
            React.createElement('div', {
              style: {
                padding: '4px 10px',
                borderRadius: '6px',
                background: bgColor,
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 600,
                flexShrink: 0,
                minWidth: '45px'
              }
            }, fmtPct(demoRatio))
          );
        })
      ),
      React.createElement('div', { className: 'muted', style: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' } },
        'Зоны применяются везде: календарь, sparkline, heatmap, советы.',
        saved && React.createElement('span', { style: { color: '#22c55e', fontSize: '13px', fontWeight: 500 } }, '✓ Сохранено')
      )
    );
  }


  // === Нормы (встроенный блок) ===
  function HEYS_NormsCard() {
    const U = HEYS.utils || {};
    const clamp = (v) => Math.max(0, Math.min(100, (U.toNum ? U.toNum(v) : Number(v) || 0)));
    // Используем глобальные lsGet/lsSet из начала модуля
    const [norms, setNorms] = React.useState(() => {
      const val = readStoredValue('heys_norms', {
        carbsPct: 0, proteinPct: 0, badFatPct: 0, superbadFatPct: 0, simpleCarbPct: 0, giPct: 0, harmPct: 0, fiberPct: 0
      });
      // Служебные поля для сравнения версий с облаком
      return { revision: 0, updatedAt: 0, ...val };
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
        writeStoredValue('heys_norms', { ...norms, updatedAt: Date.now() });
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

        const newNorms = readStoredValue('heys_norms', {
          carbsPct: 0, proteinPct: 0, badFatPct: 0, superbadFatPct: 0, simpleCarbPct: 0, giPct: 0, harmPct: 0, fiberPct: 0
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

    const update = (k, v) => {
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

    return React.createElement('div', { className: 'profile-field-group' },
      React.createElement('div', { className: 'profile-field-group__header' },
        React.createElement('span', { className: 'profile-field-group__icon' }, '📊'),
        React.createElement('span', { className: 'profile-field-group__title' }, 'Нормы')
      ),
      React.createElement('div', { className: 'field-list' },
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Углеводы (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: carb, onChange: e => update('carbsPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'carbsPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Белки (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: prot, onChange: e => update('proteinPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'proteinPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Жиры (%) — авто = 100 − У − Б'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: fatAuto })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Вредные жиры (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: badF, onChange: e => update('badFatPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'badFatPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Супервредные жиры (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: superBadF, onChange: e => update('superbadFatPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'superbadFatPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Полезные жиры (%) — авто = 100 − вредные − супервредные'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: goodFAuto })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Простые углеводы (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: simpleC, onChange: e => update('simpleCarbPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'simpleCarbPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Сложные углеводы (%) — авто = 100 − простые'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { className: 'readOnly', readOnly: true, value: complexCAuto })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'ГИ (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.giPct), onChange: e => update('giPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'giPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Вредность (%) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.harmPct), onChange: e => update('harmPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'harmPct' })),
        React.createElement('div', { className: 'inline-field' }, React.createElement('label', null, 'Клетчатка (г/1000 ккал) — вручную'), React.createElement('span', { className: 'sep' }, '-'), React.createElement('input', { type: 'number', min: 0, max: 100, step: '1', value: clamp(norms.fiberPct), onChange: e => update('fiberPct', e.target.value), onFocus: e => e.target.select() }), React.createElement(NormFieldStatus, { fieldKey: 'fiberPct' }))
      ),
      (overMacro || overFatSplit || overCarbSplit) ?
        React.createElement('div', { className: 'muted', style: { marginTop: '6px', color: '#dc2626' } },
          (overMacro ? 'Предупреждение: У% + Б% превышают 100. Жиры будут обнулены. ' : ''),
          (overFatSplit ? 'Предупреждение: Вредные% + Супервредные% > 100. Полезные будут обнулены. ' : ''),
          (overCarbSplit ? 'Предупреждение: Простые% > 100. Сложные будут обнулены.' : '')
        )
        : null,
      React.createElement('div', { className: 'muted', style: { marginTop: '6px' } },
        'Все значения сохраняются автоматически. Жиры считаются из 9 ккал/г, клетчатка — в граммах на 1000 ккал.'
      )
    );
  }

  function UserTab(props) {
    return React.createElement(UserTabBase, props);
  }

  HEYS.UserTab = UserTab;

  // Экспорт функций для использования в других модулях
  HEYS.calcSleepNorm = calcSleepNorm;
  HEYS.calcAgeFromBirthDate = calcAgeFromBirthDate;

})(window);
