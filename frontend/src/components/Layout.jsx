import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { fetchWorkspaces, setCurrentWorkspace } from '../store/slices/workspaceSlice';
import { fetchProjects } from '../store/slices/projectSlice';
import { searchTasks, clearSearchResults } from '../store/slices/taskSlice';
import { useTheme } from '../context/ThemeContext';
import Sidebar from './Sidebar';
import InviteModal from '../features/workspace/InviteModal';

function Layout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAppSelector((state) => state.auth);
  const { workspaces, currentWorkspace } = useAppSelector((state) => state.workspace);
  const { searchResults } = useAppSelector((state) => state.task);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef(null);
  const userMenuRef = useRef(null);
  const quickAddRef = useRef(null);

  useEffect(() => {
    dispatch(fetchWorkspaces());
  }, [dispatch]);

  useEffect(() => {
    if (workspaces.length > 0 && !currentWorkspace) {
      dispatch(setCurrentWorkspace(workspaces[0]));
    }
  }, [workspaces, currentWorkspace, dispatch]);

  // Single source: fetch projects whenever workspace changes
  useEffect(() => {
    if (currentWorkspace?.id) {
      dispatch(fetchProjects(currentWorkspace.id));
    }
  }, [currentWorkspace, dispatch]);

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (quickAddRef.current && !quickAddRef.current.contains(e.target)) setShowQuickAdd(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchResults(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || !currentWorkspace?.id) {
      dispatch(clearSearchResults());
      return;
    }
    const timer = setTimeout(() => {
      dispatch(searchTasks({ workspaceId: currentWorkspace.id, query: searchQuery }));
      setShowSearchResults(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, currentWorkspace, dispatch]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const getPageTitle = () => {
    if (location.pathname === '/') return 'Home';
    if (location.pathname.includes('/project')) return currentWorkspace?.name || 'Project';
    if (location.pathname.includes('/my-tasks')) return 'My Tasks';
    if (location.pathname.includes('/inbox')) return 'Inbox';
    if (location.pathname.includes('/profile')) return 'Profile';
    if (location.pathname.includes('/settings')) return 'Settings';
    if (location.pathname.includes('/workspace')) return 'Workspace Settings';
    return 'Asana';
  };

  const avatarColor = user?.name ? `hsl(${user.name.charCodeAt(0) * 15}, 65%, 50%)` : '#4573D2';

  return (
    <div className="h-screen flex overflow-hidden font-sans bg-[var(--asana-bg)]">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div className="md:hidden sidebar-mobile-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}
      <div className={`${isSidebarOpen ? 'md:block' : ''} ${isSidebarOpen ? 'sidebar-mobile-open md:relative md:w-auto' : 'hidden md:block'}`}>
        <Sidebar
          isOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenCreateProject={() => { setShowQuickAdd(false); navigate(`/workspace/${currentWorkspace?.id}`); }}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Header ── */}
        <header className="h-14 bg-[var(--asana-surface)] border-b border-[var(--asana-border)] px-2 sm:px-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-[var(--asana-text-secondary)]"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-[var(--asana-text-primary)] hidden sm:block truncate max-w-[150px] lg:max-w-none">
              {getPageTitle()}
            </span>
          </div>

          {/* ── Search ── */}
          <div className="flex-1 max-w-lg mx-2 sm:mx-6 relative hidden sm:block" ref={searchRef}>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-[var(--asana-text-secondary)] pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                placeholder="Search tasks..."
                className="w-full bg-gray-100 dark:bg-gray-700 border-transparent focus:bg-[var(--asana-surface)] focus:ring-2 focus:ring-asana-blue/20 focus:border-asana-blue/30 rounded-full pl-10 pr-4 py-1.5 text-sm transition-all outline-none text-[var(--asana-text-primary)] placeholder-gray-400 dark:placeholder-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); dispatch(clearSearchResults()); setShowSearchResults(false); }}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {showSearchResults && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana shadow-xl z-50 max-h-80 overflow-y-auto">
                {searchResults.length > 0 ? (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">
                      Tasks
                    </p>
                    {searchResults.map((task) => {
                      const projectId = task.list?.board?.project?.id;
                      const projectName = task.list?.board?.project?.name;
                      const projectColor = task.list?.board?.project?.color || '#4573D2';
                      return (
                        <button
                          key={task.id}
                          onClick={() => {
                            navigate(`/project/${projectId}?task=${task.id}`);
                            setShowSearchResults(false);
                            setSearchQuery('');
                            dispatch(clearSearchResults());
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-3 transition-colors"
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {task.status === 'DONE' && (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>{task.title}</p>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: projectColor }} />
                              <p className="text-[11px] text-[var(--asana-text-secondary)] truncate">{projectName} &middot; {task.list?.name}</p>
                            </div>
                          </div>
                          {task.assignees?.length > 0 && (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                              style={{ backgroundColor: `hsl(${task.assignees[0].user?.name?.charCodeAt(0) * 15}, 60%, 50%)` }}
                              title={task.assignees[0].user?.name}
                            >
                              {task.assignees[0].user?.name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <svg className="w-8 h-8 mx-auto text-[var(--asana-text-secondary)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm text-[var(--asana-text-secondary)]">No tasks found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-[var(--asana-text-secondary)]"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke="currentColor" fill="none" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>

            {/* Quick Add */}
            <div className="relative" ref={quickAddRef}>
              <button
                onClick={() => setShowQuickAdd(!showQuickAdd)}
                className="bg-asana-coral hover:opacity-90 text-white rounded-full w-7 h-7 flex items-center justify-center shadow transition-all"
                aria-label="Quick add"
              >
                <svg
                  className="w-4 h-4 transition-transform duration-200"
                  style={{ transform: showQuickAdd ? 'rotate(45deg)' : 'none' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              {showQuickAdd && (
                <div className="absolute top-full right-0 mt-2 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana shadow-xl z-50 min-w-[200px] py-1 animate-fade-in">
                  <button
                    onClick={() => { setShowQuickAdd(false); setShowInviteModal(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 text-asana-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite Member
                  </button>
                  <button
                    onClick={() => { setShowQuickAdd(false); navigate(`/workspace/${currentWorkspace?.id}`); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center transition-colors border-t border-gray-50 dark:border-gray-700"
                  >
                    <svg className="w-4 h-4 mr-3 text-asana-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Create Project
                  </button>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center p-0.5 rounded-full hover:ring-2 hover:ring-asana-blue/30 transition-all"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: avatarColor }}
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana shadow-xl z-50 min-w-[220px] py-1 animate-fade-in">
                  <div className="px-4 py-3 border-b border-[var(--asana-border)]">
                    <p className="font-semibold text-[var(--asana-text-primary)] text-sm">{user?.name}</p>
                    <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                      className="w-full text-left px-4 py-2 text-sm text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>My Profile</span>
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                      className="w-full text-left px-4 py-2 text-sm text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Settings</span>
                    </button>
                  </div>
                  <div className="border-t border-[var(--asana-border)] pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-asana-red hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--asana-bg)]">
          <Outlet />
        </main>
      </div>

      {showInviteModal && (
        <InviteModal workspaceId={currentWorkspace?.id} onClose={() => setShowInviteModal(false)} />
      )}
    </div>
  );
}

export default Layout;
