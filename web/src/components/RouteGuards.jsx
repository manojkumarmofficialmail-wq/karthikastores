import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth.js';

const Loading = () => (
  <div className="page">
    <div className="stack">
      <div className="skeleton" style={{ height: 80 }} />
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  </div>
);

/** Signed-in customers only; sends guests to the login wall and back again. */
export const RequireAuth = ({ children }) => {
  const status = useAuth((state) => state.status);
  const location = useLocation();

  if (status === 'loading') return <Loading />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return children;
};

export const RequireAdmin = ({ children }) => {
  const status = useAuth((state) => state.status);
  const isAdmin = useAuth((state) => state.isAdmin);
  const location = useLocation();

  if (status === 'loading') return <Loading />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};
