import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import api from '../../services/api';

function Profile() {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();

  const [formData, setFormData] = useState({ name: user?.name || '', email: user?.email || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const avatarColor = user?.name ? `hsl(${user.name.charCodeAt(0) * 15}, 60%, 50%)` : '#4573D2';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put('/api/v1/users/profile', { name: formData.name });
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
        <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">My Profile</h1>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Manage your personal information</p>
      </div>

      <div className="bg-[var(--asana-surface)] border border-asana-border rounded-asana-lg overflow-hidden">
        {/* Avatar section */}
        <div className="px-8 py-8 border-b border-asana-border flex items-center space-x-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg"
            style={{ backgroundColor: avatarColor }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--asana-text-primary)]">{user?.name}</h2>
            <p className="text-sm text-[var(--asana-text-secondary)]">{user?.email}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-asana text-sm">
              {error}
            </div>
          )}
          {saved && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-asana text-sm flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Changes saved successfully</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Full name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="asana-input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Email address</label>
            <input
              type="email"
              value={formData.email}
              className="asana-input w-full opacity-60 cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-[var(--asana-text-secondary)] mt-1">Email cannot be changed</p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="asana-button-primary px-6 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Profile;
