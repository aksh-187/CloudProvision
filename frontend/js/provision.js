/**
 * CloudProvision — Provisioning UI script (stub)
 *
 * Full implementation in Phase 7.
 * Handles resource type selection, form rendering, job submission, polling.
 */

'use strict';

// Polling interval in milliseconds
const POLL_INTERVAL_MS = 3000;

// Active polling timers keyed by jobId
const activePollers = {};

/**
 * Starts polling GET /api/status/:jobId every POLL_INTERVAL_MS.
 * Calls onUpdate(status) on each poll.
 * Stops automatically when status reaches a terminal state.
 *
 * @param {string}   jobId
 * @param {Function} onUpdate  - called with the job status object
 */
function startPolling(jobId, onUpdate) {
  if (activePollers[jobId]) return; // already polling

  const terminal = new Set(['READY', 'FAILED', 'DESTROYED']);

  activePollers[jobId] = setInterval(async () => {
    try {
      const data = await api.get(`/status/${jobId}`);
      onUpdate(data);
      if (terminal.has(data?.status)) {
        stopPolling(jobId);
      }
    } catch (err) {
      console.error(`Polling error for job ${jobId}:`, err.message);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stops polling for a given jobId.
 *
 * @param {string} jobId
 */
function stopPolling(jobId) {
  if (activePollers[jobId]) {
    clearInterval(activePollers[jobId]);
    delete activePollers[jobId];
  }
}

/**
 * Returns the CSS class for a given status string.
 *
 * @param {string} status
 * @returns {string}
 */
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

/**
 * Renders a status badge element.
 *
 * @param {string} status
 * @returns {string} HTML string
 */
function renderStatusBadge(status) {
  return `<span class="badge ${statusBadgeClass(status)}">${status}</span>`;
}
