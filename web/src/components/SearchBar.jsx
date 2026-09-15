import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money } from '../lib/format.js';
import { IconSearch, IconClose } from './Icons.jsx';

const PLACEHOLDERS = [
  'Search "matta rice"',
  'Search "coconut oil"',
  'Search "milk"',
  'Search "sambar powder"',
  'Search "banana chips"',
];

export const SearchBar = ({ autoFocus = false, initialValue = '' }) => {
  const [term, setTerm] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  // Suggestions belong to typing. Arriving on /search?q=… must not drop a
  // dropdown over the results the customer came to read.
  const [typing, setTyping] = useState(false);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const navigate = useNavigate();
  const boxRef = useRef(null);

  // Rotating placeholder — the small touch that makes the bar feel alive.
  useEffect(() => {
    if (term) return undefined;
    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % PLACEHOLDERS.length;
      setPlaceholder(PLACEHOLDERS[index]);
    }, 2800);
    return () => clearInterval(timer);
  }, [term]);

  // Debounced type-ahead, aborted when the term changes again.
  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/catalog/products/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setSuggestions(data.suggestions);
        if (typing) setOpen(true);
      } catch {
        // A failed suggestion lookup is not worth interrupting typing over.
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  useEffect(() => {
    const onClickAway = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onClickAway);
    return () => document.removeEventListener('pointerdown', onClickAway);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <form className="searchbar" onSubmit={submit} role="search">
        <span className="searchbar__icon"><IconSearch size={18} /></span>
        <input
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(event) => {
            setTyping(true);
            setTerm(event.target.value);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder={placeholder}
          aria-label="Search products"
          enterKeyHint="search"
        />
        {term && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ padding: 4, minHeight: 0 }}
            onClick={() => {
              setTerm('');
              setSuggestions([]);
              setOpen(false);
            }}
            aria-label="Clear search"
          >
            <IconClose size={16} />
          </button>
        )}
      </form>

      {open && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((item) => (
            <button
              key={item.slug}
              type="button"
              className="suggestion"
              onClick={() => {
                setOpen(false);
                navigate(`/p/${item.slug}`);
              }}
            >
              <IconSearch size={15} />
              <span className="grow truncate">
                {item.name}
                <span className="faint"> · {item.unitLabel}</span>
              </span>
              <strong className="small">{money(item.pricePaise)}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
