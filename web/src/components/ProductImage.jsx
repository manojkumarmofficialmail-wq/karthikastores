/**
 * Product artwork.
 *
 * The shop photographs its own stock over time; until a row has an imageUrl
 * we draw a deterministic tile from the product's name — a stable hue per
 * item plus its category emoji. It never 404s, costs no network request, and
 * works offline, which matters more here than a stock photo would.
 */
const EMOJI_BY_CATEGORY = {
  'rice-grains': '🌾',
  'pulses-dals': '🫘',
  'spices-masalas': '🌶️',
  'oils-ghee': '🫗',
  'dairy-eggs': '🥛',
  'fruits-vegetables': '🥬',
  bakery: '🍞',
  'snacks-namkeen': '🍪',
  beverages: '☕',
  household: '🧼',
  'personal-care': '🧴',
  'pooja-essentials': '🪔',
};

// A few items read much better with their own glyph than the category default.
const EMOJI_BY_KEYWORD = [
  [/egg/i, '🥚'],
  [/milk/i, '🥛'],
  [/curd|yog/i, '🍶'],
  [/butter|cheese|paneer/i, '🧈'],
  [/banana|pazham/i, '🍌'],
  [/coconut|thenga/i, '🥥'],
  [/tomato/i, '🍅'],
  [/onion|ulli/i, '🧅'],
  [/potato/i, '🥔'],
  [/carrot/i, '🥕'],
  [/chilli|mulaku/i, '🌶️'],
  [/garlic/i, '🧄'],
  [/bread|bun|rusk/i, '🍞'],
  [/tea|chaya/i, '🍵'],
  [/coffee/i, '☕'],
  [/biscuit|cookie/i, '🍪'],
  [/chips|mixture|murukku/i, '🥨'],
  [/salt/i, '🧂'],
  [/oil|ghee/i, '🫗'],
  [/soap|handwash/i, '🧼'],
  [/toothpaste|toothbrush/i, '🪥'],
  [/broom/i, '🧹'],
  [/candle|camphor|lamp/i, '🪔'],
  [/water|juice/i, '🧃'],
  [/honey/i, '🍯'],
  [/pepper/i, '🫑'],
  [/atta|flour|rava|powder/i, '🌾'],
];

const hue = (seed) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
};

const glyphFor = (name = '', categorySlug = '') => {
  const match = EMOJI_BY_KEYWORD.find(([pattern]) => pattern.test(name));
  return match?.[1] ?? EMOJI_BY_CATEGORY[categorySlug] ?? '🛒';
};

export const ProductImage = ({ product, size = '100%', rounded = 10 }) => {
  const name = product?.name ?? '';
  const categorySlug = product?.category?.slug ?? '';

  if (product?.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: rounded }}
      />
    );
  }

  const h = hue(name || categorySlug);
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size, borderRadius: rounded, display: 'block' }}
      role="img"
      aria-label={name}
    >
      <defs>
        <linearGradient id={`g${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${h} 62% 93%)`} />
          <stop offset="100%" stopColor={`hsl(${(h + 40) % 360} 58% 84%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#g${h})`} />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="44">
        {glyphFor(name, categorySlug)}
      </text>
    </svg>
  );
};

export const categoryEmoji = (slug) => EMOJI_BY_CATEGORY[slug] ?? '🛒';
