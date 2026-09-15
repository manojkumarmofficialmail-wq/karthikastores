import { query, queryOne } from '../db.js';
import { serializeProduct } from './serialize.js';

export const ensureCart = async (userId, client = null) => {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId]
  );
  return rows[0].id;
};

/**
 * The cart with live prices and stock, plus totals.
 *
 * Line prices are always read from `products` rather than remembered at
 * add-to-cart time: the customer pays today's shelf price, and a price change
 * in the admin dashboard is reflected everywhere at once.
 */
export const getCartSummary = async (userId, client = null) => {
  const run = client ? client.query.bind(client) : query;
  const cartId = await ensureCart(userId, client);

  const { rows } = await run(
    `SELECT ci.id AS cart_item_id, ci.quantity,
            p.id, p.name, p.slug, p.brand, p.description, p.unit_label, p.price_paise,
            p.mrp_paise, p.image_url, p.stock_qty, p.max_per_order, p.is_popular,
            p.is_active, p.sold_count, p.tags,
            c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
            c.emoji AS category_emoji
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN categories c ON c.id = p.category_id
      WHERE ci.cart_id = $1
      ORDER BY ci.added_at`,
    [cartId]
  );

  const items = rows.map((row) => {
    // Never let the cart promise more than the shelf holds.
    const available = row.is_active ? row.stock_qty : 0;
    const quantity = Math.min(row.quantity, available);
    return {
      cartItemId: row.cart_item_id,
      quantity,
      requestedQuantity: row.quantity,
      adjusted: quantity !== row.quantity,
      lineTotalPaise: quantity * row.price_paise,
      lineMrpPaise: quantity * row.mrp_paise,
      product: serializeProduct(row),
    };
  });

  const priced = items.filter((item) => item.quantity > 0);
  const subtotalPaise = priced.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const mrpTotalPaise = priced.reduce((sum, item) => sum + item.lineMrpPaise, 0);

  return {
    cartId,
    items,
    itemCount: priced.reduce((sum, item) => sum + item.quantity, 0),
    lineCount: priced.length,
    subtotalPaise,
    savingsPaise: mrpTotalPaise - subtotalPaise,
    hasUnavailableItems: items.some((item) => item.quantity === 0 || item.adjusted),
  };
};

export const clearCart = async (userId, client = null) => {
  const run = client ? client.query.bind(client) : query;
  await run(`DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`, [
    userId,
  ]);
};

export const findProductForCart = (productId) =>
  queryOne(
    `SELECT id, name, price_paise, stock_qty, max_per_order, is_active FROM products WHERE id = $1`,
    [productId]
  );
