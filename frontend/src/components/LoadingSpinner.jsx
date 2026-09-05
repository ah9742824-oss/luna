export default function LoadingSpinner({ label = 'جارٍ التحميل...' }) {
  return (
    <div className="loading-wrap">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}
