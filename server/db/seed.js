/**
 * Loads Karthika Stores with its real catalogue, delivery zones, two demo
 * accounts and a few historic orders so the admin dashboard is not empty on
 * first run. Safe to re-run: everything upserts on a natural key.
 */
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { hashPassword } from '../src/lib/password.js';
import { store, deliveryZones, pincodes, categories, products } from './seed-data.js';

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /* ------------------------------ store ----------------------------- */
    await client.query(
      `INSERT INTO store_settings (id, name, tagline, phone, address_line, city, state, pincode,
          latitude, longitude, opens_at, closes_at, free_delivery_radius_km, max_delivery_radius_km,
          min_order_paise, base_prep_minutes, minutes_per_km, upi_vpa, upi_payee_name)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, tagline = EXCLUDED.tagline, phone = EXCLUDED.phone,
         address_line = EXCLUDED.address_line, latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude, free_delivery_radius_km = EXCLUDED.free_delivery_radius_km,
         max_delivery_radius_km = EXCLUDED.max_delivery_radius_km,
         -- Re-seeding must not overwrite a real UPI ID typed into the
         -- dashboard; it only fills the field in when it is still empty.
         upi_vpa = COALESCE(store_settings.upi_vpa, EXCLUDED.upi_vpa),
         upi_payee_name = COALESCE(store_settings.upi_payee_name, EXCLUDED.upi_payee_name)`,
      [
        store.name, store.tagline, store.phone, store.addressLine, store.city, store.state,
        store.pincode, store.latitude, store.longitude, store.opensAt, store.closesAt,
        store.freeDeliveryRadiusKm, store.maxDeliveryRadiusKm, store.minOrderPaise,
        store.basePrepMinutes, store.minutesPerKm, store.upiVpa, store.upiPayeeName,
      ]
    );

    await client.query('DELETE FROM delivery_zones');
    for (const zone of deliveryZones) {
      await client.query(
        `INSERT INTO delivery_zones (name, max_distance_km, delivery_fee_paise, min_order_paise, eta_minutes)
         VALUES ($1,$2,$3,$4,$5)`,
        [zone.name, zone.maxDistanceKm, zone.deliveryFeePaise, zone.minOrderPaise, zone.etaMinutes]
      );
    }

    for (const p of pincodes) {
      await client.query(
        `INSERT INTO pincode_centroids (pincode, area, city, state, latitude, longitude)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (pincode) DO UPDATE SET area = EXCLUDED.area,
           latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
        [p.pincode, p.area, p.city, p.state, p.latitude, p.longitude]
      );
    }

    /* ---------------------------- catalogue --------------------------- */
    const categoryIds = new Map();
    for (const category of categories) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, slug, description, emoji, sort_order)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name,
           description = EXCLUDED.description, emoji = EXCLUDED.emoji,
           sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [category.name, category.slug, category.description, category.emoji, category.sortOrder]
      );
      categoryIds.set(category.slug, rows[0].id);
    }

    const productIds = [];
    for (const product of products) {
      const slug = slugify(`${product.name}-${product.unitLabel}`);
      const { rows } = await client.query(
        `INSERT INTO products (category_id, name, slug, brand, description, unit_label,
            price_paise, mrp_paise, stock_qty, is_popular, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (slug) DO UPDATE SET
           category_id = EXCLUDED.category_id, name = EXCLUDED.name, brand = EXCLUDED.brand,
           description = EXCLUDED.description, price_paise = EXCLUDED.price_paise,
           mrp_paise = EXCLUDED.mrp_paise, stock_qty = EXCLUDED.stock_qty,
           is_popular = EXCLUDED.is_popular, tags = EXCLUDED.tags, is_active = true
         RETURNING id, price_paise, mrp_paise, name, unit_label`,
        [
          categoryIds.get(product.categorySlug), product.name, slug, product.brand,
          product.description, product.unitLabel, product.pricePaise, product.mrpPaise,
          product.stockQty, product.isPopular, product.tags,
        ]
      );
      productIds.push(rows[0]);
    }

    /* ------------------------------ users ----------------------------- */
    const { rows: adminRows } = await client.query(
      `INSERT INTO users (name, phone, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'admin')
       ON CONFLICT (phone) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['Karthika Stores Admin', config.seed.adminPhone, 'admin@karthikastores.in',
       await hashPassword(config.seed.adminPassword)]
    );
    const adminId = adminRows[0].id;

    const { rows: customerRows } = await client.query(
      `INSERT INTO users (name, phone, email, password_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (phone) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['Anitha Menon', config.seed.customerPhone, 'anitha@example.com',
       await hashPassword(config.seed.customerPassword)]
    );
    const customerId = customerRows[0].id;

    await client.query(`INSERT INTO carts (user_id) VALUES ($1), ($2) ON CONFLICT DO NOTHING`, [
      adminId, customerId,
    ]);

    // Two saved addresses: one comfortably inside the 5 km radius, one that
    // deliberately falls outside it so the pickup-only path is demoable.
    await client.query(`DELETE FROM addresses WHERE user_id = $1`, [customerId]);
    const { rows: addressRows } = await client.query(
      `INSERT INTO addresses (user_id, label, contact_name, contact_phone, line1, landmark,
          city, state, pincode, latitude, longitude, is_default)
       VALUES
         ($1,'Home','Anitha Menon',$2,'Flat 3B, Vaisakh Apartments, Chembukkavu','Opposite Sree Krishna Temple','Thrissur','Kerala','680003',10.5370,76.2200,true),
         ($1,'Amma''s house','Anitha Menon',$2,'Ponnath House, Ollur','Near Ollur Church','Thrissur','Kerala','680005',10.4530,76.2450,false)
       RETURNING id`,
      [customerId, config.seed.customerPhone]
    );
    const homeAddressId = addressRows[0].id;

    /* ---------------------- a little order history --------------------- */
    const { rows: existingOrders } = await client.query(
      `SELECT count(*)::int AS count FROM orders WHERE user_id = $1`,
      [customerId]
    );

    if (existingOrders[0].count === 0) {
      const pick = (from, count) => productIds.slice(from, from + count);
      const demoOrders = [
        { status: 'delivered', fulfilment: 'delivery', method: 'upi_qr', paid: 'paid', daysAgo: 9, lines: pick(0, 4) },
        { status: 'delivered', fulfilment: 'pickup', method: 'pay_at_store', paid: 'paid', daysAgo: 4, lines: pick(20, 3) },
        { status: 'preparing', fulfilment: 'delivery', method: 'upi_qr', paid: 'paid', daysAgo: 0, lines: pick(40, 5) },
        // Sitting in the shop's verification queue on first run, so the new
        // "confirm UPI payment" screen has something real to act on.
        { status: 'awaiting_payment', fulfilment: 'pickup', method: 'upi_qr', paid: 'submitted', daysAgo: 0, lines: pick(60, 2) },
      ];

      for (const demo of demoOrders) {
        const lines = demo.lines.map((product, index) => {
          const quantity = (index % 3) + 1;
          return {
            ...product,
            quantity,
            lineTotal: product.price_paise * quantity,
          };
        });
        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const savings = lines.reduce(
          (sum, line) => sum + (line.mrp_paise - line.price_paise) * line.quantity,
          0
        );
        const placedAt = new Date(Date.now() - demo.daysAgo * 86_400_000 - 3_600_000);

        const { rows: orderRows } = await client.query(
          `INSERT INTO orders (order_number, user_id, status, fulfilment, payment_method, payment_status,
              address_id, contact_name, contact_phone, address_line, landmark, city, pincode,
              latitude, longitude, distance_km, eta_minutes, subtotal_paise, savings_paise,
              delivery_fee_paise, total_paise, placed_at, completed_at)
           VALUES ('KS-' || to_char($21::timestamptz,'YYMMDD') || '-' || nextval('order_number_seq'),
                   $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,0,$19,$21,$20)
           RETURNING id`,
          [
            customerId, demo.status, demo.fulfilment, demo.method, demo.paid,
            demo.fulfilment === 'delivery' ? homeAddressId : null,
            'Anitha Menon', config.seed.customerPhone,
            demo.fulfilment === 'delivery' ? 'Flat 3B, Vaisakh Apartments, Chembukkavu' : null,
            demo.fulfilment === 'delivery' ? 'Opposite Sree Krishna Temple' : null,
            'Thrissur', demo.fulfilment === 'delivery' ? '680003' : store.pincode,
            demo.fulfilment === 'delivery' ? 10.537 : null,
            demo.fulfilment === 'delivery' ? 76.22 : null,
            demo.fulfilment === 'delivery' ? 1.57 : null,
            demo.fulfilment === 'delivery' ? 28 : 20,
            subtotal, savings, subtotal,
            demo.status === 'delivered' ? placedAt : null,
            placedAt,
          ]
        );
        const orderId = orderRows[0].id;

        for (const line of lines) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, unit_label,
                unit_price_paise, mrp_paise, quantity, line_total_paise)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [orderId, line.id, line.name, line.unit_label, line.price_paise, line.mrp_paise,
             line.quantity, line.lineTotal]
          );
        }

        const trail =
          demo.status === 'delivered'
            ? ['confirmed', 'preparing', demo.fulfilment === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery', 'delivered']
            : demo.status === 'awaiting_payment'
              ? ['awaiting_payment']
              : ['confirmed', 'preparing'];
        for (const [index, status] of trail.entries()) {
          await client.query(
            `INSERT INTO order_status_history (order_id, status, changed_by, created_at)
             VALUES ($1,$2,$3,$4)`,
            [orderId, status, adminId, new Date(placedAt.getTime() + index * 900_000)]
          );
        }

        if (demo.method === 'upi_qr') {
          await client.query(
            `INSERT INTO payments (order_id, provider, provider_order_id, amount_paise, status,
                method_detail, upi_reference, verified_by, verified_at)
             VALUES ($1,'upi_qr',$2,$3,$4,'upi',$5,$6,$7)`,
            [
              orderId,
              `SEED${orderId.slice(0, 8).toUpperCase()}`,
              subtotal,
              demo.paid === 'paid' ? 'paid' : 'submitted',
              // A UTR-shaped reference, unique per seeded order.
              `4${orderId.replace(/\D/g, '').padEnd(11, '0').slice(0, 11)}`,
              demo.paid === 'paid' ? adminId : null,
              demo.paid === 'paid' ? placedAt : null,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');

    console.log(`[seed] ${categories.length} categories, ${products.length} products`);
    console.log(`[seed] store: ${store.name}, ${store.city} (free delivery ${store.freeDeliveryRadiusKm} km)`);
    console.log('[seed] demo logins:');
    console.log(`         admin    ${config.seed.adminPhone} / ${config.seed.adminPassword}`);
    console.log(`         customer ${config.seed.customerPhone} / ${config.seed.customerPassword}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('[seed] failed:', error.message);
  process.exit(1);
});
