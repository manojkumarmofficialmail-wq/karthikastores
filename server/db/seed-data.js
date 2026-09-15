/**
 * Seed catalogue for Karthika Stores — a provision shop on the Thrissur Round
 * in Kerala. Prices are in paise and reflect typical 2024-25 neighbourhood
 * shop rates; `mrp` is the printed price so the app can show a saving.
 */

export const store = {
  name: 'Karthika Stores',
  tagline: 'Your neighbourhood provision shop — free delivery within 5 km',
  phone: '+914872334455',
  addressLine: '24/586, Shornur Road, Near Thrissur Round East',
  city: 'Thrissur',
  state: 'Kerala',
  pincode: '680001',
  latitude: 10.5276,
  longitude: 76.2144,
  opensAt: '07:00',
  closesAt: '21:30',
  freeDeliveryRadiusKm: 5,
  maxDeliveryRadiusKm: 5,
  minOrderPaise: 9900, // ₹99
  basePrepMinutes: 20,
  minutesPerKm: 5,
  // The shop's own UPI handle — replace it with the real one from the
  // dashboard (Store -> Settings -> UPI) before taking live orders. Every
  // rupee scanned goes straight to whichever account this resolves to.
  upiVpa: process.env.SEED_UPI_VPA || 'karthikastores@okicici',
  upiPayeeName: process.env.SEED_UPI_PAYEE || 'Karthika Stores',
};

/**
 * One free band today. A second paid band can be switched on from the admin
 * dashboard without touching code — quoteDelivery() picks the first band whose
 * max_distance_km covers the customer.
 */
export const deliveryZones = [
  { name: 'Free delivery zone', maxDistanceKm: 5, deliveryFeePaise: 0, minOrderPaise: 9900, etaMinutes: 45 },
];

/** Road distance from the shop is shown next to each area for reference. */
export const pincodes = [
  { pincode: '680001', area: 'Thrissur Round / Shornur Road', latitude: 10.5276, longitude: 76.2144 },
  { pincode: '680002', area: 'Puzhakkal', latitude: 10.548, longitude: 76.193 },
  { pincode: '680003', area: 'Chembukkavu', latitude: 10.537, longitude: 76.22 },
  { pincode: '680004', area: 'Ayyanthole', latitude: 10.518, longitude: 76.198 },
  { pincode: '680005', area: 'Ollur', latitude: 10.453, longitude: 76.245 },
  { pincode: '680006', area: 'Poothole', latitude: 10.525, longitude: 76.195 },
  { pincode: '680007', area: 'Kuriachira', latitude: 10.51, longitude: 76.18 },
  { pincode: '680011', area: 'Ramavarmapuram', latitude: 10.542, longitude: 76.208 },
  { pincode: '680012', area: 'Viyyur', latitude: 10.548, longitude: 76.21 },
  { pincode: '680020', area: 'Patturaikkal', latitude: 10.532, longitude: 76.189 },
  { pincode: '680022', area: 'Mannuthy', latitude: 10.548, longitude: 76.279 },
  { pincode: '680026', area: 'Koorkenchery', latitude: 10.501, longitude: 76.208 },
  { pincode: '680121', area: 'Peramangalam', latitude: 10.58, longitude: 76.18 },
  { pincode: '680651', area: 'Kandassankadavu', latitude: 10.42, longitude: 76.14 },
].map((p) => ({ ...p, city: 'Thrissur', state: 'Kerala' }));

export const categories = [
  { name: 'Rice & Grains', slug: 'rice-grains', emoji: '🌾', sortOrder: 10, description: 'Matta, jaya, basmati, wheat and millets' },
  { name: 'Pulses & Dals', slug: 'pulses-dals', emoji: '🫘', sortOrder: 20, description: 'Toor, urad, moong, chana and more' },
  { name: 'Spices & Masalas', slug: 'spices-masalas', emoji: '🌶️', sortOrder: 30, description: 'Whole and ground spices, curry powders' },
  { name: 'Oils & Ghee', slug: 'oils-ghee', emoji: '🫗', sortOrder: 40, description: 'Coconut, gingelly, sunflower oil and ghee' },
  { name: 'Dairy & Eggs', slug: 'dairy-eggs', emoji: '🥛', sortOrder: 50, description: 'Milk, curd, butter, paneer and eggs' },
  { name: 'Fruits & Vegetables', slug: 'fruits-vegetables', emoji: '🥬', sortOrder: 60, description: 'Fresh from the Thrissur market every morning' },
  { name: 'Bakery & Breads', slug: 'bakery', emoji: '🍞', sortOrder: 70, description: 'Bread, buns and rusk' },
  { name: 'Snacks & Namkeen', slug: 'snacks-namkeen', emoji: '🍪', sortOrder: 80, description: 'Banana chips, mixture, biscuits' },
  { name: 'Beverages', slug: 'beverages', emoji: '☕', sortOrder: 90, description: 'Tea, coffee, health drinks and juices' },
  { name: 'Cleaning & Household', slug: 'household', emoji: '🧼', sortOrder: 100, description: 'Detergents, dishwash and daily essentials' },
  { name: 'Personal Care', slug: 'personal-care', emoji: '🧴', sortOrder: 110, description: 'Soaps, shampoo, toothpaste and hair oil' },
  { name: 'Pooja Essentials', slug: 'pooja-essentials', emoji: '🪔', sortOrder: 120, description: 'Lamp oil, wicks, camphor and agarbatti' },
];

/**
 * [category slug, name, brand, unit, pricePaise, mrpPaise, stock, popular, tags]
 */
const rows = [
  // --- Rice & Grains ---
  ['rice-grains', 'Kerala Matta Rice', 'Nirapara', '5 kg', 38500, 42000, 60, true, ['rice', 'matta', 'staple']],
  ['rice-grains', 'Jaya Rice', 'Pavizham', '5 kg', 34500, 37500, 45, true, ['rice', 'jaya']],
  ['rice-grains', 'Basmati Rice Classic', 'India Gate', '1 kg', 14500, 16500, 38, false, ['rice', 'basmati', 'biryani']],
  ['rice-grains', 'Idli Rice', 'Double Horse', '5 kg', 33000, 36000, 30, false, ['rice', 'idli', 'breakfast']],
  ['rice-grains', 'Whole Wheat Atta', 'Aashirvaad', '5 kg', 27500, 29500, 42, true, ['atta', 'wheat', 'chapati']],
  ['rice-grains', 'Ragi Flour', 'Double Horse', '500 g', 7500, 8500, 25, false, ['ragi', 'millet', 'healthy']],
  ['rice-grains', 'Rava / Semolina', 'Nirapara', '500 g', 4200, 4800, 40, false, ['rava', 'upma']],
  ['rice-grains', 'Roasted Rice Powder (Puttu Podi)', 'Brahmins', '1 kg', 8800, 9500, 35, true, ['puttu', 'breakfast']],

  // --- Pulses & Dals ---
  ['pulses-dals', 'Toor Dal', 'Pavizham', '1 kg', 16500, 18000, 50, true, ['dal', 'sambar', 'toor']],
  ['pulses-dals', 'Urad Dal (White, Whole)', 'Double Horse', '500 g', 9500, 10500, 34, false, ['dal', 'urad', 'dosa']],
  ['pulses-dals', 'Moong Dal', 'Nirapara', '500 g', 8200, 9000, 36, false, ['dal', 'moong']],
  ['pulses-dals', 'Chana Dal', 'Pavizham', '500 g', 6800, 7500, 40, false, ['dal', 'chana']],
  ['pulses-dals', 'Green Gram (Cherupayar)', 'Double Horse', '1 kg', 15500, 17000, 28, true, ['payar', 'gram', 'kerala']],
  ['pulses-dals', 'Black Chana (Kadala)', 'Nirapara', '1 kg', 13500, 14500, 32, true, ['kadala', 'puttu']],
  ['pulses-dals', 'Rajma Red Kidney Beans', 'Tata Sampann', '500 g', 11000, 12500, 20, false, ['rajma', 'beans']],
  ['pulses-dals', 'Groundnut (Raw)', 'Local', '500 g', 7800, 8500, 26, false, ['peanut', 'groundnut']],

  // --- Spices & Masalas ---
  ['spices-masalas', 'Chilli Powder', 'Eastern', '500 g', 16500, 18000, 44, true, ['masala', 'chilli', 'mulaku']],
  ['spices-masalas', 'Turmeric Powder', 'Eastern', '250 g', 6200, 7000, 48, true, ['masala', 'manjal', 'turmeric']],
  ['spices-masalas', 'Coriander Powder', 'Eastern', '500 g', 11500, 12500, 40, false, ['masala', 'malli']],
  ['spices-masalas', 'Sambar Powder', 'Eastern', '200 g', 6800, 7500, 46, true, ['masala', 'sambar']],
  ['spices-masalas', 'Fish Curry Masala (Meen Curry)', 'Eastern', '200 g', 7200, 8000, 30, true, ['masala', 'fish', 'kerala']],
  ['spices-masalas', 'Garam Masala', 'Everest', '100 g', 6500, 7200, 28, false, ['masala', 'garam']],
  ['spices-masalas', 'Black Pepper (Whole)', 'Local Estate', '100 g', 9500, 10500, 25, true, ['pepper', 'kurumulaku', 'wayanad']],
  ['spices-masalas', 'Cardamom (Green, Small)', 'Idukki Estate', '50 g', 24500, 27000, 14, false, ['elakka', 'cardamom']],
  ['spices-masalas', 'Mustard Seeds', 'Local', '200 g', 4200, 4800, 42, false, ['kaduku', 'tempering']],
  ['spices-masalas', 'Cumin Seeds (Jeerakam)', 'Local', '200 g', 8800, 9600, 30, false, ['jeera', 'cumin']],
  ['spices-masalas', 'Fenugreek Seeds (Uluva)', 'Local', '200 g', 3600, 4200, 33, false, ['uluva', 'fenugreek']],
  ['spices-masalas', 'Asafoetida (Kayam)', 'LG', '50 g', 5500, 6000, 22, false, ['hing', 'kayam']],
  ['spices-masalas', 'Tamarind (Seedless)', 'Local', '500 g', 12500, 13500, 24, false, ['puli', 'tamarind']],
  ['spices-masalas', 'Rock Salt / Table Salt', 'Tata', '1 kg', 2800, 3200, 60, true, ['salt', 'uppu']],

  // --- Oils & Ghee ---
  ['oils-ghee', 'Coconut Oil', 'KLF Nirmal', '1 L', 32500, 35500, 38, true, ['oil', 'coconut', 'velichenna']],
  ['oils-ghee', 'Coconut Oil Pouch', 'Kera', '500 ml', 16500, 18000, 30, false, ['oil', 'coconut']],
  ['oils-ghee', 'Sunflower Oil', 'Fortune', '1 L', 14500, 16000, 44, true, ['oil', 'sunflower']],
  ['oils-ghee', 'Gingelly / Sesame Oil', 'Idhayam', '500 ml', 18500, 20000, 22, false, ['oil', 'sesame', 'ellenna']],
  ['oils-ghee', 'Pure Cow Ghee', 'Milma', '500 ml', 32500, 35000, 26, true, ['ghee', 'neyy', 'milma']],
  ['oils-ghee', 'Vanaspati', 'Dalda', '1 kg', 16500, 18000, 16, false, ['vanaspati', 'baking']],

  // --- Dairy & Eggs ---
  ['dairy-eggs', 'Milma Toned Milk', 'Milma', '500 ml', 2600, 2800, 80, true, ['milk', 'milma', 'daily']],
  ['dairy-eggs', 'Milma Curd', 'Milma', '400 g', 3000, 3200, 55, true, ['curd', 'thairu']],
  ['dairy-eggs', 'Table Butter', 'Amul', '100 g', 6200, 6500, 34, false, ['butter', 'amul']],
  ['dairy-eggs', 'Fresh Paneer', 'Milma', '200 g', 8500, 9000, 18, false, ['paneer', 'cottage cheese']],
  ['dairy-eggs', 'Cheese Slices', 'Amul', '100 g', 8800, 9500, 20, false, ['cheese', 'sandwich']],
  ['dairy-eggs', 'Farm Eggs', 'Local Farm', '6 pcs', 4800, 5400, 60, true, ['egg', 'mutta', 'protein']],
  ['dairy-eggs', 'Country Eggs (Naadan)', 'Local Farm', '6 pcs', 8400, 9000, 24, false, ['egg', 'naadan']],

  // --- Fruits & Vegetables ---
  ['fruits-vegetables', 'Onion (Big)', 'Farm Fresh', '1 kg', 4200, 4800, 70, true, ['onion', 'savala']],
  ['fruits-vegetables', 'Small Onion (Kunjulli)', 'Farm Fresh', '500 g', 6500, 7200, 40, true, ['shallot', 'kunjulli']],
  ['fruits-vegetables', 'Tomato', 'Farm Fresh', '1 kg', 3800, 4500, 55, true, ['tomato', 'thakkali']],
  ['fruits-vegetables', 'Potato', 'Farm Fresh', '1 kg', 3600, 4200, 60, true, ['potato', 'urulakizhangu']],
  ['fruits-vegetables', 'Carrot', 'Farm Fresh', '500 g', 3400, 4000, 38, false, ['carrot']],
  ['fruits-vegetables', 'Beans', 'Farm Fresh', '500 g', 4800, 5500, 30, false, ['beans', 'payar']],
  ['fruits-vegetables', 'Ginger', 'Farm Fresh', '250 g', 4200, 4800, 28, false, ['ginger', 'inji']],
  ['fruits-vegetables', 'Garlic', 'Farm Fresh', '250 g', 5500, 6200, 32, false, ['garlic', 'veluthulli']],
  ['fruits-vegetables', 'Green Chilli', 'Farm Fresh', '250 g', 2600, 3000, 34, false, ['chilli', 'pachamulaku']],
  ['fruits-vegetables', 'Nendran Banana', 'Farm Fresh', '1 kg', 7500, 8200, 26, true, ['banana', 'nendran', 'kerala']],
  ['fruits-vegetables', 'Robusta Banana (Pazham)', 'Farm Fresh', '1 kg', 5200, 5800, 30, false, ['banana', 'pazham']],
  ['fruits-vegetables', 'Curry Leaves', 'Farm Fresh', '100 g', 1500, 1800, 40, false, ['curry leaves', 'kariveppila']],
  ['fruits-vegetables', 'Coconut', 'Farm Fresh', '1 pc', 4500, 5000, 45, true, ['coconut', 'thenga']],

  // --- Bakery ---
  ['bakery', 'White Sandwich Bread', 'Modern', '400 g', 4500, 5000, 25, true, ['bread', 'breakfast']],
  ['bakery', 'Brown Bread', 'Modern', '400 g', 5200, 5600, 18, false, ['bread', 'brown', 'healthy']],
  ['bakery', 'Milk Bun (6 pcs)', 'Local Bakery', '6 pcs', 3500, 4000, 20, false, ['bun', 'bakery']],
  ['bakery', 'Rusk Toast', 'Britannia', '300 g', 5500, 6000, 22, false, ['rusk', 'tea time']],

  // --- Snacks ---
  ['snacks-namkeen', 'Kerala Banana Chips', 'Local Made', '250 g', 9500, 10500, 35, true, ['chips', 'upperi', 'kerala']],
  ['snacks-namkeen', 'Jackfruit Chips', 'Local Made', '250 g', 14500, 16000, 18, false, ['chips', 'chakka']],
  ['snacks-namkeen', 'Kerala Mixture', 'Local Made', '250 g', 8500, 9500, 28, true, ['mixture', 'namkeen']],
  ['snacks-namkeen', 'Murukku', 'Local Made', '200 g', 7500, 8200, 24, false, ['murukku', 'snack']],
  ['snacks-namkeen', 'Marie Gold Biscuits', 'Britannia', '250 g', 3500, 4000, 48, true, ['biscuit', 'tea time']],
  ['snacks-namkeen', 'Good Day Cashew Cookies', 'Britannia', '200 g', 4000, 4500, 40, false, ['biscuit', 'cookies']],
  ['snacks-namkeen', 'Parle-G', 'Parle', '250 g', 3000, 3200, 55, false, ['biscuit', 'classic']],
  ['snacks-namkeen', 'Tapioca Chips (Kappa)', 'Local Made', '250 g', 8800, 9500, 16, false, ['chips', 'kappa']],

  // --- Beverages ---
  ['beverages', 'Tea Dust', 'Kannan Devan', '500 g', 26500, 28500, 34, true, ['tea', 'chaya', 'munnar']],
  ['beverages', 'Green Tea Bags', 'Lipton', '25 bags', 15500, 17000, 16, false, ['tea', 'green tea']],
  ['beverages', 'Filter Coffee Powder', 'Bru', '200 g', 14500, 15500, 24, true, ['coffee', 'filter']],
  ['beverages', 'Instant Coffee', 'Nescafe', '50 g', 18500, 20000, 20, false, ['coffee', 'instant']],
  ['beverages', 'Horlicks Classic Malt', 'Horlicks', '500 g', 26500, 28500, 18, false, ['health drink', 'malt']],
  ['beverages', 'Boost', 'Boost', '450 g', 24500, 26500, 15, false, ['health drink']],
  ['beverages', 'Tender Coconut Water', 'Local', '200 ml', 3500, 4000, 22, false, ['drink', 'karikku']],

  // --- Household ---
  ['household', 'Detergent Powder', 'Surf Excel', '1 kg', 14500, 16000, 36, true, ['detergent', 'washing']],
  ['household', 'Detergent Bar', 'Rin', '250 g', 2200, 2500, 50, false, ['detergent', 'bar']],
  ['household', 'Dishwash Gel', 'Vim', '500 ml', 11500, 12500, 30, true, ['dishwash', 'kitchen']],
  ['household', 'Dishwash Bar', 'Vim', '300 g', 3500, 4000, 44, false, ['dishwash', 'bar']],
  ['household', 'Floor Cleaner', 'Lizol', '500 ml', 12500, 13500, 22, false, ['cleaner', 'floor']],
  ['household', 'Toilet Cleaner', 'Harpic', '500 ml', 10500, 11500, 24, false, ['cleaner', 'toilet']],
  ['household', 'Garbage Bags (Medium)', 'Local', '30 pcs', 8500, 9500, 26, false, ['garbage', 'bags']],
  ['household', 'Coconut Fibre Broom', 'Local', '1 pc', 12500, 14000, 14, false, ['broom', 'chooral']],
  ['household', 'Mosquito Repellent Refill', 'Good Knight', '45 ml', 7800, 8500, 28, false, ['mosquito', 'repellent']],

  // --- Personal Care ---
  ['personal-care', 'Bathing Soap', 'Medimix', '125 g', 4500, 5000, 45, true, ['soap', 'ayurvedic']],
  ['personal-care', 'Sandal Soap', 'Mysore Sandal', '125 g', 6500, 7000, 30, false, ['soap', 'sandal']],
  ['personal-care', 'Shampoo Bottle', 'Clinic Plus', '175 ml', 11000, 12000, 26, false, ['shampoo', 'hair']],
  ['personal-care', 'Coconut Hair Oil', 'Parachute', '250 ml', 8500, 9200, 34, true, ['hair oil', 'coconut']],
  ['personal-care', 'Toothpaste', 'Colgate', '150 g', 9500, 10500, 38, true, ['toothpaste', 'dental']],
  ['personal-care', 'Toothbrush (2 pack)', 'Colgate', '2 pcs', 6500, 7500, 24, false, ['toothbrush']],
  ['personal-care', 'Talcum Powder', 'Ponds', '100 g', 6800, 7500, 20, false, ['powder', 'talc']],
  ['personal-care', 'Handwash Refill', 'Dettol', '675 ml', 15500, 17000, 18, false, ['handwash', 'hygiene']],

  // --- Pooja ---
  ['pooja-essentials', 'Lamp Oil (Vilakku Enna)', 'Local', '500 ml', 12500, 13500, 24, true, ['pooja', 'lamp', 'oil']],
  ['pooja-essentials', 'Cotton Wicks (Thiri)', 'Local', '50 pcs', 2500, 3000, 40, false, ['pooja', 'wick']],
  ['pooja-essentials', 'Camphor (Karpooram)', 'Mangalam', '50 g', 6500, 7200, 28, false, ['pooja', 'camphor']],
  ['pooja-essentials', 'Agarbatti Sticks', 'Cycle', '100 sticks', 5500, 6000, 32, true, ['pooja', 'incense']],
  ['pooja-essentials', 'Sandal Paste (Chandanam)', 'Local', '50 g', 4500, 5000, 18, false, ['pooja', 'sandal']],
  ['pooja-essentials', 'Kumkum & Turmeric Set', 'Local', '1 set', 3500, 4000, 20, false, ['pooja', 'kumkum']],
];

export const products = rows.map(
  ([categorySlug, name, brand, unitLabel, pricePaise, mrpPaise, stockQty, isPopular, tags]) => ({
    categorySlug,
    name,
    brand,
    unitLabel,
    pricePaise,
    mrpPaise,
    stockQty,
    isPopular,
    tags,
    description: `${name} — ${unitLabel}${brand ? ` from ${brand}` : ''}. Packed fresh at Karthika Stores.`,
  })
);
