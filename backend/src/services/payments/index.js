import { CashProvider } from './cashProvider.js';
import { PaymobProvider } from './paymobProvider.js';

const providers = {
  cash: new CashProvider(),
  paymob: new PaymobProvider(),
};

// Maps an order's payment_method to the provider that handles it. 'card'
// (in-person card, e.g. a physical terminal) behaves exactly like cash from
// the backend's perspective — no online step, admin confirms receipt —
// while 'online' goes through the real online gateway. Adding a second
// online gateway later is a one-line addition here, not a rewrite of
// paymentController.js.
const PAYMENT_METHOD_PROVIDER = {
  cash: 'cash',
  card: 'cash', // in-person card: same "admin confirms in person" flow as cash
  online: 'paymob',
};

export function getProviderForPaymentMethod(paymentMethod) {
  const providerName = PAYMENT_METHOD_PROVIDER[paymentMethod];
  if (!providerName || !providers[providerName]) {
    throw new Error(`No payment provider configured for payment_method "${paymentMethod}".`);
  }
  return providers[providerName];
}

export function getProviderByName(name) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown payment provider "${name}".`);
  return provider;
}
