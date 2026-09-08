import { Routes, Route } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ProtectedRoute from './pages/admin/ProtectedRoute.jsx';
import ProtectedCustomerRoute from './components/customer/ProtectedCustomerRoute.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';

import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import About from './pages/About.jsx';
import Gallery from './pages/Gallery.jsx';
import Contact from './pages/Contact.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderDetail from './pages/OrderDetail.jsx';

import CustomerLogin from './pages/customer/CustomerLogin.jsx';
import CustomerRegister from './pages/customer/CustomerRegister.jsx';
import ForgotPassword from './pages/customer/ForgotPassword.jsx';
import ResetPassword from './pages/customer/ResetPassword.jsx';
import CustomerProfile from './pages/customer/CustomerProfile.jsx';
import CustomerOrders from './pages/customer/CustomerOrders.jsx';

import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminForgotPassword from './pages/admin/AdminForgotPassword.jsx';
import AdminResetPassword from './pages/admin/AdminResetPassword.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminProducts from './pages/admin/AdminProducts.jsx';
import AdminCategories from './pages/admin/AdminCategories.jsx';
import AdminBusinessSettings from './pages/admin/AdminBusinessSettings.jsx';
import AdminReviews from './pages/admin/AdminReviews.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminCustomers from './pages/admin/AdminCustomers.jsx';
import AdminCoupons from './pages/admin/AdminCoupons.jsx';
import AdminGallery from './pages/admin/AdminGallery.jsx';
import AdminStaff from './pages/admin/AdminStaff.jsx';
import AdminAuditLog from './pages/admin/AdminAuditLog.jsx';

export default function App() {
  return (
    <LanguageProvider>
      <Routes>
      {/* Public website + customer experience — CartProvider is scoped here
          only (not the admin section), since the cart is a customer concept. */}
        <Route element={<CartProvider><PublicLayout /></CartProvider>}>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:id" element={<ProductDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/contact" element={<Contact />} />

        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        {/* Guest order tracking uses ?access_token=... on this same route
            (see pages/OrderDetail.jsx) — no login required. */}
        <Route path="/orders/:id" element={<OrderDetail />} />

        <Route path="/login" element={<CustomerLogin />} />
        <Route path="/register" element={<CustomerRegister />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/orders" element={<ProtectedCustomerRoute><CustomerOrders /></ProtectedCustomerRoute>} />
        <Route path="/profile" element={<ProtectedCustomerRoute><CustomerProfile /></ProtectedCustomerRoute>} />
      </Route>

      {/* Admin */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
      <Route path="/admin/reset-password" element={<AdminResetPassword />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="gallery" element={<AdminGallery />} />
        <Route path="business-settings" element={<AdminBusinessSettings />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
      </Route>
        <Route path="*" element={<div style={{ padding: 60, textAlign: 'center' }}>الصفحة غير موجودة (404)</div>} />
      </Routes>
    </LanguageProvider>
  );
}
 
