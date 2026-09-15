import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money } from '../lib/format.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { PageBar } from '../components/TopBar.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { ProductCard } from '../components/ProductCard.jsx';
import { QuantityStepper } from '../components/QuantityStepper.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconTruck, IconStore, IconShield } from '../components/Icons.jsx';

export const ProductPage = () => {
  const { slug } = useParams();
  const { store } = useStoreInfo();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get(`/catalog/products/${slug}`)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <>
        <PageBar title="Item" />
        <main className="page">
          <EmptyState art="🫙" title="Not on our shelves" message={error} action={<Link className="btn btn--primary" to="/">Back to the shop</Link>} />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageBar title="Item" />
        <main className="page stack">
          <div className="skeleton" style={{ aspectRatio: '1/1', maxWidth: 320, margin: '0 auto', width: '100%' }} />
          <div className="skeleton" style={{ height: 22, width: '70%' }} />
          <div className="skeleton" style={{ height: 16, width: '40%' }} />
          <div className="skeleton" style={{ height: 48 }} />
        </main>
      </>
    );
  }

  const { product, related } = data;

  return (
    <>
      <PageBar title={product.category?.name ?? 'Item'} />
      <main className="page">
        <div style={{ maxWidth: 340, margin: '0 auto 16px', position: 'relative' }}>
          <ProductImage product={product} rounded={18} />
          {!product.inStock && <span className="out-of-stock" style={{ borderRadius: 18 }}>Out of stock</span>}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="row row--wrap" style={{ gap: 6 }}>
            {product.brand && <span className="badge">{product.brand}</span>}
            {product.isPopular && <span className="badge badge--warn">⭐ Bestseller</span>}
            {product.discountPercent > 0 && (
              <span className="badge badge--good">{product.discountPercent}% off</span>
            )}
          </div>

          <h1>{product.name}</h1>
          <p className="muted small">{product.unitLabel}</p>

          <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 24 }}>{money(product.pricePaise)}</strong>
            {product.mrpPaise > product.pricePaise && (
              <>
                <s className="muted">{money(product.mrpPaise)}</s>
                <span className="small" style={{ color: 'var(--green-600)', fontWeight: 700 }}>
                  Save {money(product.mrpPaise - product.pricePaise)}
                </span>
              </>
            )}
          </div>
          <p className="tiny muted">Inclusive of all taxes</p>

          <div className="row row--between card" style={{ marginTop: 10 }}>
            <div>
              <strong className="small">
                {product.inStock ? `In stock · ${product.stockQty} left` : 'Out of stock'}
              </strong>
              <div className="tiny muted">
                {product.inStock ? 'Packed fresh when you order' : 'Ask the shop to restock'}
              </div>
            </div>
            <QuantityStepper product={product} size="lg" />
          </div>
        </div>

        <section className="section" style={{ marginTop: 20 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <IconTruck size={18} />
              <span className="small">
                Free delivery within {store?.freeDeliveryRadiusKm ?? 5} km of the shop
              </span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <IconStore size={18} />
              <span className="small">Or collect in store — usually ready in 20 minutes</span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <IconShield size={18} />
              <span className="small">Not happy with an item? Tell the rider and we take it back.</span>
            </div>
          </div>
        </section>

        {product.description && (
          <section className="section">
            <h2 style={{ marginBottom: 6 }}>About this item</h2>
            <p className="small muted">{product.description}</p>
            {product.tags?.length > 0 && (
              <div className="row row--wrap" style={{ marginTop: 10, gap: 6 }}>
                {product.tags.map((tag) => (
                  <Link key={tag} className="chip chip--static" to={`/search?q=${encodeURIComponent(tag)}`}>
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {related.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2>More from {product.category?.name}</h2>
              <Link to={`/c/${product.category?.slug}`}>See all</Link>
            </div>
            <div className="product-grid">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
};
