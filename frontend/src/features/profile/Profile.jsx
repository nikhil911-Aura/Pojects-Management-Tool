import { useState, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { updateProfile } from '../../store/slices/authSlice';
import api from '../../services/api';

const ROLE_STYLES = {
  OWNER:  { label: 'Owner',  bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  ADMIN:  { label: 'Admin',  bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300'   },
  MEMBER: { label: 'Manager', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  GUEST:  { label: 'Guest',  bg: 'bg-gray-100 dark:bg-gray-700',      text: 'text-gray-600 dark:text-gray-300'  },
};

function RoleBadge({ role, customRole }) {
  if (customRole?.name) {
    const color = customRole.color || '#6366f1';
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {customRole.name}
      </span>
    );
  }
  const s = ROLE_STYLES[role] || ROLE_STYLES.GUEST;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function Profile() {
  const { user } = useAppSelector((state) => state.auth);
  const { workspaces, currentWorkspace } = useAppSelector((state) => state.workspace);
  const dispatch = useAppDispatch();

  const [formData, setFormData] = useState({ name: user?.name || '', email: user?.email || '' });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const avatarColor = user?.name ? `hsl(${user.name.charCodeAt(0) * 15}, 60%, 50%)` : '#4573D2';
  const currentRole = currentWorkspace?.role;
  const currentCustomRole = currentWorkspace?.customRole;
  const displayAvatar = avatarPreview || user?.avatar;

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select a valid image file'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Image must be smaller than 2MB'); return; }

    // Show local preview immediately
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await api.post('/api/v1/users/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const updated = res.data?.data;
      if (updated) {
        dispatch(updateProfile({ avatar: updated.avatar }));
        setAvatarPreview(updated.avatar);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload image');
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.put('/api/v1/users/profile', { name: formData.name });
      const updated = res.data?.data;
      if (updated) dispatch(updateProfile({ name: updated.name }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--karya-text-primary)]">My Profile</h1>
        <p className="text-sm text-[var(--karya-text-secondary)] mt-1">Manage your personal information</p>
      </div>

      <div className="bg-[var(--karya-surface)] border border-karya-border rounded-karya-lg overflow-hidden">
        {/* Avatar section */}
        <div className="px-8 py-8 border-b border-karya-border flex items-center space-x-6">
          <div className="relative flex-shrink-0 group/avatar">
            {/* Clickable image → opens lightbox */}
            <button
              type="button"
              onClick={() => displayAvatar && setLightboxOpen(true)}
              className={`block w-20 h-20 rounded-full overflow-hidden shadow-lg focus:outline-none ${displayAvatar ? 'cursor-zoom-in' : 'cursor-default'}`}
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-bold text-3xl"
                  style={{ backgroundColor: avatarColor }}
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>

            {/* Camera overlay → opens file picker */}
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--karya-surface)] border-2 border-[var(--karya-border)] flex items-center justify-center shadow hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:cursor-wait"
              title="Change profile picture"
            >
              {uploadingAvatar ? (
                <svg className="w-3.5 h-3.5 text-[var(--karya-text-primary)] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-[var(--karya-text-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-semibold text-[var(--karya-text-primary)]">{user?.name}</h2>
              {currentRole && <RoleBadge role={currentRole} customRole={currentCustomRole} />}
            </div>
            <p className="text-sm text-[var(--karya-text-secondary)] mt-0.5">{user?.email}</p>
            {currentWorkspace && (
              <p className="text-xs text-[var(--karya-text-secondary)] mt-1">
                in <span className="font-medium text-[var(--karya-text-primary)]">{currentWorkspace.name}</span>
              </p>
            )}
            <button
              type="button"
              onClick={handleAvatarClick}
              className="mt-2 text-xs text-[var(--karya-blue)] hover:underline"
            >
              Change photo
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-karya text-sm">
              {error}
            </div>
          )}
          {saved && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-karya text-sm flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Changes saved successfully</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--karya-text-primary)] mb-1.5">Full name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="karya-input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--karya-text-primary)] mb-1.5">Email address</label>
            <input
              type="email"
              value={formData.email}
              className="karya-input w-full opacity-60 cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-[var(--karya-text-secondary)] mt-1">Email cannot be changed</p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="karya-button-primary px-6 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>

        {/* Workspace roles */}
        {workspaces?.length > 0 && (
          <div className="px-8 py-6 border-t border-karya-border">
            <h3 className="text-sm font-semibold text-[var(--karya-text-primary)] mb-3">Workspace roles</h3>
            <div className="space-y-2">
              {workspaces.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {ws.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-[var(--karya-text-primary)] truncate font-medium">{ws.name}</span>
                    {ws.id === currentWorkspace?.id && (
                      <span className="text-[10px] text-[var(--karya-text-secondary)] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">current</span>
                    )}
                  </div>
                  {ws.role && <RoleBadge role={ws.role} customRole={ws.customRole} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && displayAvatar && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={displayAvatar}
            alt="Profile"
            className="w-[420px] h-[420px] rounded-2xl shadow-2xl object-cover"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default Profile;
