/* Quick SMTP login test — run:  node test-email.js
 * Prints the raw Gmail response so you can diagnose auth errors.
 * Safe: only reports success/failure, does NOT display the password.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const cfgPath = path.join(__dirname, 'email-config.json');

if (!fs.existsSync(cfgPath)) {
  console.error('❌  email-config.json not found in', __dirname);
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
} catch (e) {
  console.error('❌  email-config.json is not valid JSON:', e.message);
  process.exit(1);
}

console.log('Config detected:');
console.log('  service :', cfg.service || 'Gmail');
console.log('  user    :', cfg.user);
console.log('  pass    :', cfg.pass ? '(length ' + cfg.pass.length + ' chars, hidden)' : 'MISSING');
console.log('  from    :', cfg.from);

if (!cfg.user || !cfg.pass) {
  console.error('\n❌  user or pass is missing. Fill email-config.json first.');
  process.exit(1);
}

if (cfg.pass.startsWith('REPLACE_WITH') || cfg.user.startsWith('REPLACE_WITH')) {
  console.error('\n❌  You still have the placeholder values. Replace them with your real Gmail + App Password.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  service: cfg.service || 'Gmail',
  auth: { user: cfg.user, pass: cfg.pass },
});

console.log('\nVerifying SMTP login…');

transport.verify((err, info) => {
  if (err) {
    console.error('❌  SMTP login failed:');
    console.error(err.message);
    console.error('\nCommon causes:');
    console.error('  - Used regular Gmail password instead of an App Password');
    console.error('  - 2-Step Verification not enabled');
    console.error('  - Typo in email address');
    console.error('  - Extra spaces in the app password');
    process.exit(2);
  }
  console.log('✅  SMTP login OK:', info);
  console.log('\nYou can now use the register + OTP flow — emails will actually send.');
  process.exit(0);
});
