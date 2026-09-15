/**
 * Thin fetch wrapper around the Karthika Stores API.
 *
 * The access token lives in memory only (never localStorage), and the long
 * lived refresh token is an httpOnly cookie the browser sends automatically.
 * A 401 triggers exactly one silent refresh + replay; concurrent 401s share
 * the same refresh promise so we never stampede the endpoint.
 */
const BASE = import.meta.env.VITE_API_URL ?? '/api';

let accessToken = null;
let refreshPromise = null;
let onSessionLost = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const onUnauthorised = (handler) => {
  onSessionLost = handler;
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details ?? [];
  }
  /** Field -> message, for inline form errors. */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

const parse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 200) } };
  }
};

const refreshSession = async () => {
  refreshPromise ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new ApiError(response.status, 'Session expired');
      const data = await parse(response);
      accessToken = data.accessToken ?? null;
      return data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};

const request = async (path, { method = 'GET', body, retry = true, signal } = {}) => {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'We could not reach the shop. Check your connection and try again.');
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
      return request(path, { method, body, retry: false, signal });
    } catch {
      accessToken = null;
      onSessionLost();
    }
  }

  const data = await parse(response);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.message ?? 'Something went wrong', data?.error?.details);
  }
  return data;
};

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body: body ?? {} }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body: body ?? {} }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
  refreshSession,
};
