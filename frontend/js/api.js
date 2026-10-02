/**
 * CloudProvision — API client
 *
 * Thin fetch wrapper that:
 *  - Always sends/receives JSON
 *  - Includes credentials (session cookie)
 *  - Throws a structured Error on non-2xx responses
 *  - Redirects to /login.html on 401
 */

'use strict';

const API_BASE = '/api';

/**
 * Core fetch wrapper.
 *
 * @param {string} path   - API path, e.g. '/auth/me'
 * @param {object} [opts] - fetch options (method, body, etc.)
 * @returns {Promise<any>} - Parsed JSON response body
 */
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;

  const defaults = {
    method: 'GET',
    credentials: 'include',       // send session cookie
    headers: { 'Content-Type': 'application/json' },
  };

  const options = {
    ...defaults,
    ...opts,
    headers: { ...defaults.headers, ...(opts.headers || {}) },
  };

  // Don't set Content-Type for GET/HEAD (no body)
  if (options.method === 'GET' || options.method === 'HEAD') {
    delete options.headers['Content-Type'];
  }

  const response = await fetch(url, options);

  // Redirect to login on 401 Unauthorized (session expired / not logged in)
  if (response.status === 401) {
    window.location.href = '/login.html';
    return;
  }

  // Parse response body (may be empty on 204)
  let data = null;
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json') && response.status !== 204) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status} ${response.statusText}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Convenience methods ────────────────────────────────────────────────────

const api = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put:    (path, body)   => apiFetch(path, { method: 'PUT',  body: JSON.stringify(body) }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
};

// Export for modules / inline script use
if (typeof module !== 'undefined') {
  module.exports = api;
}
