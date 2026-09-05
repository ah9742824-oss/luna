import { useState, useRef } from 'react';
import { uploadImage } from '../../services/mediaService.js';

// purpose: 'product' | 'category' | 'gallery' | 'business' — must match the
// permission the backend checks for that purpose (see mediaController.js).
export default function ImageUploader({ purpose, value, onChange, label }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const url = await uploadImage(file, purpose);
      onChange(url);
    } catch (err) {
      setError(err.message || 'تعذر رفع الصورة.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      {value && <img src={value} alt="" className="image-uploader-preview" />}
      <div className="image-uploader-row">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFile} disabled={uploading} />
        {uploading && <span className="summary-note">جارٍ الرفع...</span>}
      </div>
      <input
        className="form-control"
        placeholder="أو ألصق رابط صورة مباشرة"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 8 }}
      />
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
