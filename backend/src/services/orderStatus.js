// Order status state machine (section 32). Enforced entirely server-side —
// admin UI buttons are not security (section 16), so an invalid transition
// must be rejected here even if the frontend never offers it.
const TRANSITIONS = {
  new: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [], // terminal
  cancelled: [], // terminal
};

export const ORDER_STATUSES = Object.keys(TRANSITIONS);

export function assertValidTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed) {
    throw new Error(`Unknown order status "${fromStatus}".`);
  }
  if (!ORDER_STATUSES.includes(toStatus)) {
    throw new Error(`Unknown target status "${toStatus}".`);
  }
  return allowed.includes(toStatus);
}
