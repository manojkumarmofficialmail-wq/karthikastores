import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { payForOrder } from '../lib/payments.js';
import { UpiPaySheet } from '../components/UpiPaySheet.jsx';
import { money, timeRange, eta } from '../lib/format.js';
import { useCart } from '../store/cart.js';
import { useAuth } from '../store/auth.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { AddressForm } from '../components/AddressForm.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconTruck, IconStore, IconPin, IconClock, IconRupee, IconShield, IconQr } from '../components/Icons.jsx';

const UPI_OPTION = {
  value: 'upi_qr',
  title: 'Pay by UPI',
  hint: 'Scan the shop QR with GPay, PhonePe, Paytm or any UPI app',
  icon: IconQr,
  recommended: true,
};

const PAYMENT_OPTIONS = {
  delivery: [
    UPI_OPTION,
    { value: 'razorpay', title: 'Card or netbanking', hint: 'Secured by Razorpay' },
    { value: 'pay_on_delivery', title: 'Pay on delivery', hint: 'Cash or UPI when the rider hands over the bag' },
  ],
  pickup: [
    UPI_OPTION,
    { value: 'razorpay', title: 'Card or netbanking', hint: 'Secured by Razorpay' },
    { value: 'pay_at_store', title: 'Pay at the counter', hint: 'Settle the bill when you collect' },
  ],
};

/** Methods that open a payment screen instead of confirming the order outright. */
const PREPAID = ['upi_qr', 'razorpay'];

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const cart = useCart((state) => state.cart);
  const resetCart = useCart((state) => state.reset);
  const loadCart = useCart((state) => state.load);
  const { store, slots, isOpen } = useStoreInfo();

  // The customer's saved preference wins until they touch the toggle. `user`
  // can arrive after this mounts (session restore), so it is applied in an
  // effect as well as in the initial value.
  const [fulfilment, setFulfilment] = useState(() => user?.preferences?.fulfilment ?? 'delivery');
  const fulfilmentTouched = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState('upi_qr');
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [slotStart, setSlotStart] = useState('');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState(null);
  const [addressSheet, setAddressSheet] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Stays true from "place order" until we navigate away, so emptying the
  // basket mid-checkout cannot unmount the payment sheet under the customer.
  const [checkoutInFlight, setCheckoutInFlight] = useState(false);
  const [simulator, setSimulator] = useState(null);
  const simulatorResolve = useRef(null);
  // The order exists by the time this is set: the QR is for a real, placed,
  // stock-reserved order, never for a basket.
  const [upiOrder, setUpiOrder] = useState(null);

  useEffect(() => {
    loadCart().catch(() => {});
  }, [loadCart]);

  useEffect(() => {
    const preferred = user?.preferences?.fulfilment;
    if (preferred && !fulfilmentTouched.current) setFulfilment(preferred);
  }, [user]);

  const chooseFulfilment = (value) => {
    fulfilmentTouched.current = true;
    setFulfilment(value);
  };

  const loadAddresses = useCallback(async () => {
    const data = await api.get('/addresses');
    setAddresses(data.addresses);
    setAddressId((current) => {
      if (current && data.addresses.some((a) => a.id === current)) return current;
      const serviceable = data.addresses.find((a) => a.delivery?.serviceable);
      return (serviceable ?? data.addresses[0])?.id ?? null;
    });
  }, []);

  useEffect(() => {
    loadAddresses().catch(() => {});
  }, [loadAddresses]);

  // Re-price whenever the fulfilment choice or the chosen address changes.
  useEffect(() => {
    if (!cart.lineCount) return;
    api
      .post('/orders/quote', {
        fulfilment,
        ...(fulfilment === 'delivery' && addressId ? { addressId } : {}),
      })
      .then(setQuote)
      .catch((error) => toast.error(error.message));
  }, [fulfilment, addressId, cart.lineCount, cart.subtotalPaise]);

  // Never offer a method the server would refuse: UPI needs a VPA saved in
  // shop settings, cards need a configured gateway, and pay-later can be
  // switched off from the dashboard.
  const paymentOptions = PAYMENT_OPTIONS[fulfilment].filter((option) => {
    if (option.value === 'upi_qr') return store?.upiPaymentEnabled === true;
    if (option.value === 'razorpay') return store?.onlinePaymentEnabled === true;
    return store?.acceptsPayLater !== false;
  });

  // Keep the payment choice legal for the chosen fulfilment type.
  useEffect(() => {
    const allowed = paymentOptions.map((option) => option.value);
    if (allowed.length && !allowed.includes(paymentMethod)) setPaymentMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fulfilment,
    paymentMethod,
    store?.acceptsPayLater,
    store?.onlinePaymentEnabled,
    store?.upiPaymentEnabled,
  ]);

  const selectedAddress = addresses.find((address) => address.id === addressId);
  const delivery = quote?.delivery;
  const totals = quote?.totals;
  const canDeliver = fulfilment === 'pickup' || Boolean(delivery?.serviceable);

  const askSimulated = ({ amountPaise, orderNumber }) =>
    new Promise((resolve) => {
      simulatorResolve.current = resolve;
      setSimulator({ amountPaise, orderNumber });
    });

  const answerSimulated = (outcome) => {
    setSimulator(null);
    simulatorResolve.current?.(outcome);
    simulatorResolve.current = null;
  };

  const placeOrder = async () => {
    setPlacing(true);
    setCheckoutInFlight(true);
    try {
      const { order, requiresPayment, paymentMethod: placedMethod } = await api.post('/orders', {
        fulfilment,
        paymentMethod,
        ...(fulfilment === 'delivery' ? { addressId } : {}),
        ...(slotStart ? { slotStart } : {}),
        ...(note.trim() ? { customerNote: note.trim() } : {}),
      });
      resetCart();

      if (!requiresPayment) {
        toast.success('Order placed — we are packing it now');
        navigate(`/orders/${order.id}`, { replace: true });
        return;
      }

      // UPI: the order is placed and the stock is held; the QR opens over the
      // top of this screen. Nothing else to await here — the customer's own
      // UPI app is the next step, and the shop confirms the money after.
      if (placedMethod === 'upi_qr') {
        setUpiOrder(order);
        return;
      }

      try {
        const paid = await payForOrder({
          orderId: order.id,
          customer: { name: user?.name, contact: user?.phone, email: user?.email ?? '' },
          confirmSimulated: askSimulated,
        });
        toast.success('Payment received — thank you!');
        navigate(`/orders/${paid.id}`, { replace: true });
      } catch (paymentError) {
        toast.error(paymentError.message);
        // The order exists; send the customer to it so they can retry or see
        // that the stock was released.
        navigate(`/orders/${order.id}`, { replace: true });
      }
    } catch (error) {
      // The order was never created — put the customer back on the form.
      setCheckoutInFlight(false);
      toast.error(error.message);
      if (error.details?.length) {
        error.details.forEach((detail) => toast.error(`${detail.field}: ${detail.message}`));
        loadCart().catch(() => {});
      }
    } finally {
      setPlacing(false);
    }
  };

  if (!cart.lineCount && !checkoutInFlight) {
    return (
      <>
        <PageBar title="Checkout" />
        <main className="page">
          <EmptyState
            art="🧺"
            title="Nothing to check out"
            message="Your basket is empty."
            action={<Link className="btn btn--primary" to="/">Start shopping</Link>}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <PageBar title="Checkout" />
      <main className="page">
        {/* ---------------------------- fulfilment ---------------------- */}
        <section className="section">
          <h2 style={{ marginBottom: 10 }}>How would you like it?</h2>
          <div className="stack" style={{ gap: 10 }}>
            <label className={`radio-card ${fulfilment === 'delivery' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === 'delivery'}
                onChange={() => chooseFulfilment('delivery')}
              />
              <div className="grow">
                <div className="row row--between">
                  <strong><IconTruck size={15} /> Home delivery</strong>
                  <span className="badge badge--good">FREE</span>
                </div>
                <div className="small muted">
                  Within {store?.freeDeliveryRadiusKm ?? 5} km of the shop
                  {delivery?.serviceable && ` · about ${delivery.distanceKm} km, ${eta(delivery.etaMinutes)}`}
                </div>
              </div>
            </label>

            <label className={`radio-card ${fulfilment === 'pickup' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === 'pickup'}
                onChange={() => chooseFulfilment('pickup')}
              />
              <div className="grow">
                <div className="row row--between">
                  <strong><IconStore size={15} /> Store pickup</strong>
                  <span className="badge">No minimum</span>
                </div>
                <div className="small muted">
                  {store ? `${store.addressLine}, ${store.city}` : 'Collect at the counter'}
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* ----------------------------- address ------------------------ */}
        {fulfilment === 'delivery' && (
          <section className="section">
            <div className="section__head">
              <h2>Deliver to</h2>
              <button type="button" className="btn btn--link" onClick={() => setAddressSheet(true)}>
                + Add new
              </button>
            </div>

            {addresses.length === 0 ? (
              <div className="card center">
                <p className="small muted" style={{ marginBottom: 10 }}>
                  No saved addresses yet.
                </p>
                <button type="button" className="btn btn--primary" onClick={() => setAddressSheet(true)}>
                  Add a delivery address
                </button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`radio-card ${addressId === address.id ? 'is-active' : ''} ${
                      address.delivery?.serviceable ? '' : 'is-disabled'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={addressId === address.id}
                      disabled={!address.delivery?.serviceable}
                      onChange={() => setAddressId(address.id)}
                    />
                    <div className="grow">
                      <div className="row row--between">
                        <strong className="small">{address.label}</strong>
                        {address.delivery?.serviceable ? (
                          <span className="badge badge--good">{address.delivery.distanceKm} km</span>
                        ) : (
                          <span className="badge badge--bad">Too far</span>
                        )}
                      </div>
                      <div className="small muted">
                        {address.line1}
                        {address.landmark ? `, ${address.landmark}` : ''}, {address.city} {address.pincode}
                      </div>
                      <div className="tiny faint">{address.contactName} · {address.contactPhone}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {delivery && !delivery.serviceable && (
              <div className="banner banner--warn" style={{ marginTop: 10 }}>
                <IconPin size={16} />
                <div className="small">
                  {delivery.reason}
                  <button
                    type="button"
                    className="btn btn--link"
                    style={{ marginLeft: 6 }}
                    onClick={() => chooseFulfilment('pickup')}
                  >
                    Switch to pickup
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------ slot -------------------------- */}
        <section className="section">
          <div className="section__head">
            <h2>{fulfilment === 'pickup' ? 'Pickup time' : 'Delivery time'}</h2>
          </div>
          <div className="scroller">
            <button
              type="button"
              className={`chip ${slotStart === '' ? 'is-active' : ''}`}
              onClick={() => setSlotStart('')}
            >
              <IconClock size={14} />
              {isOpen ? `As soon as possible${delivery?.etaMinutes ? ` · ${eta(delivery.etaMinutes)}` : ''}` : 'When we open'}
            </button>
            {slots.slice(0, 6).map((slot) => (
              <button
                key={slot.start}
                type="button"
                className={`chip ${slotStart === slot.start ? 'is-active' : ''}`}
                onClick={() => setSlotStart(slot.start)}
              >
                {timeRange(slot.start, slot.end)}
              </button>
            ))}
          </div>
        </section>

        {/* ----------------------------- payment ------------------------ */}
        <section className="section">
          <h2 style={{ marginBottom: 10 }}>Payment</h2>
          <div className="stack" style={{ gap: 10 }}>
            {paymentOptions.map((option) => (
              <label
                key={option.value}
                className={`radio-card ${paymentMethod === option.value ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === option.value}
                  onChange={() => setPaymentMethod(option.value)}
                />
                <div className="grow">
                  <div className="row row--between">
                    <strong className="small row" style={{ gap: 6 }}>
                      {option.icon && <option.icon size={15} />}
                      {option.title}
                    </strong>
                    {option.recommended && <span className="badge badge--good">Fastest</span>}
                  </div>
                  <div className="small muted">{option.hint}</div>
                </div>
              </label>
            ))}
          </div>
          {paymentMethod === 'upi_qr' && (
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
              <IconShield size={15} />
              <span className="tiny muted">
                You pay straight into the shop&apos;s UPI account. We only ask for the reference
                number afterwards so the shop can match it.
              </span>
            </div>
          )}
          {paymentMethod === 'razorpay' && (
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <IconShield size={15} />
              <span className="tiny muted">
                Card details never touch our servers — the gateway handles them.
              </span>
            </div>
          )}
        </section>

        {/* ------------------------------ note -------------------------- */}
        <section className="section">
          <div className="field">
            <label htmlFor="order-note">Note for the shop (optional)</label>
            <textarea
              id="order-note"
              rows={2}
              maxLength={280}
              value={note}
              placeholder="e.g. send small onions, ring the bell twice"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </section>

        {/* ------------------------------ bill -------------------------- */}
        <section className="card section">
          <h2 style={{ marginBottom: 12 }}>Bill summary</h2>
          <div className="bill">
            <div className="bill__row">
              <span className="muted">Item total</span>
              <span>{money((totals?.subtotalPaise ?? cart.subtotalPaise) + (totals?.savingsPaise ?? cart.savingsPaise))}</span>
            </div>
            {(totals?.savingsPaise ?? cart.savingsPaise) > 0 && (
              <div className="bill__row bill__row--save">
                <span>Shop discount</span>
                <span>− {money(totals?.savingsPaise ?? cart.savingsPaise)}</span>
              </div>
            )}
            <div className="bill__row">
              <span className="muted">{fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</span>
              <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                {totals?.deliveryFeePaise ? money(totals.deliveryFeePaise) : 'FREE'}
              </span>
            </div>
            <div className="bill__row bill__row--total">
              <span>To pay</span>
              <span>{money(totals?.totalPaise ?? cart.subtotalPaise)}</span>
            </div>
          </div>
        </section>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={placing || !canDeliver}
          onClick={placeOrder}
        >
          {placing ? (
            'Placing your order…'
          ) : (
            <>
              <IconRupee size={16} />
              {PREPAID.includes(paymentMethod) ? 'Pay' : 'Place order ·'}{' '}
              {money(totals?.totalPaise ?? cart.subtotalPaise)}
            </>
          )}
        </button>
        {!canDeliver && (
          <p className="tiny center" style={{ marginTop: 8, color: 'var(--red-500)' }}>
            Choose a serviceable address, or switch to store pickup.
          </p>
        )}
      </main>

      <Sheet open={addressSheet} title="New address" onClose={() => setAddressSheet(false)}>
        <AddressForm
          initial={{ contactName: user?.name ?? '', contactPhone: user?.phone ?? '' }}
          onCancel={() => setAddressSheet(false)}
          onSubmit={async (values) => {
            const { address } = await api.post('/addresses', values);
            await loadAddresses();
            setAddressId(address.id);
            setAddressSheet(false);
            toast.success('Address saved');
          }}
        />
      </Sheet>

      <UpiPaySheet
        open={Boolean(upiOrder)}
        order={upiOrder}
        onClose={() => {
          const id = upiOrder.id;
          setUpiOrder(null);
          // Closing is not cancelling: the order is real and unpaid, and the
          // tracking screen can reopen the same QR.
          navigate(`/orders/${id}`, { replace: true });
        }}
        onClaimed={(updated) => {
          setUpiOrder(null);
          navigate(`/orders/${updated.id}`, { replace: true });
        }}
      />

      {/* Local gateway stand-in; never rendered when real Razorpay keys are set. */}
      <Sheet
        open={Boolean(simulator)}
        title="Payment (development gateway)"
        onClose={() => answerSimulated('cancel')}
      >
        <p className="small muted" style={{ marginBottom: 14 }}>
          The server is running with <code>PAYMENT_PROVIDER=simulated</code>. Choosing an outcome below
          produces a signed payload that goes through the same verification endpoint Razorpay would hit.
        </p>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row row--between">
            <span className="muted">Order</span>
            <strong>{simulator?.orderNumber}</strong>
          </div>
          <div className="row row--between" style={{ marginTop: 6 }}>
            <span className="muted">Amount</span>
            <strong>{money(simulator?.amountPaise ?? 0)}</strong>
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <button type="button" className="btn btn--primary" onClick={() => answerSimulated('success')}>
            Approve payment
          </button>
          <button type="button" className="btn btn--danger" onClick={() => answerSimulated('failure')}>
            Decline payment
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => answerSimulated('cancel')}>
            Close the sheet
          </button>
        </div>
      </Sheet>
    </>
  );
};
