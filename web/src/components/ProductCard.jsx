import { Link } from 'react-router-dom';
import { money } from '../lib/format.js';
import { ProductImage } from './ProductImage.jsx';
import { QuantityStepper } from './QuantityStepper.jsx';

export const ProductCard = ({ product }) => (
  <article className="product-card">
    <Link to={`/p/${product.slug}`} className="product-card__art" aria-label={product.name}>
      <ProductImage product={product} />
      {product.discountPercent > 0 && product.inStock && (
        <span className="product-card__save">{product.discountPercent}% off</span>
      )}
      {!product.inStock && <span className="out-of-stock">Out of stock</span>}
    </Link>

    <Link to={`/p/${product.slug}`}>
      <div className="product-card__unit">{product.unitLabel}</div>
      <h3 className="product-card__name clamp-2">{product.name}</h3>
    </Link>

    <div className="product-card__foot">
      <div className="product-card__price">
        <b>{money(product.pricePaise)}</b>
        {product.mrpPaise > product.pricePaise && <s>{money(product.mrpPaise)}</s>}
      </div>
      <QuantityStepper product={product} />
    </div>
  </article>
);

export const ProductCardSkeleton = () => (
  <article className="product-card" aria-hidden="true">
    <div className="skeleton" style={{ aspectRatio: '1 / 1', borderRadius: 10 }} />
    <div className="skeleton" style={{ height: 10, width: '45%' }} />
    <div className="skeleton" style={{ height: 12 }} />
    <div className="skeleton" style={{ height: 12, width: '70%' }} />
    <div className="skeleton" style={{ height: 30, marginTop: 4 }} />
  </article>
);
