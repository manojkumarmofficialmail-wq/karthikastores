import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { toast } from '../../store/ui.js';
import { Sheet } from '../../components/Sheet.jsx';
import { ProductImage } from '../../components/ProductImage.jsx';
import { IconSearch, IconPlus, IconMinus } from '../../components/Icons.jsx';

const emptyProduct = {
  categoryId: '',
  name: '',
  brand: '',
  description: '',
  unitLabel: '',
  priceRupees: '',
  mrpRupees: '',
  stockQty: '0',
  maxPerOrder: '20',
  isActive: true,
  isPopular: false,
  tags: '',
};

const toForm = (product) => ({
  categoryId: product.category?.id ?? '',
  name: product.name,
  brand: product.brand ?? '',
  description: product.description ?? '',
  unitLabel: product.unitLabel,
  priceRupees: String(product.pricePaise / 100),
  mrpRupees: String(product.mrpPaise / 100),
  stockQty: String(product.stockQty),
  maxPerOrder: String(product.maxPerOrder || 20),
  isActive: product.isActive,
  isPopular: product.isPopular,
  tags: (product.tags ?? []).join(', '),
});

export const AdminInventory = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // product | 'new'
  const [form, setForm] = useState(emptyProduct);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '60' });
      if (search.trim()) query.set('q', search.trim());
      if (categorySlug) query.set('category', categorySlug);
      const data = await api.get(`/admin/products?${query}`);
      setProducts(data.products);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [search, categorySlug]);

  useEffect(() => {
    api.get('/admin/categories').then((data) => setCategories(data.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const adjustStock = async (product, delta) => {
    try {
      const data = await api.post(`/admin/products/${product.id}/stock`, { delta });
      setProducts((current) => current.map((item) => (item.id === product.id ? data.product : item)));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const startEdit = (product) => {
    setEditing(product);
    setForm(product === 'new' ? { ...emptyProduct, categoryId: categories[0]?.id ?? '' } : toForm(product));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        categoryId: form.categoryId,
        name: form.name.trim(),
        brand: form.brand.trim(),
        description: form.description.trim(),
        unitLabel: form.unitLabel.trim(),
        pricePaise: Math.round(Number(form.priceRupees) * 100),
        mrpPaise: Math.round(Number(form.mrpRupees) * 100),
        stockQty: Number(form.stockQty),
        maxPerOrder: Number(form.maxPerOrder),
        isActive: form.isActive,
        isPopular: form.isPopular,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      };
      if (editing === 'new') await api.post('/admin/products', payload);
      else await api.patch(`/admin/products/${editing.id}`, payload);
      toast.success('Saved');
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const delist = async (product) => {
    try {
      await api.del(`/admin/products/${product.id}`);
      toast.info(`${product.name} delisted`);
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const set = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <div className="searchbar grow" style={{ margin: 0 }}>
          <span className="searchbar__icon"><IconSearch size={17} /></span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find an item"
            aria-label="Search inventory"
          />
        </div>
        <button type="button" className="btn btn--primary" onClick={() => startEdit('new')}>
          <IconPlus size={16} /> New
        </button>
      </div>

      <div className="scroller" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`chip ${categorySlug === '' ? 'is-active' : ''}`}
          onClick={() => setCategorySlug('')}
        >
          All aisles
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`chip ${categorySlug === category.slug ? 'is-active' : ''}`}
            onClick={() => setCategorySlug(category.slug)}
          >
            {category.emoji} {category.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="stack">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: '2px 12px' }}>
          {products.map((product) => (
            <div key={product.id} className="cart-line" style={{ alignItems: 'center' }}>
              <div className="cart-line__art" style={{ width: 44, height: 44 }}>
                <ProductImage product={product} />
              </div>
              <button
                type="button"
                className="grow"
                onClick={() => startEdit(product)}
                style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit' }}
              >
                <div className="small" style={{ fontWeight: 600 }}>
                  {product.name} {!product.isActive && <span className="badge badge--bad">delisted</span>}
                </div>
                <div className="tiny muted">
                  {product.unitLabel} · {money(product.pricePaise)}
                  {product.mrpPaise > product.pricePaise && ` (MRP ${money(product.mrpPaise)})`}
                </div>
              </button>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  style={{ padding: 6, minHeight: 0 }}
                  aria-label={`Reduce stock of ${product.name}`}
                  onClick={() => adjustStock(product, -1)}
                >
                  <IconMinus size={14} />
                </button>
                <span
                  className={`badge ${product.stockQty === 0 ? 'badge--bad' : product.stockQty <= 10 ? 'badge--warn' : 'badge--good'}`}
                  style={{ minWidth: 36, justifyContent: 'center' }}
                >
                  {product.stockQty}
                </span>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  style={{ padding: 6, minHeight: 0 }}
                  aria-label={`Add stock of ${product.name}`}
                  onClick={() => adjustStock(product, 1)}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="small muted center" style={{ padding: 20 }}>No items match.</p>}
        </div>
      )}

      <Sheet
        open={Boolean(editing)}
        title={editing === 'new' ? 'New item' : editing?.name}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="p-category">Aisle</label>
            <select id="p-category" value={form.categoryId} onChange={set('categoryId')} required>
              <option value="" disabled>Choose an aisle</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="p-name">Item name</label>
            <input id="p-name" value={form.name} onChange={set('name')} required minLength={2} />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="p-brand">Brand</label>
              <input id="p-brand" value={form.brand} onChange={set('brand')} />
            </div>
            <div className="field">
              <label htmlFor="p-unit">Pack size</label>
              <input id="p-unit" value={form.unitLabel} onChange={set('unitLabel')} placeholder="1 kg" required />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="p-price">Selling price (₹)</label>
              <input id="p-price" inputMode="decimal" value={form.priceRupees} onChange={set('priceRupees')} required />
            </div>
            <div className="field">
              <label htmlFor="p-mrp">MRP (₹)</label>
              <input id="p-mrp" inputMode="decimal" value={form.mrpRupees} onChange={set('mrpRupees')} required />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="p-stock">Stock on hand</label>
              <input id="p-stock" inputMode="numeric" value={form.stockQty} onChange={set('stockQty')} />
            </div>
            <div className="field">
              <label htmlFor="p-max">Max per order</label>
              <input id="p-max" inputMode="numeric" value={form.maxPerOrder} onChange={set('maxPerOrder')} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="p-tags">Search tags (comma separated)</label>
            <input id="p-tags" value={form.tags} onChange={set('tags')} placeholder="rice, matta, staple" />
          </div>

          <div className="field">
            <label htmlFor="p-desc">Description</label>
            <textarea id="p-desc" rows={2} value={form.description} onChange={set('description')} />
          </div>

          <label className={`radio-card ${form.isPopular ? 'is-active' : ''}`} style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={form.isPopular} onChange={set('isPopular')} />
            <div>
              <strong className="small">Show as a bestseller</strong>
              <div className="tiny muted">Pins it near the top of the storefront</div>
            </div>
          </label>

          <label className={`radio-card ${form.isActive ? 'is-active' : ''}`} style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} />
            <div>
              <strong className="small">Listed for sale</strong>
              <div className="tiny muted">Uncheck to hide it from customers</div>
            </div>
          </label>

          <div className="row" style={{ gap: 10 }}>
            {editing !== 'new' && (
              <button type="button" className="btn btn--danger grow" onClick={() => delist(editing)}>
                Delist
              </button>
            )}
            <button type="submit" className="btn btn--primary grow" disabled={busy}>
              {busy ? 'Saving…' : 'Save item'}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
};
