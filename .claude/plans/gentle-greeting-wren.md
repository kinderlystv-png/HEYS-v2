# Plan: Fix Login-First Boot — Remove location.reload()

## Problem

Static login overlay works correctly, BUT after successful login
`location.reload()` destroys all downloaded bundles. On throttled networks:

- 28s on login screen (bundles downloading in background)
- `location.reload()` → 33s to re-download ALL bundles from scratch
- **Total: ~62s instead of ~33s** — optimization negated

Logs confirm: at +28.1s only 3/6 boot bundles loaded, then ALL re-download after
reload.

## Root Cause

`hlgHideOverlay(true)` calls `window.location.reload()` (index.html:1160). Both
login handlers pass `true` (lines 1309, 1379).

This was added to solve: React LoginScreen mounts behind overlay (z-index:9999)
and becomes visible when overlay just hides.

## Solution: Event-Based Handoff (No Reload)

Replace `location.reload()` with dispatching `heys:static-login-done` event that
React auth init listens for.

### Two Scenarios

**Slow network** (bundles take 30s+): User logs in before React mounts. When
React finally mounts, `runAuthInit()` reads localStorage → finds session → works
automatically. **Already works without reload.**

**Fast network** (bundles load in <5s): React/LoginScreen already mounted behind
overlay. Need to notify React to re-check auth state via event → triggers
`setClientId()` or `setCloudUser()` → gate re-evaluates → LoginScreen unmounts.

---

## Changes (3 files)

### File 1: `apps/web/index.html`

**A. `hlgHideOverlay`** (line 1154-1165) — remove `doReload`, just fade+hide:

```javascript
// BEFORE:
function hlgHideOverlay(doReload) {
    ...
    setTimeout(function () {
        if (doReload) { window.location.reload(); }
        else { gate.style.display = 'none'; }
    }, 320);
}

// AFTER:
function hlgHideOverlay() {
    ...
    setTimeout(function () {
        gate.style.display = 'none';
    }, 320);
}
```

**B. Client login success** (line 1309) — dispatch event:

```javascript
// BEFORE:
hlgHideOverlay(true);

// AFTER:
hlgHideOverlay();
try {
  window.dispatchEvent(
    new CustomEvent('heys:static-login-done', {
      detail: { mode: 'client', clientId: clientId },
    }),
  );
} catch (e) {}
```

**C. Curator login success** (line 1379) — dispatch event:

```javascript
// BEFORE:
hlgHideOverlay(true);

// AFTER:
hlgHideOverlay();
try {
  window.dispatchEvent(
    new CustomEvent('heys:static-login-done', {
      detail: { mode: 'curator', user: d.user, accessToken: d.access_token },
    }),
  );
} catch (e) {}
```

### File 2: `apps/web/heys_app_auth_init_v1.js`

Add event listener at end of `runAuthInit()` (before line 295
`return undefined`):

```javascript
// Listen for static login overlay completing login (no-reload handoff)
var staticLoginHandler = function (e) {
  var detail = e.detail || {};
  devLog('[AuthInit] heys:static-login-done received:', detail.mode);

  if (detail.mode === 'client') {
    // Same logic as PIN session branch (lines 257-287)
    var cid = detail.clientId || readGlobalValue('heys_pin_auth_client', null);
    if (cid && cloudRef) {
      if (cloudRef.setPinAuthClient) cloudRef.setPinAuthClient(cid);
      initLocalData();
      setStatus('online');
      setClientId(cid);
      window.HEYS.currentClientId = cid;
      cloudRef
        .syncClient(cid)
        .then(function () {
          devLog('[AuthInit] PIN session from static login OK');
        })
        .catch(function (err) {
          devWarn('[AuthInit] PIN session from static login error:', err);
        })
        .finally(function () {
          setIsInitializing(false);
        });
    }
  } else if (detail.mode === 'curator') {
    // Same logic as stored user branch (lines 232-256)
    var user = detail.user;
    if (!user) {
      try {
        var raw = localStorage.getItem('heys_supabase_auth_token');
        if (raw) user = JSON.parse(raw).user;
      } catch (_) {}
    }
    if (user && cloudRef) {
      setCloudUser(user);
      setEmail(user.email || '');
      setStatus('online');
      initLocalData({ skipClientRestore: false, skipPinAuthRestore: true });
      setIsInitializing(false);
    }
  }
};
window.addEventListener('heys:static-login-done', staticLoginHandler);

// Return cleanup function for useEffect
return function () {
  window.removeEventListener('heys:static-login-done', staticLoginHandler);
};
```

**Replace `return undefined;`** (line 295) with the returned cleanup function
above.

### File 3: `apps/web/heys_login_screen_v1.js`

**No changes needed.** Existing guard at line 44 handles slow-network case:

```javascript
if (
  window.__heysPreAuth &&
  Date.now() - (window.__heysPreAuth.timestamp || 0) < 30000
) {
  return null;
}
```

---

## Why This Works

### Gate Flow (heys_app_gate_flow_v1.js buildGate):

```
if (!clientId && isInitializing) → AppLoader (skeleton)
if (!clientId && !cloudUser)     → LoginScreen     ← was visible behind overlay
if (!clientId && cloudUser)      → ClientSelection  ← curator sets cloudUser
if (clientId)                    → null (main app)  ← client sets clientId
```

**Client login**: event → `setClientId(cid)` → gate `clientId` truthy → `null` →
LoginScreen unmounts → app.

**Curator login**: event → `setCloudUser(user)` → gate `cloudUser` truthy →
ClientSelectionModal → user picks client.

### Timing:

| Scenario                                   | What Happens                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Slow net (React not mounted)               | Event dispatched → no listener yet → no-op. React mounts later, reads localStorage naturally.                         |
| Fast net (React mounted)                   | Event dispatched → handler fires → `setClientId`/`setCloudUser` → React re-renders → gate changes → LoginScreen gone. |
| Edge case (event fires during React mount) | Either handler catches it, or `runAuthInit` reads localStorage. Both paths lead to correct state.                     |

---

## Files Summary

| File                                | Change                              | Size              |
| ----------------------------------- | ----------------------------------- | ----------------- |
| `apps/web/index.html`               | Remove reload, add event dispatch   | ~10 lines changed |
| `apps/web/heys_app_auth_init_v1.js` | Add event listener + cleanup return | ~30 lines added   |
| `apps/web/heys_login_screen_v1.js`  | No changes                          | 0                 |

## Verification

1. **Incognito + Slow 3G throttle**: Login via static form → bundles continue
   loading (NOT re-downloaded) → app loads faster
2. **Incognito + Fast network**: Login → LoginScreen disappears → app renders
   immediately
3. **Client PIN login**: Phone+PIN → app shows diary (clientId set via event)
4. **Curator login**: Email+password → client selection modal (cloudUser set via
   event)
5. **Returning user**: Session in localStorage → overlay hidden → skeleton → app
   (unchanged)
6. **Bundle status logs**: `hlgLogBundleStatus()` shows bundles downloaded
   during login
7. `pnpm build` passes
