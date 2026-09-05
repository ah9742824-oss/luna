import { useLanguage } from '../context/LanguageContext.jsx';

// Mirrors EXACTLY the state machine in backend/src/services/orderStatus.js —
// these are the only statuses that actually exist; nothing here is invented.
// out_for_delivery only shows in the sequence for delivery orders (it's
// never reached for pickup/dine_in orders in the backend transition table).
const STEP_KEYS = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'];
const TRANSLATION_KEY = {
  new: 'status_new', accepted: 'status_accepted', preparing: 'status_preparing',
  ready: 'status_ready', out_for_delivery: 'status_out_for_delivery', completed: 'status_completed',
};

const STEP_INDEX = Object.fromEntries(STEP_KEYS.map((k, i) => [k, i]));
// 'delivered' is a real backend status but only exists on the path to
// 'completed' for delivery orders — treat it as reaching the same point as
// out_for_delivery's next step for display purposes.
STEP_INDEX.delivered = STEP_INDEX.out_for_delivery;

export default function OrderStatusTimeline({ status, orderType }) {
  const { t } = useLanguage();

  if (status === 'cancelled') {
    return (
      <div className="status-timeline status-timeline-cancelled">
        <span className="badge badge-unavailable">{t('status_cancelled')}</span>
      </div>
    );
  }

  const steps = STEP_KEYS.filter((k) => k !== 'out_for_delivery' || orderType === 'delivery');
  const currentIndex = STEP_INDEX[status] ?? 0;

  return (
    <div className="status-timeline" role="list">
      {steps.map((key, i) => {
        const stepIndex = STEP_INDEX[key];
        const state = stepIndex < currentIndex ? 'done' : stepIndex === currentIndex ? 'current' : 'upcoming';
        return (
          <div key={key} role="listitem" className={`status-step status-step-${state}`}>
            <span className="status-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
            <span className="status-label">{t(TRANSLATION_KEY[key])}</span>
          </div>
        );
      })}
    </div>
  );
}
