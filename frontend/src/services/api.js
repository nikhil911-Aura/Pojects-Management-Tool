import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Global socket ID — set by useSocket hook
let _socketId = null;
export const setApiSocketId = (id) => { _socketId = id; };

// ── Token refresh queue ──────────────────────────────────────────────────────
// Only one refresh request runs at a time. Any other 401s that arrive while
// a refresh is in-flight are queued and resolved with the new token once done.
let _isRefreshing = false;
let _refreshQueue = []; // [{ resolve, reject }]

function _processQueue(error, token = null) {
  _refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  _refreshQueue = [];
}

// ── Proactive refresh ────────────────────────────────────────────────────────
// Refresh the token 2 minutes before it expires so users never hit a 401
// from normal inactivity. Reschedules itself after every successful refresh.
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // must match JWT_EXPIRE on backend
const REFRESH_EARLY_MS    =  2 * 60 * 1000; // refresh 2 min before expiry
let _proactiveTimer = null;

function _scheduleProactiveRefresh() {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);
  _proactiveTimer = setTimeout(_doProactiveRefresh, ACCESS_TOKEN_TTL_MS - REFRESH_EARLY_MS);
}

async function _doProactiveRefresh() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') return;
  try {
    const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh-token`, { refreshToken }, { withCredentials: true });
    const { accessToken, refreshToken: newRefreshToken } = res.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', newRefreshToken);
    _scheduleProactiveRefresh(); // keep the cycle going
  } catch {
    // Silently ignore — the next real 401 will handle cleanup
  }
}

// ── Request interceptor ──────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (_socketId) {
      config.headers['x-socket-id'] = _socketId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    // Kick off the proactive refresh timer after a successful login/refresh
    const url = response.config?.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/refresh-token')) {
      _scheduleProactiveRefresh();
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // The refresh endpoint itself returned 401 — tokens are fully invalid
    if (originalRequest.url?.includes('/auth/refresh-token')) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      if (!window.location.pathname.startsWith('/invite/')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Another refresh is already in-flight — queue this request
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    // This request is the one that will do the refresh
    originalRequest._retry = true;
    _isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
        throw new Error('No refresh token');
      }

      const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh-token`, { refreshToken }, { withCredentials: true });
      const { accessToken, refreshToken: newRefreshToken } = res.data.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefreshToken);

      _processQueue(null, accessToken);
      _isRefreshing = false;
      _scheduleProactiveRefresh();

      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      _processQueue(refreshError);
      _isRefreshing = false;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      if (!window.location.pathname.startsWith('/invite/')) {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
