export const EmptyState = ({ art = '🧺', title, message, action }) => (
  <div className="empty">
    <div className="empty__art" aria-hidden="true">{art}</div>
    <h3>{title}</h3>
    {message && <p className="small" style={{ marginTop: 6 }}>{message}</p>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);
