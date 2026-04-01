import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { useRole } from '../hooks/useRole';
import CreateProjectWizard from '../features/projects/CreateProjectWizard';

function Sidebar({ isOpen }) {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { projects } = useAppSelector((state) => state.project);

  const { canCreateProject } = useRole();

  const [showProjects, setShowProjects] = useState(true);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

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
        {/* ── Logo / Workspace ── */}
        <div className="px-4 py-3 flex items-center space-x-3 border-b border-white/5">
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--asana-sidebar-text-muted)]">
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
                {projects.map((project) => (
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
          </div>
        </nav>

        {/* ── Bottom: Workspace settings ── */}
        <div
          className="px-3 py-3 border-t border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => currentWorkspace && navigate(`/workspace/${currentWorkspace.id}`)}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: '#4573D2' }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--asana-sidebar-text)] truncate">{user?.name}</p>
              <p className="text-[10px] text-[var(--asana-sidebar-text-muted)] truncate">
                {currentWorkspace?.name}
              </p>
            </div>
            <svg className="w-3.5 h-3.5 text-[var(--asana-sidebar-text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
      </aside>

      {/* ── Create Project Wizard ── */}
      <CreateProjectWizard
        isOpen={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
      />
    </>
  );
}

export default Sidebar;
