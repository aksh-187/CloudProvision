/**
 * CloudProvision — Dashboard page
 */
'use strict';

// Active job pollers on this page
const pagePollers = {};

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  let user;
  try { user = await requireAuth(); } catch { return; }
  populateSidebarUser(user);
  wireLogoutButton();

  await loadStats();
  await loadRecentActivity();
  initProvisionUI(onJobCreated);
});

async function loadStats() {
  try {
    const data = await api.get('/stats');
    if (!data) return;
    setStatEl('stat-total',      data.total);
    setStatEl('stat-active',     data.active);
    setStatEl('stat-inprogress', data.inProgress);
    setStatEl('stat-failed',     data.failed);
  } catch {
    ['stat-total','stat-active','stat-inprogress','stat-failed'].forEach(id => setStatEl(id, '—'));
  }
}

function setStatEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '0';
}

async function loadRecentActivity() {
  try {
    const data = await api.get('/activity?limit=5');
    if (!data) return;
    renderActivityFeed(data.activity || [], 'activity-feed');
  } catch { /* leave empty state */ }
}

function renderActivityFeed(items, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!items || items.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">◷</div>
        <div class="empty-state-title">No activity yet</div>
        <div class="empty-state-text">Provision your first resource to get started.</div>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="activity-list">${items.map(a => `
    <div class="activity-item">
      <div class="activity-dot ${actionDotClass(a.action)}"></div>
      <div class="activity-content">
        <div class="activity-action">${escHtml(actionLabel(a.action))}${a.resourceType ? ` <span class="text-muted">(${resourceTypeLabel(a.resourceType)})</span>` : ''}</div>
        ${a.jobId ? `<div class="activity-detail text-mono">Job ${a.jobId.slice(0,8)}…</div>` : ''}
      </div>
      <div class="activity-time">${timeAgo(a.createdAt)}</div>
    </div>`).join('')}</div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function onJobCreated(result) {
  if (!result?.jobId) return;
  const jobId = result.jobId;

  // Show status card
  const statusArea = document.getElementById('active-job-status');
  if (statusArea) {
    renderJobStatusCard({ status: 'PENDING', jobId, resourceType: result.resourceType, resource: null }, 'active-job-status');
  }

  // Start polling
  startPolling(jobId, async (jobData) => {
    renderJobStatusCard(jobData, 'active-job-status');

    if (jobData.status === 'READY' || jobData.status === 'FAILED') {
      await loadStats();
      await loadRecentActivity();
    }
  });
}
