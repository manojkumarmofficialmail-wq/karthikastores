import { create } from 'zustand';
import { api, setAccessToken, onUnauthorised } from '../lib/api.js';

export const useAuth = create((set, get) => ({
  user: null,
  status: 'loading', // loading | authenticated | guest
  isAdmin: false,

  /** Restore the session from the httpOnly refresh cookie on app start. */
  hydrate: async () => {
    try {
      const { user, accessToken } = await api.refreshSession();
      setAccessToken(accessToken);
      set({ user, status: 'authenticated', isAdmin: user?.role === 'admin' });
    } catch {
      set({ user: null, status: 'guest', isAdmin: false });
    }
  },

  login: async (credentials) => {
    const { user, accessToken } = await api.post('/auth/login', credentials);
    setAccessToken(accessToken);
    set({ user, status: 'authenticated', isAdmin: user.role === 'admin' });
    return user;
  },

  register: async (details) => {
    const { user, accessToken } = await api.post('/auth/register', details);
    setAccessToken(accessToken);
    set({ user, status: 'authenticated', isAdmin: user.role === 'admin' });
    return user;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      set({ user: null, status: 'guest', isAdmin: false });
    }
  },

  updateProfile: async (patch) => {
    const { user } = await api.patch('/auth/me', patch);
    set({ user });
    return user;
  },

  savePreference: async (key, value) => {
    const preferences = { ...(get().user?.preferences ?? {}), [key]: value };
    const { user } = await api.patch('/auth/me', { preferences });
    set({ user });
  },
}));

// A refresh that fails for good drops the app back to guest mode rather than
// leaving it stuck on a spinner.
onUnauthorised(() => {
  useAuth.setState({ user: null, status: 'guest', isAdmin: false });
});
