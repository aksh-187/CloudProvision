/**
 * CloudProvision — Auth helpers (frontend)
 * getCurrentUser, requireAuth, logout, UI helpers.
 */
'use strict';

async function getCurrentUser() {
  try {
    const data = await api.get('/auth/me');
    return data?.user || null;
  } catch { return null; }
}

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  return user;
}

async function logout() {
  try { await api.post('/auth/logout'); } catch {}
  window.location.href = '/login.html';
}

function populateSidebarUser(user) {
  if (!user) return;
  const initials = (user.name || user.email || '?')
    .split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name || user.email; });
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = user.email; });
  document.querySelectorAll('[data-user-avatar]').forEach(el => { el.textContent = initials; });
}

function showAlert(elementId, message, type = 'error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} visible`;
}

function hideAlert(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.remove('visible');
}

function setButtonLoading(btn, loadingText = 'Loading…') {
  btn.disabled = true;
  btn._originalHTML = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
}

function setButtonReady(btn) {
  btn.disabled = false;
  if (btn._originalHTML !== undefined) {
    btn.innerHTML = btn._originalHTML;
    delete btn._originalHTML;
  }
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString();
}

function statusBadgeClass(status) {
  const map = {
    PENDING:      'badge-pending',
    PROVISIONING: 'badge-provisioning',
    READY:        'badge-ready',
    FAILED:       'badge-failed',
    DESTROYING:   'badge-destroying',
    DESTROYED:    'badge-destroyed',
  };
  return map[status] || 'badge-pending';
}

function renderBadge(status) {
  return `<span class="badge ${statusBadgeClass(status)}">${status}</span>`;
}

function resourceTypeIcon(type) {
  return { ec2: '🖥️', s3: '🪣', rds: '🗄️' }[type] || '📦';
}

function resourceTypeLabel(type) {
  return { ec2: 'EC2', s3: 'S3', rds: 'RDS' }[type] || type?.toUpperCase();
}

function actionLabel(action) {
  const map = {
    signup:               'Account created',
    login:                'Signed in',
    logout:               'Signed out',
    provision_requested:  'Provision requested',
    provision_started:    'Provisioning started',
    provision_succeeded:  'Provisioning succeeded',
    provision_failed:     'Provisioning failed',
    destroy_requested:    'Destroy requested',
    destroy_succeeded:    'Destroy succeeded',
    destroy_failed:       'Destroy failed',
  };
  return map[action] || action;
}

function actionDotClass(action) {
  if (action.includes('succeeded') || action === 'signup' || action === 'login') return 'activity-dot-success';
  if (action.includes('failed'))   return 'activity-dot-failed';
  if (action.includes('destroy'))  return 'activity-dot-warning';
  return 'activity-dot-info';
}

function wireLogoutButton() {
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', e => { e.preventDefault(); logout(); });
}
