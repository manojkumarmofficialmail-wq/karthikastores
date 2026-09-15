import { useNavigate } from 'react-router-dom';
import { useStoreInfo } from '../store/storeInfo.js';
import { SearchBar } from './SearchBar.jsx';
import { IconBack, IconPin, IconClock } from './Icons.jsx';

/** Storefront header: shop identity, open/closed state and the search bar. */
export const TopBar = ({ showSearch = true }) => {
  const { store, isOpen } = useStoreInfo();

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="row row--between">
          <div className="topbar__title">
            <span className="topbar__mark" aria-hidden="true">🛍️</span>
            <div>
              <div className="topbar__name">{store?.name ?? 'Karthika Stores'}</div>
              <div className="topbar__meta">
                <IconPin size={13} />
                <span className="truncate">
                  {store ? `${store.city} · free delivery within ${store.freeDeliveryRadiusKm} km` : 'Loading shop…'}
                </span>
              </div>
            </div>
          </div>
          <span className={`badge ${isOpen ? 'badge--good' : 'badge--warn'}`} style={{ flex: 'none' }}>
            <IconClock size={12} />
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        {showSearch && <SearchBar />}
      </div>
    </header>
  );
};

/** Header for secondary screens: back arrow + title. */
export const PageBar = ({ title, action }) => {
  const navigate = useNavigate();
  return (
    <header className="topbar topbar--plain">
      <div className="topbar__inner row row--between">
        <button
          type="button"
          className="backlink"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        >
          <IconBack size={20} />
          <span>{title}</span>
        </button>
        {action}
      </div>
    </header>
  );
};
