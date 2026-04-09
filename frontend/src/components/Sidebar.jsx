import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useRole } from '../hooks/useRole';
import { createWorkspace, setCurrentWorkspace } from '../store/slices/workspaceSlice';
import CreateProjectWizard from '../features/projects/CreateProjectWizard';
import InviteModal from '../features/workspace/InviteModal';

const PROJECTS_VISIBLE_LIMIT = 8;
const WORKSPACES_VISIBLE_LIMIT = 5;

function Sidebar({ isOpen }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { currentWorkspace, workspaces } = useAppSelector((state) => state.workspace);
  const { projects, projectsLoading, projectsLoaded } = useAppSelector((state) => state.project);

  const { canCreateProject, canManageWorkspace } = useRole();

  const [showProjects, setShowProjects] = useState(true);
  const [showOwned, setShowOwned] = useState(true);
  const [showJoined, setShowJoined] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllOwned, setShowAllOwned] = useState(false);
  const [showAllJoined, setShowAllJoined] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const handleCreateWorkspace = (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || creatingWorkspace) return;
    setCreatingWorkspace(true);
    dispatch(createWorkspace({ name: newWorkspaceName.trim() })).then((result) => {
      setCreatingWorkspace(false);
      if (result.payload && !result.error) {
        dispatch(setCurrentWorkspace(result.payload));
        setNewWorkspaceName('');
        setShowCreateWorkspace(false);
        navigate('/');
      }
    });
  };

  // Split into owned (role === OWNER) and joined (everything else).
  // The role lives on the workspace object itself because workspaceService.getAll
  // spreads `m.workspace` with `role: m.role` from the membership row.
  const ownedWorkspaces  = (workspaces || []).filter(w => w.role === 'OWNER');
  const joinedWorkspaces = (workspaces || []).filter(w => w.role !== 'OWNER');

  const visibleProjects = showAllProjects ? projects : projects.slice(0, PROJECTS_VISIBLE_LIMIT);
  const visibleOwned    = showAllOwned    ? ownedWorkspaces  : ownedWorkspaces.slice(0, WORKSPACES_VISIBLE_LIMIT);
  const visibleJoined   = showAllJoined   ? joinedWorkspaces : joinedWorkspaces.slice(0, WORKSPACES_VISIBLE_LIMIT);
  const hiddenProjectCount = Math.max(0, (projects?.length || 0) - PROJECTS_VISIBLE_LIMIT);
  const hiddenOwnedCount   = Math.max(0, ownedWorkspaces.length  - WORKSPACES_VISIBLE_LIMIT);
  const hiddenJoinedCount  = Math.max(0, joinedWorkspaces.length - WORKSPACES_VISIBLE_LIMIT);

  // Render a single workspace row — active = in-app NavLink, others open in a new tab.
  const renderWorkspaceRow = (ws) => {
    const isActive = ws.id === currentWorkspace?.id;
    const peopleIcon = (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
    if (isActive) {
      return (
        <NavLink
          key={ws.id}
          to={`/workspace/${ws.id}`}
          className={({ isActive: routeActive }) =>
            `flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              routeActive
                ? 'bg-white/10 text-white font-medium'
                : 'text-white font-medium hover:bg-white/5'
            }`
          }
        >
          {peopleIcon}
          <span className="truncate">{ws.name}</span>
          <svg className="w-3 h-3 text-[var(--asana-sidebar-text-muted)] ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </NavLink>
      );
    }
    return (
      <a
        key={ws.id}
        href={`/?workspace=${ws.id}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${ws.name} in a new tab`}
        className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-[var(--asana-sidebar-text)] hover:bg-white/5 hover:text-white"
      >
        {peopleIcon}
        <span className="truncate">{ws.name}</span>
        <svg className="w-3 h-3 text-[var(--asana-sidebar-text-muted)] ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  };

  const navItems = [
    {
      name: 'Home', path: '/', exact: true,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'My Tasks', path: '/my-tasks',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      name: 'Inbox', path: '/inbox',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <aside
        className={`${isOpen ? 'w-64' : 'w-0 overflow-hidden'} flex-shrink-0 flex flex-col h-full transition-all duration-300 ease-in-out z-40`}
        style={{ backgroundColor: 'var(--asana-sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* ── Logo / Workspace ── (h-14 to match the main header height exactly) */}
        <div className="h-14 px-4 flex items-center space-x-3 border-b border-white/5 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-asana-coral to-[#e04030] flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate leading-tight">
              {currentWorkspace?.name || 'Asana Clone'}
            </p>
            <p className="text-[10px] text-[var(--asana-sidebar-text-muted)] truncate">
              {user?.email}
            </p>
          </div>
        </div>

        {/* ── Nav items ── */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-[var(--asana-sidebar-text)] hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}

          {/* ── Projects section ── */}
          <div className="pt-5">
            <button
              className="w-full flex items-center justify-between px-3 py-1 group"
              onClick={() => setShowProjects(!showProjects)}
            >
              <span className="text-xs font-medium tracking-wide uppercase text-[var(--asana-sidebar-text-muted)]">
                Projects
              </span>
              <svg
                className={`w-3 h-3 text-[var(--asana-sidebar-text-muted)] transition-transform duration-150 ${showProjects ? '' : '-rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showProjects && (
              <div className="mt-1 space-y-0.5 animate-fade-in">
                {/* Skeleton while loading — only show when we have a workspace
                    and are actively fetching. Without a workspace, no fetch
                    ever fires, so the skeleton would loop forever. */}
                {currentWorkspace && (projectsLoading || !projectsLoaded) ? (
                  <div className="space-y-1 px-3 animate-pulse">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-2.5 py-1.5">
                        <div className="w-2 h-2 rounded-sm bg-white/10 flex-shrink-0" />
                        <div className="h-3 rounded bg-white/10" style={{ width: `${50 + i * 10}%` }} />
                      </div>
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-[var(--asana-sidebar-text-muted)] italic">
                    {currentWorkspace ? 'No projects yet. Create one to get started.' : 'Create a workspace first to add projects.'}
                  </p>
                ) : (
                  <>
                    {visibleProjects.map((project) => (
                      <NavLink
                        key={project.id}
                        to={`/project/${project.id}`}
                        className={({ isActive }) =>
                          `flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-white/10 text-white font-medium'
                              : 'text-[var(--asana-sidebar-text)] hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        <div
                          className="w-2 h-2 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: project.color || '#4573D2' }}
                        />
                        <span className="truncate">{project.name}</span>
                      </NavLink>
                    ))}
                    {hiddenProjectCount > 0 && (
                      <button
                        onClick={() => setShowAllProjects((v) => !v)}
                        className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs w-full text-left text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white transition-colors"
                      >
                        <svg className={`w-3 h-3 transition-transform ${showAllProjects ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>{showAllProjects ? 'Show less' : `View all (${projects.length})`}</span>
                      </button>
                    )}
                  </>
                )}

                {/* Create project button */}
                {canCreateProject && (
                  <button
                    onClick={() => setShowCreateWizard(true)}
                    className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors w-full text-left text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Project</span>
                  </button>
                )}
              </div>
            )}
          {/* ── My Workspaces (role: OWNER) ── */}
          <div className="pt-5">
            <button
              className="w-full flex items-center justify-between px-3 py-1 group"
              onClick={() => setShowOwned(!showOwned)}
            >
              <span className="text-xs font-medium tracking-wide uppercase text-[var(--asana-sidebar-text-muted)]">
                My Workspaces
              </span>
              <svg
                className={`w-3 h-3 text-[var(--asana-sidebar-text-muted)] transition-transform duration-150 ${showOwned ? '' : '-rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showOwned && (
              <div className="mt-1 space-y-0.5 animate-fade-in">
                {ownedWorkspaces.length === 0 && !showCreateWorkspace && (
                  <p className="px-3 py-1 text-[11px] text-[var(--asana-sidebar-text-muted)] italic">
                    You haven't created any workspaces yet.
                  </p>
                )}

                {visibleOwned.map(renderWorkspaceRow)}

                {hiddenOwnedCount > 0 && (
                  <button
                    onClick={() => setShowAllOwned((v) => !v)}
                    className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs w-full text-left text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showAllOwned ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span>{showAllOwned ? 'Show less' : `View all (${ownedWorkspaces.length})`}</span>
                  </button>
                )}

                {/* Create workspace — inline form with inline Create button + spinner */}
                {showCreateWorkspace ? (
                  <form onSubmit={handleCreateWorkspace} className="px-3 py-1.5">
                    <div className="flex items-stretch space-x-1.5">
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="Workspace name"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Escape') { setShowCreateWorkspace(false); setNewWorkspaceName(''); } }}
                        className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white placeholder-[var(--asana-sidebar-text-muted)] outline-none focus:border-asana-blue disabled:opacity-50"
                        disabled={creatingWorkspace}
                      />
                      <button
                        type="submit"
                        disabled={!newWorkspaceName.trim() || creatingWorkspace}
                        className="flex-shrink-0 flex items-center justify-center px-2.5 rounded-md bg-asana-blue text-white text-xs font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-w-[58px]"
                      >
                        {creatingWorkspace ? (
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        ) : 'Create'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowCreateWorkspace(true)}
                    className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors w-full text-left text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create workspace</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Joined Workspaces (role: ADMIN / MEMBER / etc.) ── */}
          {joinedWorkspaces.length > 0 && (
            <div className="pt-5">
              <button
                className="w-full flex items-center justify-between px-3 py-1 group"
                onClick={() => setShowJoined(!showJoined)}
              >
                <span className="text-xs font-medium tracking-wide uppercase text-[var(--asana-sidebar-text-muted)]">
                  Joined Workspaces
                </span>
                <svg
                  className={`w-3 h-3 text-[var(--asana-sidebar-text-muted)] transition-transform duration-150 ${showJoined ? '' : '-rotate-90'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showJoined && (
                <div className="mt-1 space-y-0.5 animate-fade-in">
                  {visibleJoined.map(renderWorkspaceRow)}

                  {hiddenJoinedCount > 0 && (
                    <button
                      onClick={() => setShowAllJoined((v) => !v)}
                      className="flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs w-full text-left text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showAllJoined ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span>{showAllJoined ? 'Show less' : `View all (${joinedWorkspaces.length})`}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </nav>

        {/* ── Bottom: Invite + User ── */}
        <div className="border-t border-white/5">
          {/* Invite teammates */}
          <button
            onClick={() => setShowInviteModal(true)}
            className="w-full flex items-center space-x-3 px-4 py-2.5 text-[var(--asana-sidebar-text-muted)] hover:bg-white/5 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">Invite teammates</span>
          </button>
        </div>
      </aside>

      {/* ── Create Project Wizard ── */}
      <CreateProjectWizard
        isOpen={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
      />

      {/* ── Invite Modal ── */}
      {showInviteModal && currentWorkspace && (
        <InviteModal workspaceId={currentWorkspace.id} onClose={() => setShowInviteModal(false)} />
      )}
    </>
  );
}

export default Sidebar;
