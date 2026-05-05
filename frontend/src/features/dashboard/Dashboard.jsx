import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createWorkspace, setCurrentWorkspace } from '../../store/slices/workspaceSlice';
import CreateProjectWizard from '../projects/CreateProjectWizard';

function ProjectCard({ project }) {
  const color = project.color || '#4573D2';

  // Use pre-computed stats from backend (or fallback to legacy board.lists.tasks)
  const stats = project.stats;
  const sections = stats?.sections ?? project.board?.lists?.length ?? 0;
  const tasks = stats?.tasks ?? (project.board?.lists?.flatMap(l => l.tasks || []).filter(t => !t.parentId && t.taskType !== 'MILESTONE').length ?? 0);
  const milestones = stats?.milestones ?? 0;
  const subtasks = stats?.subtasks ?? 0;
  const total = stats?.total ?? 0;

  return (
    <Link
      to={`/project/${project.id}`}
      className="group block bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana-lg overflow-hidden hover:shadow-asana-hover hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Color strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-sm"
            style={{ backgroundColor: color }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)] uppercase tracking-wider">
            {project.visibility?.toLowerCase() || 'private'}
          </span>
        </div>

        <h3 className="font-semibold text-[var(--asana-text-primary)] text-sm leading-snug group-hover:text-asana-blue transition-colors mb-1">
          {project.name}
        </h3>
        {project.description && (
          <p className="text-xs text-[var(--asana-text-secondary)] line-clamp-2 mb-3">{project.description}</p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[var(--asana-border)]">
          <span className="text-[11px] text-[var(--asana-text-secondary)] flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            {tasks} task{tasks !== 1 ? 's' : ''}
          </span>
          {sections > 0 && (
            <span className="text-[11px] text-[var(--asana-text-secondary)] flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              {sections} section{sections !== 1 ? 's' : ''}
            </span>
          )}
          {milestones > 0 && (
            <span className="text-[11px] text-[var(--asana-text-secondary)] flex items-center">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 12 12"><rect x="6" y="0" width="7" height="7" rx="1" transform="rotate(45 6 0)" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              {milestones} milestone{milestones !== 1 ? 's' : ''}
            </span>
          )}
          {subtasks > 0 && (
            <span className="text-[11px] text-[var(--asana-text-secondary)] flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              {subtasks} subtask{subtasks !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Dashboard() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { workspaces, currentWorkspace, loading } = useAppSelector((state) => state.workspace);
  const { projects, projectsLoading, projectsLoaded } = useAppSelector((state) => state.project);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState({ name: '', description: '' });
  const [wsCreating, setWsCreating] = useState(false);

  // Workspaces and projects are fetched centrally by Layout.jsx — no duplicate fetch here

  const handleCreateWorkspace = (e) => {
    e.preventDefault();
    setWsCreating(true);
    dispatch(createWorkspace(newWorkspace)).then((result) => {
      setWsCreating(false);
      if (result.payload) {
        dispatch(setCurrentWorkspace(result.payload));
        setShowCreateWorkspace(false);
        setNewWorkspace({ name: '', description: '' });
      }
    });
  };

  if (loading && !currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-asana-blue" />
        <p className="text-[var(--asana-text-secondary)] text-sm">Loading workspace...</p>
      </div>
    );
  }

  /* ── No workspace state ── */
  if (!currentWorkspace && workspaces.length === 0) {
    return (
      <>
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-asana-blue/10 dark:bg-asana-blue/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-asana-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--asana-text-primary)] mb-3">Welcome to Asana Clone</h1>
          <p className="text-[var(--asana-text-secondary)] mb-8 max-w-md mx-auto">
            Create a workspace to start managing your projects and collaborating with your team.
          </p>
          <button
            onClick={() => setShowCreateWorkspace(true)}
            className="asana-button-primary px-8 py-3 text-sm font-semibold shadow-lg shadow-asana-blue/20"
          >
            Create your first workspace
          </button>
        </div>

        {showCreateWorkspace && (
          <div className="asana-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateWorkspace(false)}>
            <div className="asana-modal p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[var(--asana-text-primary)]">Create Workspace</h2>
                <button onClick={() => setShowCreateWorkspace(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-[var(--asana-text-secondary)] transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Workspace name <span className="text-asana-red">*</span></label>
                  <input type="text" value={newWorkspace.name} onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })} placeholder="e.g. Acme Inc." className="asana-input w-full" required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--asana-text-primary)] mb-1.5">Description</label>
                  <textarea value={newWorkspace.description} onChange={(e) => setNewWorkspace({ ...newWorkspace, description: e.target.value })} placeholder="What does your team work on?" rows={2} className="asana-input w-full resize-none" />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button type="button" onClick={() => setShowCreateWorkspace(false)} className="flex-1 py-2 text-sm font-medium border border-[var(--asana-border)] rounded-asana text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                  <button type="submit" disabled={wsCreating} className="flex-1 py-2 text-sm font-medium asana-button-primary disabled:opacity-50">{wsCreating ? 'Creating...' : 'Create Workspace'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!currentWorkspace) return null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">
            {currentWorkspace.name}
          </h1>
          <p className="text-sm text-[var(--asana-text-secondary)] mt-0.5">
            {projectsLoaded ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            to={`/workspace/${currentWorkspace.id}`}
            className="px-3 py-1.5 text-sm font-medium text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-asana transition-colors flex items-center space-x-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Members</span>
          </Link>
          <button
            onClick={() => setShowCreateWizard(true)}
            className="asana-button-primary px-4 py-1.5 text-sm font-medium flex items-center space-x-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* ── Workspace switcher if multiple ── */}
      {workspaces.length > 1 && (
        <div className="flex items-center space-x-2 mb-6 overflow-x-auto pb-1">
          {workspaces.map((ws) => {
            const isActive = ws.id === currentWorkspace?.id;
            // Use an anchor with target="_blank" so:
            //  • clicking opens the workspace in a new tab (Layout's URL bootstrap reads ?workspace=)
            //  • middle-click and Cmd/Ctrl+click work natively
            //  • the active workspace stays put in this tab
            // The active workspace is rendered as a non-link button so it doesn't open a duplicate tab.
            if (isActive) {
              return (
                <button
                  key={ws.id}
                  className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-asana-blue text-white cursor-default"
                >
                  {ws.name}
                </button>
              );
            }
            return (
              <a
                key={ws.id}
                href={`/?workspace=${ws.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {ws.name}
              </a>
            );
          })}
        </div>
      )}

      {/* ── Projects grid ── */}
      {projectsLoading || !projectsLoaded ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-asana-blue" />
          <p className="text-[var(--asana-text-secondary)] text-sm mt-3">Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-[var(--asana-border)] rounded-asana-lg">
          <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-[var(--asana-text-primary)] font-medium mb-1">No projects yet</p>
          <p className="text-sm text-[var(--asana-text-secondary)] mb-5">Create your first project to get started</p>
          <button onClick={() => setShowCreateWizard(true)} className="asana-button-primary text-sm px-5 py-2">
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
          {/* Add project tile */}
          <button
            onClick={() => setShowCreateWizard(true)}
            className="border-2 border-dashed border-[var(--asana-border)] rounded-asana-lg p-5 flex flex-col items-center justify-center text-[var(--asana-text-secondary)] hover:border-asana-blue/40 hover:text-asana-blue hover:bg-asana-blue/5 transition-all group min-h-[140px]"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium">New Project</span>
          </button>
        </div>
      )}

      {/* ── Create Project Wizard ── */}
      <CreateProjectWizard
        isOpen={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
      />
    </div>
  );
}

export default Dashboard;
