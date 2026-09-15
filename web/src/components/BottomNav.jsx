import { NavLink } from 'react-router-dom';
import { useCart } from '../store/cart.js';
import { useAuth } from '../store/auth.js';
import { IconHome, IconOrders, IconCart, IconUser, IconShield } from './Icons.jsx';

/**
 * A short tick on tap. Android honours it, iOS ignores it, and anything
 * without the API is unaffected — it is a nicety, never a dependency.
 */
const tick = () => navigator.vibrate?.(8);

const Item = ({ to, label, icon: Icon, badge, end }) => (
  <NavLink
    to={to}
    end={end}
    onClick={tick}
    className={({ isActive }) => `bottomnav__item ${isActive ? 'is-active' : ''}`}
  >
    <Icon size={21} />
    <span>{label}</span>
    {badge > 0 && <span className="bottomnav__badge">{badge > 99 ? '99+' : badge}</span>}
  </NavLink>
);

export const BottomNav = () => {
  const itemCount = useCart((state) => state.cart.itemCount);
  const isAdmin = useAuth((state) => state.isAdmin);

  return (
    <nav className="bottomnav" aria-label="Main">
      <Item to="/" label="Shop" icon={IconHome} end />
      <Item to="/orders" label="Orders" icon={IconOrders} />
      <Item to="/cart" label="Basket" icon={IconCart} badge={itemCount} />
      {isAdmin ? (
        <Item to="/admin" label="Store" icon={IconShield} />
      ) : (
        <Item to="/account" label="Account" icon={IconUser} />
      )}
    </nav>
  );
};
