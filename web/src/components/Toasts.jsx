import { useToasts } from '../store/ui.js';

export const Toasts = () => {
  const toasts = useToasts((state) => state.toasts);
  if (!toasts.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.tone}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
};
