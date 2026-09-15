import { create } from 'zustand';

let nextId = 1;

export const useToasts = create((set, get) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5000 : 3000);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message) => useToasts.getState().push(message, 'success'),
  error: (message) => useToasts.getState().push(message, 'error'),
  info: (message) => useToasts.getState().push(message, 'info'),
};
