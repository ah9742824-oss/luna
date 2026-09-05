import { useEffect, useState } from 'react';
import { useCustomerAuth } from '../../hooks/useCustomerAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';
import { updateProfile } from '../../services/customerAuthService.js';
import { listAddresses, createAddress, updateAddress, deleteAddress } from '../../services/addressService.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';

const emptyAddressForm = { label: '', recipient_name: '', phone: '', address_line: '', city: '', notes: '', is_default: false };

export default function CustomerProfile() {
  const { customer, setCustomer } = useCustomerAuth();
  const { t, lang } = useLanguage();
  useDocumentHead({ title: t('profile_title') });
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [toast, setToast] = useState(null);

  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
  const [editingId, setEditingId] = useState(null);
  const [addressError, setAddressError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => { loadAddresses(); }, []);
  function loadAddresses() {
    listAddresses().then(setAddresses).catch(() => {});
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileError('');
    setSavingProfile(true);
    try {
      const updated = await updateProfile({ name, phone: phone || undefined, email: email || undefined });
      setCustomer(updated);
      setToast({ type: 'success', message: 'تم تحديث بياناتك.' });
    } catch (err) {
      setProfileError(err.message || 'تعذر حفظ التغييرات.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddressSubmit(e) {
    e.preventDefault();
    setAddressError('');
    try {
      if (editingId) {
        await updateAddress(editingId, addressForm);
      } else {
        await createAddress(addressForm);
      }
      setAddressForm(emptyAddressForm);
      setEditingId(null);
      loadAddresses();
      setToast({ type: 'success', message: 'تم حفظ العنوان.' });
    } catch (err) {
      setAddressError(err.message || 'تعذر حفظ العنوان.');
    }
  }

  function handleEditAddress(addr) {
    setEditingId(addr.id);
    setAddressForm({
      label: addr.label || '', recipient_name: addr.recipient_name, phone: addr.phone,
      address_line: addr.address_line, city: addr.city || '', notes: addr.notes || '', is_default: addr.is_default,
    });
  }

  async function handleDeleteAddress() {
    try {
      await deleteAddress(confirmDeleteId);
      setConfirmDeleteId(null);
      loadAddresses();
    } catch (err) {
      setToast({ type: 'error', message: err.message || (lang === 'ar' ? 'تعذر حذف العنوان.' : 'Could not delete the address.') });
    }
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('profile_title')}</h1>

        <div className="card checkout-section" style={{ marginBottom: 24 }}>
          <h3>{t('profile_personal_data')}</h3>
          {profileError && <div className="error-banner">{profileError}</div>}
          <form onSubmit={handleProfileSubmit}>
            <div className="form-group"><label>{lang === 'ar' ? 'الاسم' : 'Name'}</label><input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'رقم الهاتف' : 'Phone number'}</label><input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label><input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={savingProfile}>{savingProfile ? t('common_loading') : t('common_save')}</button>
          </form>
        </div>

        <div className="card checkout-section">
          <h3>{t('profile_addresses')}</h3>
          {addresses.length === 0 ? (
            <p className="summary-note">{t('profile_no_addresses')}</p>
          ) : (
            addresses.map((a) => (
              <div key={a.id} className="summary-row" style={{ alignItems: 'center' }}>
                <span>{a.label ? `${a.label} — ` : ''}{a.address_line}{a.is_default ? (lang === 'ar' ? ' (افتراضي)' : ' (default)') : ''}</span>
                <span className="table-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => handleEditAddress(a)}>{t('common_edit')}</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteId(a.id)}>{t('common_delete')}</button>
                </span>
              </div>
            ))
          )}

          <h3 style={{ marginTop: 24 }}>{editingId ? t('profile_edit_address') : t('profile_add_address')}</h3>
          {addressError && <div className="error-banner">{addressError}</div>}
          <form onSubmit={handleAddressSubmit}>
            <div className="form-group"><label>{lang === 'ar' ? 'مسمى العنوان (مثال: المنزل)' : 'Label (e.g. Home)'}</label><input className="form-control" value={addressForm.label} onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))} /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'اسم المستلم' : 'Recipient name'}</label><input className="form-control" value={addressForm.recipient_name} onChange={(e) => setAddressForm((f) => ({ ...f, recipient_name: e.target.value }))} required /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'هاتف المستلم' : 'Recipient phone'}</label><input className="form-control" value={addressForm.phone} onChange={(e) => setAddressForm((f) => ({ ...f, phone: e.target.value }))} required /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'العنوان بالتفصيل' : 'Full address'}</label><input className="form-control" value={addressForm.address_line} onChange={(e) => setAddressForm((f) => ({ ...f, address_line: e.target.value }))} required /></div>
            <div className="form-group"><label>{lang === 'ar' ? 'المدينة' : 'City'}</label><input className="form-control" value={addressForm.city} onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))} /></div>
            <div className="form-group">
              <label><input type="checkbox" checked={addressForm.is_default} onChange={(e) => setAddressForm((f) => ({ ...f, is_default: e.target.checked }))} /> {t('profile_default_address')}</label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary btn-sm" type="submit">{editingId ? t('common_save') : t('profile_add_address')}</button>
              {editingId && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditingId(null); setAddressForm(emptyAddressForm); }}>{t('common_cancel')}</button>}
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title={t('common_delete')}
        message={lang === 'ar' ? 'هل تريد حذف هذا العنوان؟' : 'Delete this address?'}
        onConfirm={handleDeleteAddress}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </section>
  );
}
