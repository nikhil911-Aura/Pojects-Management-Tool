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
  const [activeTab, setActiveTab] = useState('overview');
  const { currentWorkspace, pendingInvites, loading } = useAppSelector((state) => state.workspace);
  const { projects } = useAppSelector((state) => state.project);
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
    role: inv.role,
    status: 'pending',
    invitedBy: inv.invitedBy?.name,
  }));

  const tabs = ['Overview', 'Members'];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-[var(--asana-surface)] border-b border-[var(--asana-border)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-asana-coral to-[#e04030] flex items-center justify-center text-white font-bold text-sm">
                {currentWorkspace.name?.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-base font-bold text-[var(--asana-text-primary)]">{currentWorkspace.name}</h1>
            </div>
            <div className="flex items-center space-x-2">
              {members.slice(0, 3).map((m, i) => (
                <div key={m.id} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: `hsl(${(m.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
              ))}
              {isAdmin && (
                <button onClick={() => setShowInviteModal(true)}
                  className="asana-button-primary flex items-center text-xs px-3 py-1.5">
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Invite
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab.toLowerCase())}
                className={`px-4 py-2 text-sm font-medium transition-all relative rounded-t-md ${
                  activeTab === tab.toLowerCase() ? 'text-asana-blue' : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
                }`}>
                {tab}
                {activeTab === tab.toLowerCase() && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-[var(--asana-bg)]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Team hero */}
              <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] overflow-hidden">
                <div className="h-24 bg-gradient-to-r from-gray-700 to-gray-900 dark:from-gray-800 dark:to-gray-950" />
                <div className="px-6 pb-6 -mt-8">
                  <div className="w-16 h-16 rounded-full bg-gray-400 dark:bg-gray-600 border-4 border-[var(--asana-surface)] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {currentWorkspace.name?.charAt(0).toUpperCase()}
                  </div>
                  <h2 className="text-xl font-bold text-[var(--asana-text-primary)] mt-3">{currentWorkspace.name}</h2>
                  <p className="text-sm text-[var(--asana-text-secondary)] mt-1">
                    {currentWorkspace.description || 'Click to add team description...'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                {/* Projects */}
                <div className="lg:col-span-2 bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Projects</h3>
                  </div>
                  <div className="space-y-1">
                    {projects.length > 0 ? projects.map(p => (
                      <Link key={p.id} to={`/project/${p.id}`}
                        className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: p.color || '#4573D2' }}>
                          {p.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--asana-text-primary)] truncate">{p.name}</p>
                        </div>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)]">
                          {p.visibility?.toLowerCase()}
                        </span>
                      </Link>
                    )) : (
                      <p className="text-sm text-[var(--asana-text-secondary)] text-center py-6">No projects yet</p>
                    )}
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                  {/* Members card */}
                  <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Members</h3>
                      <button onClick={() => setActiveTab('members')} className="text-[10px] text-asana-blue hover:underline">
                        View all {members.length}
                      </button>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {members.slice(0, 5).map((m, i) => (
                        <div key={m.id} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: `hsl(${(m.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}
                          title={m.name}>
                          {m.name?.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {isAdmin && (
                        <button onClick={() => setShowInviteModal(true)}
                          className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[var(--asana-text-secondary)] hover:border-asana-blue hover:text-asana-blue transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats card */}
                  <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                    <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-3">Workspace stats</h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Projects</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{projects.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Members</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{members.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Pending invites</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{invites.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Members tab ── */
            <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--asana-border)] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--asana-text-primary)]">
                  Members & Invites
                  <span className="ml-2 text-xs font-medium text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {members.length + invites.length}
                  </span>
                </h2>
                {isAdmin && (
                  <button onClick={() => setShowInviteModal(true)}
                    className="asana-button-primary flex items-center text-xs px-3 py-1.5">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--asana-border)]">
                {[...members, ...invites].map((person) => (
                  <div key={person.id}
                    className={`flex items-center justify-between px-6 py-3.5 transition-colors ${
                      person.status === 'pending' ? 'bg-yellow-50/30 dark:bg-yellow-900/5' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                    }`}>
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: person.status === 'pending' ? '#9CA3AF' : `hsl(${(person.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                        {person.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--asana-text-primary)]">
                          {person.name}
                          {person.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] bg-asana-blue/10 text-asana-blue px-1.5 py-0.5 rounded-full font-bold">You</span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--asana-text-secondary)]">
                          {person.status === 'pending' ? `Invited${person.invitedBy ? ` by ${person.invitedBy}` : ''}` : person.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {person.status === 'pending' ? (
                        <>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">Pending</span>
                          {isAdmin && (
                            <div className="flex items-center space-x-1">
                              <button onClick={() => dispatch(resendInvite(person.id))} className="text-xs text-asana-blue hover:underline px-2 py-1">Resend</button>
                              <button onClick={() => confirm('Cancel this invitation?') && dispatch(cancelInvite(person.id))} className="text-xs text-red-500 hover:underline px-2 py-1">Cancel</button>
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
              </div>
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
