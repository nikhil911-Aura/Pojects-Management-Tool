import { useState, useRef, useEffect } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { inviteUser, fetchInvites } from '../../store/slices/workspaceSlice';

const ROLES = [
  {
    value: 'MEMBER',
    label: 'Member',
    desc: 'Can view and edit projects they have access to',
    color: '#3B82F6',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    desc: 'Can manage members, invites, and workspace settings',
    color: '#8B5CF6',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    value: 'GUEST',
    label: 'Guest',
    desc: 'Can only view projects they are explicitly added to',
    color: '#F59E0B',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
];

function InviteModal({ workspaceId, onClose }) {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const roleBtnRef = useRef(null);
  const rolePickerRef = useRef(null);

  // Close role picker on outside click
  useEffect(() => {
    if (!showRolePicker) return;
    const handler = (e) => {
      if (rolePickerRef.current && !rolePickerRef.current.contains(e.target) && !roleBtnRef.current?.contains(e.target))
        setShowRolePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRolePicker]);

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

  const selectedRole = ROLES.find(r => r.value === role) || ROLES[0];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--asana-surface)] rounded-2xl shadow-2xl border border-[var(--asana-border)] w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-asana-blue/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-asana-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--asana-text-primary)]">Invite teammate</h2>
                <p className="text-xs text-[var(--asana-text-secondary)]">Send an invitation to join your workspace</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-[var(--asana-text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {success ? (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-[var(--asana-text-primary)]">Invitation sent!</p>
            <p className="text-sm text-[var(--asana-text-secondary)] mt-1">They'll receive an email with a link to join.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 space-y-4">
              {/* Error */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2.5 rounded-lg text-sm flex items-center space-x-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-1.5">Email address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-[var(--asana-text-secondary)] pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    autoFocus
                    className="w-full pl-10 pr-3 py-2.5 text-sm bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg text-[var(--asana-text-primary)] placeholder-[var(--asana-text-muted)] outline-none focus:border-asana-blue focus:ring-1 focus:ring-asana-blue transition-colors"
                  />
                </div>
              </div>

              {/* Role picker */}
              <div>
                <label className="block text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-1.5">Role</label>
                <div className="relative">
                  <button
                    ref={roleBtnRef}
                    type="button"
                    onClick={() => setShowRolePicker(!showRolePicker)}
                    className="w-full flex items-center px-3 py-2.5 bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg text-sm text-[var(--asana-text-primary)] hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg mr-2.5 flex-shrink-0"
                      style={{ backgroundColor: `${selectedRole.color}15`, color: selectedRole.color }}>
                      {selectedRole.icon}
                    </span>
                    <div className="text-left min-w-0 flex-1">
                      <span className="font-semibold">{selectedRole.label}</span>
                      <span className="text-[var(--asana-text-secondary)] ml-1.5 text-xs hidden sm:inline">— {selectedRole.desc}</span>
                    </div>
                    <svg className={`w-4 h-4 text-[var(--asana-text-secondary)] flex-shrink-0 ml-2 transition-transform ${showRolePicker ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showRolePicker && (() => {
                    const rect = roleBtnRef.current?.getBoundingClientRect();
                    const top = rect ? rect.bottom + 4 : 0;
                    const left = rect ? rect.left : 0;
                    const width = rect ? rect.width : 300;
                    return (
                    <>
                      <div className="fixed inset-0 z-[210]" onClick={() => setShowRolePicker(false)} />
                      <div ref={rolePickerRef}
                        className="fixed z-[211] bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl py-1 animate-fade-in"
                        style={{ top, left, width }}>
                        {ROLES.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => { setRole(r.value); setShowRolePicker(false); }}
                            className={`w-full flex items-center px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                              role === r.value ? 'bg-asana-blue/5' : ''
                            }`}
                          >
                            <span className="flex items-center justify-center w-8 h-8 rounded-lg mr-3 flex-shrink-0"
                              style={{ backgroundColor: `${r.color}15`, color: r.color }}>
                              {r.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[var(--asana-text-primary)]">{r.label}</p>
                              <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">{r.desc}</p>
                            </div>
                            {role === r.value && (
                              <svg className="w-4 h-4 text-asana-blue flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center px-6 py-4 mt-4 border-t border-[var(--asana-border)] space-x-3">
              <button type="button" onClick={onClose} disabled={loading}
                className="flex-1 py-2.5 text-sm font-medium border border-[var(--asana-border)] rounded-lg text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={loading || !email.trim()}
                className="flex-1 py-2.5 text-sm font-semibold bg-asana-blue text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center">
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Invite
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default InviteModal;
