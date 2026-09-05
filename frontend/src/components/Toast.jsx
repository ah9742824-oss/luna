export default function Toast({ message, type = 'success', onClose }) {
  if (!message) return null;
  return (
    <div className={`toast ${type}`} onClick={onClose} role="status">
      {message}
    </div>
  );
}
