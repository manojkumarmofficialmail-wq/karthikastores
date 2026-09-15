import { create } from 'zustand';
import { api } from '../lib/api.js';
import { useAuth } from './auth.js';

const GUEST_KEY = 'ks.guest-cart';

/**
 * The basket lives on the server for signed-in customers. Guests get a
 * localStorage basket with the same shape, which is merged into the server
 * cart the moment they sign in — so nothing is lost at the login wall.
 */
const readGuestCart = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writeGuestCart = (lines) => {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
  } catch {
    // Private mode with storage disabled: the basket is simply not persisted.
  }
};

/**
 * Build the same shape the API returns for a signed-in cart, so every screen
 * can render a guest basket and a server basket with one code path.
 */
const summarise = (lines) => {
  const items = lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      cartItemId: `guest:${line.product.id}`,
      quantity: line.quantity,
      requestedQuantity: line.quantity,
      adjusted: false,
      lineTotalPaise: line.quantity * line.product.pricePaise,
      lineMrpPaise: line.quantity * line.product.mrpPaise,
      product: line.product,
    }));

  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const mrpTotalPaise = items.reduce((sum, item) => sum + item.lineMrpPaise, 0);

  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    lineCount: items.length,
    subtotalPaise,
    savingsPaise: mrpTotalPaise - subtotalPaise,
    hasUnavailableItems: false,
  };
};

const emptyCart = { items: [], itemCount: 0, lineCount: 0, subtotalPaise: 0, savingsPaise: 0 };

export const useCart = create((set, get) => ({
  cart: emptyCart,
  busyProductId: null,
  loaded: false,

  isSignedIn: () => useAuth.getState().status === 'authenticated',

  quantityOf: (productId) =>
    get().cart.items.find((line) => line.product.id === productId)?.quantity ?? 0,

  load: async () => {
    if (!get().isSignedIn()) {
      const lines = readGuestCart();
      set({ cart: summarise(lines), loaded: true });
      return;
    }
    const { cart } = await api.get('/cart');
    set({ cart, loaded: true });
  },

  /** Fold the guest basket into the server cart, then clear the local copy. */
  mergeGuestCart: async () => {
    const lines = readGuestCart();
    if (!lines.length) return get().load();
    const { cart } = await api.post('/cart/merge', {
      items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    });
    writeGuestCart([]);
    set({ cart, loaded: true });
  },

  add: async (product, quantity = 1) => {
    set({ busyProductId: product.id });
    try {
      if (!get().isSignedIn()) {
        const lines = readGuestCart();
        const existing = lines.find((line) => line.product.id === product.id);
        const next = Math.min((existing?.quantity ?? 0) + quantity, product.maxPerOrder || 20);
        if (existing) existing.quantity = next;
        else lines.push({ product, quantity: next });
        writeGuestCart(lines);
        set({ cart: summarise(lines) });
        return;
      }
      const { cart } = await api.post('/cart/items', { productId: product.id, quantity });
      set({ cart });
    } finally {
      set({ busyProductId: null });
    }
  },

  setQuantity: async (product, quantity) => {
    set({ busyProductId: product.id });
    try {
      if (!get().isSignedIn()) {
        let lines = readGuestCart();
        const existing = lines.find((line) => line.product.id === product.id);
        if (quantity <= 0) lines = lines.filter((line) => line.product.id !== product.id);
        else if (existing) existing.quantity = quantity;
        else lines.push({ product, quantity });
        writeGuestCart(lines);
        set({ cart: summarise(lines) });
        return;
      }
      const { cart } = await api.patch(`/cart/items/${product.id}`, { quantity });
      set({ cart });
    } finally {
      set({ busyProductId: null });
    }
  },

  remove: (product) => get().setQuantity(product, 0),

  clear: async () => {
    if (!get().isSignedIn()) {
      writeGuestCart([]);
      set({ cart: emptyCart });
      return;
    }
    const { cart } = await api.del('/cart');
    set({ cart });
  },

  /** Called after a successful checkout. */
  reset: () => set({ cart: emptyCart }),
  replace: (cart) => set({ cart }),
}));
