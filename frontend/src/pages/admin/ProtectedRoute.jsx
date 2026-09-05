import { Navigate } from 'react-router-dom';
import { isLoggedIn } from '../../services/authService.js';

// Guards every /admin/* route except the login page itself.
export default function ProtectedRoute({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
