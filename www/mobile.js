(() => {
  const RESIDENTS_KEY = 'rn_residents';
  const screens = Array.from(document.querySelectorAll('.screen'));

  function show(screenName) {
    screens.forEach(s => s.style.display = (s.dataset.screen === screenName) ? 'flex' : 'none');
  }

  // initial view
  show('splash');

  // show confirmation toast if a registration just completed elsewhere
  (function showLastRegisteredToast(){
    try{
      const raw = localStorage.getItem('rn_last_registered');
      if (!raw) return;
      const obj = JSON.parse(raw);
      const t = document.createElement('div');
      t.className = 'rn-toast';
      t.textContent = `Registration complete: ${obj.firstName || ''} ${obj.lastName || ''}`;
      document.body.appendChild(t);
      // fade out
      setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=>{ t.remove(); }, 400); }, 3600);
      // remove marker
      localStorage.removeItem('rn_last_registered');
    }catch(e){}
  })();

  // actions
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'get-started') {
      show('hero');
      // hide the hero image after clicking Get started
      const hv = document.querySelector('.hero-visual');
      if (hv) hv.style.display = 'none';
    }
    if (act === 'to-signup') show('signup');
    if (act === 'to-login') show('login');
  });

  function readResidents() { try { return JSON.parse(localStorage.getItem(RESIDENTS_KEY) || '[]') } catch { return [] } }
  function saveResidents(list) { localStorage.setItem(RESIDENTS_KEY, JSON.stringify(list)); try { window.dispatchEvent(new Event('storage')); } catch(e){} }
  function notifyResidentsUpdate(){ try { const bc=new BroadcastChannel('rescuenet'); bc.postMessage('rn_residents_updated'); bc.close(); } catch(e){} }
  function uid() { return 'RN' + Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
  function saveCurrentResident(resident) {
    try {
      const payload = {
        id: resident.id || uid(),
        firstName: resident.firstName || '',
        lastName: resident.lastName || '',
        email: resident.email || '',
        phone: resident.phone || '',
      };
      sessionStorage.setItem('rn_current_user', JSON.stringify(payload));
      if (payload.email) sessionStorage.setItem('rescueNetUserEmail', payload.email);
    } catch (e) {}
  }
  function createEmergencyAlert(residentName, residentPhone, message) {
    try {
      const alertsKey = 'rn_alerts';
      const current = JSON.parse(localStorage.getItem(alertsKey) || '[]');
      const alert = {
        id: 'ALRT-' + Date.now().toString(36),
        type: 'SOS',
        residentName: residentName || 'Resident',
        residentPhone: residentPhone || '',
        message: message || 'Emergency assistance requested.',
        createdAt: new Date().toISOString(),
        status: 'open',
      };
      current.unshift(alert);
      localStorage.setItem(alertsKey, JSON.stringify(current.slice(0, 30)));
      try {
        const bc = new BroadcastChannel('rescuenet');
        bc.postMessage({ type: 'rn_alerts_updated', alert });
        bc.close();
      } catch (e) {}
    } catch (e) {}
  }

  // Auto-register flow: if the user arrived from the web register flow
  // (register.html → otp.html → documents.html → facial.html) some
  // values are kept in sessionStorage. Create a resident entry from
  // those values so the dashboard shows the new resident immediately.
  (function tryAutoRegisterFromSession(){
    try {
      const fn = sessionStorage.getItem('rescueFirstName');
      const phone = sessionStorage.getItem('rescuePhone');
      if (!fn || !phone) return;

      const ln = sessionStorage.getItem('rescueLastName') || '';
      const email = sessionStorage.getItem('rescueEmail') || null;
      const mobileVerified = sessionStorage.getItem('mobileVerified') === 'true';
      const facialVerified = sessionStorage.getItem('facialVerified') === 'true';
      const docName = sessionStorage.getItem('rescueDocumentName');

      const list = readResidents();
      // avoid duplicates by phone or email
      const exists = list.some(r => (r.phone && phone && r.phone === phone) || (r.email && email && r.email === email));
      if (!exists) {
        const resident = {
          id: uid(),
          firstName: fn,
          lastName: ln,
          email: email,
          phone: phone,
          phoneVerified: mobileVerified,
          emailVerified: false,
          hasValidId: !!docName,
          hasFaceOrSecondaryId: facialVerified,
          vulnerabilities: [],
          registeredAt: new Date().toISOString()
        };
        list.unshift(resident);
        saveResidents(list);
        saveCurrentResident(resident);
        try { notifyResidentsUpdate(); } catch(e){}
      } else {
        const resident = list.find(r => (r.phone && phone && r.phone === phone) || (r.email && email && r.email === email));
        if (resident) saveCurrentResident(resident);
      }

      // clear ephemeral session values
      sessionStorage.removeItem('rescueFirstName');
      sessionStorage.removeItem('rescueLastName');
      sessionStorage.removeItem('rescueEmail');
      sessionStorage.removeItem('rescuePhone');
      sessionStorage.removeItem('mobileVerified');
      sessionStorage.removeItem('facialVerified');
      sessionStorage.removeItem('rescueDocumentName');

      // redirect to dashboards.html (residents view) so the user sees the new record
      setTimeout(() => { window.location.href = 'dashboards.html#residents'; }, 600);
    } catch (e) {
      // ignore errors — non-blocking enhancement
    }
  })();

  // Signup handler
  const signupForm = document.getElementById('signupForm');
  const signupMsg = document.getElementById('signupMsg');
  signupForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(signupForm);
    const resident = {
      id: uid(),
      firstName: (fd.get('firstName')||'').toString().trim(),
      lastName: (fd.get('lastName')||'').toString().trim(),
      email: (fd.get('email')||'').toString().trim() || null,
      phone: (fd.get('phone')||'').toString().trim() || null,
      phoneVerified: false,
      emailVerified: false,
      hasValidId: false,
      hasFaceOrSecondaryId: false,
      vulnerabilities: [],
      registeredAt: new Date().toISOString()
    };
    const list = readResidents(); list.unshift(resident); saveResidents(list); saveCurrentResident(resident); try { notifyResidentsUpdate(); } catch(e){}
    signupMsg.textContent = 'Account created — redirecting to Dashboard...';
    signupForm.reset();
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
  });

  // Login handler (dummy)
  const loginForm = document.getElementById('loginForm');
  const loginMsg = document.getElementById('loginMsg');
  loginForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(loginForm);
    const email = (fd.get('email') || '').toString().trim();
    const resident = readResidents().find(r => (r.email || '').toLowerCase() === email.toLowerCase() || (r.phone || '').toString() === email);
    if (resident) saveCurrentResident(resident);
    loginMsg.textContent = 'Logged in — opening Dashboard...';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
  });

})();
