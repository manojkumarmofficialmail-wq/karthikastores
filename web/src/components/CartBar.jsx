import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart.js';
import { money } from '../lib/format.js';
import { IconChevron } from './Icons.jsx';

/** Blinkit-style floating basket bar; hidden on the pages that already show it. */
const HIDDEN_ON = ['/cart', '/checkout', '/login', '/register'];

export const CartBar = () => {
  const cart = useCart((state) => state.cart);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!cart.itemCount || HIDDEN_ON.some((path) => pathname.startsWith(path)) || pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <>
      {/* The bar floats above the page, so the flow needs matching space or
          it hides the last row of ADD buttons. */}
      <div className="cartbar-spacer" aria-hidden="true" />
      <div className="cartbar">
        <div
          className="cartbar__inner"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/cart')}
          onKeyDown={(event) => event.key === 'Enter' && navigate('/cart')}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              {cart.itemCount} item{cart.itemCount > 1 ? 's' : ''}
            </div>
            <strong>{money(cart.subtotalPaise)}</strong>
          </div>
          <div className="row" style={{ gap: 4, fontWeight: 700 }}>
            View basket <IconChevron size={17} />
          </div>
        </div>
      </div>
    </>
  );
};
