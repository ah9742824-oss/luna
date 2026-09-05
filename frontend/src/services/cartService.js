// Client-side cart persistence ONLY — a convenience so the cart survives a
// page reload (section 27, 95). The prices stored here are a DISPLAY
// snapshot taken when the item was added, shown only until the Cart page's
// first live validateCart() call replaces them with real numbers from the
// backend. Nothing in this file is ever sent to the backend as a price;
// checkout only ever sends { product_id, quantity } (see orderService.js).
import { appConfig } from '../config/appConfig.js';

const STORAGE_KEY = `luna_cart_${appConfig.businessSlug}`;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('luna-cart-changed'));
  return items;
}

export function getCart() {
  return read();
}

export function addToCart(product, quantity = 1) {
  const items = read();
  const existing = items.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({
      product_id: product.id,
      name: product.name,
      name_ar: product.name_ar,
      image_url: product.image_url,
      display_price: Number(product.price),
      quantity,
    });
  }
  return write(items);
}

export function updateQuantity(productId, quantity) {
  const items = read();
  const item = items.find((i) => i.product_id === productId);
  if (!item) return items;
  if (quantity <= 0) return removeFromCart(productId);
  item.quantity = Math.min(50, Math.max(1, Math.floor(quantity)));
  return write(items);
}

export function removeFromCart(productId) {
  return write(read().filter((i) => i.product_id !== productId));
}

export function clearCart() {
  return write([]);
}

export function cartItemCount() {
  return read().reduce((sum, i) => sum + i.quantity, 0);
}
