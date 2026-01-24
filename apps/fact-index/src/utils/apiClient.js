// Utility for making authenticated API calls with JWT token
import { getAuthHeaders } from '../context/AuthContext';

/**
 * Fetch wrapper that automatically includes JWT token in Authorization header
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Helper to make GET requests with authentication
 * @param {string} url - The URL to fetch
 * @returns {Promise<any>}
 */
export async function apiGet(url) {
  const res = await authenticatedFetch(url, {
    method: 'GET',
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

/**
 * Helper to make POST requests with authentication
 * @param {string} url - The URL to fetch
 * @param {any} data - The data to send
 * @returns {Promise<any>}
 */
export async function apiPost(url, data) {
  const res = await authenticatedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

/**
 * Helper to make PUT requests with authentication
 * @param {string} url - The URL to fetch
 * @param {any} data - The data to send
 * @returns {Promise<any>}
 */
export async function apiPut(url, data) {
  const res = await authenticatedFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

/**
 * Helper to make DELETE requests with authentication
 * @param {string} url - The URL to fetch
 * @returns {Promise<any>}
 */
export async function apiDelete(url) {
  const res = await authenticatedFetch(url, {
    method: 'DELETE',
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}
