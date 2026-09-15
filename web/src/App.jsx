import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './store/auth.js';
import { useCart } from './store/cart.js';
import { useStoreInfo } from './store/storeInfo.js';

import { AppShell } from './components/AppShell.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { CartBar } from './components/CartBar.jsx';
import { Toasts } from './components/Toasts.jsx';
import { InstallPrompt } from './components/InstallPrompt.jsx';
import { RequireAuth, RequireAdmin } from './components/RouteGuards.jsx';
import { IconWifiOff } from './components/Icons.jsx';

import { HomePage } from './pages/Home.jsx';
import { CategoryPage } from './pages/Category.jsx';
import { SearchPage } from './pages/Search.jsx';
import { ProductPage } from './pages/Product.jsx';
import { CartPage } from './pages/Cart.jsx';
import { CheckoutPage } from './pages/Checkout.jsx';
import { OrdersPage } from './pages/Orders.jsx';
import { OrderDetailPage } from './pages/OrderDetail.jsx';
import { AccountPage } from './pages/Account.jsx';
import { AddressesPage } from './pages/Addresses.jsx';
import { LoginPage } from './pages/Login.jsx';
import { RegisterPage } from './pages/Register.jsx';
import { AdminPage } from './pages/admin/AdminPage.jsx';
import { NotFoundPage } from './pages/NotFound.jsx';

const OfflineBanner = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;
  return (
    <div className="banner banner--warn" style={{ borderRadius: 0, justifyContent: 'center' }}>
      <IconWifiOff size={16} />
      You are offline — browsing saved items. Orders will need a connection.
    </div>
  );
};

/**
 * Held up only while the session is being restored, which is one HTTP round
 * trip. Without it an installed app flashes a signed-out header for a moment
 * on every cold start — the single most web-page-ish thing it could do.
 */
const LaunchScreen = () => (
  <div className="launch">
    <div className="launch__mark" aria-hidden="true">🛍️</div>
    <span className="small">Karthika Stores</span>
  </div>
);

/** Screens animate in on navigation; the key is what restarts the animation. */
const Screens = () => {
  const location = useLocation();
  return (
    <div className="screen" key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/c/:slug" element={<CategoryPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/p/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/account/addresses" element={<RequireAuth><AddressesPage /></RequireAuth>} />

        <Route path="/admin/*" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </div>
  );
};

export const App = () => {
  const hydrate = useAuth((state) => state.hydrate);
  const status = useAuth((state) => state.status);
  const loadStore = useStoreInfo((state) => state.load);
  const loadCart = useCart((state) => state.load);
  const mergeGuestCart = useCart((state) => state.mergeGuestCart);

  useEffect(() => {
    hydrate();
    loadStore();
  }, [hydrate, loadStore]);

  // On sign-in the guest basket is folded into the server cart; on sign-out
  // the local basket takes over again.
  useEffect(() => {
    if (status === 'loading') return;
    const sync = status === 'authenticated' ? mergeGuestCart : loadCart;
    sync().catch(() => {});
  }, [status, loadCart, mergeGuestCart]);

  if (status === 'loading') return <LaunchScreen />;

  return (
    <AppShell>
      <OfflineBanner />
      <InstallPrompt />
      <Screens />
      <CartBar />
      <BottomNav />
      <Toasts />
    </AppShell>
  );
};
