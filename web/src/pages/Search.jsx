import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PageBar } from '../components/TopBar.jsx';
import { SearchBar } from '../components/SearchBar.jsx';
import { ProductBrowser } from '../components/ProductBrowser.jsx';

export const SearchPage = () => {
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/catalog/categories').then((data) => setCategories(data.categories)).catch(() => {});
  }, []);

  return (
    <>
      <PageBar title={query ? `“${query}”` : 'Search'} />
      <main className="page">
        <div style={{ marginTop: -4, marginBottom: 12 }}>
          <SearchBar autoFocus={!query} initialValue={query} />
        </div>
        <ProductBrowser
          key={query}
          query={query}
          categories={categories}
          emptyHint={`We could not find “${query}”. Ask at the counter — we may still have it.`}
        />
      </main>
    </>
  );
};
