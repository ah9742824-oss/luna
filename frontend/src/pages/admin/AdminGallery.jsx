import { useEffect, useState } from 'react';
import {
  listGallery,
  createGalleryImage,
  updateGalleryVisibility,
  reorderGallery,
  deleteGalleryImage,
} from '../../services/galleryAdminService.js';
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
  const [savingId, setSavingId] = useState(null);

  function load() {
    setLoading(true);

    listGallery()
      .then(setImages)
      .catch((err) =>
        setToast({ type: 'error', message: err.message })
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();

    if (!newUrl) {
      setToast({
        type: 'error',
        message: 'ارفع صورة أولاً.',
      });
      return;
    }

    try {
      await createGalleryImage({
        image_url: newUrl,
        caption,
        display_order: images.length,
      });

      setNewUrl('');
      setCaption('');
      load();

      setToast({
        type: 'success',
        message: 'تمت إضافة الصورة.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message,
      });
    }
  }

  async function handleToggleVisibility(img) {
    try {
      setSavingId(img.id);

      await updateGalleryVisibility(
        img.id,
        !img.is_visible
      );

      setImages((current) =>
        current.map((item) =>
          item.id === img.id
            ? { ...item, is_visible: !item.is_visible }
            : item
        )
      );

      setToast({
        type: 'success',
        message: img.is_visible
          ? 'تم إخفاء الصورة من المعرض.'
          : 'تم إظهار الصورة في المعرض.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message,
      });
    } finally {
      setSavingId(null);
    }
  }

  async function moveImage(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= images.length) {
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const updated = reordered.map((item, position) => ({
      ...item,
      display_order: position,
    }));

    setImages(updated);

    try {
      await reorderGallery(
        updated.map((item) => ({
          id: item.id,
          display_order: item.display_order,
        }))
      );
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message,
      });

      load();
    }
  }

  async function handleDelete() {
    try {
      await deleteGalleryImage(confirmId);
      setConfirmId(null);
      load();

      setToast({
        type: 'success',
        message: 'تم حذف الصورة.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message,
      });
    }
  }

  return (
    <div>
      <h1>معرض الصور</h1>

      <div
        className="card admin-form-card"
        style={{ maxWidth: 500, marginBottom: 24 }}
      >
        <h3>إضافة صورة جديدة</h3>

        <form onSubmit={handleAdd}>
          <ImageUploader
            purpose="gallery"
            value={newUrl}
            onChange={setNewUrl}
            label="الصورة"
          />

          <div className="form-group">
            <label>وصف الصورة (اختياري)</label>

            <input
              className="form-control"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary btn-sm"
            type="submit"
          >
            إضافة
          </button>
        </form>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : images.length === 0 ? (
        <div className="empty-state">
          <p>لا توجد صور في المعرض بعد.</p>
        </div>
      ) : (
        <div className="gallery-admin-grid">
          {images.map((img, index) => (
            <div
              key={img.id}
              className={`card gallery-admin-item ${
                img.is_visible ? '' : 'gallery-item-hidden'
              }`}
            >
              <img
                src={img.image_url}
                alt={img.caption || ''}
              />

              <div className="gallery-admin-status">
                {img.is_visible ? (
                  <span>✓ ظاهرة للزوار</span>
                ) : (
                  <span>○ مخفية عن الزوار</span>
                )}
              </div>

              {img.caption && <p>{img.caption}</p>}

              <div className="gallery-admin-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => moveImage(index, -1)}
                  disabled={index === 0}
                  title="تحريك لأعلى"
                >
                  ↑
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => moveImage(index, 1)}
                  disabled={index === images.length - 1}
                  title="تحريك لأسفل"
                >
                  ↓
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => handleToggleVisibility(img)}
                  disabled={savingId === img.id}
                >
                  {savingId === img.id
                    ? 'جارٍ...'
                    : img.is_visible
                      ? 'إخفاء'
                      : 'إظهار'}
                </button>

                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => setConfirmId(img.id)}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title="حذف الصورة"
        message="هل تريد حذف هذه الصورة من المعرض؟"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
