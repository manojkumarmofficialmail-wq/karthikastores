import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { serializeCategory, serializeProduct } from '../lib/serialize.js';
import { validate } from '../middleware/validate.js';

export const catalogRouter = Router();

const PRODUCT_COLUMNS = `
  p.id, p.name, p.slug, p.brand, p.description, p.unit_label, p.price_paise, p.mrp_paise,
  p.image_url, p.stock_qty, p.max_per_order, p.is_popular, p.is_active, p.sold_count, p.tags,
  c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.emoji AS category_emoji
`;

catalogRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.*, count(p.id) FILTER (WHERE p.is_active) AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        WHERE c.is_active
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`
    );
    res.json({ categories: rows.map(serializeCategory) });
  })
);

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  minPricePaise: z.coerce.number().int().min(0).optional(),
  maxPricePaise: z.coerce.number().int().min(0).optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'discount', 'newest', 'name']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

const SORT_SQL = {
  popular: 'p.is_popular DESC, p.sold_count DESC, p.name ASC',
  price_asc: 'p.price_paise ASC, p.name ASC',
  price_desc: 'p.price_paise DESC, p.name ASC',
  discount: '(p.mrp_paise - p.price_paise)::numeric / p.mrp_paise DESC, p.name ASC',
  newest: 'p.created_at DESC',
  name: 'p.name ASC',
};

catalogRouter.get(
  '/products',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, category, minPricePaise, maxPricePaise, inStock, sort, page, limit } =
      req.validatedQuery;

    // Build the WHERE clause from placeholders only — values never touch the
    // SQL string.
    const where = ['p.is_active'];
    const params = [];
    const add = (value) => `$${params.push(value)}`;

    if (q) {
      const needle = add(`%${q}%`);
      where.push(
        `(p.name ILIKE ${needle} OR p.brand ILIKE ${needle} OR p.description ILIKE ${needle}
          OR EXISTS (SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE ${needle}))`
      );
    }
    if (category) where.push(`c.slug = ${add(category)}`);
    if (minPricePaise !== undefined) where.push(`p.price_paise >= ${add(minPricePaise)}`);
    if (maxPricePaise !== undefined) where.push(`p.price_paise <= ${add(maxPricePaise)}`);
    if (inStock === true) where.push('p.stock_qty > 0');
    if (inStock === false) where.push('p.stock_qty = 0');

    const whereSql = where.join(' AND ');
    // An exact prefix match should outrank a match buried in a description.
    const orderSql = q
      ? `(CASE WHEN p.name ILIKE ${add(`${q}%`)} THEN 0 WHEN p.name ILIKE ${add(`%${q}%`)} THEN 1 ELSE 2 END), ${SORT_SQL[sort]}`
      : SORT_SQL[sort];

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS}, count(*) OVER () AS total_count
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${add(limit)} OFFSET ${add(offset)}`,
      params
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      products: rows.map(serializeProduct),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);

/** Type-ahead suggestions for the search bar. */
catalogRouter.get(
  '/products/suggest',
  validate(z.object({ q: z.string().trim().min(1).max(60) }), 'query'),
  asyncHandler(async (req, res) => {
    const needle = `%${req.validatedQuery.q}%`;
    const { rows } = await query(
      `SELECT p.name, p.slug, p.image_url, p.price_paise, p.unit_label, c.name AS category_name
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.is_active AND (p.name ILIKE $1 OR p.brand ILIKE $1)
        ORDER BY (CASE WHEN p.name ILIKE $2 THEN 0 ELSE 1 END), p.sold_count DESC
        LIMIT 8`,
      [needle, `${req.validatedQuery.q}%`]
    );
    res.json({
      suggestions: rows.map((r) => ({
        name: r.name,
        slug: r.slug,
        imageUrl: r.image_url,
        pricePaise: r.price_paise,
        unitLabel: r.unit_label,
        categoryName: r.category_name,
      })),
    });
  })
);

catalogRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.slug = $1 AND p.is_active`,
      [req.params.slug]
    );
    if (!row) throw notFound('That item is not in our aisles');

    const { rows: related } = await query(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.category_id = $1 AND p.id <> $2 AND p.is_active
        ORDER BY p.sold_count DESC LIMIT 8`,
      [row.category_id, row.id]
    );

    res.json({ product: serializeProduct(row), related: related.map(serializeProduct) });
  })
);
