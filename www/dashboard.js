// ================================================
// RescueNet Dashboard – dashboard.js
// OpenStreetMap map + Chart.js donut & bar charts
// ================================================

document.addEventListener('DOMContentLoaded', () => {

  const ALERTS_KEY = 'rn_alerts';
  const REPORTS_KEY = 'rn_reports';
  const RESPONDER_LOCATION_KEY = 'rn_responder_location';
  const RESPONDER_ASSIGNMENTS_KEY = 'rn_responder_assignments';
  const RESPONDER_TEAM_KEY = 'rn_responder_team';
  const SYNC_API_URL = (window.RN_SERVER || 'http://192.168.43.119:3000') + '/api/sync';

  function readAssignments() {
    try {
      const raw = localStorage.getItem(RESPONDER_ASSIGNMENTS_KEY);
      const list = raw ? JSON.parse(raw) : {};
      return list && typeof list === 'object' ? list : {};
    } catch (e) {
      return {};
    }
  }

  function saveAssignments(assignments) {
    localStorage.setItem(RESPONDER_ASSIGNMENTS_KEY, JSON.stringify(assignments));
    try {
      const channel = new BroadcastChannel('rescuenet');
      channel.postMessage({ type: 'rn_responder_assignment_updated', assignments });
      channel.close();
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('rescuenet:rn_responder_assignment_updated', { detail: { assignments } }));
    } catch (e) {}
  }

  function assignResponderToIncident(incidentId, responderName) {
    const assignments = readAssignments();
    if (!incidentId) return;
    if (responderName && responderName.trim()) {
      assignments[incidentId] = responderName.trim();
    } else {
      delete assignments[incidentId];
    }
    saveAssignments(assignments);

    const reports = loadReports();
    const reportIndex = reports.findIndex((report) => String(report.id) === String(incidentId));
    if (reportIndex >= 0) {
      reports[reportIndex].assignedResponder = responderName && responderName.trim() ? responderName.trim() : '';
      reports[reportIndex].assignedDispatcher = responderName && responderName.trim() ? responderName.trim() : reports[reportIndex].assignedDispatcher || 'Maria Santos';
      localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
      notifyRescuenetUpdate('rn_reports_updated', { reports });
    }

    const assignedTeam = document.getElementById('incidentAssignedTeamValue');
    if (assignedTeam) assignedTeam.textContent = responderName && responderName.trim() ? responderName.trim() : 'Unassigned';
  }

  function publishResponderLocation(latitude, longitude) {
    const location = { latitude, longitude, updatedAt: new Date().toISOString() };
    localStorage.setItem(RESPONDER_LOCATION_KEY, JSON.stringify(location));
    try {
      const channel = new BroadcastChannel('rescuenet');
      channel.postMessage({ type: 'rn_responder_location_updated', location });
      channel.close();
    } catch (e) {}
  }

  function notifyRescuenetUpdate(type, payload) {
    try {
      const channel = new BroadcastChannel('rescuenet');
      channel.postMessage({ type, ...payload });
      channel.close();
    } catch (e) {}

    try {
      window.dispatchEvent(new CustomEvent('rescuenet:' + type, { detail: payload || {} }));
    } catch (e) {}
  }

  async function fetchSyncState() {
    try {
      const response = await fetch(SYNC_API_URL);
      if (!response.ok) return null;
      const data = await response.json();
      if (data && Array.isArray(data.alerts)) localStorage.setItem(ALERTS_KEY, JSON.stringify(data.alerts));
      if (data && Array.isArray(data.reports)) localStorage.setItem(REPORTS_KEY, JSON.stringify(data.reports));
      return data;
    } catch (e) {
      return null;
    }
  }

  function readAlerts() {
    try {
      const raw = localStorage.getItem(ALERTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function readReports() {
    try {
      const raw = localStorage.getItem(REPORTS_KEY);
      const reports = raw ? JSON.parse(raw) : [];
      return Array.isArray(reports) ? reports : [];
    } catch (e) {
      return [];
    }
  }

  function renderLatestReport() {
    const report = readReports()[0];
    const name = document.getElementById('incidentPersonName');
    const location = document.getElementById('incidentPersonLocation');
    const type = document.getElementById('incidentType');
    const time = document.getElementById('incidentTime');
    const coordinate = document.getElementById('incidentCoordinate');
    const description = document.getElementById('incidentDescription');
    const severity = document.getElementById('incidentSeverity');
    const dispatcher = document.getElementById('incidentDispatcher');
    const avatar = document.getElementById('incidentAvatar');
    if (!report) return;

    const fullName = report.residentName || 'Resident';
    const reportTime = report.createdAt ? new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';
    const assignments = readAssignments();
    const assignedResponder = assignments[report.id] || report.assignedResponder || report.assignedDispatcher || 'Maria Santos';
    name.textContent = fullName;
    location.textContent = report.residentPhone ? report.residentPhone : 'Resident-submitted report';
    type.textContent = report.type || 'Report';
    time.textContent = reportTime;
    coordinate.textContent = report.latitude != null && report.longitude != null
      ? Number(report.latitude).toFixed(5) + ', ' + Number(report.longitude).toFixed(5)
      : 'Location pending';
    description.textContent = report.details || 'No description provided.';
    severity.textContent = report.status === 'open' ? 'Open report' : report.status || 'Open report';
    if (dispatcher) dispatcher.textContent = assignedResponder;
    avatar.textContent = fullName.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  }

  function renderAlertFeed() {
    const wrapper = document.querySelector('.overlay-sos');
    if (!wrapper) return;

    const list = readAlerts();
    const countEl = document.querySelector('.alerts-count');
    if (countEl) countEl.textContent = String(list.length || 0);

    const header = `
      <div class="sos-header">
        <span class="sos-title">SOS ALERTS FEED</span>
        <span class="sos-dot"></span>
      </div>
    `;

    const items = list.length ? list.slice(0, 4).map(alert => {
      const date = alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';
      const label = alert.type || 'Alert';
      return `
        <div class="sos-item">
          <div class="sos-item-header">
            <span class="sos-badge">⚠ ${label}</span>
            <span class="sos-time">${date}</span>
          </div>
          <p class="sos-body">${alert.residentName || 'Resident'} ${alert.residentPhone ? '(' + alert.residentPhone + ')' : ''}: ${alert.message || 'Emergency assistance requested.'}</p>
        </div>
      `;
    }).join('') : `
      <div class="sos-item">
        <div class="sos-item-header">
          <span class="sos-badge">⚠ No Alerts</span>
          <span class="sos-time">Now</span>
        </div>
        <p class="sos-body">Waiting for resident emergency requests.</p>
      </div>
    `;

    wrapper.innerHTML = header + items;
  }

  function getAlertLatLng(alert) {
    if (!alert || alert.latitude == null || alert.longitude == null) return [10.6498, 122.9440];
    const latitude = Number(alert.latitude);
    const longitude = Number(alert.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : [10.6498, 122.9440];
  }

  function renderNotifications() {
    const notificationList = document.getElementById('notificationList');
    if (!notificationList) return;

    const merged = [...readReports(), ...readAlerts()]
      .filter(item => item && (item.createdAt || item.id || item.message || item.details))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const hasStevenSample = merged.some(item => {
      const name = String(item.residentName || '').toLowerCase();
      return name.includes('steven') || name.includes('derla');
    });

    const items = hasStevenSample ? merged : [
      {
        residentName: 'Steven Derla',
        type: 'Emergency report',
        message: 'Steven Derla requested urgent assistance and emergency support.',
        status: 'critical',
        createdAt: new Date().toISOString(),
      },
      ...merged
    ].slice(0, 5);

    if (!items.length) {
      notificationList.innerHTML = `
        <div class="notification-item unread">
          <div class="notification-pill pill-info">Info</div>
          <div class="notification-copy">
            <strong>No notifications yet</strong>
            <p>New resident alerts and incident reports will appear here.</p>
          </div>
          <span class="notification-time">Now</span>
        </div>
      `;
      return;
    }

    notificationList.innerHTML = items.map((item, index) => {
      const status = String(item.status || '').toLowerCase();
      const pill = status === 'resolved' || status === 'closed' || status === 'completed'
        ? 'pill-success'
        : status === 'critical' || String(item.priority || item.severity || '').toLowerCase() === 'critical'
          ? 'pill-alert'
          : (index === 0 ? 'pill-alert' : 'pill-update');

      const label = status === 'resolved' || status === 'closed' || status === 'completed'
        ? 'Resolved'
        : status === 'critical' || String(item.priority || item.severity || '').toLowerCase() === 'critical'
          ? 'Critical'
          : (index === 0 ? 'Alert' : 'Update');

      const residentName = item.residentName || 'Resident';
      const summary = item.message || item.details || `${residentName} submitted a report.`;
      const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';

      return `
        <div class="notification-item ${index === 0 ? 'unread' : ''}">
          <div class="notification-pill ${pill}">${label}</div>
          <div class="notification-copy">
            <strong>${residentName} reported ${String(item.type || 'incident').toLowerCase()}</strong>
            <p>${summary}</p>
          </div>
          <span class="notification-time">${time}</span>
        </div>
      `;
    }).join('');
  }

  function refreshAdminPanels() {
    renderAlertFeed();
    renderLatestReport();
    syncLatestAlertMap();
    renderAnalytics();
    renderHistory();
    renderNotifications();
  }

  function renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const merged = [...readReports(), ...readAlerts()]
      .filter(item => item && (item.createdAt || item.id || item.message || item.details))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const hasStevenSample = merged.some(item => {
      const name = String(item.residentName || '').toLowerCase();
      return name.includes('steven') || name.includes('derla');
    });

    const baseList = hasStevenSample ? merged : [
      {
        residentName: 'Steven Derla',
        type: 'Emergency report',
        message: 'Resident reported a medical emergency and requested immediate assistance nearby.',
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      ...merged
    ].slice(0, 8);

    if (!baseList.length) {
      historyList.innerHTML = `
        <div class="history-item">
          <span class="history-badge status-review">No data</span>
          <div class="history-content">
            <strong>No incident history yet</strong>
            <p>Resident reports and SOS alerts will appear here automatically.</p>
          </div>
          <span class="history-time">Now</span>
        </div>
      `;
      return;
    }

    historyList.innerHTML = baseList.map(item => {
      const status = String(item.status || '').toLowerCase();
      const type = item.type || 'Incident';
      const title = item.residentName
        ? `${item.residentName} reported ${type.toLowerCase()}`
        : (item.message ? 'Resident incident update' : 'Incident update');
      const summary = item.message || item.details || `${type} was submitted from the field.`;
      const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';

      let badgeClass = 'status-review';
      let badgeText = 'Review';
      if (status === 'open' || status === 'active' || status === 'pending' || status === 'new') {
        badgeClass = 'status-active';
        badgeText = 'Active';
      } else if (status === 'resolved' || status === 'closed' || status === 'completed') {
        badgeClass = 'status-resolved';
        badgeText = 'Resolved';
      } else if (status === 'critical' || status === 'high' || String(item.priority || item.severity || '').toLowerCase() === 'critical') {
        badgeClass = 'status-active';
        badgeText = 'Critical';
      }

      return `
        <div class="history-item">
          <span class="history-badge ${badgeClass}">${badgeText}</span>
          <div class="history-content">
            <strong>${title}</strong>
            <p>${summary}</p>
          </div>
          <span class="history-time">${time}</span>
        </div>
      `;
    }).join('');
  }

  fetchSyncState();
  renderAlertFeed();
  renderHistory();
  renderNotifications();
  try {
    const channel = new BroadcastChannel('rescuenet');
    channel.onmessage = (ev) => {
      if (ev && ev.data && (ev.data.type === 'rn_alerts_updated' || ev.data.type === 'rn_reports_updated')) {
        fetchSyncState();
        refreshAdminPanels();
      }
    };
  } catch (e) {}

  window.addEventListener('rescuenet:rn_alerts_updated', refreshAdminPanels);
  window.addEventListener('rescuenet:rn_reports_updated', refreshAdminPanels);

  window.addEventListener('storage', (event) => {
    if (event.key === ALERTS_KEY || event.key === REPORTS_KEY) {
      refreshAdminPanels();
    }
  });

  // ============ OPENSTREETMAP MAP ==========
  const map = document.getElementById('map');
  const responderLocation = { latitude: 10.6540, longitude: 122.9482 };

  function updateOpenStreetMap(latitude, longitude) {
    const span = 0.008;
    const bbox = [longitude - span, latitude - span, longitude + span, latitude + span].join('%2C');
    map.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + latitude + '%2C' + longitude;
  }

  function syncLatestAlertMap() {
    const alerts = readAlerts();
    const reports = readReports();
    const latest = [...alerts, ...reports].filter(Boolean).sort((a, b) => {
      const left = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const right = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return right - left;
    })[0];
    const location = latest ? getAlertLatLng(latest) : [responderLocation.latitude, responderLocation.longitude];
    updateOpenStreetMap(location[0], location[1]);
  }

  publishResponderLocation(responderLocation.latitude, responderLocation.longitude);
  updateOpenStreetMap(responderLocation.latitude, responderLocation.longitude);
  syncLatestAlertMap();
  renderLatestReport();
  setInterval(() => {
    fetchSyncState();
    syncLatestAlertMap();
  }, 2000);

  // Recenter button
  document.getElementById('recenterBtn')?.addEventListener('click', () => {
    updateOpenStreetMap(responderLocation.latitude, responderLocation.longitude);
  });

  // Optimize button feedback
  document.getElementById('optimizeBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('optimizeBtn');
    btn.textContent = 'Optimizing…';
    btn.style.opacity = '0.7';
    setTimeout(() => {
      btn.textContent = 'Optimize';
      btn.style.opacity = '1';
    }, 1500);
  });

  // Refresh spin
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn?.addEventListener('click', () => {
    refreshBtn.querySelector('svg').style.transition = 'transform 0.6s';
    refreshBtn.querySelector('svg').style.transform = 'rotate(360deg)';
    setTimeout(() => {
      refreshBtn.querySelector('svg').style.transform = 'rotate(0deg)';
      refreshBtn.querySelector('svg').style.transition = 'none';
    }, 700);
  });

  // ============ MAP TABS ============
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ============ SHELTER TABS ============
  document.querySelectorAll('.shelter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.shelter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ============ NAV ITEMS + VIEW SWITCH ============
  const defaultViewSections = ['.map-section', '.right-panel', '.incident-section'];
  const residentsSection = document.getElementById('residentsSection');
  const incidentsSection = document.getElementById('incidentsSection');
  const analyticsSection = document.getElementById('analyticsSection');
  const historySection = document.getElementById('historySection');
  const notificationsSection = document.getElementById('notificationsSection');
  function showView(viewName) {
    const sectionEls = [
      document.querySelector('.map-section'),
      document.querySelector('.right-panel'),
      document.querySelector('.incident-section'),
      residentsSection,
      incidentsSection,
      analyticsSection,
      historySection,
      notificationsSection,
    ].filter(Boolean);

    sectionEls.forEach(el => {
      el.style.display = 'none';
    });

    if (viewName === 'residents') {
      if (residentsSection) residentsSection.style.display = 'block';
      renderResidents();
    } else if (viewName === 'incidents') {
      if (incidentsSection) incidentsSection.style.display = 'block';
      renderIncidents();
    } else if (viewName === 'analytics') {
      if (analyticsSection) analyticsSection.style.display = 'block';
    } else if (viewName === 'history') {
      if (historySection) historySection.style.display = 'block';
    } else if (viewName === 'notifications') {
      if (notificationsSection) notificationsSection.style.display = 'block';
    } else {
      document.querySelector('.map-section') && (document.querySelector('.map-section').style.display = 'flex');
      document.querySelector('.incident-section') && (document.querySelector('.incident-section').style.display = 'block');
      if (document.querySelector('.right-panel')) document.querySelector('.right-panel').style.display = 'none';
    }
  }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const id = item.id;
      if (id === 'navResidents') showView('residents');
      else if (id === 'navIncidents') showView('incidents');
      else if (id === 'navAnalytics') showView('analytics');
      else if (id === 'navHistory') showView('history');
      else if (id === 'navNotifications') showView('notifications');
      else showView('default');
    });
  });

  // ============ RESIDENTS REGISTRY INTEGRATION ============
  const RESIDENTS_KEY = 'rn_residents';
  // Also accept sessionStorage registration flow directly on the dashboard page.
  (function tryAutoRegisterFromSessionOnDashboard(){
    try {
      const fn = sessionStorage.getItem('rescueFirstName');
      const phone = sessionStorage.getItem('rescuePhone');
      if (!fn || !phone) return;

      const ln = sessionStorage.getItem('rescueLastName') || '';
      const email = sessionStorage.getItem('rescueEmail') || null;
      const mobileVerified = sessionStorage.getItem('mobileVerified') === 'true';
      const facialVerified = sessionStorage.getItem('facialVerified') === 'true';
      const docName = sessionStorage.getItem('rescueDocumentName');

      // load existing residents
      let existing = [];
      try { existing = JSON.parse(localStorage.getItem(RESIDENTS_KEY) || '[]'); } catch(e) { existing = []; }

      const duplicate = existing.some(r => (r.phone && phone && r.phone === phone) || (r.email && email && r.email === email));
      if (!duplicate) {
        const newRes = {
          id: 'RN' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
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
        existing.unshift(newRes);
        try { localStorage.setItem(RESIDENTS_KEY, JSON.stringify(existing)); } catch(e){}
      }

      // clear ephemeral session keys so we don't duplicate next visit
      sessionStorage.removeItem('rescueFirstName');
      sessionStorage.removeItem('rescueLastName');
      sessionStorage.removeItem('rescueEmail');
      sessionStorage.removeItem('rescuePhone');
      sessionStorage.removeItem('mobileVerified');
      sessionStorage.removeItem('facialVerified');
      sessionStorage.removeItem('rescueDocumentName');

    } catch (e) {
      // ignore
    }
  })();
  let cachedResidentHash = '';
  let activeFilter = 'all';
  let activeSearch = '';

  const VULN_LABELS = {
    pwd: { label: 'PWD', cls: 'vuln-pwd' },
    minor: { label: 'Minor', cls: 'vuln-minor' },
    senior: { label: 'Senior', cls: 'vuln-senior' },
    health: { label: 'Health', cls: 'vuln-health' },
  };

  function loadResidents() {
    try {
      const raw = localStorage.getItem(RESIDENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function formatDateTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  function initialsOf(first, middle, last) {
    const f = (first || '').trim().charAt(0).toUpperCase();
    const l = (last || '').trim().charAt(0).toUpperCase();
    return (f || '') + (l || '');
  }

  function filterResidents(list) {
    return list.filter(r => {
      if (activeFilter !== 'all') {
        if (activeFilter === 'verified') {
          if (!(r.phoneVerified && r.emailVerified)) return false;
        } else {
          if (!r.vulnerabilities || !r.vulnerabilities.includes(activeFilter)) return false;
        }
      }
      if (activeSearch) {
        const q = activeSearch.toLowerCase();
        const hay = [
          r.firstName, r.middleName, r.lastName,
          r.email, r.phone, r.id
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function loadReports() {
    try {
      const raw = localStorage.getItem('rn_reports');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function loadIncidentPhoto(report, target) {
    if (!report || !report.hasPhoto || !target || !window.indexedDB) {
      if (target) {
        target.innerHTML = '<div class="incident-photo-empty">No attached photo</div>';
      }
      return;
    }

    const request = indexedDB.open('rescuenet_reports', 1);
    request.onsuccess = () => {
      try {
        const db = request.result;
        const tx = db.transaction('media', 'readonly');
        const store = tx.objectStore('media');
        const getReq = store.get(report.id);
        getReq.onsuccess = () => {
          const media = getReq.result;
          if (!media || !media.photo) {
            target.innerHTML = '<div class="incident-photo-empty">No attached photo</div>';
            return;
          }

          const img = document.createElement('img');
          img.src = URL.createObjectURL(media.photo);
          img.alt = 'Resident incident photo';
          img.style.width = '100%';
          img.style.maxHeight = '220px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '10px';
          img.style.border = '1px solid rgba(148, 163, 184, 0.4)';
          target.innerHTML = '';
          target.appendChild(img);
        };
      } catch (e) {
        target.innerHTML = '<div class="incident-photo-empty">Photo unavailable</div>';
      }
    };
    request.onerror = () => {
      target.innerHTML = '<div class="incident-photo-empty">Photo unavailable</div>';
    };
  }

  function openIncidentModal(report) {
    const modal = document.getElementById('incidentDetailModal');
    if (!modal) return;

    const residentName = report.residentName || 'Resident';
    const residentPhone = report.residentPhone || 'No phone';
    const type = report.type || 'Report';
    const details = report.details || 'No details provided.';
    const coord = report.latitude != null && report.longitude != null ? Number(report.latitude).toFixed(5) + ', ' + Number(report.longitude).toFixed(5) : 'Location pending';
    const createdAt = report.createdAt ? new Date(report.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';

    const nameEl = modal.querySelector('[data-role="modal-name"]');
    const phoneEl = modal.querySelector('[data-role="modal-phone"]');
    const typeEl = modal.querySelector('[data-role="modal-type"]');
    const coordEl = modal.querySelector('[data-role="modal-coord"]');
    const timeEl = modal.querySelector('[data-role="modal-time"]');
    const detailsEl = modal.querySelector('[data-role="modal-details"]');
    const photoWrap = modal.querySelector('[data-role="modal-photo"]');
    const responderSelect = document.getElementById('incidentResponderSelect');

    if (nameEl) nameEl.textContent = residentName;
    if (phoneEl) phoneEl.textContent = residentPhone;
    if (typeEl) typeEl.textContent = type;
    if (coordEl) coordEl.textContent = coord;
    if (timeEl) timeEl.textContent = createdAt;
    if (detailsEl) detailsEl.textContent = details;

    const currentAssignment = readAssignments()[report.id] || report.assignedResponder || '';
    const assignedTeamValue = document.getElementById('incidentAssignedTeamValue');
    if (assignedTeamValue) assignedTeamValue.textContent = currentAssignment || 'Unassigned';

    if (responderSelect) {
      responderSelect.value = currentAssignment || '';
      responderSelect.onchange = function () {
        assignResponderToIncident(report.id, this.value);
        const currentDispatcher = document.getElementById('incidentDispatcher');
        if (currentDispatcher) currentDispatcher.textContent = this.value || 'Maria Santos';
      };
    }

    if (photoWrap) {
      photoWrap.innerHTML = '<div class="incident-modal-empty">No attached photo</div>';
      if (report.hasPhoto) {
        const request = indexedDB.open('rescuenet_reports', 1);
        request.onsuccess = () => {
          const tx = request.result.transaction('media', 'readonly');
          const store = tx.objectStore('media');
          const getReq = store.get(report.id);
          getReq.onsuccess = () => {
            const media = getReq.result;
            if (!media || !media.photo) {
              photoWrap.innerHTML = '<div class="incident-modal-empty">No attached photo</div>';
              return;
            }
            const img = document.createElement('img');
            img.src = URL.createObjectURL(media.photo);
            img.alt = 'Resident incident photo';
            img.className = 'incident-modal-photo';
            photoWrap.innerHTML = '';
            photoWrap.appendChild(img);
          };
        };
      }
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeIncidentModal() {
    const modal = document.getElementById('incidentDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }

  const incidentModal = document.getElementById('incidentDetailModal');
  if (incidentModal) {
    incidentModal.addEventListener('click', (event) => {
      if (event.target === incidentModal) closeIncidentModal();
    });
    const closeButton = incidentModal.querySelector('[data-close-incident-modal]');
    if (closeButton) closeButton.addEventListener('click', closeIncidentModal);
  }

  function renderIncidents() {
    const list = loadReports();
    const incidentsList = document.getElementById('incidentsList');
    const incidentsEmpty = document.getElementById('incidentsEmpty');
    if (!incidentsList) return;

    if (!list.length) {
      incidentsList.innerHTML = '';
      const sampleCard = document.createElement('div');
      sampleCard.className = 'incident-report-card';
      sampleCard.innerHTML = `
        <div class="incident-report-header">
          <div class="incident-report-user">
            <div class="incident-report-avatar">SD</div>
            <div class="incident-report-info">
              <div class="incident-report-name">Steven Derla</div>
            </div>
          </div>
        </div>
        <div class="incident-report-meta">
          <div class="incident-report-row"><span>Time</span><strong>Today, 8:42 AM</strong></div>
          <div class="incident-report-row"><span>Location</span><strong>14.6300, 121.0550</strong></div>
        </div>
        <div class="incident-report-actions">
          <button type="button" class="incident-view-btn">View</button>
          <button type="button" class="incident-latest-btn">Last Update</button>
        </div>
      `;
      incidentsList.appendChild(sampleCard);
      if (incidentsEmpty) {
        incidentsEmpty.style.display = 'none';
      }
      return;
    }

    incidentsList.innerHTML = '';
    list.forEach(report => {
      const card = document.createElement('div');
      card.className = 'incident-report-card';

      const residentName = report.residentName || 'Resident';
      const coord = report.latitude != null && report.longitude != null ? Number(report.latitude).toFixed(5) + ', ' + Number(report.longitude).toFixed(5) : 'Location pending';
      const createdAt = report.createdAt ? new Date(report.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
      const initials = (residentName.split(/\s+/).map(part => part[0]).join('').slice(0, 2) || 'R').toUpperCase();

      const header = document.createElement('div');
      header.className = 'incident-report-header';
      header.innerHTML = `
        <div class="incident-report-user">
          <div class="incident-report-avatar">${initials}</div>
          <div class="incident-report-info">
            <div class="incident-report-name">${residentName}</div>
          </div>
        </div>
      `;

      const meta = document.createElement('div');
      meta.className = 'incident-report-meta';
      meta.innerHTML = `
        <div class="incident-report-row"><span>Time</span><strong>${createdAt}</strong></div>
        <div class="incident-report-row"><span>Location</span><strong>${coord}</strong></div>
      `;

      const actions = document.createElement('div');
      actions.className = 'incident-report-actions';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'incident-view-btn';
      button.textContent = 'View';
      button.addEventListener('click', () => openIncidentModal(report));

      const lastUpdateBtn = document.createElement('button');
      lastUpdateBtn.type = 'button';
      lastUpdateBtn.className = 'incident-latest-btn';
      lastUpdateBtn.textContent = 'Last Update';

      actions.appendChild(button);
      actions.appendChild(lastUpdateBtn);

      card.appendChild(header);
      card.appendChild(meta);
      card.appendChild(actions);
      incidentsList.appendChild(card);
    });
  }

  function getAnalyticsSnapshot() {
    const residents = loadResidents();
    const reports = loadReports();
    const alerts = readAlerts();
    const allIncidents = [...reports, ...alerts].filter(item => item && (item.id || item.createdAt || item.message || item.details));

    const openCount = allIncidents.filter(item => {
      const status = String(item.status || '').toLowerCase();
      return status === 'open' || status === 'active' || status === 'pending' || status === 'new';
    }).length;

    const criticalCount = allIncidents.filter(item => {
      const priority = String(item.priority || item.severity || '').toLowerCase();
      const type = String(item.type || '').toLowerCase();
      const status = String(item.status || '').toLowerCase();
      return priority === 'critical' || priority === 'high' || status === 'critical' || type.includes('sos') || type.includes('fire') || type.includes('medical');
    }).length;

    const resolvedCount = allIncidents.filter(item => {
      const status = String(item.status || '').toLowerCase();
      return status === 'resolved' || status === 'closed' || status === 'completed';
    }).length;

    const labels = [];
    const series = [];
    const now = new Date();
    for (let dayIndex = 6; dayIndex >= 0; dayIndex--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(now.getDate() - dayIndex);
      labels.push(day.toLocaleDateString('en-US', { weekday: 'short' }));

      const start = day.getTime();
      const end = start + 24 * 60 * 60 * 1000;
      const count = allIncidents.filter(item => {
        if (!item.createdAt) return false;
        const value = new Date(item.createdAt).getTime();
        return value >= start && value < end;
      }).length;
      series.push(count);
    }

    const responseMinutes = allIncidents
      .map(item => item.createdAt ? Math.max(1, Math.round((Date.now() - new Date(item.createdAt).getTime()) / 60000)) : null)
      .filter(value => Number.isFinite(value))
      .slice(0, 20);

    const avgResponseMinutes = responseMinutes.length
      ? Math.min(60, Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length))
      : 5;

    return {
      openCount,
      criticalCount,
      resolvedCount,
      avgResponseMinutes,
      residentsServed: residents.length,
      labels,
      series,
    };
  }

  function renderAnalytics() {
    const snapshot = getAnalyticsSnapshot();

    const avgResponseEl = document.getElementById('analyticsAvgResponse');
    const openIncidentsEl = document.getElementById('analyticsOpenIncidents');
    const criticalAlertsEl = document.getElementById('analyticsCriticalAlerts');
    const residentsServedEl = document.getElementById('analyticsResidentsServed');

    if (avgResponseEl) avgResponseEl.textContent = `${snapshot.avgResponseMinutes} min`;
    if (openIncidentsEl) openIncidentsEl.textContent = String(snapshot.openCount);
    if (criticalAlertsEl) criticalAlertsEl.textContent = String(snapshot.criticalCount);
    if (residentsServedEl) residentsServedEl.textContent = snapshot.residentsServed.toLocaleString();

    if (analyticsBarChart) {
      analyticsBarChart.data.labels = snapshot.labels;
      analyticsBarChart.data.datasets[0].data = snapshot.series;
      analyticsBarChart.update();
    }

    if (analyticsDonutChart) {
      const resolved = Math.max(snapshot.resolvedCount, 0);
      const open = Math.max(snapshot.openCount, 0) || 1;
      analyticsDonutChart.data.datasets[0].data = [resolved || 1, open];
      analyticsDonutChart.update();
    }
  }

  function renderResidents() {
    const list = loadResidents();
    const statTotal = document.getElementById('statTotal');
    const statVerified = document.getElementById('statVerified');
    const statVulnerable = document.getElementById('statVulnerable');
    const residentsList = document.getElementById('residentsList');
    const residentsEmpty = document.getElementById('residentsEmpty');
    if (statTotal) statTotal.textContent = list.length;
    const verifiedCount = list.filter(r => r.phoneVerified && r.emailVerified).length;
    if (statVerified) statVerified.textContent = verifiedCount;
    const vulnCount = list.filter(r => Array.isArray(r.vulnerabilities) && r.vulnerabilities.length > 0).length;
    if (statVulnerable) statVulnerable.textContent = vulnCount;
    renderAnalytics();
    if (!residentsList) return;

    const filtered = filterResidents(list);

    if (filtered.length === 0) {
      residentsList.innerHTML = '';
      const sampleCard = document.createElement('div');
      sampleCard.className = 'resident-card';
      sampleCard.innerHTML = `
        <div class="resident-top">
          <div class="resident-avatar" style="background:#1B2D5B">SD</div>
          <div class="resident-main">
            <div class="resident-name-row">
              <h3 class="resident-name">Steven Derla</h3>
              <span class="resident-id">R-1024</span>
            </div>
            <div class="resident-contact-row">
              <span class="resident-contact">+63 912 345 6789</span>
              <span class="resident-contact">steven.derla@example.com</span>
            </div>
            <div class="resident-badges"><span class="vuln-badge vuln-pwd">PWD</span></div>
          </div>
        </div>
        <div class="resident-meta">
          <div class="resident-meta-col">
            <span class="meta-label">Account</span><span class="status-pill status-green">Fully Verified</span>
          </div>
          <div class="resident-meta-col">
            <span class="meta-label">Identity</span><span class="status-pill status-green">ID Verified</span>
          </div>
        </div>
      `;
      residentsList.appendChild(sampleCard);
      if (residentsEmpty) residentsEmpty.style.display = 'none';
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(r => {
      const card = document.createElement('div');
      card.className = 'resident-card';

      const avatarBgColors = ['#1B2D5B', '#F47920', '#E53935', '#2e7d32', '#546e7a', '#7B1FA2'];
      const seed = ((r.firstName || 'A').charCodeAt(0) + (r.lastName || 'A').charCodeAt(0)) % avatarBgColors.length;
      const avatarColor = avatarBgColors[seed];
      const initials = initialsOf(r.firstName, r.middleName, r.lastName);

      const fullName = [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ');

      let vulnBadges = '';
      if (Array.isArray(r.vulnerabilities)) {
        r.vulnerabilities.forEach(v => {
          const meta = VULN_LABELS[v];
          if (meta) vulnBadges += `<span class="vuln-badge ${meta.cls}">${meta.label}</span>`;
        });
      }
      if (r.healthCondition) {
        const crit = r.isHealthCritical ? 'vuln-health' : 'vuln-minor';
        vulnBadges += `<span class="vuln-badge ${crit}" title="${r.healthCondition.replace(/"/g, '&quot;')}">${r.healthCondition}</span>`;
      }

      const idStatus = (r.hasValidId && r.hasFaceOrSecondaryId)
        ? '<span class="status-pill status-green">ID Verified</span>'
        : r.hasValidId
          ? '<span class="status-pill status-orange">Partial ID</span>'
          : '<span class="status-pill status-gray">No ID</span>';

      const verifiedStatus = (r.phoneVerified && r.emailVerified)
        ? '<span class="status-pill status-green">Fully Verified</span>'
        : (r.phoneVerified || r.emailVerified)
          ? '<span class="status-pill status-orange">Partially Verified</span>'
          : '<span class="status-pill status-gray">Unverified</span>';

      card.innerHTML = `
        <div class="resident-top">
          <div class="resident-avatar" style="background:${avatarColor}">${initials || 'R'}</div>
          <div class="resident-main">
            <div class="resident-name-row">
              <h3 class="resident-name">${fullName || 'Resident'}</h3>
              <span class="resident-id">${r.id}</span>
            </div>
            <div class="resident-contact-row">
              <span class="resident-contact">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                ${r.phone || '—'}
              </span>
              <span class="resident-contact">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                ${r.email || '—'}
              </span>
            </div>
            <div class="resident-badges">${vulnBadges}</div>
          </div>
        </div>
        <div class="resident-meta">
          <div class="resident-meta-col">
            <span class="meta-label">Account</span>${verifiedStatus}
          </div>
          <div class="resident-meta-col">
            <span class="meta-label">Identity</span>${idStatus}
          </div>
          <div class="resident-meta-col meta-right">
            <span class="meta-label">Registered</span>
            <span class="meta-value">${formatDateTime(r.registeredAt)}</span>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });

    residentsList.innerHTML = '';
    residentsList.appendChild(frag);
  }

  function pollResidents() {
    const raw = localStorage.getItem(RESIDENTS_KEY) || '';
    if (raw !== cachedResidentHash) {
      cachedResidentHash = raw;
      renderResidents();
    }
  }

  // Initial render
  renderResidents();
  cachedResidentHash = localStorage.getItem(RESIDENTS_KEY) || '';
  // Live polling every 1 second so new registrations appear faster
  setInterval(pollResidents, 1000);

  // If there are any residents saved, auto-open the Residents view so entries are visible
  try {
    const initialList = loadResidents();
    if (initialList.length > 0) {
      document.getElementById('navResidents')?.click();
      setTimeout(renderResidents, 200);
    } else if (location.hash && location.hash.includes('residents')) {
      // fallback: open via hash
      document.getElementById('navResidents')?.click();
      setTimeout(renderResidents, 200);
    }
  } catch (e) {
    if (location.hash && location.hash.includes('residents')) {
      document.getElementById('navResidents')?.click();
      setTimeout(renderResidents, 200);
    }
  }

  // Listen for BroadcastChannel updates so residents render in realtime
  try {
    const bc = new BroadcastChannel('rescuenet');
    bc.onmessage = (ev) => {
      if (ev && ev.data === 'rn_residents_updated') {
        renderResidents();
      }
      if (ev && ev.data && (ev.data.type === 'rn_reports_updated' || ev.data.type === 'rn_alerts_updated')) {
        renderIncidents();
      }
    };
  } catch (e) {
    // BroadcastChannel not available; rely on polling
  }

  window.addEventListener('rescuenet:rn_reports_updated', renderIncidents);
  window.addEventListener('rescuenet:rn_alerts_updated', renderIncidents);

  // Search input
  const searchInput = document.getElementById('residentSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      activeSearch = e.target.value.trim();
      renderResidents();
    });
  }
  // Filter buttons
  const filterButtons = document.querySelectorAll('#residentFilter .filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      renderResidents();
    });
  });
  // Clicking refresh button also forces a re-render
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    cachedResidentHash = '';
    pollResidents();
  });

  // ============ ANALYTICS CHARTS (Chart.js) ============
  let analyticsBarChart = null;
  let analyticsDonutChart = null;

  const analyticsBarCtx = document.getElementById('analyticsBarChart')?.getContext('2d');
  if (analyticsBarCtx) {
    analyticsBarChart = new Chart(analyticsBarCtx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Incidents',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: ['#dfe6f6', '#dfe6f6', '#dfe6f6', '#dfe6f6', '#1B2D5B', '#1B2D5B', '#dfe6f6'],
          borderRadius: 8,
          barThickness: 20,
        }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10, family: 'Inter' } } },
          y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { color: '#6b7280', font: { size: 10, family: 'Inter' } } },
        },
      },
    });
  }

  const analyticsDonutCtx = document.getElementById('analyticsDonutChart')?.getContext('2d');
  if (analyticsDonutCtx) {
    analyticsDonutChart = new Chart(analyticsDonutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Resolved', 'Open'],
        datasets: [{
          data: [1, 1],
          backgroundColor: ['#1B2D5B', '#F47920'],
          borderWidth: 0,
        }],
      },
      options: {
        cutout: '72%',
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', color: '#374151', font: { size: 10, family: 'Inter' } } }, tooltip: { enabled: true } },
      },
    });
  }

  renderAnalytics();

});
