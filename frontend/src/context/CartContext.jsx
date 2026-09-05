import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as cartService from '../services/cartService.js';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => cartService.getCart());

  // Keeps the navbar cart badge and the cart page in sync even if two tabs
  // (or two components) touch the cart independently.
  useEffect(() => {
    function sync() { setItems(cartService.getCart()); }
    window.addEventListener('luna-cart-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('luna-cart-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const addItem = useCallback((product, quantity = 1) => setItems(cartService.addToCart(product, quantity)), []);
  const updateItem = useCallback((productId, quantity) => setItems(cartService.updateQuantity(productId, quantity)), []);
  const removeItem = useCallback((productId) => setItems(cartService.removeFromCart(productId)), []);
  const clear = useCallback(() => setItems(cartService.clearCart()), []);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, count, addItem, updateItem, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
