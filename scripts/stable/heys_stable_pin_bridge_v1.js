/**
 * stable.heyslab.ru only — PIN login bridge.
 *
 * The frozen login screen still calls verify_client_pin_v3. After login v2
 * that RPC rejects clients who already have access_code_hash. This wrap keeps
 * the old keypad/UI and retries through login_client_v1 / onetime PIN.
 */
(function (global) {
  'use strict';

  var DEVICE_KEY = 'heys_client_device_id_v1';

  function getDeviceId() {
    try {
      var existing = global.localStorage && global.localStorage.getItem(DEVICE_KEY);
      if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) {
        return existing;
      }
    } catch (_) { /* ignore */ }

    var id;
    try {
      id = global.crypto && typeof global.crypto.randomUUID === 'function'
        ? global.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0;
          var v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      global.localStorage.setItem(DEVICE_KEY, id);
    } catch (_) {
      id = '00000000-0000-4000-8000-000000000001';
    }
    return id;
  }

  function unwrap(res, name) {
    var data = res && res.data;
    if (!data) return null;
    if (data[name]) return data[name];
    if (Array.isArray(data)) return data[0];
    return data;
  }

  function asV3(row) {
    return {
      data: {
        verify_client_pin_v3: {
          success: !!(row && row.success && row.client_id && row.session_token),
          client_id: row && row.client_id,
          session_token: row && row.session_token,
          name: (row && (row.name || row.client_name)) || '',
          error: row && row.error,
          message: row && row.message,
        },
      },
      error: null,
    };
  }

  function install() {
    var api = global.HEYS && global.HEYS.YandexAPI;
    if (!api || typeof api.rpc !== 'function' || api.__stablePinBridge) return false;

    var origRpc = api.rpc.bind(api);
    api.rpc = function (fnName, params, requestOptions) {
      if (fnName !== 'verify_client_pin_v3') {
        return origRpc(fnName, params || {}, requestOptions);
      }

      return origRpc(fnName, params || {}, requestOptions).then(function (v3res) {
        var v3row = unwrap(v3res, 'verify_client_pin_v3');
        if (v3row && v3row.success) return v3res;

        var err = (v3row && v3row.error) || (v3res && v3res.error && v3res.error.message) || '';
        if (err !== 'access_code_login_required' && err !== 'pin_login_disabled') {
          return v3res;
        }

        var phone = params && params.p_phone;
        var pin = params && params.p_pin;
        var deviceId = getDeviceId();

        return origRpc('login_client_v1', {
          p_phone: phone,
          p_device_id: deviceId,
          p_access_code: null,
        }).then(function (first) {
          var row = unwrap(first, 'login_client_v1');
          if (row && row.success) return asV3(row);

          if (row && row.error === 'access_code_required') {
            return origRpc('login_client_v1', {
              p_phone: phone,
              p_device_id: deviceId,
              p_access_code: pin,
            }).then(function (second) {
              return asV3(unwrap(second, 'login_client_v1'));
            });
          }

          if (row && row.error === 'access_code_not_set') {
            return origRpc('verify_client_onetime_pin', {
              p_phone: phone,
              p_pin: pin,
              p_device_id: deviceId,
            }).then(function (onetime) {
              return asV3(unwrap(onetime, 'verify_client_onetime_pin'));
            });
          }

          return asV3(row || { success: false, error: err || 'invalid_credentials' });
        });
      });
    };

    api.__stablePinBridge = true;
    try { console.info('[STABLE_PIN_BRIDGE] verify_client_pin_v3 → login_client_v1 fallback'); } catch (_) { }
    return true;
  }

  if (install()) return;

  var tries = 0;
  var timer = global.setInterval(function () {
    tries += 1;
    if (install() || tries > 80) global.clearInterval(timer);
  }, 50);
})(typeof window !== 'undefined' ? window : this);
