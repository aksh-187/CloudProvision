/**
 * CloudProvision — Auth helpers (frontend)
 *
 * Handles login, signup, logout, and auth-guard redirects.
 * Full form wiring is implemented in Phase 7.
 * This stub provides the utility functions used across all pages.
 */

'use strict';

/**
 * Checks whether the user is authenticated by calling GET /api/auth/me.
 * Returns the user object if authenticated, or null if not.
 *
 * @returns {Promise<object|null>}
 */
async function getCurrentUser() {
  try {
    const data = await api.get('/auth/me');
    return data?.user || null;
  } catch {
    return null;
  }
}

/**
 * Redirects to /login.html if the user is not authenticated.
 * Call at the top of every protected page's script.
 *
 * @returns {Promise<object>} The authenticated user object.
 */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  return user;
}

/**
 * Logs out the current user and redirects to /login.html.
 */
async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Ignore errors — still redirect
  }
  window.location.href = '/login.html';
}

/**
 * Populates user info elements in the sidebar.
 * Looks for elements with data-user-name and data-user-email attributes.
 *
 * @param {object} user
 */
function populateSidebarUser(user) {
  const nameEls  = document.querySelectorAll('[data-user-name]');
  const emailEls = document.querySelectorAll('[data-user-email]');
  const avatarEls = document.querySelectorAll('[data-user-avatar]');

  const initials = (user.name || user.email || '?')
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  nameEls.forEach(el  => { el.textContent = user.name || user.email; });
  emailEls.forEach(el => { el.textContent = user.email; });
  avatarEls.forEach(el => { el.textContent = initials; });
}

/**
 * Shows an alert element with the given message.
 *
 * @param {string}  elementId  - ID of the alert element
 * @param {string}  message
 * @param {'error'|'success'|'info'|'warning'} type
 */
function showAlert(elementId, message, type = 'error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} visible`;
}

/**
 * Hides an alert element.
 *
 * @param {string} elementId
 */
function hideAlert(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('visible');
}

/**
 * Sets a button to loading state (disables it, shows spinner text).
 *
 * @param {HTMLButtonElement} btn
 * @param {string} loadingText
 */
function setButtonLoading(btn, loadingText = 'Loading…') {
  btn.disabled = true;
  btn._originalText = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
}

/**
 * Restores a button from loading state.
 *
 * @param {HTMLButtonElement} btn
 */
function setButtonReady(btn) {
  btn.disabled = false;
  if (btn._originalText) {
    btn.innerHTML = btn._originalText;
    delete btn._originalText;
  }
}
