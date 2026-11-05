/* =====================================================
   RescueNet — local WiFi server config

   Resolution order (first non-empty wins):
     1. localStorage.rn_server_url_override   (user override from the Server panel)
     2. window.RN_SERVER already set          (from config.runtime.js, which the
                                                Node backend regenerates on startup
                                                with the current LAN IP)
     3. Fallback below                         (last-known / dev default)

   - RN_SERVER (HTTP :3000)          → used by the Capacitor APK
   - RN_SERVER_SECURE (HTTPS :3443)  → used when you open the app
     in a mobile browser so geolocation is allowed (Secure Context).
   Pages loaded over :3443 auto-detect their own origin and use HTTPS.
   ===================================================== */
(function () {
  var FALLBACK_HTTP  = 'http://192.168.43.119:3000';
  var FALLBACK_HTTPS = 'https://192.168.43.119:3443';

  // 1) If we're already being served from the Node backend, same-origin wins.
  var o = (window.location && window.location.origin) || '';
  var isRealHttpOrigin = /^https?:\/\//.test(o) && !/localhost|127\.0\.0\.1|\[::1\]/.test(o);
  var originIsSecure = /^https:\/\//.test(o);
  var inferredHttp = isRealHttpOrigin ? o.replace(/^https:/, 'http:').replace(/:3443/, ':3000') : '';
  var inferredHttps = isRealHttpOrigin && originIsSecure ? o : (isRealHttpOrigin ? o.replace(/^http:/, 'https:').replace(/:3000/, ':3443') : '');

  // 2) Config precedence: localStorage > config.runtime.js > same-origin > fallback.
  var ovHttp = '', ovHttps = '';
  try {
    ovHttp = (localStorage.getItem('rn_server_url_override') || '').trim();
    ovHttps = (localStorage.getItem('rn_server_url_override_secure') || '').trim();
  } catch (e) {}

  var embeddedHttp = (window.RN_SERVER || '').trim();
  var embeddedHttps = (window.RN_SERVER_SECURE || '').trim();

  function pick(a, b, c, d) { return a || b || c || d || ''; }

  window.RN_SERVER = pick(ovHttp, embeddedHttp, inferredHttp, FALLBACK_HTTP);
  window.RN_SERVER_SECURE = pick(ovHttps, embeddedHttps, inferredHttps, FALLBACK_HTTPS);
  window.RN_SERVER_SOURCE = ovHttp ? 'override'
                              : embeddedHttp ? 'runtime'
                              : inferredHttp ? 'same-origin'
                              : 'fallback';

  // 3) Self-heal probe. If the embedded URL is unreachable, ask /api/config on
  //    any candidate we know about and adopt the first answer. This runs async
  //    and only updates the runtime value for later fetches — the initial page
  //    still uses whatever precedence resolved above.
  window.RN_SERVER_HEAL = function () {
    var candidates = [];
    if (inferredHttp) candidates.push(inferredHttp);
    if (embeddedHttp) candidates.push(embeddedHttp);
    candidates.push(FALLBACK_HTTP);
    candidates.push('http://localhost:3000');
    var done = false;
    function tryNext(i) {
      if (done || i >= candidates.length) return;
      var base = candidates[i];
      fetch(base + '/api/config', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) {
          if (done) return;
          if (cfg && cfg.serverUrl) {
            done = true;
            window.RN_SERVER = cfg.serverUrl;
            if (cfg.serverSecureUrl) window.RN_SERVER_SECURE = cfg.serverSecureUrl;
            window.RN_LAN_IP = cfg.lanIp || '';
            try { localStorage.setItem('rn_server_url_autodiscovered', cfg.serverUrl); } catch (e) {}
            document.dispatchEvent(new CustomEvent('rnserverready', { detail: cfg }));
          } else {
            tryNext(i + 1);
          }
        })
        .catch(function () { tryNext(i + 1); });
    }
    tryNext(0);
  };

  // 4) Public helper: prompt the user for a LAN URL override and persist it.
  //    Any page can call RN_ShowServerPanel() (e.g. a "Server" gear in a topbar).
  window.RN_ShowServerPanel = function () {
    var current = window.RN_SERVER || '';
    var input = window.prompt(
      'RescueNet server URL\n' +
      '(the LAN IP of the PC running node server.js)\n\n' +
      'Examples:\n  http://192.168.0.197:3000\n  http://10.0.0.5:3000\n\n' +
      'Leave empty to clear override and use the auto-detected value.',
      current
    );
    if (input === null) return false;
    input = String(input).trim();
    if (!input) {
      try {
        localStorage.removeItem('rn_server_url_override');
        localStorage.removeItem('rn_server_url_override_secure');
      } catch (e) {}
    } else {
      if (!/^https?:\/\//.test(input)) input = 'http://' + input;
      input = input.replace(/\/+$/, '');
      if (!/:\d+/.test(input)) input += ':3000';
      try {
        localStorage.setItem('rn_server_url_override', input);
        var secure = input.replace(/^http:/, 'https:').replace(/:3000/, ':3443');
        localStorage.setItem('rn_server_url_override_secure', secure);
      } catch (e) {}
    }
    window.location.reload();
    return true;
  };

  // 5) Auto-heal on boot if the current URL is not answering within 2s.
  window.RN_SERVER_HEALTH = function (timeoutMs) {
    timeoutMs = timeoutMs || 2000;
    return new Promise(function (resolve) {
      var base = window.RN_SERVER;
      if (!base) return resolve({ ok: false });
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); resolve({ ok: false, error: 'timeout' }); }, timeoutMs);
      fetch(base + '/api/config', { signal: ctrl.signal, cache: 'no-store' })
        .then(function (r) { clearTimeout(to); return r.ok ? r.json() : null; })
        .then(function (cfg) { resolve({ ok: !!cfg, cfg: cfg }); })
        .catch(function (e) { clearTimeout(to); resolve({ ok: false, error: (e && e.message) || 'error' }); });
    });
  };
})();

/* Kick off an early health probe. If the primary URL is dead, RN_SERVER_HEAL()
 * walks the candidate list and fires 'rnserverready' once a live server answers.
 * Every 15 s we re-check so we notice when the PC comes back online. */
(function () {
  function ping() {
    window.RN_SERVER_HEALTH(2500).then(function (h) {
      window.RN_SERVER_ONLINE = !!(h && h.ok);
      if (h && h.cfg && h.cfg.serverUrl && h.cfg.serverUrl !== window.RN_SERVER) {
        // Server told us its canonical LAN URL — adopt it if different from what
        // we're currently calling (e.g. we were using the fallback after a 404).
        try { localStorage.setItem('rn_server_url_autodiscovered', h.cfg.serverUrl); } catch (e) {}
        document.dispatchEvent(new CustomEvent('rnserverready', { detail: h.cfg }));
      }
      if (!window.RN_SERVER_ONLINE && !window.__rn_heal_attempted) {
        window.__rn_heal_attempted = true;
        window.RN_SERVER_HEAL();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(ping, 300); });
  } else {
    setTimeout(ping, 300);
  }
  setInterval(ping, 15000);
})();

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
