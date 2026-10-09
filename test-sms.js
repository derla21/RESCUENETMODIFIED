/* Diagnose OTP delivery channels.
 * Usage:   node test-sms.js  [optional recipient phone]
 * Example: node test-sms.js 09171234567
 * If no phone is provided, uses 09171234567 as a fake demo number.
 * Safe: does not print the auth token.
 */
const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, 'sms-config.json');
const examplePath = path.join(__dirname, 'sms-config.example.json');

function hr() { console.log('─'.repeat(60)); }

console.log('SMS configuration check\n');
hr();

if (!fs.existsSync(cfgPath)) {
  console.log('⚠  sms-config.json NOT FOUND at:');
  console.log('   ', cfgPath);
  console.log('\n   → Your server is running in DEV-LOG mode.');
  console.log('     The SMS body is printed in the server terminal only.');
  if (fs.existsSync(examplePath)) {
    console.log('     Template available at: ' + examplePath);
    console.log('     Copy it to sms-config.json and fill in real values.');
  }
  hr();
  process.exit(0);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
} catch (e) {
  console.error('❌  sms-config.json is not valid JSON:', e.message);
  process.exit(1);
}

const sid = cfg.accountSid || '';
const token = cfg.authToken || '';
const from = cfg.from || '';

console.log('sms-config.json FOUND');
console.log('  accountSid :', sid ? (sid.slice(0, 6) + '...' + '(len ' + sid.length + ')') : 'MISSING');
console.log('  authToken  :', token ? '(len ' + token.length + ', hidden)' : 'MISSING');
console.log('  from       :', from || 'MISSING');
hr();

if (/REPLACE_WITH/.test(sid + token + from)) {
  console.log('⚠  Still using placeholder values.');
  console.log('   → Server will remain in DEV-LOG mode.');
  hr();
  process.exit(0);
}

if (!sid.startsWith('AC')) {
  console.log('❌  accountSid must start with "AC" (from Twilio console)');
}

if (/^\+1500555\d+/.test(from)) {
  console.log('⚠  "from" is Twilio magic test number.');
  console.log('   Real deliveries will be rejected.');
  console.log('   Buy a Twilio number at console.twilio.com → Phone Numbers → Buy');
}

const toRaw = process.argv[2] || '09171234567';
let d = String(toRaw).replace(/\D/g, '');
let to = d.length === 11 && d.startsWith('09') ? '+63' + d.slice(1) : (toRaw.startsWith('+') ? toRaw : '+' + d);
console.log('\nAttempting real Twilio send...');
console.log('  to    :', to);

(async () => {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const basic = Buffer.from(`${sid}:${token}`).toString('base64');
  const body = new URLSearchParams({ To: to, From: from, Body: 'RescueNet test SMS.' });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + basic,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* ignore */ }

  if (resp.ok) {
    console.log('✅  SMS accepted by Twilio. sid=' + data.sid + ' status=' + data.status);
  } else {
    console.log('❌  Twilio rejected SMS: HTTP ' + resp.status);
    console.log('    code:    ' + (data.code || '(none)'));
    console.log('    message: ' + (data.message || text));
    if (data.more_info) console.log('    docs:    ' + data.more_info);
    hr();
    if (data.code === 21408) console.log('→ Trial account: verify this recipient at console.twilio.com/us1/account/manage_api/verified_caller_id');
    else if (data.code === 30007) console.log('→ Country blocked: enable Philippines at console.twilio.com/us1/messaging/settings/countries');
    else if (data.code === 21211) console.log('→ Invalid To number: use E.164 format like +639171234567');
    else if (data.code === 21215) console.log('→ Invalid From number: use your purchased Twilio number');
    else if (data.code === 21610) console.log('→ Recipient cannot receive SMS (carrier blocked or wrong prefix)');
    else if (data.code === 11301 || data.code === 21612 || data.code === 21614) console.log('→ Regulatory / opted-out: check Twilio Messaging settings');
  }
})();
