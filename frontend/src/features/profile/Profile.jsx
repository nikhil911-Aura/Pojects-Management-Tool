import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import api from '../../services/api';

const ROLE_STYLES = {
  OWNER:  { label: 'Owner',  bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  ADMIN:  { label: 'Admin',  bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300'   },
  MEMBER: { label: 'Member', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const avatarColor = user?.name ? `hsl(${user.name.charCodeAt(0) * 15}, 60%, 50%)` : '#4573D2';
  const currentRole = currentWorkspace?.role;
  const currentCustomRole = currentWorkspace?.customRole;

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
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg flex-shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-semibold text-[var(--asana-text-primary)]">{user?.name}</h2>
              {currentRole && <RoleBadge role={currentRole} customRole={currentCustomRole} />}
            </div>
            <p className="text-sm text-[var(--asana-text-secondary)] mt-0.5">{user?.email}</p>
            {currentWorkspace && (
              <p className="text-xs text-[var(--asana-text-secondary)] mt-1">
                in <span className="font-medium text-[var(--asana-text-primary)]">{currentWorkspace.name}</span>
              </p>
            )}
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

        {/* Workspace roles */}
        {workspaces?.length > 0 && (
          <div className="px-8 py-6 border-t border-asana-border">
            <h3 className="text-sm font-semibold text-[var(--asana-text-primary)] mb-3">Workspace roles</h3>
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
                    <span className="text-sm text-[var(--asana-text-primary)] truncate font-medium">{ws.name}</span>
                    {ws.id === currentWorkspace?.id && (
                      <span className="text-[10px] text-[var(--asana-text-secondary)] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">current</span>
                    )}
                  </div>
                  {ws.role && <RoleBadge role={ws.role} customRole={ws.customRole} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
