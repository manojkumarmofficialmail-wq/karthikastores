import { create } from 'zustand';
import { api } from '../lib/api.js';

/** Shop details, opening hours and delivery slots — loaded once per session. */
export const useStoreInfo = create((set) => ({
  store: null,
  isOpen: true,
  slots: [],
  deliveryZones: [],
  loaded: false,

  load: async () => {
    try {
      const data = await api.get('/store');
      set({ ...data, loaded: true });
    } catch {
      // Offline on a cold start: the app still renders, just without the
      // shop banner.
      set({ loaded: true });
    }
  },
}));
