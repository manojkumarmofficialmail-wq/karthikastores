import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { TopBar } from '../components/TopBar.jsx';
import { usePullToRefresh } from '../components/AppShell.jsx';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard.jsx';
import { categoryEmoji } from '../components/ProductImage.jsx';
import { IconTruck, IconStore, IconChevron } from '../components/Icons.jsx';

const Shelf = ({ title, products, link, loading }) => (
  <section className="section">
    <div className="section__head">
      <h2>{title}</h2>
      {link && <Link to={link}>See all</Link>}
    </div>
    <div className="product-grid">
      {loading
        ? Array.from({ length: 6 }, (_, index) => <ProductCardSkeleton key={index} />)
        : products.map((product) => <ProductCard key={product.id} product={product} />)}
    </div>
  </section>
);

export const HomePage = () => {
  const { store, isOpen } = useStoreInfo();
  const [categories, setCategories] = useState([]);
  const [popular, setPopular] = useState([]);
  const [deals, setDeals] = useState([]);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadStore = useStoreInfo((state) => state.load);

  const load = useCallback(
    async () =>
      Promise.all([
        api.get('/catalog/categories'),
        api.get('/catalog/products?sort=popular&limit=10'),
        api.get('/catalog/products?sort=discount&limit=10'),
        api.get('/catalog/products?category=dairy-eggs&limit=10&sort=popular'),
      ]).then(([categoryData, popularData, dealData, dailyData]) => {
        setCategories(categoryData.categories);
        setPopular(popularData.products);
        setDeals(dealData.products);
        setDaily(dailyData.products);
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Pulling down at the top re-reads the shelves and the shop's open/closed
  // state — the two things most likely to have moved on since the app was
  // last opened.
  usePullToRefresh(async () => {
    await Promise.all([load(), loadStore()]);
  }, [load, loadStore]);

  return (
    <>
      <TopBar />
      <main className="page">
        <section className="section">
          <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
            <div className="card grow" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <IconTruck size={18} />
                <strong className="small">Free delivery</strong>
              </div>
              <p className="tiny muted" style={{ marginTop: 4 }}>
                Within {store?.freeDeliveryRadiusKm ?? 5} km · no minimum fuss, arrives in about{' '}
                {store?.basePrepMinutes ? store.basePrepMinutes + 20 : 40} min
              </p>
            </div>
            <div className="card grow" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <IconStore size={18} />
                <strong className="small">Store pickup</strong>
              </div>
              <p className="tiny muted" style={{ marginTop: 4 }}>
                Pack it now, collect at the counter — {store?.opensAt?.slice(0, 5) ?? '07:00'} to{' '}
                {store?.closesAt?.slice(0, 5) ?? '21:30'}
              </p>
            </div>
          </div>
          {!isOpen && (
            <div className="banner banner--warn" style={{ marginTop: 10 }}>
              <span aria-hidden="true">🌙</span>
              <div>
                <strong>The shop is closed right now</strong>
                <div className="small">
                  You can still order — we start packing at {store?.opensAt?.slice(0, 5) ?? '07:00'}.
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section__head">
            <h2>Shop by aisle</h2>
          </div>
          <div className="category-grid">
            {(loading ? Array.from({ length: 8 }) : categories).map((category, index) =>
              category ? (
                <Link key={category.id} to={`/c/${category.slug}`} className="category-tile">
                  <span className="category-tile__art" aria-hidden="true">
                    {category.emoji ?? categoryEmoji(category.slug)}
                  </span>
                  <span>{category.name}</span>
                </Link>
              ) : (
                <div key={index} className="skeleton" style={{ height: 88 }} />
              )
            )}
          </div>
        </section>

        <Shelf title="Everyone's buying" products={popular} link="/search?sort=popular" loading={loading} />
        <Shelf title="Best savings today" products={deals} link="/search?sort=discount" loading={loading} />
        <Shelf title="Daily fresh" products={daily} link="/c/dairy-eggs" loading={loading} />

        <section className="section">
          <Link to="/c/spices-masalas" className="card card--tap row row--between">
            <div>
              <strong>Kerala kitchen staples</strong>
              <div className="small muted">Sambar podi, meen curry masala, Wayanad pepper</div>
            </div>
            <IconChevron size={18} />
          </Link>
        </section>

        {store && (
          <footer className="center faint" style={{ paddingTop: 8 }}>
            <div>{store.name} · {store.addressLine}</div>
            <div>{store.city}, {store.state} {store.pincode} · {store.phone}</div>
          </footer>
        )}
      </main>
    </>
  );
};
