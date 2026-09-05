import { useEffect, useState } from 'react';
import { listGallery, createGalleryImage, deleteGalleryImage } from '../../services/galleryAdminService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';
import ImageUploader from '../../components/admin/ImageUploader.jsx';

export default function AdminGallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  function load() {
    setLoading(true);
    listGallery().then(setImages).catch((err) => setToast({ type: 'error', message: err.message })).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newUrl) { setToast({ type: 'error', message: 'ارفع صورة أولاً.' }); return; }
    try {
      await createGalleryImage({ image_url: newUrl, caption, display_order: images.length });
      setNewUrl('');
      setCaption('');
      load();
      setToast({ type: 'success', message: 'تمت إضافة الصورة.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  async function handleDelete() {
    try {
      await deleteGalleryImage(confirmId);
      setConfirmId(null);
      load();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  return (
    <div>
      <h1>معرض الصور</h1>

      <div className="card checkout-section" style={{ maxWidth: 500, marginBottom: 24 }}>
        <h3>إضافة صورة جديدة</h3>
        <form onSubmit={handleAdd}>
          <ImageUploader purpose="gallery" value={newUrl} onChange={setNewUrl} label="الصورة" />
          <div className="form-group">
            <label>وصف الصورة (اختياري)</label>
            <input className="form-control" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" type="submit">إضافة</button>
        </form>
      </div>

      {loading ? <LoadingSpinner /> : images.length === 0 ? (
        <div className="empty-state"><p>لا توجد صور في المعرض بعد.</p></div>
      ) : (
        <div className="gallery-admin-grid">
          {images.map((img) => (
            <div key={img.id} className="card gallery-admin-item">
              <img src={img.image_url} alt={img.caption || ''} />
              {img.caption && <p>{img.caption}</p>}
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(img.id)}>حذف</button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!confirmId} title="حذف الصورة" message="هل تريد حذف هذه الصورة من المعرض؟" onConfirm={handleDelete} onCancel={() => setConfirmId(null)} />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
