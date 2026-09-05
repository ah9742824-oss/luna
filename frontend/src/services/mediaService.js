// Real upload to the backend's Supabase Storage endpoint (section 20) — no
// client-only/fake preview-as-final-image path. Converts the File to
// base64 (matches POST /api/admin/uploads' JSON body shape) and validates
// size/type client-side too, purely for fast UX feedback; the backend
// re-validates everything regardless (section 97 — never trust the client).
import { api } from './api.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('تعذرت قراءة الملف.'));
    reader.readAsDataURL(file);
  });
}

// purpose: 'product' | 'category' | 'gallery' | 'business'
export async function uploadImage(file, purpose) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة. الصيغ المسموحة: JPEG, PNG, WEBP, GIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.');
  }
  const content_base64 = await fileToBase64(file);
  const result = await api.post('/admin/uploads', { purpose, mime_type: file.type, content_base64 });
  return result.url;
}
