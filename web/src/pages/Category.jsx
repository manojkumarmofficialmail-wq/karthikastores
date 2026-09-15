import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PageBar } from '../components/TopBar.jsx';
import { ProductBrowser } from '../components/ProductBrowser.jsx';

export const CategoryPage = () => {
  const { slug } = useParams();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/catalog/categories').then((data) => setCategories(data.categories)).catch(() => {});
  }, []);

  const current = categories.find((category) => category.slug === slug);

  return (
    <>
      <PageBar title={current?.name ?? 'Aisle'} />
      <main className="page">
        <div className="scroller" style={{ marginBottom: 12 }}>
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/c/${category.slug}`}
              className={`chip ${category.slug === slug ? 'is-active' : ''}`}
            >
              <span aria-hidden="true">{category.emoji}</span>
              {category.name}
            </Link>
          ))}
        </div>

        {current?.description && <p className="faint" style={{ marginBottom: 12 }}>{current.description}</p>}

        <ProductBrowser key={slug} category={slug} categories={categories} />
      </main>
    </>
  );
};
