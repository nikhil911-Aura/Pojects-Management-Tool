import { useState } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { inviteUser, fetchInvites } from '../../store/slices/workspaceSlice';

function InviteModal({ workspaceId, onClose }) {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!workspaceId) { setError('No active workspace selected'); return; }
    setLoading(true);
    setError(null);
    try {
      await dispatch(inviteUser({ workspaceId, email, role })).unwrap();
      setSuccess(true);
      setEmail('');
      dispatch(fetchInvites(workspaceId));
      setTimeout(() => { setSuccess(false); onClose(); }, 2000);
    } catch (err) {
      setError(typeof err === 'string' ? err : err.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="asana-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="asana-modal p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--asana-text-primary)]">Invite to workspace</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-[var(--asana-text-secondary)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-[var(--asana-text-primary)]">Invitation sent!</p>
            <p className="text-sm text-[var(--asana-text-secondary)] mt-1">They'll receive an email shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2.5 rounded-asana text-sm flex items-center space-x-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="asana-input w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="asana-input w-full"
              >
                <option value="MEMBER">Member — can view and edit projects</option>
                <option value="ADMIN">Admin — can manage members and settings</option>
                <option value="GUEST">Guest — view only</option>
              </select>
            </div>

            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-2 text-sm font-medium border border-[var(--asana-border)] rounded-asana text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 asana-button-primary py-2 text-sm font-medium disabled:opacity-50">
                {loading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default InviteModal;
