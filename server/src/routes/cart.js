import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ensureCart, getCartSummary, clearCart, findProductForCart } from '../lib/cart.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const cartRouter = Router();
cartRouter.use(requireAuth);

const uuid = z.string().uuid('Unknown product');

const addSchema = z.object({
  productId: uuid,
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const assertAvailable = (product, quantity) => {
  if (!product || !product.is_active) throw notFound('That item is no longer available');
  if (product.stock_qty <= 0) throw badRequest(`${product.name} is out of stock`);
  if (quantity > product.stock_qty) {
    throw badRequest(`Only ${product.stock_qty} left of ${product.name}`);
  }
  if (quantity > product.max_per_order) {
    throw badRequest(`You can order at most ${product.max_per_order} of ${product.name} at a time`);
  }
};

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ cart: await getCartSummary(req.user.id) });
  })
);

/** Add to cart, or bump the quantity if the item is already in the basket. */
cartRouter.post(
  '/items',
  validate(addSchema),
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    const product = await findProductForCart(productId);
    const cartId = await ensureCart(req.user.id);

    const { rows } = await query(
      `SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cartId, productId]
    );
    const nextQuantity = (rows[0]?.quantity ?? 0) + quantity;
    assertAvailable(product, nextQuantity);

    await query(
      `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = $3`,
      [cartId, productId, nextQuantity]
    );
    res.status(201).json({ cart: await getCartSummary(req.user.id) });
  })
);

/** Set an absolute quantity; 0 removes the line. */
cartRouter.patch(
  '/items/:productId',
  validate(z.object({ quantity: z.coerce.number().int().min(0).max(50) })),
  asyncHandler(async (req, res) => {
    const productId = uuid.parse(req.params.productId);
    const { quantity } = req.body;
    const cartId = await ensureCart(req.user.id);

    if (quantity === 0) {
      await query(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
    } else {
      assertAvailable(await findProductForCart(productId), quantity);
      await query(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = $3`,
        [cartId, productId, quantity]
      );
    }
    res.json({ cart: await getCartSummary(req.user.id) });
  })
);

cartRouter.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const productId = uuid.parse(req.params.productId);
    const cartId = await ensureCart(req.user.id);
    await query(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
    res.json({ cart: await getCartSummary(req.user.id) });
  })
);

cartRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    await clearCart(req.user.id);
    res.json({ cart: await getCartSummary(req.user.id) });
  })
);

/**
 * Fold a guest's local basket into the server cart at sign-in. Quantities are
 * merged (max of the two) rather than summed, so a refresh cannot double an
 * item, and anything out of stock is silently skipped.
 */
cartRouter.post(
  '/merge',
  validate(
    z.object({
      items: z
        .array(z.object({ productId: uuid, quantity: z.coerce.number().int().min(1).max(50) }))
        .max(100),
    })
  ),
  asyncHandler(async (req, res) => {
    const cartId = await ensureCart(req.user.id);
    const skipped = [];

    for (const item of req.body.items) {
      const product = await findProductForCart(item.productId);
      if (!product?.is_active || product.stock_qty <= 0) {
        skipped.push(item.productId);
        continue;
      }
      const quantity = Math.min(item.quantity, product.stock_qty, product.max_per_order);
      await query(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id)
         DO UPDATE SET quantity = GREATEST(cart_items.quantity, EXCLUDED.quantity)`,
        [cartId, item.productId, quantity]
      );
    }

    res.json({ cart: await getCartSummary(req.user.id), skipped });
  })
);
