import { ORDER_STATUS } from '../lib/format.js';
import { dateTime } from '../lib/format.js';
import { IconCheck } from './Icons.jsx';

const stepsFor = (fulfilment) => [
  { status: 'confirmed', label: 'Order confirmed', hint: 'We have your order' },
  { status: 'preparing', label: 'Being packed', hint: 'Staff is filling your bag' },
  fulfilment === 'pickup'
    ? { status: 'ready_for_pickup', label: 'Ready for pickup', hint: 'Collect from the counter' }
    : { status: 'out_for_delivery', label: 'Out for delivery', hint: 'On the way to you' },
  {
    status: 'delivered',
    label: fulfilment === 'pickup' ? 'Picked up' : 'Delivered',
    hint: 'Order complete',
  },
];

export const StatusTimeline = ({ order }) => {
  if (order.status === 'cancelled') {
    return (
      <div className="banner banner--bad">
        <span>❌</span>
        <div>
          <strong>Order cancelled</strong>
          {order.cancelReason && <div className="small">{order.cancelReason}</div>}
        </div>
      </div>
    );
  }

  const steps = stepsFor(order.fulfilment);
  const current = ORDER_STATUS[order.status]?.step ?? 0;
  const timeFor = (status) => order.history?.find((entry) => entry.status === status)?.at;

  return (
    <div className="timeline">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const done = current >= stepNumber;
        const isCurrent = current === stepNumber;
        const at = timeFor(step.status);
        return (
          <div className="timeline__step" key={step.status}>
            <div className="timeline__rail">
              <div className={`timeline__dot ${done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}>
                {done && <IconCheck size={11} />}
              </div>
              {index < steps.length - 1 && (
                <div className={`timeline__line ${current > stepNumber ? 'is-done' : ''}`} />
              )}
            </div>
            <div className="timeline__body">
              <div style={{ fontWeight: done ? 650 : 500, color: done ? 'var(--text)' : 'var(--text-faint)' }}>
                {step.label}
              </div>
              <div className="tiny muted">{at ? dateTime(at) : step.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
