const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DATA_FILE = path.join(__dirname, 'rescuenet-sync.json');
const EMAIL_CONFIG_FILE = path.join(__dirname, 'email-config.json');
const SMS_CONFIG_FILE = path.join(__dirname, 'sms-config.json');
const MAPS_CONFIG_FILE = path.join(__dirname, 'maps-config.json');
const TLS_KEY_FILE = path.join(__dirname, 'certs', 'server.key');
const TLS_CERT_FILE = path.join(__dirname, 'certs', 'server.crt');

app.use(cors());
app.use(express.json({ limit: '25mb' })); // photo/video attachments from resident SOS + reports

/* ==========================================================
   EMAIL CONFIG + SMTP TRANSPORT
   Options (first match wins):
     1. email-config.json  { "user": "...", "pass": "...", "from": "..." }
     2. Env vars           GMAIL_USER, GMAIL_APP_PASS, GMAIL_FROM
   Gmail requires an App Password (2FA on) — NOT the normal login pw.
   ========================================================== */
function loadEmailConfig() {
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('email-config.json could not be parsed:', e.message);
  }
  return {};
}

function getTransporter() {
  const cfg = loadEmailConfig();
  const user = cfg.user || process.env.GMAIL_USER;
  const pass = cfg.pass || process.env.GMAIL_APP_PASS || process.env.GMAIL_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: cfg.service || 'Gmail',
    auth: { user, pass },
  });
}

/* ==========================================================
   IN-MEMORY OTP STORE  (email -> { codeHash, expiresAt, attempts })
   ========================================================== */
const otpStore = new Map();
const OTP_TTL_MS = 2 * 60 * 1000;      // 2 minutes, matches front-end timer
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateOtp() {
  // Cryptographically secure 6-digit code
  return String(crypto.randomInt(100000, 999999));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ==========================================================
   SMS CONFIG + SENDER  (Vonage / Nexmo via REST API, no SDK)
     - sms-config.json  { "apiKey": "...", "apiSecret": "...", "from": "RescueNet" }
     - Env vars         VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM
   If none configured, the SMS body is printed in the terminal
   (dev-log mode) so you can still test the flow for free.
   ========================================================== */
function loadSmsConfig() {
  try {
    if (fs.existsSync(SMS_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(SMS_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('sms-config.json could not be parsed:', e.message);
  }
  return {};
}

function normalizePhone(raw) {
  // Strip non-digits
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;

  // Philippine mobile: 09XXXXXXXXX  -> 639XXXXXXXXX (Vonage wants country code, no plus)
  if (d.length === 11 && d.startsWith('09')) {
    return '63' + d.slice(1);
  }
  // Already international like +639... or +1...
  if (String(raw).trim().startsWith('+')) {
    return d;
  }
  // 10-digit PH without leading zero -> 639XXXXXXXXX
  if (d.length === 10 && d.startsWith('9')) {
    return '63' + d;
  }
  return d;
}

async function sendSms(toPhone, message) {
  const cfg = loadSmsConfig();
  const apiKey = cfg.apiKey || process.env.VONAGE_API_KEY;
  const apiSecret = cfg.apiSecret || process.env.VONAGE_API_SECRET;
  const from = cfg.from || process.env.VONAGE_FROM || 'RescueNet';

  // Dev-log fallback: no Vonage creds -> just print the SMS to the console
  if (!apiKey || !apiSecret || /REPLACE_WITH/.test(apiKey + apiSecret)) {
    console.log('\n\x1b[36m[DEV SMS → ' + toPhone + ']\x1b[0m ' + message + '\n');
    return { dev: true, to: toPhone, body: message };
  }

  // Vonage REST API. Uses form-encoded POST.
  const resp = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      api_key: apiKey,
      api_secret: apiSecret,
      to: toPhone,
      from: from,
      text: message,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  const msg = (data && data.messages && data.messages[0]) || {};

  if (msg.status !== '0') {
    throw new Error('Vonage ' + (msg.status || resp.status) + ': ' + (msg['error-text'] || 'unknown error'));
  }
  return { dev: false, to: toPhone, messageId: msg['message-id'], remainingBalance: msg['remaining-balance'] };
}

app.post('/api/send-otp', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const rawPhone = (req.body && req.body.phone) || '';
  const phone = normalizePhone(rawPhone);

  // At least one identifier (email or phone) is required
  const hasEmail = EMAIL_RE.test(email);
  const hasPhone = !!phone;
  if (!hasEmail && !hasPhone) {
    return res.status(400).json({ ok: false, error: 'Provide a valid email or phone number.' });
  }

  // Key the OTP store by email (preferred) or phone
  const otpKey = hasEmail ? email : 'phone:' + phone;
  const transport = getTransporter();

  // Resend cooldown
  const existing = otpStore.get(otpKey);
  if (existing && existing.lastSentAt && Date.now() - existing.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
    return res.status(429).json({ ok: false, error: `Please wait ${wait}s before requesting a new code.` });
  }

  const code = generateOtp();
  otpStore.set(otpKey, {
    codeHash: hashCode(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
    phone,
  });

  const cfg = loadEmailConfig();
  const from = cfg.from || cfg.user || process.env.GMAIL_FROM || process.env.GMAIL_USER;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#ffffff;padding:28px;max-width:480px;margin:auto;border:1px solid #e5eaf2;border-radius:14px;">
      <h2 style="color:#102d5c;margin:0 0 8px;">RescueNet verification code</h2>
      <p style="color:#5b7392;margin:0 0 20px;font-size:14px;">Use this 6-digit code to verify your number. It expires in 2 minutes.</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#102d5c;background:#f6f9fd;border:1px solid rgba(16,45,92,0.14);border-radius:12px;padding:16px;text-align:center;">${code}</div>
      <p style="color:#5b7392;margin:20px 0 0;font-size:12px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  const smsBody = `RescueNet: your verification code is ${code}. It expires in 2 minutes.`;

  // Build tasks: email (if configured) + SMS (always try)
  const tasks = [];
  const taskLabels = [];

  if (hasEmail && transport) {
    tasks.push(transport.sendMail({
      from: `RescueNet <${from}>`,
      to: email,
      subject: `Your RescueNet verification code: ${code}`,
      text: `Your RescueNet verification code is ${code}. It expires in 2 minutes.`,
      html,
    }));
    taskLabels.push('email');
  }

  if (hasPhone) {
    tasks.push(sendSms(phone, smsBody));
    taskLabels.push('sms');
  }

  // If no tasks (no email transport AND no phone), force dev-log
  if (!tasks.length) {
    console.log('\n\x1b[33m[OTP DEV — no email/SMS configured] Code for ' + otpKey + ': ' + code + '\x1b[0m\n');
    return res.json({ ok: true, expiresAt: Date.now() + OTP_TTL_MS, channels: { email: 'skipped', sms: 'dev-log' }, phone: phone || null });
  }

  const results = await Promise.allSettled(tasks);
  const channels = { email: 'skipped', sms: 'skipped' };

  results.forEach((r, i) => {
    const label = taskLabels[i];
    if (label === 'email') {
      channels.email = r.status === 'fulfilled' ? 'sent' : 'failed';
    } else if (label === 'sms') {
      if (r.status === 'fulfilled') {
        channels.sms = (r.value && r.value.dev) ? 'dev-log' : (r.value && r.value.skipped ? 'skipped' : 'sent');
      } else {
        channels.sms = 'failed';
      }
    }
  });

  // If ALL channels failed, that's fatal
  if (channels.email === 'failed' && channels.sms === 'failed') {
    otpStore.delete(otpKey);
    return res.status(502).json({ ok: false, error: 'Could not send code via email or SMS. Check server config.', channels });
  }

  // If email failed but SMS worked (or dev-logged), still succeed
  if (channels.email === 'failed') {
    console.warn('send-otp email failed for ' + email + ' — code delivered via SMS/dev-log only');
  }

  // Always print the code in terminal for dev visibility
  console.log('\n\x1b[32m[RESCUENET OTP] ' + otpKey + ' → ' + code + '\x1b[0m (' + new Date().toLocaleTimeString() + ')\n');

  return res.json({
    ok: true,
    expiresAt: Date.now() + OTP_TTL_MS,
    channels,
    phone: phone || null,
  });
});

app.post('/api/verify-otp', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const rawPhone = (req.body && req.body.phone) || '';
  const phone = normalizePhone(rawPhone);
  const code = String((req.body && req.body.code) || '').trim();

  if (!/\d{6}/.test(code)) {
    return res.status(400).json({ ok: false, error: 'Enter the complete 6-digit code.' });
  }
  if (!email && !phone) {
    return res.status(400).json({ ok: false, error: 'No identifier provided.' });
  }

  // Try email key first, then phone key
  const otpKey = EMAIL_RE.test(email) ? email : (phone ? 'phone:' + phone : null);
  const altKey = (otpKey !== email && email) ? email : (phone ? 'phone:' + phone : null);

  let record = otpKey ? otpStore.get(otpKey) : null;
  if (!record && altKey) { record = otpStore.get(altKey); }
  const activeKey = (record && otpKey && otpStore.get(otpKey)) ? otpKey : altKey;

  if (!record) {
    return res.status(400).json({ ok: false, error: 'No active code. Please request a new one.' });
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(activeKey);
    return res.status(400).json({ ok: false, error: 'Code expired. Please request a new one.' });
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(activeKey);
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please request a new code.' });
  }

  record.attempts += 1;

  if (hashCode(code) !== record.codeHash) {
    return res.status(401).json({ ok: false, error: 'Incorrect code. Please try again.' });
  }

  otpStore.delete(activeKey);
  return res.json({ ok: true, verified: true });
});

/* Periodic cleanup of expired OTP entries */
setInterval(() => {
  const now = Date.now();
  for (const [email, rec] of otpStore.entries()) {
    if (rec.expiresAt < now) otpStore.delete(email);
  }
}, 60 * 1000);

/* ==========================================================
   CENTRAL DATA STORE (persisted to rescuenet-sync.json)
   ========================================================== */
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    // Normalize: ensure all fields exist even in older files
    const base = emptyStore();
    for (const key of Object.keys(base)) {
      if (!(key in parsed)) parsed[key] = base[key];
    }
    return parsed;
  } catch (e) {
    return emptyStore();
  }
}
function emptyStore() {
  return { alerts: [], reports: [], residents: [], assignments: [], households: [], announcements: [], resources: [], responderLocations: {}, responders: [] };
}
function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

/* ==========================================================
   REAL-TIME EVENT SYSTEM
   Two transport layers:
   1. SSE (/api/events) — works in browsers (admin on PC)
   2. Long-poll (/api/longpoll) — works in Capacitor WebView
      via CapacitorHttp fetch interception (bypasses mixed content)
   ========================================================== */
let sseClients = [];
let pendingPolls = [];  // long-poll waiting requests
let eventQueue = [];    // last N events for any joining poll
const EVENT_BUFFER_MAX = 50;

function broadcast(eventType, data) {
  const event = { type: eventType, data, ts: Date.now() };

  // 1) Resolve pending long-poll requests immediately
  const resolved = pendingPolls.splice(0);
  resolved.forEach(client => {
    clearTimeout(client.timer);
    try { client.res.json({ events: [event] }); } catch (e) {}
  });

  // 2) Push to SSE clients (browsers)
  const payload = `event: ${eventType}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
  sseClients = sseClients.filter(c => {
    try { c.res.write(payload); return true; } catch (e) { return false; }
  });
}

// SSE endpoint (for browser-based admin)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(':connected\r\n\r\n');
  const client = { id: Date.now() + '_' + Math.random().toString(36).slice(2), res };
  sseClients.push(client);
  req.on('close', () => { sseClients = sseClients.filter(c => c.id !== client.id); });
});

// Long-poll endpoint (for Capacitor native apps via fetch/CapacitorHttp)
app.get('/api/longpoll', (req, res) => {
  const client = { res, timer: null };
  // Hold request open for 28s max; if no event, respond with empty
  client.timer = setTimeout(() => {
    const idx = pendingPolls.indexOf(client);
    if (idx >= 0) pendingPolls.splice(idx, 1);
    try { res.json({ events: [] }); } catch (e) {}
  }, 28000);
  pendingPolls.push(client);
  req.on('close', () => {
    clearTimeout(client.timer);
    const idx = pendingPolls.indexOf(client);
    if (idx >= 0) pendingPolls.splice(idx, 1);
  });
});

// Keep-alive ping every 25s for SSE
setInterval(() => {
  sseClients = sseClients.filter(c => {
    try { c.res.write(':ping\r\n\r\n'); return true; } catch (e) { return false; }
  });
}, 25000);

/* ==========================================================
   SYNC / FULL STATE
   ========================================================== */

/* ==========================================================
   MAPS CONFIG (Google Maps API key)
   Kept in maps-config.json at the project root so the key does
   NOT appear in any HTML / client JS file. The client fetches
   /api/config once on startup and builds the Google Maps SDK
   <script> tag at runtime.
   Options (first match wins):
     1. maps-config.json   { "googleMapsApiKey": "..." }
     2. Env var            GOOGLE_MAPS_API_KEY
   ========================================================== */
function loadMapsConfig() {
  try {
    if (fs.existsSync(MAPS_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(MAPS_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('maps-config.json could not be parsed:', e.message);
  }
  return {};
}

app.get('/api/config', (req, res) => {
  const cfg = loadMapsConfig();
  res.json({
    googleMapsApiKey: cfg.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || ''
  });
});

/* Synchronous script include so the Google Maps SDK can be loaded with
 * the key BEFORE any page code runs. Not inlined into HTML view-source;
 * only appears in the /maps-key.js response. */
app.get('/maps-key.js', (req, res) => {
  const cfg = loadMapsConfig();
  const key = (cfg.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '').replace(/[^A-Za-z0-9_\-]/g, '');
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send('window.RN_GOOGLE_MAPS_KEY=' + JSON.stringify(key) + ';\n');
});

app.get('/api/sync', (req, res) => {
  res.json(readStore());
});

app.post('/api/sync', (req, res) => {
  const incoming = req.body || {};
  const current = readStore();
  const next = { ...current };
  const changed = [];
  if (Array.isArray(incoming.alerts))       { next.alerts = incoming.alerts; changed.push('alerts'); }
  if (Array.isArray(incoming.reports))      { next.reports = incoming.reports; changed.push('reports'); }
  if (Array.isArray(incoming.residents))    { next.residents = incoming.residents; changed.push('residents'); }
  if (Array.isArray(incoming.assignments))  { next.assignments = incoming.assignments; changed.push('assignments'); }
  if (Array.isArray(incoming.households))   { next.households = incoming.households; changed.push('households'); }
  if (Array.isArray(incoming.announcements)){ next.announcements = incoming.announcements; changed.push('announcements'); }
  if (Array.isArray(incoming.resources))    { next.resources      = incoming.resources;    changed.push('resources'); }
  writeStore(next);
  changed.forEach(key => broadcast('sync_' + key, next[key]));
  res.json({ ok: true });
});

/* ==========================================================
   ALERTS (SOS)
   ========================================================== */
app.get('/api/alerts', (req, res) => {
  res.json(readStore().alerts || []);
});

app.post('/api/alert', (req, res) => {
  const alert = req.body || null;
  if (!alert || !alert.id) return res.status(400).json({ ok: false, error: 'Missing alert payload' });
  const store = readStore();
  const alerts = [...(store.alerts || [])];
  const idx = alerts.findIndex(a => a.id === alert.id);
  if (idx >= 0) alerts[idx] = alert;
  else alerts.unshift(alert);
  store.alerts = alerts.slice(0, 50);
  writeStore(store);
  broadcast('new_alert', alert);
  res.json({ ok: true });
});

/* ==========================================================
   REPORTS
   ========================================================== */
app.get('/api/reports', (req, res) => {
  res.json(readStore().reports || []);
});

app.post('/api/report', (req, res) => {
  const report = req.body || null;
  if (!report || !report.id) return res.status(400).json({ ok: false, error: 'Missing report payload' });
  const store = readStore();
  const reports = [...(store.reports || [])];
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx >= 0) reports[idx] = report;
  else reports.unshift(report);
  store.reports = reports.slice(0, 50);
  writeStore(store);
  broadcast('new_report', report);
  res.json({ ok: true });
});

app.delete('/api/report/:id', (req, res) => {
  const store = readStore();
  store.reports = (store.reports || []).filter(r => r.id !== req.params.id);
  writeStore(store);
  broadcast('report_deleted', { id: req.params.id });
  res.json({ ok: true });
});

/* ==========================================================
   RESIDENTS (registration sync)
   ========================================================== */
app.get('/api/residents', (req, res) => {
  res.json(readStore().residents || []);
});

app.post('/api/resident', (req, res) => {
  const resident = req.body || null;
  console.log('[RESIDENT POST] received:', resident ? (resident.id + ' ' + (resident.firstName||'') + ' ' + (resident.lastName||'')) : 'EMPTY');
  if (!resident || (!resident.id && !resident.phone && !resident.email)) {
    return res.status(400).json({ ok: false, error: 'Missing resident payload' });
  }
  const store = readStore();
  const list = [...(store.residents || [])];
  const exists = list.findIndex(r =>
    (resident.id && r.id === resident.id) ||
    (resident.phone && r.phone && r.phone.replace(/\s/g,'') === resident.phone.replace(/\s/g,'')) ||
    (resident.email && r.email && r.email.toLowerCase() === resident.email.toLowerCase())
  );
  /* SECURITY + APPROVAL WORKFLOW
   * ---------------------------------------------------------------
   * This endpoint is called from the resident's own device (browser
   * / Capacitor APK) during registration. We MUST NOT trust a
   * client-supplied `status` — a stale build, a crafted fetch, or a
   * copy/paste of an approved record could otherwise self-approve an
   * account and skip the barangay-admin review step. The ONLY
   * endpoints that can write 'approved' or 'rejected' are
   * POST /api/resident/:id/approve and /api/resident/:id/reject,
   * both of which are called from the admin console.
   *
   * Status decision on POST /api/resident:
   *   new record                 → 'pending'   (enter admin queue)
   *   existing 'pending'         → 'pending'   (idempotent re-POST)
   *   existing 'approved'        → 'approved'  (never silently undo
   *                                             an admin approval by
   *                                             re-submitting the
   *                                             form)
   *   existing 'rejected'        → 'pending'   (resident has
   *                                             re-registered after a
   *                                             rejection: the record
   *                                             MUST go back into the
   *                                             admin's verification
   *                                             queue so it can be
   *                                             re-reviewed. This was
   *                                             the cause of the
   *                                             reported "auto denied
   *                                             even though the admin
   *                                             didn't reject it"
   *                                             bug — a stale
   *                                             'rejected' status in
   *                                             rescueNet-sync.json
   *                                             was silently preserved
   *                                             across re-registrations.)
   *   existing anything else     → 'pending'   (defensive default)
   */
  const existingStatus = exists >= 0
    ? String(list[exists].status || '').toLowerCase()
    : '';
  const finalStatus = existingStatus === 'approved' ? 'approved' : 'pending';
  const withStatus = {
    ...resident,
    status: finalStatus,
    registeredAt: resident.registeredAt || new Date().toISOString()
  };
  if (exists >= 0) {
    /* Wipe any stale rejectedAt / rejectedReason so the record reads
     * cleanly as a fresh pending request in the admin UI. Keep
     * approvedAt only when we are preserving an approved record. */
    const merged = { ...list[exists], ...withStatus, status: finalStatus };
    if (finalStatus === 'pending') {
      delete merged.rejectedAt;
      delete merged.rejectedReason;
      delete merged.approvedAt;
    }
    list[exists] = merged;
  } else {
    list.unshift(withStatus);
  }
  store.residents = list;
  writeStore(store);
  broadcast('resident_registered', list[exists >= 0 ? exists : 0]);
  console.log('[RESIDENT POST] saved + broadcast OK. Total residents:', list.length, '· status:', finalStatus, '(was:', existingStatus || '<new>', ')');
  res.json({ ok: true, resident: list[exists >= 0 ? exists : 0] });
});

/* ---- Resident approval status lookup (used by index.html login gate) ---- */
app.get('/api/resident/status', (req, res) => {
  const em = String(req.query.email || '').trim().toLowerCase();
  const ph = String(req.query.phone || '').replace(/\D/g, '');
  if (!em && !ph) return res.status(400).json({ ok: false, error: 'email or phone required' });
  const list = readStore().residents || [];
  const match = list.find(r =>
    (em && String(r.email || '').toLowerCase() === em) ||
    (ph && String(r.phone || '').replace(/\D/g, '') === ph)
  );
  if (!match) return res.json({ ok: true, found: false });
  res.json({
    ok: true, found: true,
    status: match.status || 'pending',
    resident: {
      id: match.id, firstName: match.firstName, lastName: match.lastName,
      email: match.email, phone: match.phone,
      facialDataUrl: match.facialDataUrl || '',
      approvedAt: match.approvedAt || null, rejectedAt: match.rejectedAt || null
    }
  });
});

/* ---- Approve a resident: flip status + notify via Gmail + SMS ---- */
app.post('/api/resident/:id/approve', async (req, res) => {
  const id = String(req.params.id || '');
  const store = readStore();
  const list = Array.isArray(store.residents) ? [...store.residents] : [];
  const idx = list.findIndex(r => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Resident not found' });

  const approvedAt = new Date().toISOString();
  list[idx] = { ...list[idx], status: 'approved', approvedAt };
  store.residents = list;
  writeStore(store);
  const r = list[idx];
  broadcast('resident_approved', r);

  const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.name || 'Resident';
  const channels = { email: 'skipped', sms: 'skipped' };
  const errors   = [];

  // Email (Gmail via nodemailer)
  if (r.email) {
    const transport = getTransporter();
    if (transport) {
      try {
        const cfg  = loadEmailConfig();
        const from = cfg.from || cfg.user || process.env.GMAIL_USER;
        const subject = 'RescueNet — Your account has been approved ✅';
        const text = 'Hi ' + name + ',\n\n'
          + 'A barangay official has reviewed and approved your RescueNet registration.\n'
          + 'You can now sign in on the app using your registered email or mobile number.\n\n'
          + '— RescueNet · Barangay Taculing';
        const html = '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;background:#f6f9fd;border-radius:12px;color:#1a2942">'
          + '<h2 style="color:#102d5c;margin:0 0 10px">Account Approved ✓</h2>'
          + '<p>Hi <b>' + (name) + '</b>,</p>'
          + '<p>A barangay official has reviewed and approved your RescueNet registration. You can now sign in on the RescueNet app using your registered email or mobile number.</p>'
          + '<p style="margin-top:22px;padding:12px 14px;background:#ffffff;border-left:3px solid #ff6500;border-radius:6px;font-size:13px;color:#5b7392">'
          + 'Approved: ' + new Date(approvedAt).toLocaleString() + '</p>'
          + '<p style="margin-top:22px;color:#5b7392;font-size:12px">RescueNet · Barangay Taculing</p></div>';
        await transport.sendMail({ from: 'RescueNet <' + from + '>', to: r.email, subject, text, html });
        channels.email = 'sent';
      } catch (e) { channels.email = 'failed'; errors.push('email: ' + e.message); }
    } else {
      channels.email = 'not configured (email-config.json missing)';
    }
  }

  // SMS (Vonage / dev-log fallback)
  if (r.phone) {
    try {
      const to = normalizePhone(r.phone);
      if (to) {
        const s = await sendSms(to, 'RescueNet: Your account has been APPROVED by the barangay. Sign in now. -Brgy Taculing');
        channels.sms = (s && s.dev) ? 'dev-log' : 'sent';
      } else {
        channels.sms = 'invalid phone';
      }
    } catch (e) { channels.sms = 'failed'; errors.push('sms: ' + e.message); }
  }

  console.log('[RESIDENT APPROVED]', id, name, '·', channels);
  res.json({ ok: true, resident: r, channels, errors });
});

/* ---- Reject a resident ---- */
app.post('/api/resident/:id/reject', (req, res) => {
  const id = String(req.params.id || '');
  const store = readStore();
  const list = Array.isArray(store.residents) ? [...store.residents] : [];
  const idx = list.findIndex(r => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Resident not found' });
  list[idx] = { ...list[idx], status: 'rejected', rejectedAt: new Date().toISOString() };
  store.residents = list;
  writeStore(store);
  broadcast('resident_rejected', list[idx]);
  console.log('[RESIDENT REJECTED]', id);
  res.json({ ok: true, resident: list[idx] });
});

/* ==========================================================
   RESPONSE ASSIGNMENTS (admin dispatch → responder)
   ========================================================== */
app.get('/api/assignments', (req, res) => {
  res.json(readStore().assignments || []);
});

app.post('/api/assignment', (req, res) => {
  const assignment = req.body || null;
  if (!assignment || !assignment.caseId) return res.status(400).json({ ok: false, error: 'Missing assignment' });
  const store = readStore();
  const list = [...(store.assignments || [])];
  const idx = list.findIndex(a => a.caseId === assignment.caseId && a.responderId === assignment.responderId);
  if (idx >= 0) list[idx] = { ...list[idx], ...assignment };
  else list.unshift(assignment);
  store.assignments = list;
  writeStore(store);
  broadcast('assignment_updated', assignment);
  res.json({ ok: true });
});

/* ==========================================================
   HOUSEHOLD SAFETY STATUS
   ========================================================== */
app.get('/api/households', (req, res) => {
  res.json(readStore().households || []);
});

app.post('/api/household', (req, res) => {
  const hh = req.body || null;
  if (!hh || !hh.id) return res.status(400).json({ ok: false, error: 'Missing household payload' });
  const store = readStore();
  const list = [...(store.households || [])];
  const idx = list.findIndex(h => h.id === hh.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...hh };
  else list.unshift(hh);
  store.households = list;
  writeStore(store);
  broadcast('household_update', hh);
  res.json({ ok: true });
});

/* ==========================================================
   ANNOUNCEMENTS (admin → residents)
   ========================================================== */
app.get('/api/announcements', (req, res) => {
  res.json(readStore().announcements || []);
});

app.post('/api/announcement', (req, res) => {
  const ann = req.body || null;
  if (!ann || !ann.id) return res.status(400).json({ ok: false, error: 'Missing announcement' });
  const store = readStore();
  const list = [...(store.announcements || [])];
  const idx = list.findIndex(a => a.id === ann.id);
  if (idx >= 0) list[idx] = ann;
  else list.unshift(ann);
  store.announcements = list;
  writeStore(store);
  broadcast('announcement_published', ann);
  res.json({ ok: true });
});

app.delete('/api/announcement/:id', (req, res) => {
  const store = readStore();
  store.announcements = (store.announcements || []).filter(a => a.id !== req.params.id);
  writeStore(store);
  broadcast('announcement_deleted', { id: req.params.id });
  res.json({ ok: true });
});

/* ==========================================================
   EMERGENCY RESOURCES (admin → residents)
   Guides / hotlines / checklists that residents can open
   offline. Same upsert + delete + SSE broadcast pattern as
   announcements so client devices pull the current list.
   ========================================================== */
app.get('/api/resources', (req, res) => {
  res.json(readStore().resources || []);
});

app.post('/api/resource', (req, res) => {
  const rec = req.body || null;
  if (!rec || !rec.id) return res.status(400).json({ ok: false, error: 'Missing resource' });
  const store = readStore();
  const list = [...(store.resources || [])];
  const idx = list.findIndex(r => r.id === rec.id);
  if (idx >= 0) list[idx] = rec;
  else list.unshift(rec);
  store.resources = list;
  writeStore(store);
  broadcast('resource_updated', rec);
  res.json({ ok: true });
});

app.delete('/api/resource/:id', (req, res) => {
  const store = readStore();
  store.resources = (store.resources || []).filter(r => r.id !== req.params.id);
  writeStore(store);
  broadcast('resource_deleted', { id: req.params.id });
  res.json({ ok: true });
});

/* ==========================================================
   RESPONDER LOCATIONS (live GPS tracking)
   ========================================================== */
app.post('/api/responder-location', (req, res) => {
  const { responderId, lat, lng, updatedAt, name, role, status } = req.body || {};
  if (!responderId) return res.status(400).json({ ok: false });
  const nLat = Number(lat), nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return res.status(400).json({ ok: false, error: 'Valid lat and lng are required' });
  }
  const nAcc = Number(req.body && req.body.accuracy);
  const store = readStore();
  if (!store.responderLocations) store.responderLocations = {};
  store.responderLocations[responderId] = {
    lat: nLat, lng: nLng,
    accuracy: Number.isFinite(nAcc) ? nAcc : undefined,
    updatedAt: updatedAt || new Date().toISOString(),
    name: name || undefined,
    role: role || undefined,
    status: status || undefined
  };
  // Keep the roster record's coordinates in sync so rosterPos() / the admin map
  // read the freshest precise GPS instead of the stale seed placeholder.
  if (Array.isArray(store.responders)) {
    const idx = store.responders.findIndex(r => String(r.id) === String(responderId));
    if (idx >= 0) {
      store.responders[idx].lat = nLat;
      store.responders[idx].lng = nLng;
      if (status) store.responders[idx].status = status;
    }
  }
  writeStore(store);
  broadcast('responder_location', { responderId, lat: nLat, lng: nLng, updatedAt, name, role, status });
  res.json({ ok: true });
});

/* GET all live responder positions (for admin hydration) */
app.get('/api/responder-locations', (req, res) => {
  const store = readStore();
  res.json(store.responderLocations || {});
});

/* ==========================================================
   RESPONDER DIRECTORY (admin-registered accounts)
   Admin creates records via dashboards.html → POSTed here
   so the responder mobile app can hydrate the login roster.
   ========================================================== */
app.get('/api/responders', (req, res) => {
  const store = readStore();
  res.json(store.responders || []);
});

// Responder login: verify name + 11-digit phone against the roster
app.post('/api/responder/login', (req, res) => {
  const body  = req.body || {};
  const name  = String(body.name  || '').trim().toLowerCase();
  const phone = String(body.phone || '').replace(/\D/g, '');
  if (!name || !/^09\d{9}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: 'Name and an 11-digit phone starting with 09 are required' });
  }
  const store = readStore();
  const list  = Array.isArray(store.responders) ? store.responders : [];
  const match = list.find(r =>
    String(r.name  || '').trim().toLowerCase() === name &&
    String(r.phone || '').replace(/\D/g, '') === phone
  );
  if (!match) {
    console.log('[RESPONDER LOGIN] rejected for', name, '·', phone);
    return res.status(401).json({ ok: false, error: 'Credentials do not match any registered responder' });
  }
  console.log('[RESPONDER LOGIN] ok:', match.id, match.name);
  res.json({ ok: true, responder: match });
});

app.post('/api/responder', (req, res) => {
  const r = req.body || null;
  if (!r || !r.name || !r.phone) {
    return res.status(400).json({ ok: false, error: 'Responder requires name and phone' });
  }
  const phoneDigits = String(r.phone).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(phoneDigits)) {
    return res.status(400).json({ ok: false, error: 'Phone must be exactly 11 digits starting with 09' });
  }
  const store = readStore();
  const list = Array.isArray(store.responders) ? [...store.responders] : [];

  // Auto-assign next RS### id when admin omitted it
  let id = String(r.id || '').trim();
  if (!id) {
    const nextNum = list.length
      ? Math.max(...list.map(x => parseInt(String(x.id || '').replace('RS', ''), 10) || 0)) + 1
      : 1;
    id = 'RS' + String(nextNum).padStart(3, '0');
  }

  const rec = {
    id,
    name:  String(r.name).trim(),
    role:  String(r.role || 'Responder').trim(),
    skill: String(r.skill || '').trim(),
    phone: phoneDigits,
    email: String(r.email || '').trim(),
    status: String(r.status || 'available').trim(),
    lat: Number.isFinite(Number(r.lat)) ? Number(r.lat) : 13.3520,
    lng: Number.isFinite(Number(r.lng)) ? Number(r.lng) : 123.7490,
    joined: r.joined || new Date().toISOString().slice(0, 10),
    createdAt: r.createdAt || new Date().toISOString()
  };

  const idx = list.findIndex(x => String(x.id) === id);
  if (idx >= 0) list[idx] = { ...list[idx], ...rec };
  else list.push(rec);
  store.responders = list;
  writeStore(store);
  broadcast('responder_registered', rec);
  console.log('[RESPONDER POST] saved:', rec.id, rec.name, '· total', list.length);
  res.json({ ok: true, responder: rec });
});

/* Batch upsert (used by admin if they want to sync full roster) */
app.post('/api/responders', (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : (Array.isArray(req.body && req.body.responders) ? req.body.responders : null);
  if (!incoming) return res.status(400).json({ ok: false, error: 'Expected array of responders' });
  const store = readStore();
  const list = Array.isArray(store.responders) ? [...store.responders] : [];
  let nextNum = list.length
    ? Math.max(...list.map(x => parseInt(String(x.id || '').replace('RS', ''), 10) || 0))
    : 0;
  incoming.forEach(r => {
    if (!r || !r.name || !r.phone) return;
    let id = String(r.id || '').trim();
    if (!id) { nextNum += 1; id = 'RS' + String(nextNum).padStart(3, '0'); }
    const rec = {
      id,
      name:  String(r.name).trim(),
      role:  String(r.role || 'Responder').trim(),
      skill: String(r.skill || '').trim(),
      phone: String(r.phone).trim(),
      email: String(r.email || '').trim(),
      status: String(r.status || 'available').trim(),
      lat: Number.isFinite(Number(r.lat)) ? Number(r.lat) : 13.3520,
      lng: Number.isFinite(Number(r.lng)) ? Number(r.lng) : 123.7490,
      joined: r.joined || new Date().toISOString().slice(0, 10),
      createdAt: r.createdAt || new Date().toISOString()
    };
    const idx = list.findIndex(x => String(x.id) === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...rec };
    else list.push(rec);
  });
  store.responders = list;
  writeStore(store);
  broadcast('responders_synced', list);
  res.json({ ok: true, count: list.length });
});

/* ==========================================================
   SOS STATUS UPDATE (admin resolves / updates alert)
   ========================================================== */
app.patch('/api/alert/:id', (req, res) => {
  const store = readStore();
  const alerts = [...(store.alerts || [])];
  const idx = alerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Alert not found' });
  alerts[idx] = { ...alerts[idx], ...req.body };
  store.alerts = alerts;
  writeStore(store);
  broadcast('alert_updated', alerts[idx]);
  res.json({ ok: true });
});

/* ==========================================================
   STATIC FILES + LISTEN
   ========================================================== */
app.use(express.static(path.join(__dirname, 'www')));

/* ==========================================================
   BOOT HTTP + HTTPS
   HTTPS is required so mobile browsers (Chrome/Safari) treat
   the page as a Secure Context and allow navigator.geolocation.
   Certs live in ./certs/server.key + server.crt. If they're
   missing we boot HTTP only and print a warning.
   ========================================================== */
const httpServer = http.createServer(app);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[36m[HTTP ] RescueNet running at http://0.0.0.0:${PORT}\x1b[0m`);
});

let httpsServer = null;
try {
  if (fs.existsSync(TLS_KEY_FILE) && fs.existsSync(TLS_CERT_FILE)) {
    const tlsOptions = {
      key:  fs.readFileSync(TLS_KEY_FILE),
      cert: fs.readFileSync(TLS_CERT_FILE),
    };
    httpsServer = https.createServer(tlsOptions, app);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`\x1b[32m[HTTPS] RescueNet running at https://0.0.0.0:${HTTPS_PORT}  (use this on mobile for GPS)\x1b[0m`);
    });
    httpsServer.on('error', (e) => console.warn('[HTTPS] failed:', e.message));
  } else {
    console.warn(`\x1b[33m[HTTPS] skipped — certs missing. Generate with:\n  c:\\xampp\\apache\\bin\\openssl.exe req -x509 -nodes -newkey rsa:2048 -keyout certs/server.key -out certs/server.crt -days 825 -config certs/rescuenet.cnf -extensions v3_req\x1b[0m`);
  }
} catch (e) {
  console.warn('[HTTPS] init error:', e.message);
}

console.log(`  SSE stream:  http(s)://.../api/events`);
