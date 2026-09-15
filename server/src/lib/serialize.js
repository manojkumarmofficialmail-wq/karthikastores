/** Row -> API shape mappers. Keeps camelCase JSON out of the SQL layer. */

export const serializeCategory = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  emoji: row.emoji,
  imageUrl: row.image_url,
  sortOrder: row.sort_order,
  productCount: row.product_count !== undefined ? Number(row.product_count) : undefined,
});

export const serializeProduct = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  brand: row.brand,
  description: row.description,
  unitLabel: row.unit_label,
  pricePaise: row.price_paise,
  mrpPaise: row.mrp_paise,
  discountPercent:
    row.mrp_paise > row.price_paise
      ? Math.round(((row.mrp_paise - row.price_paise) / row.mrp_paise) * 100)
      : 0,
  imageUrl: row.image_url,
  stockQty: row.stock_qty,
  inStock: row.stock_qty > 0,
  maxPerOrder: Math.min(row.max_per_order ?? 20, row.stock_qty ?? 0),
  isPopular: row.is_popular,
  soldCount: row.sold_count,
  tags: row.tags ?? [],
  isActive: row.is_active,
  category: row.category_id
    ? {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        emoji: row.category_emoji,
      }
    : undefined,
});

export const serializeAddress = (row) => ({
  id: row.id,
  label: row.label,
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  line1: row.line1,
  line2: row.line2,
  landmark: row.landmark,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  isDefault: row.is_default,
});

export const serializeUser = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  role: row.role,
  preferences: row.preferences ?? {},
  createdAt: row.created_at,
});

export const serializeStore = (row) => ({
  name: row.name,
  tagline: row.tagline,
  phone: row.phone,
  addressLine: row.address_line,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  opensAt: row.opens_at,
  closesAt: row.closes_at,
  freeDeliveryRadiusKm: Number(row.free_delivery_radius_km),
  maxDeliveryRadiusKm: Number(row.max_delivery_radius_km),
  minOrderPaise: row.min_order_paise,
  basePrepMinutes: row.base_prep_minutes,
  acceptsPayLater: row.accepts_pay_later,
  // The VPA is the handle printed on the counter QR — public by design. It is
  // sent so the payment screen can show "paying to …" next to the code.
  upiVpa: row.upi_vpa ?? null,
  upiPayeeName: row.upi_payee_name ?? null,
  acceptsUpiQr: row.accepts_upi_qr ?? false,
});

export const serializeOrderItem = (row) => ({
  id: row.id,
  productId: row.product_id,
  name: row.product_name,
  unitLabel: row.unit_label,
  imageUrl: row.image_url,
  unitPricePaise: row.unit_price_paise,
  mrpPaise: row.mrp_paise,
  quantity: row.quantity,
  lineTotalPaise: row.line_total_paise,
});

export const serializeOrder = (row, items = [], history = []) => ({
  id: row.id,
  orderNumber: row.order_number,
  status: row.status,
  fulfilment: row.fulfilment,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  addressLine: row.address_line,
  landmark: row.landmark,
  city: row.city,
  pincode: row.pincode,
  distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  etaMinutes: row.eta_minutes,
  slotStart: row.slot_start,
  slotEnd: row.slot_end,
  customerNote: row.customer_note,
  subtotalPaise: row.subtotal_paise,
  savingsPaise: row.savings_paise,
  deliveryFeePaise: row.delivery_fee_paise,
  totalPaise: row.total_paise,
  placedAt: row.placed_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  cancelReason: row.cancel_reason,
  itemCount: row.item_count !== undefined ? Number(row.item_count) : items.length,
  customer: row.customer_name
    ? { id: row.user_id, name: row.customer_name, phone: row.customer_phone }
    : undefined,
  items: items.map(serializeOrderItem),
  history: history.map((h) => ({
    status: h.status,
    note: h.note,
    at: h.created_at,
  })),
});
