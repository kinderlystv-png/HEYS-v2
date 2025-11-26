// heys_user_v12.ts — вкладка «Данные пользователя» (TypeScript version)

import React from 'react';

import type { HEYSGlobal, PulseZone, UserProfile, UserTabProps } from './types/heys';

// Declare global types
declare global {
  interface Window {
    React: typeof React;
    HEYS: HEYSGlobal;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const React = global.React;
  const { lsGet, lsSet, toNum, round1 } = HEYS.utils || {
    lsGet: (k: string, d: any) => d,
    lsSet: () => {},
    toNum: (x: any) => Number(x) || 0,
    round1: (v: number) => Math.round(v * 10) / 10,
  };

  function UserTabBase(): React.ReactElement {
    const [profile, setProfile] = React.useState<UserProfile>(() => {
      return lsGet('heys_profile', {
        firstName: '',
        lastName: '',
        gender: 'Мужской',
        weight: 70,
        height: 175,
        age: 30,
        sleepHours: 8,
        insulinWaveHours: 3,
      });
    });

    const defaultZones = React.useMemo<PulseZone[]>(() => {
      const maxHR = Math.max(0, 220 - toNum(profile.age || 0));
      const z = (fromPct: number, toPct: number, minPct: number, maxPct: number) => ({
        hrFrom: Math.round(maxHR * fromPct),
        hrTo: Math.round(maxHR * toPct),
        min: minPct,
        max: maxPct,
      });
      return [
        { name: 'Бытовая активность (ходьба)', ...z(0.5, 0.6, 50, 60), MET: 2.5 },
        { name: 'Умеренная активность (медленный бег)', ...z(0.6, 0.75, 60, 75), MET: 6 },
        { name: 'Аэробная (кардио)', ...z(0.75, 0.85, 75, 85), MET: 8 },
        { name: 'Анаэробная (активная нагрузка, когда тяжело)', ...z(0.85, 0.95, 85, 95), MET: 10 },
      ];
    }, [profile.age]);

    const [zones, setZones] = React.useState<PulseZone[]>(lsGet('heys_hr_zones', defaultZones));

    // Перезагрузка данных при смене клиента (как в данных дня)
    React.useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;

      const reloadData = () => {
        if (cancelled) return;
        console.log('[Profile] Reloading data after client change...');

        const newProfile = lsGet('heys_profile', {
          firstName: '',
          lastName: '',
          gender: 'Мужской',
          weight: 70,
          height: 175,
          age: 30,
          sleepHours: 8,
          insulinWaveHours: 3,
        });
        console.log('[Profile] Loaded profile:', newProfile);
        setProfile(newProfile);

        const newZones = lsGet('heys_hr_zones', defaultZones);
        console.log('[Profile] Loaded zones:', newZones);
        setZones(newZones);
      };

      if (clientId && cloud && cloud.bootstrapClientSync) {
        cloud.bootstrapClientSync(clientId).then(() => {
          setTimeout(reloadData, 150);
        });
      }

      return () => {
        cancelled = true;
      };
    }, [window.HEYS && window.HEYS.currentClientId, defaultZones]);

    // Автосохранение профиля
    React.useEffect(() => {
      lsSet('heys_profile', profile);
    }, [profile]);

    // Автосохранение зон
    React.useEffect(() => {
      lsSet('heys_hr_zones', zones);
    }, [zones]);

    // Обновление профиля
    const updateProfile = (field: keyof UserProfile, value: any) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
    };

    // Обновление зоны
    const updateZone = (index: number, field: keyof PulseZone, value: any) => {
      setZones((prev) => {
        const newZones = [...prev];
        newZones[index] = { ...newZones[index], [field]: value };
        return newZones;
      });
    };

    // Render basic structure
    return React.createElement(
      'div',
      { className: 'user-tab' },
      React.createElement(
        'div',
        { className: 'card' },
        React.createElement('h3', null, 'Профиль пользователя'),
        React.createElement(
          'div',
          { className: 'profile-form' },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Имя',
            value: profile.firstName || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              updateProfile('firstName', e.target.value),
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Фамилия',
            value: profile.lastName || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              updateProfile('lastName', e.target.value),
          }),
          React.createElement(
            'select',
            {
              value: profile.gender || 'Мужской',
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                updateProfile('gender', e.target.value),
            },
            React.createElement('option', { value: 'Мужской' }, 'Мужской'),
            React.createElement('option', { value: 'Женский' }, 'Женский'),
          ),
          React.createElement('input', {
            type: 'number',
            placeholder: 'Вес (кг)',
            value: profile.weight || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              updateProfile('weight', toNum(e.target.value)),
          }),
          React.createElement('input', {
            type: 'number',
            placeholder: 'Рост (см)',
            value: profile.height || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              updateProfile('height', toNum(e.target.value)),
          }),
          React.createElement('input', {
            type: 'number',
            placeholder: 'Возраст',
            value: profile.age || '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              updateProfile('age', toNum(e.target.value)),
          }),
        ),
      ),
      React.createElement(
        'div',
        { className: 'card' },
        React.createElement('h3', null, 'Пульсовые зоны'),
        React.createElement(
          'div',
          { className: 'zones-list' },
          zones.map((zone, index) =>
            React.createElement(
              'div',
              { key: index, className: 'zone-item' },
              React.createElement('span', null, zone.name),
              React.createElement('input', {
                type: 'number',
                placeholder: 'От',
                value: zone.hrFrom || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  updateZone(index, 'hrFrom', toNum(e.target.value)),
              }),
              React.createElement('input', {
                type: 'number',
                placeholder: 'До',
                value: zone.hrTo || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  updateZone(index, 'hrTo', toNum(e.target.value)),
              }),
              React.createElement('input', {
                type: 'number',
                step: '0.1',
                placeholder: 'MET',
                value: zone.MET || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  updateZone(index, 'MET', toNum(e.target.value)),
              }),
            ),
          ),
        ),
      ),
    );
  }

  // UserTab с дополнительной логикой (если есть)
  function UserTab(props: UserTabProps): React.ReactElement {
    return React.createElement(UserTabBase);
  }

  // Export to HEYS namespace
  HEYS.UserTab = UserTab;
})(window);
