/* =====================================================
   RescueNet — local WiFi server config
   Edit RN_SERVER if your PC's IP changes (run ipconfig).
   All three apps (resident, admin, responder) and the
   Capacitor WebView use this to reach the Node sync API.

   - RN_SERVER (HTTP :3000)          → used by the Capacitor APK
   - RN_SERVER_SECURE (HTTPS :3443)  → used when you open the app
     in a mobile browser so geolocation is allowed (Secure Context).
   Pages loaded over :3443 auto-detect their own origin and use HTTPS.
   ===================================================== */
window.RN_SERVER = 'http://10.156.89.119:3000';
window.RN_SERVER_SECURE = 'https://10.156.89.119:3443';

/* =====================================================
   REAL-TIME LONG-POLL (works through CapacitorHttp)
   Capacitor WebView can't use EventSource to HTTP due
   to mixed content. This uses fetch() which IS intercepted
   by CapacitorHttp and connects to the native HTTP stack.

   Usage:
     RNRealtime.init(API_BASE, function(event) {
       // event = { type, data, ts }
       if (event.type === 'new_alert') { ... }
     });
   ===================================================== */
window.RNRealtime = (function() {
  let baseUrl = '';
  let handler = null;
  let running = false;
  let abortController = null;

  async function pollLoop() {
    while (running) {
      try {
        abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 35000);
        const res = await fetch(baseUrl + '/api/longpoll', { signal: abortController.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (!res.ok) { await sleep(3000); continue; }
        const body = await res.json();
        if (body && Array.isArray(body.events)) {
          body.events.forEach(evt => {
            if (evt && evt.type && handler) {
              try { handler(evt); } catch(e) {}
            }
          });
        }
      } catch (e) {
        if (e.name === 'AbortError' || e.name === 'TypeError') {
          await sleep(2000);
        } else {
          await sleep(3000);
        }
      }
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return {
    init: function(apiBase, onEvent) {
      baseUrl = apiBase;
      handler = onEvent;
      if (!running) { running = true; pollLoop(); }
    },
    stop: function() { running = false; if (abortController) abortController.abort(); }
  };
})();

/* =====================================================
   RN LOCATION — native-first GPS
   On Capacitor Android, navigator.geolocation is often
   unreliable (no permission prompt, poor accuracy).
   This wrapper uses @capacitor/geolocation when present,
   otherwise falls back to the browser API.

   API:
     RNLocation.ensurePermission() -> Promise<granted:boolean>
     RNLocation.getCurrentPosition(opts) -> Promise<pos>
     RNLocation.watchPosition(success, error, opts) -> watchId
     RNLocation.clearWatch(watchId)
   pos shape: { coords: { latitude, longitude, accuracy, altitude, speed, heading }, timestamp }
   ===================================================== */
window.RNLocation = (function() {
  function _getPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) || null;
  }
  function _isNative() { return !!_getPlugin(); }

  function _getAppPlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
  }

  // Detailed permission status: 'granted' | 'prompt' | 'denied' | 'unsupported'
  // 'denied' means user denied (browser) OR dialog may be suppressed (native after 'Don't ask again').
  async function getPermissionStatus() {
    const geoPlugin = _getPlugin();
    if (geoPlugin) {
      try {
        const cur = await geoPlugin.checkPermissions();
        if (!cur) return 'prompt';
        if (cur.location === 'granted' || cur.coarseLocation === 'granted' || cur.location === 'limited') return 'granted';
        if (cur.location === 'prompt' || cur.coarseLocation === 'prompt') return 'prompt';
        return 'denied';
      } catch (e) { return 'prompt'; }
    }
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const r = await navigator.permissions.query({ name: 'geolocation' });
        return r.state; // 'granted' | 'denied' | 'prompt'
      } catch (e) { /* fall through */ }
    }
    return navigator.geolocation ? 'prompt' : 'unsupported';
  }

  // Opens the OS app-settings page (Android/iOS) so user can manually re-enable
  // a permission they previously denied. No-op on web.
  async function openAppSettings() {
    const appPlugin = _getAppPlugin();
    if (appPlugin && typeof appPlugin.openAppSettings === 'function') {
      try { await appPlugin.openAppSettings(); return true; } catch (e) { console.warn('[RNLocation] openAppSettings error:', e); }
    }
    return false;
  }

  async function ensurePermission() {
    const geoPlugin = _getPlugin();
    if (!geoPlugin) {
      // Browser: permission is prompted by getCurrentPosition; nothing to pre-request.
      return !!(navigator.geolocation);
    }
    try {
      const cur = await geoPlugin.checkPermissions();
      if (cur && (cur.location === 'granted' || cur.coarseLocation === 'granted' || cur.location === 'limited')) return true;
      const req = await geoPlugin.requestPermissions();
      return !!(req && (req.location === 'granted' || req.coarseLocation === 'granted' || req.location === 'limited'));
    } catch (e) {
      console.warn('[RNLocation] permission error:', e);
      return false;
    }
  }

  function webToPos(p) { return p; } // already in navigator shape

  async function getCurrentPosition(opts) {
    opts = opts || {};
    const geoPlugin = _getPlugin();
    if (geoPlugin) {
      const granted = await ensurePermission();
      if (!granted) throw Object.assign(new Error('Permission denied'), { code: 1 });
      const enableHighAccuracy = opts.enableHighAccuracy !== false;
      const timeout = opts.timeout || 20000;
      const p = await geoPlugin.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge: opts.maximumAge || 0,
      });
      return {
        coords: {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy || null,
          altitude: (typeof p.coords.altitude === 'number' ? p.coords.altitude : null),
          altitudeAccuracy: (typeof p.coords.altitudeAccuracy === 'number' ? p.coords.altitudeAccuracy : null),
          speed: (typeof p.coords.speed === 'number' ? p.coords.speed : null),
          heading: (typeof p.coords.heading === 'number' ? p.coords.heading : null),
        },
        timestamp: p.timestamp || Date.now(),
      };
    }
    // Browser fallback
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(resolve, reject, opts);
    });
  }

  const watches = new Map();
  let nextWatchId = 1;

  function watchPosition(success, error, opts) {
    opts = opts || {};
    if (_isNative()) {
      const id = nextWatchId++;
      const enableHighAccuracy = opts.enableHighAccuracy !== false;
      const intervalMs = Math.max(1000, opts.minimumUpdateInterval || 3000);
      let stopped = false;
      (async () => {
        const granted = await ensurePermission();
        if (!granted) { error && error(Object.assign(new Error('Permission denied'), { code: 1 })); return; }
        const tick = async () => {
          if (stopped) return;
          try {
            const p = await getCurrentPosition(opts);
            if (!stopped) success && success(p);
          } catch (e) {
            if (!stopped) error && error(e);
          }
          if (!stopped) setTimeout(tick, intervalMs);
        };
        tick();
      })();
      watches.set(id, { stop() { stopped = true; } });
      return id;
    }
    if (!navigator.geolocation) { error && error(new Error('Geolocation not supported')); return -1; }
    return navigator.geolocation.watchPosition(success, error, opts);
  }

  function clearWatch(id) {
    if (id == null) return;
    if (watches.has(id)) { watches.get(id).stop(); watches.delete(id); return; }
    if (navigator.geolocation) navigator.geolocation.clearWatch(id);
  }

  return {
    get isNative() { return _isNative(); },
    ensurePermission,
    getPermissionStatus,
    openAppSettings,
    getCurrentPosition,
    watchPosition,
    clearWatch,
  };
})();
