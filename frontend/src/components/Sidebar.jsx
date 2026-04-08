import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { useRole } from '../hooks/useRole';
import CreateProjectWizard from '../features/projects/CreateProjectWizard';
import InviteModal from '../features/workspace/InviteModal';

function Sidebar({ isOpen }) {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { projects, projectsLoading, projectsLoaded } = useAppSelector((state) => state.project);

  const { canCreateProject, canManageWorkspace } = useRole();

  const [showProjects, setShowProjects] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

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
                {/* Skeleton while loading */}
                {(projectsLoading || !projectsLoaded) ? (
                  <div className="space-y-1 px-3 animate-pulse">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-2.5 py-1.5">
                        <div className="w-2 h-2 rounded-sm bg-white/10 flex-shrink-0" />
                        <div className="h-3 rounded bg-white/10" style={{ width: `${50 + i * 10}%` }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  projects.map((project) => (
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
                  ))
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
          {/* ── Teams section ── */}
          <div className="pt-5">
            <button
              className="w-full flex items-center justify-between px-3 py-1 group"
              onClick={() => setShowTeams(!showTeams)}
            >
              <span className="text-xs font-medium tracking-wide uppercase text-[var(--asana-sidebar-text-muted)]">
                Teams
              </span>
              <svg
                className={`w-3 h-3 text-[var(--asana-sidebar-text-muted)] transition-transform duration-150 ${showTeams ? '' : '-rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showTeams && currentWorkspace && (
              <div className="mt-1 space-y-0.5 animate-fade-in">
                <NavLink
                  to={`/workspace/${currentWorkspace.id}`}
                  className={({ isActive }) =>
                    `flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-[var(--asana-sidebar-text)] hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate">{currentWorkspace.name}</span>
                  <svg className="w-3 h-3 text-[var(--asana-sidebar-text-muted)] ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </NavLink>
              </div>
            )}
          </div>
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
