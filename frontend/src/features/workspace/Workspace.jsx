import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchWorkspace, fetchInvites, resendInvite, cancelInvite } from '../../store/slices/workspaceSlice';
import InviteModal from './InviteModal';

const ROLE_STYLE = {
  OWNER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ADMIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  MEMBER: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  GUEST: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
};

function Workspace() {
  const { workspaceId } = useParams();
  const dispatch = useAppDispatch();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const { currentWorkspace, pendingInvites, loading } = useAppSelector((state) => state.workspace);
  const { user: currentUser } = useAppSelector((state) => state.auth);

  useEffect(() => {
    dispatch(fetchWorkspace(workspaceId));
    dispatch(fetchInvites(workspaceId));
  }, [workspaceId, dispatch]);

  const currentMember = currentWorkspace?.members?.find(m => m.userId === currentUser?.id || m.user?.id === currentUser?.id);
  const isAdmin = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

  if (loading && !currentWorkspace) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-asana-blue" />
      </div>
    );
  }

  if (!currentWorkspace) {
    return <div className="p-8 text-center text-[var(--asana-text-secondary)]">Workspace not found</div>;
  }

  const members = currentWorkspace.members?.map(m => ({
    id: m.user?.id || m.userId,
    name: m.user?.name,
    email: m.user?.email,
    avatar: m.user?.avatar,
    role: m.role,
    status: 'active',
  })) || [];

  const invites = pendingInvites.map(inv => ({
    id: inv.id,
    name: inv.email,
    email: inv.email,
    avatar: null,
    role: inv.role,
    status: 'pending',
    invitedBy: inv.invitedBy?.name,
  }));

  const allPeople = [...members, ...invites];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link to="/" className="text-xs font-medium text-asana-blue hover:underline flex items-center space-x-1 mb-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">{currentWorkspace.name}</h1>
          {currentWorkspace.description && (
            <p className="text-sm text-[var(--asana-text-secondary)] mt-1">{currentWorkspace.description}</p>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="asana-button-primary flex items-center space-x-2 text-sm px-4 py-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span>Invite Member</span>
          </button>
        )}
      </div>

      {/* ── Members table ── */}
      <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--asana-border)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--asana-text-primary)]">
            Members & Invites
            <span className="ml-2 text-xs font-medium text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
              {allPeople.length}
            </span>
          </h2>
        </div>

        <div className="divide-y divide-[var(--asana-border)]">
          {allPeople.map((person) => (
            <div
              key={person.id}
              className={`flex items-center justify-between px-6 py-4 transition-colors ${
                person.status === 'pending'
                  ? 'bg-yellow-50/50 dark:bg-yellow-900/5'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-asana-blue/10 dark:bg-asana-blue/20 flex items-center justify-center font-bold text-asana-blue flex-shrink-0">
                  {person.avatar ? (
                    <img src={person.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    person.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--asana-text-primary)]">
                    {person.name}
                    {person.id === currentUser?.id && (
                      <span className="ml-2 text-[10px] bg-asana-blue/10 text-asana-blue px-1.5 py-0.5 rounded-full font-bold">You</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--asana-text-secondary)]">
                    {person.status === 'pending'
                      ? `Invited${person.invitedBy ? ` by ${person.invitedBy}` : ''}`
                      : person.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {person.status === 'pending' ? (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => dispatch(resendInvite(person.id))}
                          className="text-xs font-medium text-asana-blue hover:underline px-2 py-1 rounded hover:bg-asana-blue/5 transition-colors"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => window.confirm('Cancel this invitation?') && dispatch(cancelInvite(person.id))}
                          className="text-xs font-medium text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_STYLE[person.role] || ROLE_STYLE.MEMBER}`}>
                    {person.role}
                  </span>
                )}
              </div>
            </div>
          ))}

          {allPeople.length === 0 && (
            <div className="px-6 py-12 text-center text-[var(--asana-text-secondary)] text-sm">
              No members yet
            </div>
          )}
        </div>
      </div>

      {showInviteModal && (
        <InviteModal workspaceId={workspaceId} onClose={() => setShowInviteModal(false)} />
      )}
    </div>
  );
}

export default Workspace;
