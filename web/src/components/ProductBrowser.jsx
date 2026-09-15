import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { ProductCard, ProductCardSkeleton } from './ProductCard.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Sheet } from './Sheet.jsx';
import { IconFilter } from './Icons.jsx';

const SORTS = [
  { value: 'popular', label: 'Popular' },
  { value: 'price_asc', label: 'Price ↓' },
  { value: 'price_desc', label: 'Price ↑' },
  { value: 'discount', label: 'Best saving' },
  { value: 'name', label: 'A–Z' },
];

const PAGE_SIZE = 24;

/**
 * The shared catalogue browser behind the category and search screens:
 * sort chips, a filter sheet and "load more" paging against /catalog/products.
 */
export const ProductBrowser = ({ query = '', category = '', categories = [], emptyHint }) => {
  const [filters, setFilters] = useState({
    sort: 'popular',
    category,
    minRupees: '',
    maxRupees: '',
    inStockOnly: false,
  });
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    setFilters((current) => ({ ...current, category }));
  }, [category]);

  const buildUrl = (page) => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: filters.sort });
    if (query) params.set('q', query);
    if (filters.category) params.set('category', filters.category);
    if (filters.minRupees !== '') params.set('minPricePaise', String(Number(filters.minRupees) * 100));
    if (filters.maxRupees !== '') params.set('maxPricePaise', String(Number(filters.maxRupees) * 100));
    if (filters.inStockOnly) params.set('inStock', 'true');
    return `/catalog/products?${params}`;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(buildUrl(1))
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setPagination(data.pagination);
      })
      .catch(() => !cancelled && setProducts([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters.sort, filters.category, filters.minRupees, filters.maxRupees, filters.inStockOnly]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api.get(buildUrl(pagination.page + 1));
      setProducts((current) => [...current, ...data.products]);
      setPagination(data.pagination);
    } finally {
      setLoadingMore(false);
    }
  };

  const activeFilterCount = useMemo(
    () =>
      [filters.minRupees !== '', filters.maxRupees !== '', filters.inStockOnly, Boolean(filters.category && !category)].filter(
        Boolean
      ).length,
    [filters, category]
  );

  return (
    <>
      <div className="scroller" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`chip ${activeFilterCount ? 'is-active' : ''}`}
          onClick={() => setFilterOpen(true)}
        >
          <IconFilter size={14} />
          Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </button>
        {SORTS.map((sort) => (
          <button
            key={sort.value}
            type="button"
            className={`chip ${filters.sort === sort.value ? 'is-active' : ''}`}
            onClick={() => setFilters((current) => ({ ...current, sort: sort.value }))}
          >
            {sort.label}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="faint" style={{ marginBottom: 10 }}>
          {pagination.total} item{pagination.total === 1 ? '' : 's'}
        </p>
      )}

      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          art="🔍"
          title="Nothing matched"
          message={emptyHint ?? 'Try a different spelling, or clear the filters.'}
          action={
            activeFilterCount ? (
              <button
                type="button"
                className="btn btn--outline"
                onClick={() =>
                  setFilters({ sort: 'popular', category, minRupees: '', maxRupees: '', inStockOnly: false })
                }
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {pagination.page < pagination.pages && (
            <button
              type="button"
              className="btn btn--outline btn--block"
              style={{ marginTop: 16 }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : `Load more (${pagination.total - products.length} left)`}
            </button>
          )}
        </>
      )}

      <Sheet open={filterOpen} title="Filters" onClose={() => setFilterOpen(false)}>
        {categories.length > 0 && (
          <div className="field">
            <label htmlFor="filter-category">Aisle</label>
            <select
              id="filter-category"
              value={filters.category}
              onChange={(event) => setFilters((c) => ({ ...c, category: event.target.value }))}
            >
              <option value="">All aisles</option>
              {categories.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor="filter-min">Min price (₹)</label>
            <input
              id="filter-min"
              inputMode="numeric"
              value={filters.minRupees}
              placeholder="0"
              onChange={(event) =>
                setFilters((c) => ({ ...c, minRupees: event.target.value.replace(/\D/g, '') }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="filter-max">Max price (₹)</label>
            <input
              id="filter-max"
              inputMode="numeric"
              value={filters.maxRupees}
              placeholder="500"
              onChange={(event) =>
                setFilters((c) => ({ ...c, maxRupees: event.target.value.replace(/\D/g, '') }))
              }
            />
          </div>
        </div>

        <div className="row row--wrap" style={{ marginBottom: 12 }}>
          {[
            [0, 50],
            [50, 150],
            [150, 300],
            [300, ''],
          ].map(([min, max]) => (
            <button
              key={`${min}-${max}`}
              type="button"
              className={`chip ${String(filters.minRupees) === String(min) && String(filters.maxRupees) === String(max) ? 'is-active' : ''}`}
              onClick={() => setFilters((c) => ({ ...c, minRupees: String(min), maxRupees: String(max) }))}
            >
              {max ? `₹${min} – ₹${max}` : `Over ₹${min}`}
            </button>
          ))}
        </div>

        <label className={`radio-card ${filters.inStockOnly ? 'is-active' : ''}`}>
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(event) => setFilters((c) => ({ ...c, inStockOnly: event.target.checked }))}
          />
          <div>
            <strong>In stock only</strong>
            <div className="small muted">Hide anything we have run out of</div>
          </div>
        </label>

        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn--outline grow"
            onClick={() =>
              setFilters({ sort: filters.sort, category, minRupees: '', maxRupees: '', inStockOnly: false })
            }
          >
            Reset
          </button>
          <button type="button" className="btn btn--primary grow" onClick={() => setFilterOpen(false)}>
            Show {pagination.total} item{pagination.total === 1 ? '' : 's'}
          </button>
        </div>
      </Sheet>
    </>
  );
};

export const priceLabel = (paise) => `₹${rupees(paise)}`;
