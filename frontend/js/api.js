/**
 * CloudProvision — API client
 * Thin fetch wrapper: JSON, credentials, 401 redirect, structured errors.
 */
'use strict';

const API_BASE = '/api';

async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const defaults = {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  const options = {
    ...defaults,
    ...opts,
    headers: { ...defaults.headers, ...(opts.headers || {}) },
  };
  if (options.method === 'GET' || options.method === 'HEAD') {
    delete options.headers['Content-Type'];
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    if (!window.location.pathname.includes('login') && !window.location.pathname.includes('signup')) {
      window.location.href = '/login.html';
    }
    return null;
  }

  let data = null;
  const ct = response.headers.get('Content-Type') || '';
  if (ct.includes('application/json') && response.status !== 204) {
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

const api = {
  get:    (path)       => apiFetch(path),
  post:   (path, body) => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body) => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)       => apiFetch(path, { method: 'DELETE' }),
};

if (typeof module !== 'undefined') module.exports = api;
