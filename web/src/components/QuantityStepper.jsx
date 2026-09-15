import { useCart } from '../store/cart.js';
import { toast } from '../store/ui.js';
import { IconPlus, IconMinus } from './Icons.jsx';

/**
 * The add / +- control used on every product surface. It reads its own
 * quantity from the cart store, so any card anywhere stays in sync with the
 * basket without prop drilling.
 */
export const QuantityStepper = ({ product, size = 'sm' }) => {
  const quantity = useCart((state) => state.quantityOf(product.id));
  const busy = useCart((state) => state.busyProductId === product.id);
  const add = useCart((state) => state.add);
  const setQuantity = useCart((state) => state.setQuantity);

  const limit = Math.max(0, Math.min(product.maxPerOrder ?? 20, product.stockQty ?? 0));

  const guard = (fn) => async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await fn();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (!product.inStock) {
    return (
      <button type="button" className="add-btn" disabled>
        Sold out
      </button>
    );
  }

  if (quantity === 0) {
    return (
      <button
        type="button"
        className="add-btn"
        disabled={busy}
        onClick={guard(() => add(product, 1))}
      >
        {busy ? '···' : 'ADD'}
      </button>
    );
  }

  return (
    <div className={`stepper ${size === 'lg' ? 'stepper--lg' : ''}`}>
      <button
        type="button"
        aria-label={`Remove one ${product.name}`}
        onClick={guard(() => setQuantity(product, quantity - 1))}
        disabled={busy}
      >
        <IconMinus size={size === 'lg' ? 18 : 15} />
      </button>
      <span aria-live="polite">{quantity}</span>
      <button
        type="button"
        aria-label={`Add one ${product.name}`}
        disabled={busy || quantity >= limit}
        onClick={guard(() => {
          if (quantity >= limit) {
            toast.info(`Only ${limit} available right now`);
            return Promise.resolve();
          }
          return setQuantity(product, quantity + 1);
        })}
      >
        <IconPlus size={size === 'lg' ? 18 : 15} />
      </button>
    </div>
  );
};
