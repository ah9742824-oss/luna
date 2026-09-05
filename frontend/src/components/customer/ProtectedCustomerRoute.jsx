import { Navigate, useLocation } from 'react-router-dom';
import { isCustomerLoggedIn } from '../../services/customerAuthService.js';

// Guards /profile, /orders and friends. Redirects to /login and remembers
// where the customer was trying to go so we can send them back afterward.
export default function ProtectedCustomerRoute({ children }) {
  const location = useLocation();
  if (!isCustomerLoggedIn()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
