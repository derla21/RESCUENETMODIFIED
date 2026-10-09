/* =====================================================
   RESCUENET RESPONDER — dispatch logic
   Connects to the Admin console (dashboards.html) and
   resident app (dashboard.html) through shared storage
   + BroadcastChannel + the Node API.
   ===================================================== */
const API_BASE = (function () {
    // If we're already served from the Node server (browser testing), use same origin
    const o = window.location.origin || '';
    if (o.indexOf(':3000') !== -1 || o.indexOf(':3443') !== -1) return o;
    // In Capacitor (https://localhost), use the configured LAN IP
    if (window.RN_SERVER) return window.RN_SERVER;
    if (o.indexOf('http') === 0 && o.indexOf('localhost') === -1) return o;
    return 'http://localhost:3000';
})();

const LS = {
    responders:  'rn_responders',
    assignments: 'rn_response_assignments',
    alerts:      'rn_alerts',
    reports:     'rn_reports',
    messages:    'rn_messages',
    notifs:      'rn_resp_notifs',
    me:          'rn_current_responder',
    prefs:       'rn_resp_prefs',
    seenMsg:     'rn_resp_seen_msgs'
};

const FLOW = ['assigned', 'acknowledged', 'on-the-way', 'arrived', 'responding', 'resolved'];
const FLOW_LABEL = {
    'assigned': 'Assigned', 'acknowledged': 'Acknowledged', 'on-the-way': 'On the Way',
    'arrived': 'Arrived', 'responding': 'Responding', 'resolved': 'Resolved'
};
/* legacy values the admin console used before */
const LEGACY = { 'en-route': 'on-the-way', 'on-scene': 'arrived' };
const normStatus = s => LEGACY[s] || (FLOW.includes(s) ? s : 'assigned');

/* ---------- helpers ---------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function lsGet(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
function ago(d) {
    if (!d) return '—';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}
function metersBetween(a, b) {
    if (!a || !b) return null;
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2)**2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
function fmtDist(m) { return m == null ? '—' : (m < 1000 ? m + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'); }
function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('show'), ms || 2600);
}
function broadcast(tag) { try { const bc = new BroadcastChannel('rescuenet'); bc.postMessage(tag); bc.close(); } catch (e) {} }
let audioCtx = null;
function beep() {
    const prefs = lsGet(LS.prefs, {});
    if (prefs.sound === false) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.frequency.value = 880; g.gain.value = 0.08;
        o.start(); o.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.28);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.32);
        o.stop(audioCtx.currentTime + 0.34);
    } catch (e) {}
}

/* ---------- roster seed (mirrors the admin SEED) ---------- */
(function seedResponders() {
    if (lsGet(LS.responders)) return;
    lsSet(LS.responders, [
        { id:'RS001', name:'Ramon Dela Cruz',  role:'Team Leader',    skill:'Medical / CPR',  phone:'0917-555-1001', email:'ramon.d@rescuenet.app',  status:'available', lat:13.3525, lng:123.7495, joined:'2024-02-10' },
        { id:'RS002', name:'Grace Villanueva', role:'First Responder',skill:'Fire / Rescue',  phone:'0917-555-1002', email:'grace.v@rescuenet.app',  status:'available', lat:13.3481, lng:123.7532, joined:'2024-03-02' },
        { id:'RS003', name:'Jun Torre',        role:'Driver',         skill:'Ambulance',      phone:'0917-555-1003', email:'jun.t@rescuenet.app',    status:'busy',      lat:13.3450, lng:123.7470, joined:'2023-11-19' },
        { id:'RS004', name:'Mhy Alonzo',       role:'Coordinator',    skill:'Comms / Evac',   phone:'0917-555-1004', email:'mhy.a@rescuenet.app',    status:'available', lat:13.3568, lng:123.7550, joined:'2024-01-08' }
    ]);
})();

/* ---------- session ---------- */
function getMe() {
    const id = sessionStorage.getItem(LS.me);
    if (!id) return null;
    return lsGet(LS.responders, []).find(r => r.id === id) || null;
}
function setMe(rec) {
    const list = lsGet(LS.responders, []).map(r => r.id === rec.id ? Object.assign({}, r, rec) : r);
    lsSet(LS.responders, list);
    broadcast('rn_responders_updated');
}

/* ---------- LOGIN ---------- */
const loginScreen = $('#loginScreen');

/* Normalize phone digits for comparison. Requires exactly 11 digits starting with 09. */
function _phoneDigits(s) { return String(s || '').replace(/\D/g, ''); }
function _isValidPhone(s) { return /^09\d{9}$/.test(_phoneDigits(s)); }
function _normName(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/* Force the phone input to only accept digits, cap at 11 */
(function bindPhoneInput() {
    const el = document.getElementById('loginPhone');
    if (!el) return;
    el.addEventListener('input', () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 11);
    });
    el.addEventListener('paste', () => setTimeout(() => {
        el.value = el.value.replace(/\D/g, '').slice(0, 11);
    }, 0));
})();

function setLoginPreview(html, kind) {
    const card = $('#loginPreview');
    if (!card) return;
    if (!html) { card.hidden = true; card.innerHTML = ''; return; }
    card.hidden = false;
    card.innerHTML = html;
    card.style.borderColor = kind === 'err'
        ? 'rgba(220,38,38,0.35)'
        : (kind === 'ok' ? 'rgba(22,163,74,0.35)' : 'var(--line-2)');
    card.style.background = kind === 'err'
        ? 'rgba(220,38,38,0.06)'
        : (kind === 'ok' ? 'rgba(22,163,74,0.06)' : 'var(--soft)');
}

/* Local fallback: search LS.responders for a name+phone match */
function _findLocalResponder(name, phone) {
    const nn = _normName(name);
    const pd = _phoneDigits(phone);
    return lsGet(LS.responders, []).find(r =>
        _normName(r.name) === nn && _phoneDigits(r.phone) === pd
    );
}

/* Pull admin-registered responders from the server so login works across devices.
 * Falls back silently to the local seed when the server is unreachable. */
async function hydrateLoginRoster() {
    try {
        const res = await fetch(API_BASE + '/api/responders', { cache: 'no-store' });
        if (!res.ok) return;
        const remote = await res.json();
        if (!Array.isArray(remote) || !remote.length) return;
        const local = lsGet(LS.responders, []);
        let changed = false;
        remote.forEach(r => {
            if (!r || !r.id) return;
            const idx = local.findIndex(x => x.id === r.id);
            if (idx < 0) { local.push(r); changed = true; }
            else {
                const merged = { ...local[idx], ...r, status: local[idx].status || r.status, lat: local[idx].lat ?? r.lat, lng: local[idx].lng ?? r.lng };
                if (JSON.stringify(merged) !== JSON.stringify(local[idx])) { local[idx] = merged; changed = true; }
            }
        });
        if (changed) lsSet(LS.responders, local);
    } catch (e) { /* offline */ }
}

/* Authenticate: hit the server first; if unreachable, fall back to local directory */
async function attemptLogin() {
    const name  = ($('#loginName')  && $('#loginName').value)  || '';
    const phone = ($('#loginPhone') && $('#loginPhone').value) || '';

    if (!name.trim()) {
        setLoginPreview('<b style="color:var(--err)">Full name required</b><br>Enter the exact name the admin registered.', 'err');
        $('#loginName').focus();
        return;
    }
    if (!_isValidPhone(phone)) {
        setLoginPreview('<b style="color:var(--err)">Phone must be 11 digits starting with 09</b><br>Example: 09171234567', 'err');
        $('#loginPhone').focus();
        return;
    }

    setLoginPreview('<span style="color:var(--muted)">Verifying credentials…</span>');
    const payload = { name: name.trim(), phone: _phoneDigits(phone) };

    // Try server first
    try {
        const res = await fetch(API_BASE + '/api/responder/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.ok && data.responder) {
                grantAccess(data.responder);
                return;
            }
        }
        if (res.status === 401) {
            setLoginPreview('<b style="color:var(--err)">Credentials not recognized</b><br>No responder account matches that name and phone. Ask the admin to confirm your registration.', 'err');
            toast('Incorrect name or phone');
            return;
        }
        if (res.status === 400) {
            const err = await res.json().catch(() => ({}));
            setLoginPreview('<b style="color:var(--err)">' + esc(err.error || 'Invalid input') + '</b>', 'err');
            return;
        }
        // Non-OK non-auth error → try local fallback below
    } catch (e) {
        // Server unreachable → local fallback
    }

    const local = _findLocalResponder(name, phone);
    if (local) {
        grantAccess(local);
        setLoginPreview('<b style="color:var(--ok)">Signed in offline</b><br>Server unreachable — using the local directory.', 'ok');
        return;
    }
    setLoginPreview('<b style="color:var(--err)">Cannot reach server</b><br>No local record matches that name and phone. Reconnect and try again.', 'err');
}

function grantAccess(rec) {
    sessionStorage.setItem(LS.me, rec.id);
    setLoginPreview('', null);
    loginScreen.classList.remove('show');
    boot();
    toast('Welcome, ' + String(rec.name || '').split(' ')[0] + ' — you are on duty');
}

$('#loginBtn').addEventListener('click', () => { attemptLogin(); });
document.addEventListener('keydown', (e) => {
    if (!loginScreen || !loginScreen.classList.contains('show')) return;
    if (e.key === 'Enter' && (e.target.id === 'loginName' || e.target.id === 'loginPhone')) {
        e.preventDefault();
        attemptLogin();
    }
});

/* Kick off hydration as soon as the login screen is present */
if (loginScreen && loginScreen.classList.contains('show')) {
    hydrateLoginRoster();
    setInterval(hydrateLoginRoster, 15000);
}

/* ---------- router ---------- */
const SCREEN_META = {
    home:    ['RescueNet · Dispatch', 'On duty'],
    cases:   ['RescueNet · Dispatch', 'Incidents'],
    map:     ['RescueNet · Dispatch', 'Incident map'],
    comms:   ['RescueNet · Dispatch', 'Coordination'],
    profile: ['RescueNet · Dispatch', 'My profile']
};
let currentScreen = 'home';
function navigate(key) {
    currentScreen = key;
    $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === key));
    $$('.dock-item').forEach(n => n.classList.toggle('sel', n.dataset.nav === key));
    const meta = SCREEN_META[key] || ['', ''];
    $('#tbEyebrow').textContent = meta[0]; $('#tbTitle').textContent = meta[1];
    if (key === 'map') setTimeout(() => { ensureMap(); if (MAP.map) { MAP.map.invalidateSize(); paintCases(); drawMine(); } }, 130);
    refresh(key);
}
$('#dock').addEventListener('click', e => {
    const n = e.target.closest('[data-nav]');
    if (n) navigate(n.dataset.nav);
});
document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) {
        navigate(g.dataset.goto);
        if (g.dataset.tab && g.dataset.goto === 'cases') selectTab(g.dataset.tab);
    }
});

/* ---------- data joins ---------- */
function allCases() {
    const alerts  = lsGet(LS.alerts, []).map(a => Object.assign({}, a, { kind: 'sos' }));
    const reports = lsGet(LS.reports, []).map(r => Object.assign({}, r, { kind: 'report' }));
    return alerts.concat(reports);
}
function myAssignments() {
    const me = getMe(); if (!me) return [];
    return lsGet(LS.assignments, []).filter(a => a.responderId === me.id)
        .map(a => Object.assign({}, a, { status: normStatus(a.status) }));
}
function myCases() {
    const cases = allCases();
    return myAssignments().map(a => {
        const c = cases.find(x => x.id === a.caseId) || { id: a.caseId, kind: 'sos', type: 'Emergency' };
        return Object.assign({}, c, { assign: a });
    }).sort((x, y) => new Date(y.assign.assignedAt || y.createdAt) - new Date(x.assign.assignedAt || x.createdAt));
}
function unassignedOpen() {
    const claimed = new Set(lsGet(LS.assignments, []).map(a => a.caseId));
    return lsGet(LS.alerts, []).filter(s => !s.resolvedAt && !claimed.has(s.id));
}

/* ---------- availability ---------- */
function renderAvail() {
    const me = getMe(); if (!me) return;
    const st = me.status || 'available';
    $$('#availRow .avail-btn').forEach(b => b.classList.toggle('sel', b.dataset.avail === st));
    const chip = $('#tbAvail');
    chip.hidden = false;
    chip.className = 'tb-chip' + (st === 'busy' ? ' busy' : st === 'offline' ? ' off' : '');
    $('#tbAvailLbl').textContent = st === 'available' ? 'Available' : st === 'busy' ? 'On Task' : 'Offline';
}
$('#availRow').addEventListener('click', e => {
    const b = e.target.closest('[data-avail]'); if (!b) return;
    const me = getMe(); if (!me) return;
    setMe({ id: me.id, status: b.dataset.avail });
    renderAvail();
    toast('Availability → ' + b.textContent.trim());
});

/* ---------- home ---------- */
function renderHome() {
    const mine = myCases();
    const active = mine.filter(c => c.assign.status !== 'assigned' && c.assign.status !== 'resolved');
    const fresh  = mine.filter(c => c.assign.status === 'assigned');
    const done   = mine.filter(c => c.assign.status === 'resolved');
    $('#kNew').textContent    = fresh.length;
    $('#kActive').textContent = active.length;
    $('#kDone').textContent   = done.length;
    $('#kSOS').textContent    = lsGet(LS.alerts, []).filter(s => !s.resolvedAt).length;
    const dc = $('#dockCases');
    const n = fresh.length + active.length;
    dc.hidden = !n; dc.textContent = n;

    $('#activeHint').textContent = active.length ? active.length + ' in progress' : 'none';
    const nothing = (fresh.length + active.length) ? '' :
        '<div class="empty"><strong>No active responses</strong>New assignments from the Barangay Official will appear here instantly.</div>';
    $('#homeActive').innerHTML = nothing + fresh.concat(active).slice(0, 4).map(c => incCard(c)).join('');
    const pool = unassignedOpen().slice(0, 3);
    $('#homeAlerts').innerHTML = pool.length
        ? pool.map(c => incCard(Object.assign({}, c, { kind: 'sos', assign: null }))).join('')
        : '<div class="empty">No open SOS in the barangay right now.</div>';
}

/* ---------- incident card ---------- */
function incCard(c) {
    const rep = c.reporter || {};
    const resolved = c.assign && c.assign.status === 'resolved';
    const assigned = c.assign && c.assign.status === 'assigned';
    const crit = /medical|fire|danger|flood|collapse/i.test(c.type || '');
    const tone = resolved ? 't-done' : (crit ? 't-critical' : assigned ? '' : 't-info');
    const dist = (ME_POS && c.latitude) ? fmtDist(metersBetween(ME_POS, { lat: c.latitude, lng: c.longitude })) : null;
    const statusPill = c.assign
        ? '<span class="tag ' + (resolved ? 'ok' : 'info') + '">' + FLOW_LABEL[c.assign.status] + '</span>'
        : '<span class="tag err">Unassigned</span>';
    return (
    '<article class="inc ' + tone + '" data-case="' + esc(c.id) + '">' +
        '<div class="inc-top">' +
            '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">' +
                '<span class="inc-type ' + (crit ? 'crit' : '') + '">' + esc(c.type || 'Incident') + '</span>' +
                (c.kind === 'report' ? '<span class="tag">Report</span>' : '') +
            '</div>' +
            '<span class="inc-time">' + ago(c.createdAt) + '</span>' +
        '</div>' +
        '<div class="inc-title">' + esc(rep.name || c.reporterName || 'Resident') + '</div>' +
        '<div class="inc-sub">' + esc((c.description || c.message || 'No description provided').slice(0, 90)) + '</div>' +
        '<div class="inc-meta">' +
            statusPill +
            (c.latitude ? '<span class="tag mono">' + Number(c.latitude).toFixed(5) + ', ' + Number(c.longitude).toFixed(5) + '</span>' : '<span class="tag">No GPS</span>') +
            (c.accuracy ? '<span class="tag mono">' + c.accuracy + ' m</span>' : '') +
            (dist ? '<span class="tag info">→ ' + dist + '</span>' : '') +
            (rep.vulnerabilities && rep.vulnerabilities.length ? '<span class="tag amber">⚠ ' + esc(rep.vulnerabilities[0]) + '</span>' : '') +
            (c.attachments && c.attachments.length ? '<span class="tag amber">📎 ' + c.attachments.length + ' media</span>' : '') +
        '</div>' +
        (!c.assign ? '<div class="btn-row" style="margin-top:10px;"><button class="btn sm amber" data-claim="' + esc(c.id) + '">Claim this SOS</button></div>' : '') +
    '</article>');
}

/* ---------- cases screen ---------- */
let caseTab = 'new';
function selectTab(t) {
    caseTab = t;
    $$('#caseSeg button').forEach(b => b.classList.toggle('sel', b.dataset.tab === t));
    renderCases();
}
$('#caseSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab);
});
function renderCases() {
    const mine = myCases();
    const fresh   = mine.filter(c => c.assign.status === 'assigned');
    const active  = mine.filter(c => c.assign.status !== 'assigned' && c.assign.status !== 'resolved');
    const history = mine.filter(c => c.assign.status === 'resolved');
    $('#snNew').textContent = fresh.length;
    $('#snActive').textContent = active.length;
    $('#snHistory').textContent = history.length;

    let list = [], showPool = false;
    if (caseTab === 'new')     { list = fresh; showPool = true; }
    if (caseTab === 'active')  list = active;
    if (caseTab === 'history') list = history;

    let html = list.map(c => incCard(c)).join('');
    if (!list.length && !showPool) {
        html = '<div class="empty"><strong>Nothing here</strong>No ' + caseTab + ' cases for your account yet.</div>';
    }
    if (showPool) {
        const pool = unassignedOpen();
        if (pool.length) {
            html += '<div class="sec-head" style="margin:18px 0 10px;"><h2>Barangay queue</h2><span class="hint">Not yet assigned — you can self-claim</span></div>' +
                    pool.map(c => incCard(Object.assign({}, c, { kind: 'sos', assign: null }))).join('');
        } else if (!list.length) {
            html = '<div class="empty"><strong>No new assignments</strong>Wait for the Barangay Official to dispatch a case to you.</div>';
        }
    }
    $('#caseList').innerHTML = html;
}

/* ---------- claim ---------- */
function claimCase(caseId) {
    const me = getMe(); if (!me) return;
    const list = lsGet(LS.assignments, []);
    if (list.find(a => a.caseId === caseId)) { toast('Case already assigned'); return; }
    const now = new Date().toISOString();
    list.unshift({ caseId, responderId: me.id, responderName: me.name || me.id, responderPhone: me.phone || '', status: 'acknowledged', assignedAt: now, updatedAt: now, claimedBy: 'responder', history: [{ status: 'acknowledged', at: now }] });
    lsSet(LS.assignments, list);
    setMe({ id: me.id, status: 'busy' });
    pushNotif('📌 Case self-claimed', 'You claimed case ' + caseId + ' from the barangay queue.');
    addMsg(caseId, 'responder', me.name, 'Self-claimed this case from the dispatch queue — heading out.');
    broadcast('rn_response_updated');
    // Push the claim to the server so the resident's tracking screen sees it immediately
    try {
        const asgn = list[0];
        fetch(API_BASE + '/api/assignment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asgn) }).catch(() => {});
    } catch(e){}
    toast('✓ Case claimed — opening incident location');
    refreshAll();
    // jump to the map and center on the claimed SOS location
    navigate('map');
    setTimeout(() => {
        ensureMap();
        if (!MAP.map) return;
        paintCases();
        focusCase(caseId);
        const c = findCase(caseId);
        if (c && !c.latitude) toast('This case has no geotagged location');
    }, 380);
}

/* =====================================================
   PART 2 — case sheet · comms · notifs · map · profile · realtime
   ===================================================== */
let ME_POS = null;
let openCaseId = null;
let activeThread = 'dispatch';
const fmtDT = d => d ? new Date(d).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const stageIdx = s => FLOW.indexOf(normStatus(s));

/* ---------- case detail sheet ---------- */
function findCase(caseId) {
    return myCases().find(c => c.id === caseId) ||
           allCases().filter(x => x.id === caseId).map(x => Object.assign({}, x, { assign: null }))[0] || null;
}

function openCaseSheet(caseId) {
    const c = findCase(caseId); if (!c) { toast('Case not found — it may have been removed'); return; }
    openCaseId = caseId;
    $('#caseSheetBody').innerHTML = caseSheetHTML(c);
    $('#caseSheetOv').classList.add('show');
    $('#caseSheet').scrollTop = 0;
}
function closeSheets() { $('#caseSheetOv').classList.remove('show'); $('#notifSheetOv').classList.remove('show'); }

function caseSheetHTML(c) {
    const rep = c.reporter || {};
    const crit = /medical|fire|danger|flood|collapse/i.test(c.type || '');
    const title = rep.name || c.reporterName || (c.kind === 'report' ? 'Incident report' : 'Emergency SOS');
    let head =
        '<div class="sheet-head"><div>' +
            '<span class="inc-type ' + (crit ? 'crit' : '') + '">' + esc(c.type || 'Incident') + '</span>' +
            '<div class="inc-title" style="margin-top:7px; font-size:16px;">' + esc(title) + '</div>' +
        '</div><button class="sheet-x" data-x>✕</button></div>';

    let stepper = '';
    let tl = '';
    let advanceBtn = '';
    if (c.assign) {
        const cur = stageIdx(c.assign.status);
        stepper = '<div class="sec"><div class="stepper">' + FLOW.map((s, i) => {
            const cls = i < cur ? 'done' : i === cur ? 'current' : '';
            const tick = i <= cur ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' : '';
            return '<div class="step ' + cls + '"><div class="sdot">' + tick + '</div><div class="slbl">' + FLOW_LABEL[s] + '</div></div>';
        }).join('') + '</div></div>';

        const hist = (c.assign.history && c.assign.history.length)
            ? c.assign.history : [{ status: 'assigned', at: c.assign.assignedAt }];
        tl = '<div class="sec"><div class="sec-head"><h2>Response log</h2></div><div class="tl">' +
            hist.map((h, i) => {
                const cls = i < hist.length - 1 ? 'done' : 'current';
                return '<div class="tl-item ' + cls + '"><div class="tl-dot">' + (i < hist.length - 1 ? '✓' : '●') + '</div>' +
                    '<div class="tl-body"><div class="tl-t">' + FLOW_LABEL[normStatus(h.status)] + '</div>' +
                    '<div class="tl-s">' + fmtDT(h.at) + ' · ' + ago(h.at) + '</div></div></div>';
            }).join('') + '</div></div>';

        if (c.assign.status !== 'resolved') {
            const next = FLOW[Math.min(stageIdx(c.assign.status) + 1, FLOW.length - 1)];
            advanceBtn = '<button class="btn amber block" data-advance="' + esc(c.id) + '" style="margin-top:12px;">' +
                '<svg viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
                'Update status → ' + FLOW_LABEL[next] + '</button>';
        } else {
            advanceBtn = '<div class="card" style="margin-top:12px; text-align:center; color:var(--ok); font-weight:800; font-size:13px; border-color:rgba(47,208,127,0.3); background:rgba(47,208,127,0.07);">✓ Response completed ' + fmtDT(c.assign.updatedAt) + '</div>';
        }
    } else {
        advanceBtn = '<button class="btn amber block" data-claim="' + esc(c.id) + '" style="margin-top:12px;">Claim this case</button>';
    }

    const dist = (ME_POS && c.latitude) ? fmtDist(metersBetween(ME_POS, { lat: c.latitude, lng: c.longitude })) : null;
    const when = c.createdAt ? new Date(c.createdAt) : null;
    const info =
        '<div class="sec"><div class="sec-head"><h2>Case information</h2></div><div class="dgrid">' +
            '<div class="d"><div class="d-k">Incident type</div><div class="d-v">' + esc(c.type || 'Emergency') + '</div></div>' +
            '<div class="d"><div class="d-k">Case ID</div><div class="d-v mono">' + esc(c.id) + '</div></div>' +
            '<div class="d"><div class="d-k">Reporter</div><div class="d-v">' + esc(rep.name || c.reporterName || '—') + '</div></div>' +
            '<div class="d"><div class="d-k">Contact</div><div class="d-v">' + (rep.phone ? '<a href="tel:' + esc(rep.phone) + '">' + esc(rep.phone) + '</a>' : '—') + '</div></div>' +
            '<div class="d"><div class="d-k">Location</div><div class="d-v">' + esc(rep.purok || rep.address || c.address || (c.latitude ? 'Geotagged pin' : 'Not provided')) + '</div></div>' +
            '<div class="d"><div class="d-k">Coordinates</div><div class="d-v mono">' + (c.latitude ? Number(c.latitude).toFixed(6) + ', ' + Number(c.longitude).toFixed(6) + (c.accuracy ? ' ' + c.accuracy + 'm' : '') : '—') + '</div></div>' +
            '<div class="d"><div class="d-k">Date</div><div class="d-v">' + (when ? when.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : '—') + '</div></div>' +
            '<div class="d"><div class="d-k">Time</div><div class="d-v">' + (when ? when.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—') + (dist ? '</div></div><div class="d"><div class="d-k">Distance from you</div><div class="d-v">→ ' + dist : '—') + '</div></div>' +
            '<div class="d full"><div class="d-k">Reported condition / description</div><div class="d-v">' + esc(c.description || c.message || c.reportedCondition || 'No description provided.') + '</div></div>' +
            (rep.vulnerabilities && rep.vulnerabilities.length ? '<div class="d full"><div class="d-k">Known vulnerabilities</div><div class="d-v"><span class="tag amber">⚠ ' + rep.vulnerabilities.map(esc).join('</span> <span class="tag amber">⚠ ') + '</span></div></div>' : '') +
        '</div></div>';

    const actions = c.assign ? '<div class="btn-row" style="margin-top:12px;">' +
        '<button class="btn info" data-focus="' + esc(c.id) + '"><svg viewBox="0 0 24 24"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/></svg>Map</button>' +
        (rep.phone ? '<a class="btn ok" href="tel:' + esc(rep.phone) + '" style="flex:1; min-width:110px; height:44px; padding:0 18px; border-radius:14px; display:inline-flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; font-size:13px; font-weight:800; letter-spacing:0.03em;">Call</a>' : '') +
        '<button class="btn" data-comms="' + esc(c.id) + '"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Message</button>' +
        '</div>' : '';

    // media captured by the resident (photo / video attachments)
    const media = (c.attachments || []).filter(Boolean);
    CASE_MEDIA = media;
    let mediaSec = '';
    if (media.length) {
        mediaSec = '<div class="sec"><div class="sec-head"><h2>Media from reporter</h2><span class="hint">' + media.length + ' item' + (media.length > 1 ? 's' : '') + ' · tap to open</span></div><div class="mgrid">' +
            media.map((m, i) => m.dataUrl
                ? '<div class="mthumb" data-media="' + i + '">' +
                  (m.kind === 'video'
                      ? '<video src="' + m.dataUrl + '" muted playsinline preload="metadata"></video><span class="mplay">▶</span>'
                      : '<img src="' + m.dataUrl + '" alt="">') +
                  '<span class="mkind">' + (m.kind === 'video' ? 'VIDEO' : 'PHOTO') + '</span></div>'
                : '<div class="mthumb lost">Media unavailable on this device</div>').join('') +
            '</div></div>';
    }

    return head + stepper + info + mediaSec + advanceBtn + actions + '<div class="divider"></div>' + tl;
}

/* ---------- media lightbox (resident attachments) ---------- */
let CASE_MEDIA = [];
function openMediaLightbox(item) {
    if (!item || !item.dataUrl) { toast('Media no longer available on this device'); return; }
    let lb = document.getElementById('mediaLb');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'mediaLb';
        lb.className = 'lb-overlay';
        lb.innerHTML = '<button class="lb-x" data-lb-x aria-label="Close">✕</button><div class="lb-body"></div><div class="lb-cap"></div>';
        lb.addEventListener('click', function (e) {
            if (e.target === lb || e.target.closest('[data-lb-x]')) {
                lb.classList.remove('show');
                lb.querySelector('.lb-body').innerHTML = '';
            }
        });
        document.body.appendChild(lb);
    }
    lb.querySelector('.lb-body').innerHTML = item.kind === 'video'
        ? '<video src="' + item.dataUrl + '" controls autoplay playsinline></video>'
        : '<img src="' + item.dataUrl + '" alt="">';
    lb.querySelector('.lb-cap').textContent = (item.kind === 'video' ? '🎥 Video' : '📷 Photo') +
        (item.name ? ' · ' + item.name : '') +
        (item.at ? ' · ' + new Date(item.at).toLocaleString() : '');
    lb.classList.add('show');
}

/* ---------- status flow ---------- */
function advanceStatus(caseId) {
    const me = getMe(); if (!me) return;
    const list = lsGet(LS.assignments, []);
    const a = list.find(x => x.caseId === caseId && x.responderId === me.id);
    if (!a) return;
    const cur = normStatus(a.status);
    if (cur === 'resolved') return;
    const next = FLOW[Math.min(stageIdx(cur) + 1, FLOW.length - 1)];
    const now = new Date().toISOString();
    a.status = next; a.updatedAt = now;
    a.responderName = a.responderName || me.name || me.id;
    a.responderPhone = a.responderPhone || me.phone || '';
    a.history = (a.history && a.history.length ? a.history : [{ status: cur, at: a.assignedAt || now }]).concat([{ status: next, at: now }]);
    lsSet(LS.assignments, list);
    addMsg(caseId, 'system', '', me.name.split(' ')[0] + ' → ' + FLOW_LABEL[next]);
    if (next === 'resolved') {
        ['alerts', 'reports'].forEach(k => {
            const arr = lsGet(LS[k], []);
            const rec = arr.find(x => x.id === caseId);
            if (rec && !rec.resolvedAt) { rec.resolvedAt = now; lsSet(LS[k], arr); }
        });
        const stillActive = lsGet(LS.assignments, []).some(x => x.responderId === me.id && normStatus(x.status) !== 'resolved');
        if (!stillActive) setMe({ id: me.id, status: 'available' });
        pushNotif('✔ Case resolved', 'Case ' + caseId + ' marked resolved. Availability restored.');
    }
    broadcast('rn_response_updated');
    toast('Status → ' + FLOW_LABEL[next]);
    // Sync assignment status to server for admin
    fetch(API_BASE + '/api/assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a)
    }).catch(() => {});
    refreshAll();
    if (openCaseId === caseId) openCaseSheet(caseId);
}

/* ---------- delegated clicks ---------- */
document.addEventListener('click', e => {
    const claim = e.target.closest('[data-claim]');
    if (claim) { e.stopPropagation(); closeSheets(); claimCase(claim.dataset.claim); return; }
    const adv = e.target.closest('[data-advance]');
    if (adv) { advanceStatus(adv.dataset.advance); return; }
    const foc = e.target.closest('[data-focus]');
    if (foc) { closeSheets(); navigate('map'); setTimeout(() => focusCase(foc.dataset.focus), 260); return; }
    const comms = e.target.closest('[data-comms]');
    if (comms) { closeSheets(); openThread(comms.dataset.comms); return; }
    const thr = e.target.closest('[data-thread]');
    if (thr) { openThread(thr.dataset.thread); return; }
    const x = e.target.closest('[data-x]');
    if (x) { closeSheets(); return; }
    const md = e.target.closest('[data-media]');
    if (md) { openMediaLightbox(CASE_MEDIA[parseInt(md.dataset.media, 10)]); return; }
    if (e.target.classList && e.target.classList.contains('sheet-ov')) { closeSheets(); return; }
    const card = e.target.closest('[data-case]');
    if (card) { openCaseSheet(card.dataset.case); return; }
});

/* ---------- communications ---------- */
function addMsg(thread, from, name, text) {
    const list = lsGet(LS.messages, []);
    list.push({ id: 'M' + Date.now() + Math.floor(Math.random() * 900 + 100), thread, from, name, text, at: new Date().toISOString() });
    lsSet(LS.messages, list.slice(-300));
    broadcast('rn_msg_new');
}
function seenMsgIds() { return lsGet(LS.seenMsg, []); }
function markSeen(thread) {
    const ids = seenMsgIds();
    lsGet(LS.messages, []).forEach(m => { if (m.thread === thread && !ids.includes(m.id)) ids.push(m.id); });
    lsSet(LS.seenMsg, ids.slice(-500));
}
function unreadAdminMsgs() {
    const ids = new Set(seenMsgIds());
    return lsGet(LS.messages, []).filter(m => (m.from === 'admin' || m.from === 'official') && !ids.has(m.id));
}
function openThread(thread) {
    activeThread = thread;
    markSeen(thread);
    navigate('comms');
    renderComms();
}
function myThreads() {
    return myAssignments().slice(0, 6).map(a => a.caseId);
}
function renderComms() {
    const me = getMe(); if (!me) return;
    const mine = myAssignments().slice(0, 6);
    const unread = new Set(unreadAdminMsgs().map(m => m.thread));
    const chanHTML = (id, label) =>
        '<button class="chan ' + (activeThread === id ? 'sel' : '') + '" data-thread="' + esc(id) + '">' + esc(label) +
        (unread.has(id) && activeThread !== id ? '<span class="unread"></span>' : '') + '</button>';
    $('#chanTabs').innerHTML =
        chanHTML('dispatch', '📡 Dispatch · Barangay') +
        mine.map(a => chanHTML(a.caseId, '🚨 Case ' + String(a.caseId).slice(-4))).join('');
    const msgs = lsGet(LS.messages, []).filter(m => m.thread === activeThread);
    $('#msgList').innerHTML = msgs.length ? msgs.map(m => {
        const cls = m.from === 'system' ? 'msg sys' : m.from === 'responder' ? 'msg out' : 'msg in';
        return '<div class="' + cls + '">' + esc(m.text) +
            (m.from === 'system' ? '' : '<span class="m-meta">' + esc(m.name || m.from) + ' · ' + ago(m.at) + '</span>') + '</div>';
    }).join('') : '<div class="empty"><strong>No messages yet</strong>Coordinate with the Barangay Official here — status updates also post to this thread.</div>';
    $('#msgList').scrollTop = 1e9;
}
function sendMsg() {
    const me = getMe(); if (!me) return;
    const inp = $('#msgInput');
    const text = inp.value.trim(); if (!text) return;
    addMsg(activeThread, 'responder', me.name, text);
    inp.value = '';
    markSeen(activeThread);
    renderComms();
    toast('Sent to ' + (activeThread === 'dispatch' ? 'Barangay dispatch' : 'case thread'));
}
$('#msgSend').addEventListener('click', sendMsg);
$('#msgInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

/* ---------- notifications ---------- */
function pushNotif(title, text) {
    const prefs = lsGet(LS.prefs, {});
    if (prefs.notif === false) { renderNotifBadge(); return; }
    const list = lsGet(LS.notifs, []);
    list.unshift({ id: 'N' + Date.now() + Math.floor(Math.random() * 900), title, text, at: new Date().toISOString(), read: false });
    lsSet(LS.notifs, list.slice(0, 40));
    renderNotifBadge();
}
function renderNotifBadge() {
    const unread = lsGet(LS.notifs, []).filter(n => !n.read).length;
    const b = $('#notifCount');
    b.hidden = !unread; b.textContent = unread;
    const dc = $('#dockComms');
    const u = unreadAdminMsgs().length;
    dc.hidden = !u; dc.textContent = u;
}
function renderNotifs() {
    const list = lsGet(LS.notifs, []);
    $('#notifList').innerHTML = list.length ? list.map(n =>
        '<div class="notif ' + (n.read ? '' : 'unread') + '">' +
            '<div class="n-ico"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>' +
            '<div class="n-body"><div class="n-t">' + esc(n.title) + '</div><div class="n-s">' + esc(n.text) + '</div></div>' +
            '<div class="n-at">' + ago(n.at) + '</div>' +
        '</div>').join('')
        : '<div class="empty"><strong>All quiet</strong>New assignments and case updates will show up here.</div>';
}
$('#bellBtn').addEventListener('click', () => {
    renderNotifs();
    $('#notifSheetOv').classList.add('show');
});
$('#notifReadAll').addEventListener('click', () => {
    lsSet(LS.notifs, lsGet(LS.notifs, []).map(n => Object.assign(n, { read: true })));
    markSeen(activeThread);
    renderNotifs(); renderNotifBadge();
});

/* ---------- detect new assignments / incoming msgs ---------- */
function checkNewAssignments() {
    const me = getMe(); if (!me) return;
    const key = 'rn_resp_seen_assign_' + me.id;
    const seen = lsGet(key, []);
    const mine = lsGet(LS.assignments, []).filter(a => a.responderId === me.id && !seen.includes(a.caseId));
    if (!mine.length) return;
    mine.forEach(a => {
        seen.push(a.caseId);
        pushNotif('🚨 New assignment', 'Case ' + a.caseId + ' (' + FLOW_LABEL[normStatus(a.status)] + '). Open Cases to acknowledge.');
        beep();
    });
    lsSet(key, seen);
    refreshAll();
}
function checkIncomingMsgs() {
    const me = getMe(); if (!me) return;
    const notified = lsGet('rn_resp_notified_msgs', []);
    let changed = false;
    lsGet(LS.messages, []).forEach(m => {
        if ((m.from === 'admin' || m.from === 'official') && !notified.includes(m.id)) {
            notified.push(m.id); changed = true;
            pushNotif('💬 ' + (m.name || 'Barangay Official'), m.text.slice(0, 90));
            beep();
        }
    });
    if (changed) lsSet('rn_resp_notified_msgs', notified.slice(-200));
    renderNotifBadge();
}

/* ---------- map ---------- */
const MAP = {
    map: null, caseLayer: [], byCase: {}, mine: null, focus: null,
    accLayer: [], accByCase: {},   // ±Nm accuracy circles around SOS pins
    // Route state (shortest road path via OSRM)
    route: null,
    routeGlow: null,         // outer semi-transparent halo for depth
    routeCoords: null,       // cached [lat,lng] array from OSRM
    routeTimer: null,        // debounce handle
    routeCacheKey: '',       // last endpoints we successfully routed for
    routeFetching: false,
    routeDistanceM: null,
    routeDurationS: null
};

/* Google Maps tiles rendered by Leaflet (matches the resident app).
 * Multi-tier fallback: Google → OSM → CARTO → Esri. */
function addTileLayer(map) {
    if (typeof L === 'undefined') return null;
    const primary = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'], maxZoom: 21, minZoom: 3,
        attribution: '&copy; Google Maps',
        crossOrigin: true
    });
    let stage = 1;
    primary.on('tileerror', function () {
        if (stage > 1) return;
        stage = 2;
        try { map.removeLayer(primary); } catch(e){}
        const fb = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            subdomains: 'abc', maxZoom: 19, minZoom: 3,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        fb.on('tileerror', function () {
            if (stage > 2) return;
            stage = 3;
            try { map.removeLayer(fb); } catch(e){}
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
                subdomains: 'abcd', maxZoom: 19, minZoom: 3,
                attribution: '&copy; OSM &copy; CARTO'
            }).addTo(map);
        });
    });
    primary.addTo(map);
    return primary;
}

function ensureMap() {
    if (MAP.map || !window.L) return;
    // Smarter initial view: my GPS → last focused case → PH default
    let center = [13.3525, 123.7495], zoom = 13;
    if (ME_POS && isFinite(ME_POS.lat) && isFinite(ME_POS.lng)) { center = [ME_POS.lat, ME_POS.lng]; zoom = 15; }
    MAP.map = L.map('respMap', {
        zoomControl: false,
        attributionControl: true,
        tap: true,
        preferCanvas: false
    }).setView(center, zoom);
    addTileLayer(MAP.map);
    L.control.zoom({ position: 'bottomright' }).addTo(MAP.map);
    // Ensure tiles render correctly after the map container becomes visible
    setTimeout(() => { try { MAP.map && MAP.map.invalidateSize(); } catch(e){} }, 150);
}
function teardrop(color) {
    return L.divIcon({
        className: '', iconSize: [26, 34], iconAnchor: [13, 32], popupAnchor: [0, -30],
        html: '<div style="width:26px;height:34px;filter:drop-shadow(0 5px 8px rgba(0,0,0,.6));">' +
              '<svg viewBox="0 0 26 34"><path d="M13 1C6.8 1 2 5.7 2 11.7 2 19.5 13 33 13 33s11-13.5 11-21.3C24 5.7 19.3 1 13 1z" fill="' + color + '" stroke="#fff" stroke-width="1.6"/><circle cx="13" cy="12" r="4.4" fill="#102d5c"/></svg></div>'
    });
}

/* Precise-location marker used on the responder map.
 * Mirrors the resident app's crosshair + pulsing halo + readout pill so
 * both sides of an SOS see the same visual language for "this is where
 * the resident is standing right now, with ±Nm accuracy". */
function preciseCaseIcon(opts) {
    opts = opts || {};
    const tone = opts.tone || 'orange';               // orange | red | green | amber
    const acc = (typeof opts.accuracy === 'number' && isFinite(opts.accuracy))
              ? Math.max(3, Math.round(opts.accuracy))
              : null;
    const label = String(opts.label || 'SOS').toUpperCase().slice(0, 14);
    const TONE_COLORS = { orange: '#ff6500', red: '#dc2626', green: '#16a34a', amber: '#f59e0b' };
    const color = TONE_COLORS[tone] || TONE_COLORS.orange;
    const readClass  = tone === 'orange' ? '' : (' ' + tone);
    const accTxt = acc != null
        ? ('<span class="sep">·</span><span class="acc">' + acc + ' m</span>')
        : '';
    return L.divIcon({
        className: '',
        html: '<div class="precise-wrap">'
            + '<svg class="precise-pin" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">'
            +   '<ellipse cx="17" cy="42.5" rx="3" ry="1.2" fill="rgba(0,0,0,0.12)"/>'
            +   '<line x1="17" y1="33" x2="17" y2="41" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/>'
            +   '<path d="M11.5 23C11.5 28 17 33 17 33s5.5-5 5.5-10" fill="' + color + '" opacity="0.45"/>'
            +   '<circle cx="17" cy="15" r="12.5" fill="' + color + '" stroke="#ffffff" stroke-width="2.2"/>'
            +   '<circle cx="17" cy="15" r="5" fill="rgba(255,255,255,0.25)"/>'
            + '</svg>'
            + '<div class="precise-readout' + readClass + '">' + esc(label) + accTxt + '</div>'
            + '</div>',
        iconSize: [34, 44],
        iconAnchor: [17, 42],
        popupAnchor: [0, -38],
        tooltipAnchor: [0, -30]
    });
}

function paintCases() {
    ensureMap(); if (!MAP.map) return;
    MAP.caseLayer.forEach(m => MAP.map.removeLayer(m));
    MAP.caseLayer = [];
    MAP.byCase = {};
    MAP.accLayer.forEach(c => MAP.map.removeLayer(c));
    MAP.accLayer = [];
    MAP.accByCase = {};
    const spots = [];
    myCases().concat(unassignedOpen().map(a => Object.assign({}, a, { kind: 'sos', assign: null }))).forEach(c => {
        if (!c.latitude || !c.longitude) return;
        const crit = /medical|fire|danger|flood|collapse/i.test(c.type || '');
        const resolved = c.assign && c.assign.status === 'resolved';
        const unassigned = !c.assign;
        const tone = resolved ? 'green' : unassigned ? 'red' : (crit ? 'red' : 'orange');
        const colorHex = resolved ? '#16a34a' : unassigned ? '#dc2626' : (crit ? '#dc2626' : '#ff6500');
        const acc = (typeof c.accuracy === 'number' && isFinite(c.accuracy)) ? c.accuracy : null;
        const repName = (c.reporter || {}).name || c.reporterName || c.id;

        // Accuracy circle first, so the pin sits visually on top
        if (acc != null && acc > 0 && acc < 5000) {
            const ring = L.circle([c.latitude, c.longitude], {
                radius: acc,
                color: colorHex,
                weight: 1.5,
                dashArray: '4 3',
                fillColor: colorHex,
                fillOpacity: 0.14,
                opacity: 0.55,
                interactive: false
            }).addTo(MAP.map);
            MAP.accLayer.push(ring);
            MAP.accByCase[c.id] = ring;
        }

        const mk = L.marker([c.latitude, c.longitude], {
            icon: preciseCaseIcon({ tone, accuracy: acc, label: unassigned ? 'SOS' : (resolved ? 'Done' : (c.type || 'SOS')) }),
            zIndexOffset: unassigned ? 900 : (resolved ? 200 : 700),
            riseOnHover: true,
            title: repName
        }).addTo(MAP.map);
        mk.bindPopup(
            '<b>' + esc(c.type || 'Incident') + (unassigned ? ' · Unassigned' : '') + '</b><br>'
            + esc(repName) +
            '<br><span style="color:#6b83a0">' + esc(c.assign ? FLOW_LABEL[c.assign.status] : 'Open in queue') + ' · ' + ago(c.createdAt) + '</span>'
            + (acc != null ? '<br><span style="color:#6b83a0">📍 Precise fix ' + Math.round(acc) + ' m</span>' : '')
            + (c.assign && c.assign.status !== 'resolved' ? '<br><button class="btn sm amber" style="margin-top:8px;" onclick="document.dispatchEvent(new CustomEvent(\'rnfocus\', {detail:' + JSON.stringify(c.id).replace(/"/g, '\\"') + '}))">Route</button>' : '')
            + (unassigned ? '<br><button class="btn sm amber" style="margin-top:8px;" data-claim="' + esc(c.id) + '">Claim this SOS</button>' : '')
        );
        // Tap a marker to focus it — the reporter card below the map updates too
        (function (cid) { mk.on('click', function () { MAP.focus = cid; refreshReporterCard(); }); })(c.id);
        MAP.caseLayer.push(mk);
        MAP.byCase[c.id] = mk;
        spots.push([c.latitude, c.longitude]);
    });
    $('#mapCaseCount').textContent = spots.length;
    // Auto-pick a sensible focus when none yet so the reporter card has content
    if (!MAP.focus || !findCase(MAP.focus)) MAP.focus = pickDefaultFocus();
    if (!MAP.focus && spots.length) MAP.map.fitBounds(spots, { padding: [40, 40] });
    drawMine();
    refreshReporterCard();
}

/* Choose the case most relevant to display in the reporter card */
function pickDefaultFocus() {
    const mine = myCases();
    const ongoing = mine.find(c => c.assign.status !== 'assigned' && c.assign.status !== 'resolved' && c.latitude);
    if (ongoing) return ongoing.id;
    const fresh = mine.find(c => c.assign.status === 'assigned' && c.latitude);
    if (fresh) return fresh.id;
    if (mine[0] && mine[0].latitude) return mine[0].id;
    const pool = unassignedOpen().find(a => a.latitude);
    return pool ? pool.id : null;
}

/* Populate (or hide) the reporter / resident card under the map */
function refreshReporterCard() {
    const card = document.getElementById('reporterCard');
    if (!card) return;
    const caseId = MAP.focus;
    const c = caseId ? findCase(caseId) : null;
    if (!c) { card.hidden = true; return; }

    const rep = c.reporter || {};
    const rawName = rep.name || c.reporterName || 'Resident';
    const name = String(rawName).trim() || 'Resident';
    const phone = String(rep.phone || '').trim();
    const address = rep.address || c.location || '';
    const purok = (rep.purok && rep.purok !== '—') ? rep.purok : '';
    const vulns = Array.isArray(rep.vulnerabilities) ? rep.vulnerabilities : [];
    const ini = (name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || 'R').toUpperCase();

    const avatar = document.getElementById('repAvatar');
    if (avatar) avatar.textContent = ini;
    const nameEl = document.getElementById('repName');
    if (nameEl) nameEl.textContent = name;

    const bits = [];
    if (purok) bits.push('Purok ' + purok);
    if (address && address !== '—') bits.push(address);
    if (c.type) bits.push(c.type);
    const subEl = document.getElementById('repSub');
    if (subEl) subEl.textContent = bits.join(' · ') || 'Address pending';

    const tagsEl = document.getElementById('repTags');
    if (tagsEl) {
        const t = [];
        if (c.assign && c.assign.status) t.push('<span class="rep-tag">' + esc(FLOW_LABEL[c.assign.status] || c.assign.status) + '</span>');
        else t.push('<span class="rep-tag">Unassigned</span>');
        vulns.slice(0, 3).forEach(v => t.push('<span class="rep-tag vul">⚠ ' + esc(v) + '</span>'));
        if (c.accuracy) t.push('<span class="rep-tag">' + esc(String(Math.round(c.accuracy))) + ' m</span>');
        tagsEl.innerHTML = t.join('');
    }

    const btn = document.getElementById('callResidentBtn');
    const lbl = document.getElementById('callBtnLbl');
    const sms = document.getElementById('repSms');
    if (btn && lbl) {
        const first = (name.split(/\s+/)[0] || 'Resident');
        if (phone) {
            btn.setAttribute('href', 'tel:' + phone.replace(/[^0-9+]/g, ''));
            btn.classList.remove('no-num');
            lbl.textContent = 'Call ' + first;
            if (sms) sms.hidden = true;
        } else {
            btn.removeAttribute('href');
            btn.classList.add('no-num');
            lbl.textContent = 'No phone on file';
            if (sms) sms.hidden = false;
        }
    }

    card.hidden = false;
}

/* Wire the “open Comms” button once the DOM is ready */
(function wireMsgBtn() {
    const b = document.getElementById('msgResidentBtn');
    if (!b) return;
    b.addEventListener('click', () => {
        if (!MAP.focus) { toast('No case selected on the map'); return; }
        openThread(MAP.focus);
    });
})();

function focusCase(caseId) {
    ensureMap(); if (!MAP.map) return;
    const c = findCase(caseId);
    if (!c || !c.latitude) { toast('This case has no geotag'); return; }
    const changed = MAP.focus !== caseId;
    MAP.focus = caseId;
    if (changed) { MAP.routeCacheKey = ''; MAP.routeCoords = null; MAP.routeDistanceM = null; MAP.routeDurationS = null; }
    // Zoom close enough to see the ±Nm accuracy ring as a tight target circle
    const acc = (typeof c.accuracy === 'number' && c.accuracy > 0) ? c.accuracy : 20;
    const zoom = acc <= 20 ? 19 : acc <= 50 ? 18 : acc <= 120 ? 17 : 16;
    MAP.map.flyTo([c.latitude, c.longitude], zoom, { duration: 1.1 });
    const mk = MAP.byCase[caseId];
    if (mk) setTimeout(() => mk.openPopup(), 1150);
    drawRoute();
    refreshReporterCard();
}
document.addEventListener('rnfocus', e => { focusCase(e.detail); });
function drawMine() {
    ensureMap(); if (!MAP.map || !ME_POS) return;
    const acc = (typeof ME_POS.acc === 'number' && ME_POS.acc > 0) ? ME_POS.acc : null;
    const icon = preciseCaseIcon({ tone: 'amber', accuracy: acc, label: 'Me' });
    if (MAP.mine) {
        // Move the existing marker instead of remove/re-add (keeps animations smooth)
        MAP.mine.setLatLng([ME_POS.lat, ME_POS.lng]);
        try { MAP.mine.setIcon(icon); } catch(e){}
        MAP.mine.setPopupContent('<b>You · responder unit</b><br>'
            + ME_POS.lat.toFixed(6) + ', ' + ME_POS.lng.toFixed(6)
            + (acc != null ? '<br>' + Math.round(acc) + ' m' : ''));
    } else {
        MAP.mine = L.marker([ME_POS.lat, ME_POS.lng], {
            icon, zIndexOffset: 1100, title: 'You'
        }).addTo(MAP.map).bindPopup('<b>You · responder unit</b><br>'
            + ME_POS.lat.toFixed(6) + ', ' + ME_POS.lng.toFixed(6)
            + (acc != null ? '<br>' + Math.round(acc) + ' m' : ''));
    }
    // Debounced route refresh — don't hammer OSRM on every GPS tick
    if (MAP.focus) scheduleRouteRefresh();
}

function drawRoute() {
    if (!MAP.map) return;
    if (MAP.route) { try { MAP.map.removeLayer(MAP.route); } catch(e){} MAP.route = null; }
    if (MAP.routeGlow) { try { MAP.map.removeLayer(MAP.routeGlow); } catch(e){} MAP.routeGlow = null; }
    $('#mapDistChip').hidden = true;
    if (!MAP.focus || !ME_POS) return;
    const c = findCase(MAP.focus);
    if (!c || !c.latitude) return;

    // Immediate solid straight-line so the direction is visible while OSRM loads
    const straight = [[ME_POS.lat, ME_POS.lng], [c.latitude, c.longitude]];
    // Glow layer (wider, semi-transparent) underneath the precise route line
    MAP.routeGlow = L.polyline(straight, {
        color: '#ff6500', weight: 12, opacity: 0.18,
        lineCap: 'round', lineJoin: 'round',
        interactive: false
    }).addTo(MAP.map);
    MAP.route = L.polyline(straight, {
        color: '#ff6500', weight: 5, opacity: 0.95,
        lineCap: 'round', lineJoin: 'round',
        className: 'resp-route-line'
    }).addTo(MAP.map);

    // Distance chip (haversine until OSRM returns)
    const m = metersBetween(ME_POS, { lat: c.latitude, lng: c.longitude });
    $('#mapDistChip').hidden = false;
    $('#mapDistLbl').textContent = fmtDist(m) + ' to ' + (c.type || 'case');

    // If we already have a route cached for these endpoints, draw it now
    if (MAP.routeCoords && MAP.routeCoords.length >= 2) {
        applyRoute(MAP.routeCoords, MAP.routeDistanceM, MAP.routeDurationS, c);
    } else {
        try { MAP.map.fitBounds(L.latLngBounds(straight).pad(0.25)); } catch(e){}
    }

    // Kick off shortest-road-path fetch
    fetchRoute(MAP.focus);
}

/* =========================================================
   SHORTEST-ROAD-PATH ROUTING (OSRM public demo)
   Real driving route between responder and incident.
   Debounced; silently falls back to straight line if the
   router is unreachable (data outage during typhoon).
   ========================================================= */
function scheduleRouteRefresh() {
    if (MAP.routeTimer) clearTimeout(MAP.routeTimer);
    MAP.routeTimer = setTimeout(() => {
        MAP.routeTimer = null;
        if (MAP.focus) fetchRoute(MAP.focus);
    }, 2500);
}

function fetchRoute(caseId) {
    if (!MAP.map || !ME_POS) return;
    const c = findCase(caseId);
    if (!c || !c.latitude) return;
    if (MAP.focus !== caseId) return;
    if (MAP.routeFetching) return;
    const a = ME_POS, b = { lat: c.latitude, lng: c.longitude };
    const key = a.lat.toFixed(4) + ',' + a.lng.toFixed(4) + '|' + b.lat.toFixed(4) + ',' + b.lng.toFixed(4);
    if (key === MAP.routeCacheKey && MAP.routeCoords) { applyRoute(MAP.routeCoords, MAP.routeDistanceM, MAP.routeDurationS, c); return; }

    const url = 'https://router.project-osrm.org/route/v1/driving/'
        + a.lng.toFixed(6) + ',' + a.lat.toFixed(6) + ';'
        + b.lng.toFixed(6) + ',' + b.lat.toFixed(6)
        + '?overview=full&geometries=geojson&alternatives=false&steps=false';
    MAP.routeFetching = true;
    const ctl = ('AbortController' in window) ? new AbortController() : null;
    const to  = ctl ? setTimeout(() => { try { ctl.abort(); } catch(e){} }, 5000) : null;

    fetch(url, ctl ? { signal: ctl.signal, mode: 'cors' } : { mode: 'cors' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('OSRM ' + r.status)))
        .then(j => {
            const r0 = j && j.routes && j.routes[0];
            const coords = r0 && r0.geometry && r0.geometry.coordinates;
            if (!coords || !coords.length) return;
            const path = coords.map(p => [p[1], p[0]]);
            MAP.routeCoords    = path;
            MAP.routeCacheKey  = key;
            MAP.routeDistanceM = r0.distance != null ? Number(r0.distance) : null;
            MAP.routeDurationS = r0.duration  != null ? Number(r0.duration)  : null;
            if (MAP.focus === caseId) applyRoute(path, MAP.routeDistanceM, MAP.routeDurationS, c);
        })
        .catch(() => { MAP.routeCacheKey = ''; })
        .finally(() => { MAP.routeFetching = false; if (to) clearTimeout(to); });
}

function applyRoute(path, distM, durS, c) {
    if (!MAP.map || !MAP.route) return;
    try { MAP.route.setLatLngs(path); } catch(e){}
    if (MAP.routeGlow) { try { MAP.routeGlow.setLatLngs(path); } catch(e){} }
    const dist = (distM != null) ? distM : metersBetween(ME_POS, { lat: c.latitude, lng: c.longitude });
    const eta  = durS != null ? fmtDur(durS) : null;
    $('#mapDistChip').hidden = false;
    $('#mapDistLbl').textContent = fmtDist(dist) + (eta ? ' \u00b7 ' + eta : '') + ' to ' + (c.type || 'case');
    try { MAP.map.fitBounds(L.latLngBounds(path).pad(0.2)); } catch(e){}
}

function fmtDur(sec) {
    if (sec == null || !isFinite(sec)) return '';
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + 's';
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
}
$('#recenterBtn').addEventListener('click', () => {
    ensureMap(); if (!MAP.map) return;
    if (ME_POS) MAP.map.flyTo([ME_POS.lat, ME_POS.lng], 16);
    else toast('Waiting for your GPS fix…');
});
$('#routeBtn').addEventListener('click', () => {
    const target = myCases().find(c => c.assign.status !== 'assigned' && c.assign.status !== 'resolved') || myCases()[0];
    if (!target) { toast('No assigned case to route to'); return; }
    $('#routeBtn').classList.add('on');
    focusCase(target.id);
});

/* ---------- own live position ---------- */
function setGpsChip(state, txt) {
    $('#myGpsChip').className = 'chip ' + state;
    $('#myGpsLbl').textContent = txt;
}
function rosterPos() {
    const me = getMe();
    return me && me.lat ? { lat: me.lat, lng: me.lng, acc: 0 } : null;
}
function startOwnWatch() {
    ME_POS = ME_POS || rosterPos();
    if (ME_POS) { setGpsChip('live', 'Using last known position'); }
    const hasWeb = !!navigator.geolocation;
    if (!(window.RNLocation || hasWeb)) { setGpsChip('searching', 'GPS unavailable on device'); return; }
    const prefs = lsGet(LS.prefs, {});
    if (prefs.loc === false) { setGpsChip('searching', 'Location sharing is off'); return; }

    const onOk = (pos) => {
        ME_POS = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        setGpsChip('live', ME_POS.lat.toFixed(5) + ', ' + ME_POS.lng.toFixed(5) + ' ' + Math.round(pos.coords.accuracy || 0) + 'm');
        lsSet('rn_responder_location', Object.assign({ responderId: (getMe() || {}).id, at: new Date().toISOString() }, ME_POS));
        const me = getMe();
        if (me) {
            setMe({ id: me.id, lat: ME_POS.lat, lng: ME_POS.lng });
            // Push live location to server so admin map updates in real-time
            fetch(API_BASE + '/api/responder-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ responderId: me.id, lat: ME_POS.lat, lng: ME_POS.lng, name: me.name || me.id, role: me.role || '', status: me.status || 'available', updatedAt: new Date().toISOString() })
            }).catch(() => {});
        }
        drawMine();
        broadcast('rn_responder_loc');
    };
    const onErr = () => { setGpsChip('searching', 'GPS weak — using roster position'); ME_POS = ME_POS || rosterPos(); };
    const opts = { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000, minimumUpdateInterval: 3000 };

    if (window.RNLocation) {
        RNLocation.ensurePermission().then(granted => {
            if (!granted) { onErr(); return; }
            startOwnWatch._w = RNLocation.watchPosition(onOk, onErr, opts);
        });
    } else {
        startOwnWatch._w = navigator.geolocation.watchPosition(onOk, onErr, opts);
    }
}

/* ---------- profile & settings ---------- */
function renderProfile() {
    const me = getMe(); if (!me) return;
    $('#pfAvatar').textContent = initials(me.name);
    $('#pfName').textContent = me.name;
    $('#pfRole').textContent = me.role + ' · ' + me.skill;
    $('#pfId').textContent = me.id + ' · Barangay Taculing';
    const mine = myCases();
    const done = mine.filter(c => c.assign.status === 'resolved');
    $('#pfDone').textContent = done.length;
    $('#pfActiveN').textContent = mine.filter(c => c.assign.status !== 'resolved').length;
    let avg = '—';
    if (done.length) {
        const secs = done.map(c => {
            const h = c.assign.history || [];
            const a0 = h[0] ? new Date(h[0].at) : new Date(c.assign.assignedAt);
            const a1 = new Date(c.assign.updatedAt || c.assign.assignedAt);
            return (a1 - a0) / 1000;
        }).filter(s => s > 0);
        if (secs.length) { const m = Math.round(secs.reduce((x, y) => x + y, 0) / secs.length / 60); avg = m < 60 ? m + 'm' : (m / 60).toFixed(1) + 'h'; }
    }
    $('#pfRate').textContent = avg;
    $('#pfAccount').innerHTML =
        dRow('Full name', me.name) + dRow('Responder role', me.role) +
        dRow('Specialization', me.skill) + dRow('Contact', me.phone) +
        dRow('Email', me.email || '—') + dRow('Responder ID', me.id, true) +
        dRow('Availability', me.status) + dRow('On the team since', me.joined || '—') +
        dRow('Open assignments', String(mine.filter(c => c.assign.status !== 'resolved').length)) + dRow('Completed total', String(done.length));
    const prefs = lsGet(LS.prefs, {});
    $('#setNotif').checked = prefs.notif !== false;
    $('#setSound').checked = prefs.sound !== false;
    $('#setLoc').checked = prefs.loc !== false;
}
const dRow = (k, v, mono) => '<div class="d"><div class="d-k">' + esc(k) + '</div><div class="d-v' + (mono ? ' mono' : '') + '">' + esc(v || '—') + '</div></div>';
[['setNotif', 'notif'], ['setSound', 'sound'], ['setLoc', 'loc']].forEach(([id, key]) => {
    $('#' + id).addEventListener('change', e => {
        const prefs = lsGet(LS.prefs, {});
        prefs[key] = e.target.checked;
        lsSet(LS.prefs, prefs);
        toast(e.target.checked ? 'Setting enabled' : 'Setting disabled');
        if (key === 'loc') {
            const id = startOwnWatch._w;
            if (id !== null && id !== undefined) {
                if (window.RNLocation) RNLocation.clearWatch(id);
                else if (navigator.geolocation) navigator.geolocation.clearWatch(id);
            }
            startOwnWatch._w = null;
            startOwnWatch();
        }
    });
});
(function permProbe() {
    const show = st => { $('#permState').textContent = st === 'granted' ? 'Granted — rescue location active' : st === 'denied' ? 'Denied — enable it in browser settings' : 'Prompt on next GPS fix'; };
    if (window.RNLocation && RNLocation.isNative) {
        // Native: query Capacitor plugin
        RNLocation.ensurePermission().then(g => show(g ? 'granted' : 'prompt'));
    } else if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(p => { show(p.state); p.onchange = () => show(p.state); }).catch(() => show('Not checkable'));
    } else show('Not checkable');
    $('#permRow').addEventListener('click', async () => {
        try {
            if (window.RNLocation) { await RNLocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 }); toast('Location permission OK'); }
            else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(() => toast('Location permission OK'), () => toast('Permission needed to share position'), { timeout: 8000 });
        } catch (e) { toast('Permission needed to share position'); }
    });
})();
$('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(LS.me);
    toast('Off duty — logging out…', 1200);
    setTimeout(() => location.reload(), 900);
});

/* ---------- refresh orchestration ---------- */
function refresh(key) {
    if (!getMe()) return;
    renderAvail(); renderHome(); renderCases(); renderComms(); renderProfile(); renderNotifBadge();
    if (key === 'map') paintCases();
    else drawRoute();
}
function refreshAll() { refresh(currentScreen); }

/* ---------- remote ingest (other devices via Node API) ---------- */
async function pullRemote() {
    try {
        const r = await fetch(API_BASE + '/api/alerts');
        if (r.ok) {
            const data = await r.json();
            const arr = lsGet(LS.alerts, []);
            let changed = false;
            (Array.isArray(data) ? data : []).forEach(a => {
                if (!a || !a.id) return;
                const rec = arr.find(x => x.id === a.id);
                if (!rec) { arr.unshift(a); changed = true; }
                else if (a.resolvedAt && !rec.resolvedAt) { rec.resolvedAt = a.resolvedAt; changed = true; }
            });
            if (changed) { lsSet(LS.alerts, arr); checkNewAssignments(); refreshAll(); }
        }
    } catch (e) {}
    // Also pull assignments from server (admin dispatches on different device)
    try {
        const ar = await fetch(API_BASE + '/api/assignments');
        if (ar.ok) {
            const remote = await ar.json();
            const local = lsGet(LS.assignments, []);
            let changed = false;
            (Array.isArray(remote) ? remote : []).forEach(a => {
                if (!a || !a.caseId) return;
                const idx = local.findIndex(x => x.caseId === a.caseId && x.responderId === a.responderId);
                if (idx < 0) { local.unshift(a); changed = true; }
                else if (new Date(a.updatedAt) > new Date(local[idx].updatedAt)) { local[idx] = a; changed = true; }
            });
            if (changed) { lsSet(LS.assignments, local); checkNewAssignments(); refreshAll(); }
        }
    } catch (e) {}
}

/* ---------- realtime listeners ---------- */
try {
    const bc = new BroadcastChannel('rescuenet');
    bc.onmessage = () => { checkNewAssignments(); checkIncomingMsgs(); refreshAll(); if (currentScreen === 'map') paintCases(); };
} catch (e) {}
window.addEventListener('storage', () => { checkNewAssignments(); checkIncomingMsgs(); refreshAll(); });

/* ---------- Server-Sent Events (real-time push) ---------- */
(function connectResponderSSE() {
    let es;
    try { es = new EventSource(API_BASE + '/api/events'); } catch(e) { return; }

    es.addEventListener('new_alert', function(ev) {
        try {
            const alert = JSON.parse(ev.data);
            const arr = lsGet(LS.alerts, []);
            if (!arr.find(x => x.id === alert.id)) {
                arr.unshift(alert);
                lsSet(LS.alerts, arr);
                pushNotif('🚨 New SOS', (alert.reporter && alert.reporter.name || 'Resident') + ' — ' + (alert.type || 'Emergency'));
                refreshAll();
                if (currentScreen === 'map') paintCases();
            }
        } catch(e){}
    });

    es.addEventListener('assignment_updated', function(ev) {
        try {
            const asgn = JSON.parse(ev.data);
            const me = getMe();
            if (me && asgn.responderId === me.id) {
                const list = lsGet(LS.assignments, []);
                const idx = list.findIndex(a => a.caseId === asgn.caseId && a.responderId === asgn.responderId);
                if (idx >= 0) list[idx] = asgn; else list.unshift(asgn);
                lsSet(LS.assignments, list);
                pushNotif('📻 Dispatch Update', 'Status: ' + (asgn.status || 'assigned'));
                checkNewAssignments();
                refreshAll();
            }
        } catch(e){}
    });

    es.addEventListener('alert_updated', function(ev) {
        try {
            const updated = JSON.parse(ev.data);
            const arr = lsGet(LS.alerts, []);
            const idx = arr.findIndex(a => a.id === updated.id);
            if (idx >= 0) { arr[idx] = { ...arr[idx], ...updated }; lsSet(LS.alerts, arr); }
            refreshAll();
        } catch(e){}
    });

    es.onerror = function() {
        es.close();
        setTimeout(connectResponderSSE, 4000);
    };
})();

/* ---------- Long-poll (Capacitor native — fetch through CapacitorHttp) ---------- */
if (window.RNRealtime) {
    RNRealtime.init(API_BASE, function(evt) {
        try {
            if (evt.type === 'new_alert') {
                const alert = evt.data;
                const arr = lsGet(LS.alerts, []);
                if (!arr.find(x => x.id === alert.id)) {
                    arr.unshift(alert);
                    lsSet(LS.alerts, arr);
                    pushNotif('🚨 New SOS', (alert.reporter && alert.reporter.name || 'Resident') + ' — ' + (alert.type || 'Emergency'));
                    refreshAll();
                    if (currentScreen === 'map') paintCases();
                }
            } else if (evt.type === 'assignment_updated') {
                const asgn = evt.data;
                const me = getMe();
                if (me && asgn.responderId === me.id) {
                    const list = lsGet(LS.assignments, []);
                    const idx = list.findIndex(a => a.caseId === asgn.caseId && a.responderId === asgn.responderId);
                    if (idx >= 0) list[idx] = asgn; else list.unshift(asgn);
                    lsSet(LS.assignments, list);
                    pushNotif('📻 Dispatch', 'Status: ' + (asgn.status || 'assigned'));
                    checkNewAssignments();
                    refreshAll();
                }
            } else if (evt.type === 'alert_updated') {
                const updated = evt.data;
                const arr = lsGet(LS.alerts, []);
                const idx = arr.findIndex(a => a.id === updated.id);
                if (idx >= 0) { arr[idx] = { ...arr[idx], ...updated }; lsSet(LS.alerts, arr); }
                refreshAll();
            }
        } catch(e){}
    });
}

/* ---------- boot ---------- */
function boot() {
    const me = getMe(); if (!me) return;
    renderNotifBadge();
    navigate('home');
    startOwnWatch();
    checkNewAssignments();
    checkIncomingMsgs();
    pullRemote();
    refreshAll();
}
if (getMe()) { loginScreen.classList.remove('show'); boot(); }
setInterval(() => { if (getMe()) { checkNewAssignments(); checkIncomingMsgs(); } }, 5000);
setInterval(() => { if (getMe()) pullRemote(); }, 8000);
setInterval(() => { if (getMe() && currentScreen === 'map') paintCases(); }, 15000);
