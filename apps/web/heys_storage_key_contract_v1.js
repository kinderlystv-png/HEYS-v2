// heys_storage_key_contract_v1.js — pure storage-key ownership contract.
// Load before heys_storage_supabase_v1.js (boot-core bundle).
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  if (HEYS.storageKeyContract?.version === 1) return;

  const CLIENT_SCOPED_KEY_RE = /^heys_([a-f0-9-]{36})_/i;

  function stripClientScopePrefixes(key) {
    if (typeof key !== 'string') {
      return { key, strippedClientIds: [] };
    }

    let normalized = key;
    const strippedClientIds = [];
    let guard = 0;

    while (guard < 4) {
      const match = normalized.match(CLIENT_SCOPED_KEY_RE);
      if (!match) break;
      strippedClientIds.push(match[1]);
      normalized = `heys_${normalized.slice(match[0].length)}`;
      guard += 1;
    }

    return { key: normalized, strippedClientIds };
  }

  function getLeadingClientScopeId(key) {
    const match = typeof key === 'string' ? key.match(CLIENT_SCOPED_KEY_RE) : null;
    return match ? match[1] : '';
  }

  function stripCurrentClientScopePrefixes(key, clientId) {
    if (!clientId || typeof key !== 'string') return key;

    let normalized = key;
    const ownPrefix = `heys_${clientId}_`;
    let guard = 0;

    while (guard < 4 && normalized.startsWith(ownPrefix)) {
      normalized = `heys_${normalized.slice(ownPrefix.length)}`;
      guard += 1;
    }

    return normalized;
  }

  function isForeignClientScopedKey(key, clientId) {
    if (!clientId || typeof key !== 'string') return false;
    const leadingClientId = getLeadingClientScopeId(key);
    return !!leadingClientId && leadingClientId !== clientId;
  }

  function isSensitiveSessionStorageKey(key) {
    if (typeof key !== 'string' || !key) return false;
    if (key.indexOf('sb-') === 0) return true;

    const normalizedKey = stripClientScopePrefixes(key).key;
    return normalizedKey === 'heys_supabase_auth_token'
      || normalizedKey === 'heys_pin_auth_client'
      || normalizedKey === 'heys_curator_session'
      || normalizedKey === 'heys_session_token'
      || normalizedKey === 'heys_pin_cookie_session_hint'
      || normalizedKey === 'heys_curator_cookie_session_hint';
  }

  HEYS.storageKeyContract = {
    version: 1,
    CLIENT_SCOPED_KEY_RE,
    stripClientScopePrefixes,
    getLeadingClientScopeId,
    stripCurrentClientScopePrefixes,
    isForeignClientScopedKey,
    isSensitiveSessionStorageKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
