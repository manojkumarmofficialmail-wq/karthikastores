import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart.js';
import { useAuth } from '../store/auth.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { money } from '../lib/format.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { QuantityStepper } from '../components/QuantityStepper.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconTrash, IconTruck } from '../components/Icons.jsx';

export const CartPage = () => {
  const cart = useCart((state) => state.cart);
  const loaded = useCart((state) => state.loaded);
  const load = useCart((state) => state.load);
  const remove = useCart((state) => state.remove);
  const clear = useCart((state) => state.clear);
  const status = useAuth((state) => state.status);
  const { store } = useStoreInfo();
  const navigate = useNavigate();

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const minOrder = store?.minOrderPaise ?? 0;
  const belowMinimum = cart.subtotalPaise > 0 && cart.subtotalPaise < minOrder;

  if (loaded && cart.lineCount === 0) {
    return (
      <>
        <PageBar title="Basket" />
        <main className="page">
          <EmptyState
            art="🧺"
            title="Your basket is empty"
            message="Add rice, milk, a packet of chips — we will have it at your door in under an hour."
            action={
              <Link to="/" className="btn btn--primary">
                Start shopping
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <PageBar
        title="Basket"
        action={
          cart.lineCount > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                clear()
                  .then(() => toast.info('Basket cleared'))
                  .catch((error) => toast.error(error.message))
              }
            >
              Clear
            </button>
          )
        }
      />
      <main className="page">
        {cart.hasUnavailableItems && (
          <div className="banner banner--warn" style={{ marginBottom: 12 }}>
            <span aria-hidden="true">⚠️</span>
            <div className="small">
              Some items sold out or have fewer left than you wanted. We have adjusted the quantities.
            </div>
          </div>
        )}

        <section className="card" style={{ padding: '2px 14px', marginBottom: 14 }}>
          {cart.items.map((line) => (
            <div className="cart-line" key={line.product.id}>
              <Link to={`/p/${line.product.slug}`} className="cart-line__art">
                <ProductImage product={line.product} />
              </Link>
              <div className="grow">
                <Link to={`/p/${line.product.slug}`}>
                  <div className="small" style={{ fontWeight: 600 }}>{line.product.name}</div>
                </Link>
                <div className="tiny muted">{line.product.unitLabel}</div>
                {line.adjusted && (
                  <div className="tiny" style={{ color: 'var(--red-500)' }}>
                    Only {line.quantity} available
                  </div>
                )}
                <div className="row row--between" style={{ marginTop: 8 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <strong className="small">{money(line.lineTotalPaise)}</strong>
                    {line.lineMrpPaise > line.lineTotalPaise && (
                      <s className="tiny muted">{money(line.lineMrpPaise)}</s>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <QuantityStepper product={line.product} />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ padding: 6, minHeight: 0 }}
                      aria-label={`Remove ${line.product.name}`}
                      onClick={() => remove(line.product).catch((error) => toast.error(error.message))}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ marginBottom: 12 }}>Bill summary</h2>
          <div className="bill">
            <div className="bill__row">
              <span className="muted">Item total ({cart.itemCount} item{cart.itemCount > 1 ? 's' : ''})</span>
              <span>{money(cart.subtotalPaise + cart.savingsPaise)}</span>
            </div>
            {cart.savingsPaise > 0 && (
              <div className="bill__row bill__row--save">
                <span>Shop discount</span>
                <span>− {money(cart.savingsPaise)}</span>
              </div>
            )}
            <div className="bill__row">
              <span className="muted">Delivery</span>
              <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>FREE within {store?.freeDeliveryRadiusKm ?? 5} km</span>
            </div>
            <div className="bill__row bill__row--total">
              <span>To pay</span>
              <span>{money(cart.subtotalPaise)}</span>
            </div>
          </div>
          {cart.savingsPaise > 0 && (
            <div className="banner" style={{ marginTop: 12 }}>
              <span aria-hidden="true">🎉</span>
              <span>You save {money(cart.savingsPaise)} on this basket</span>
            </div>
          )}
        </section>

        {belowMinimum && (
          <div className="banner banner--warn" style={{ marginBottom: 12 }}>
            <IconTruck size={16} />
            <span>
              Add {money(minOrder - cart.subtotalPaise)} more to reach the {money(minOrder)} minimum for
              delivery, or choose store pickup.
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => navigate(status === 'authenticated' ? '/checkout' : '/login', {
            state: status === 'authenticated' ? undefined : { from: '/checkout' },
          })}
        >
          {status === 'authenticated' ? 'Choose delivery or pickup' : 'Sign in to checkout'}
        </button>
        <p className="tiny muted center" style={{ marginTop: 10 }}>
          Pay online, on delivery, or at the counter — you choose next.
        </p>
      </main>
    </>
  );
};
