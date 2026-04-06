import { useState, useRef, useEffect } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { updateProjectMemberRole, removeProjectMember } from '../../store/slices/projectSlice';

const MEMBER_COLORS = ['#4573D2', '#FC636B', '#37A169', '#D69E2E', '#6A67CE', '#3BE8B0', '#F97316', '#EC4899'];

const ROLE_CONFIG = {
  EDITOR: {
    label: 'Editor',
    desc: 'Can add, edit, and delete anything in the project',
    color: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300',
  },
  COMMENTER: {
    label: 'Commenter',
    desc: 'Can comment, but can\'t edit anything in the project',
    color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300',
  },
  VIEWER: {
    label: 'Viewer',
    desc: 'Can view, but can\'t add comments or edit the project',
    color: 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300',
  },
};

/* Custom role dropdown — replaces native <select> for consistent styling */
function RoleDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownHeight = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < dropdownHeight) {
        setPos({ top: rect.top - dropdownHeight - 4, left: rect.right - 220 });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.right - 220 });
      }
    }
    setOpen(!open);
  };

  const current = ROLE_CONFIG[value] || ROLE_CONFIG.EDITOR;

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className={`flex items-center space-x-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition-colors hover:ring-1 hover:ring-[var(--asana-border)] ${current.color}`}>
        <span>{current.label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div ref={ref} className="fixed z-[200] w-56 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl py-1 animate-fade-in"
          style={{ top: pos.top, left: Math.max(8, pos.left) }}>
          {Object.entries(ROLE_CONFIG).map(([key, { label, desc, color }]) => {
            const isActive = value === key;
            return (
              <button key={key} onClick={() => { onChange(key); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isActive ? 'bg-asana-blue/5' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`text-xs font-bold inline-block px-2 py-0.5 rounded ${color}`}>{label}</span>
                    <p className="text-[10px] text-[var(--asana-text-secondary)] mt-0.5 ml-0.5">{desc}</p>
                  </div>
                  {isActive && (
                    <svg className="w-4 h-4 text-asana-blue flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ProjectMembersPanel({ project, onClose, onOpenShare, emitInstant }) {
  const dispatch = useAppDispatch();
  const members = project?.members || [];

  const handleRoleChange = (userId, projectRole) => {
    // Optimistic
    dispatch({ type: 'project/updateProjectMemberRole/fulfilled', payload: { projectId: project.id, member: { userId, projectRole } } });
    emitInstant?.('member_role_changed_instant', { userId, projectRole });
    // Background API
    dispatch(updateProjectMemberRole({ projectId: project.id, memberId: userId, projectRole }));
  };

  const handleRemove = (userId, userName) => {
    if (confirm(`Remove ${userName} from this project?`)) {
      // Optimistic
      dispatch({ type: 'project/removeProjectMember/fulfilled', payload: { projectId: project.id, memberId: userId } });
      emitInstant?.('member_removed_instant', { userId });
      // Background API
      dispatch(removeProjectMember({ projectId: project.id, memberId: userId }));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--asana-surface)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in border border-[var(--asana-border)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--asana-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--asana-text-primary)]">Project Members</h2>
            <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''} in {project?.name}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenShare}
              className="flex items-center text-xs px-3 py-1.5 rounded-lg bg-asana-blue text-white hover:bg-asana-blue/90 font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Member
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-[var(--asana-text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Role legend */}
        <div className="px-6 py-3 bg-gray-50/50 dark:bg-gray-800/30 border-b border-[var(--asana-border)]">
          <div className="flex items-center space-x-4">
            {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center space-x-1.5">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[10px] text-[var(--asana-text-secondary)] hidden sm:inline">{cfg.desc.split(',')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--asana-border)]">
          {members.length === 0 ? (
            <div className="py-12 text-center">
              <svg className="w-10 h-10 mx-auto text-[var(--asana-text-secondary)] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-[var(--asana-text-secondary)]">No members yet</p>
              <button onClick={onOpenShare} className="text-sm text-asana-blue hover:underline mt-2">Add the first member</button>
            </div>
          ) : (
            members.map((member, i) => {
              const role = ROLE_CONFIG[member.projectRole] || ROLE_CONFIG.EDITOR;
              return (
                <div key={member.userId || member.id} className="px-6 py-3 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}
                  >
                    {member.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-[var(--asana-text-primary)] truncate">{member.user?.name}</span>
                    </div>
                    <span className="text-xs text-[var(--asana-text-secondary)] truncate block">{member.user?.email}</span>
                  </div>

                  {/* Role selector + remove */}
                  <div className="flex items-center space-x-2">
                    <RoleDropdown value={member.projectRole || 'EDITOR'} onChange={(val) => handleRoleChange(member.userId, val)} />

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(member.userId, member.user?.name)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-[var(--asana-text-secondary)] hover:text-red-500 transition-all"
                      title="Remove from project"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with access info */}
        <div className="px-6 py-3 border-t border-[var(--asana-border)] bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex items-center space-x-2 text-[11px] text-[var(--asana-text-secondary)]">
            {project?.visibility === 'PRIVATE' ? (
              <>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Private — only listed members and workspace admins can access this project</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Public — all workspace members can view. Listed members have their specific role permissions.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectMembersPanel;
