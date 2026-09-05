import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return <LoadingSpinner />;

  const cards = [
    { label: 'عدد المنتجات', value: stats.totalProducts },
    { label: 'عدد الفئات', value: stats.totalCategories },
    { label: 'منتجات متوفرة', value: stats.availableProducts },
    { label: 'منتجات غير متوفرة', value: stats.unavailableProducts },
  ];

  return (
    <div>
      <h1>لوحة التحكم</h1>
      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="value">{c.value}</div>
            <div className="label">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
