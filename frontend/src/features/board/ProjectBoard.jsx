import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProject, deleteProject, updateProject } from '../../store/slices/projectSlice';
import { setCurrentWorkspace } from '../../store/slices/workspaceSlice';
import { fetchLists, createList, deleteList, clearLists } from '../../store/slices/boardSlice';
import api from '../../services/api';
import { createTask, moveTask as moveTaskAction } from '../../store/slices/taskSlice';
import ProjectListView from './ProjectListView';
import ListToolbar, { applyFilters, applySort, applyGrouping } from './ListToolbar';
import { OverviewView, TimelineView, DashboardView, GanttView, WorkloadView } from './ProjectViews';
import TaskDetail from '../tasks/TaskDetail';
import { useSocket } from '../../hooks/useSocket';
import { useRole } from '../../hooks/useRole';
import { useConfirm } from '../../hooks/useConfirm';
import ShareModal from '../projects/ShareModal';
import { useCelebration } from '../../components/Celebration';

const PRIORITY_DOT = {
  HIGH: 'bg-red-500 animate-pulse',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-gray-300 dark:bg-gray-600',
};

const MEMBER_COLORS = ['#4573D2', '#FC636B', '#37A169', '#D69E2E', '#6A67CE', '#3BE8B0', '#F97316', '#EC4899'];

const ROLE_BADGE = {
  EDITOR:    { label: 'Editor',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  COMMENTER: { label: 'Commenter', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  VIEWER:    { label: 'Viewer',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

/* ── Inline member popover (shown on avatar click for admin/owner) ── */
function MemberPopover({ member, color, onClose, position }) {
  const ref = useRef(null);
  const role = ROLE_BADGE[member.projectRole] || ROLE_BADGE.EDITOR;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-[60] animate-fade-in"
      style={{ top: position.top, right: position.right }}
    >
      <div className="bg-[var(--asana-surface)] rounded-xl shadow-2xl border border-[var(--asana-border)] w-64 overflow-hidden">
        {/* Color banner */}
        <div className="h-14 relative" style={{ backgroundColor: color }}>
          <div className="absolute -bottom-5 left-4">
            <div
              className="w-12 h-12 rounded-full border-3 border-[var(--asana-surface)] flex items-center justify-center text-white text-lg font-bold shadow-lg"
              style={{ backgroundColor: color, borderWidth: '3px' }}
            >
              {member.user?.name?.charAt(0).toUpperCase() || '?'}
            </div>
          </div>
        </div>

        <div className="pt-8 pb-4 px-4">
          {/* Name + role */}
          <div className="flex items-start justify-between mb-1">
            <h4 className="text-sm font-bold text-[var(--asana-text-primary)] leading-tight">{member.user?.name}</h4>
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${role.cls}`}>
              {role.label}
            </span>
          </div>

          {/* Email */}
          <p className="text-xs text-[var(--asana-text-secondary)] mb-3">{member.user?.email}</p>

          {/* Divider */}
          <div className="border-t border-[var(--asana-border)] pt-3 space-y-2">
            {/* Joined info */}
            <div className="flex items-center text-xs text-[var(--asana-text-secondary)]">
              <svg className="w-3.5 h-3.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Added {member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}</span>
            </div>

            {/* Role description */}
            <div className="flex items-center text-xs text-[var(--asana-text-secondary)]">
              <svg className="w-3.5 h-3.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>
                {member.projectRole === 'EDITOR' && 'Can edit, add & delete anything'}
                {member.projectRole === 'COMMENTER' && 'Can view & comment only'}
                {member.projectRole === 'VIEWER' && 'Can view only, no edits or comments'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectBoard() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get('view') || 'list';
  const selectedTaskId = searchParams.get('task');

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentProject, projectLoading, projects } = useAppSelector((state) => state.project);
  const { lists, loading: listsLoading, listsForBoardId } = useAppSelector((state) => state.board);
  const { currentWorkspace, workspaces } = useAppSelector((state) => state.workspace);

  const [initialLoaded, setInitialLoaded] = useState(false);
  const prevProjectIdRef = useRef(projectId);

  // Reset when projectId changes
  if (prevProjectIdRef.current !== projectId) {
    prevProjectIdRef.current = projectId;
    setInitialLoaded(false);
  }

  // Show content only when EVERY piece of data matches the current route:
  //   1. The bootstrap effect has finished (initialLoaded)
  //   2. currentProject's id matches the URL (no stale project from a previous nav)
  //   3. state.board.lists is for THIS project's board (no cross-project task leakage)
  // Without #3, switching projects fast could briefly render the old project's
  // tasks under the new project's name.
  const isReady =
    initialLoaded &&
    currentProject?.id === projectId &&
    (!currentProject?.board?.id || listsForBoardId === currentProject.board.id);

  // ── Workspace auto-sync: if this project belongs to a different workspace
  // than the currently active one, switch the sidebar to the right workspace.
  // Without this, navigating to a cross-workspace project URL (bookmark,
  // shared link, browser history) would load the project's data correctly
  // in the main area but leave the sidebar showing the wrong workspace's
  // projects — the bug the user reported.
  useEffect(() => {
    if (!currentProject?.workspace?.id) return;
    const projectWsId = currentProject.workspace.id;
    if (currentWorkspace?.id === projectWsId) return;
    // Find the workspace object in the already-loaded workspaces array
    // so we can switch with full data (name, role, etc).
    const targetWs = workspaces.find(w => w.id === projectWsId);
    if (targetWs) {
      dispatch(setCurrentWorkspace(targetWs));
    }
  }, [currentProject?.workspace?.id, currentWorkspace?.id, workspaces, dispatch]);

  const { pendingItems, addPendingItem, clearPendingItems, liveEdits, emitLiveEdit, emitInstant, customFieldEvent, setCustomFieldCallback, releaseEditLock } = useSocket(projectId, currentProject?.board?.id);

  const { canEdit, can, isWorkspaceAdmin } = useRole();
  const { confirm, ConfirmDialog } = useConfirm();
  // Project-level permissions — used to gate UI elements that were previously
  // restricted to workspace admins only but should now be available to custom
  // roles with the right permissions.
  const canInvite = isWorkspaceAdmin || can('project.invite');
  const canEditProject = isWorkspaceAdmin || can('project.edit');
  const canDeleteProject = isWorkspaceAdmin || can('project.delete');
  const { celebrate, CelebrationComponent } = useCelebration();

  const [prefetchedCF, setPrefetchedCF] = useState({ fields: null, values: null });
  const [showShare, setShowShare] = useState(searchParams.get('share') === '1');
  const [showCreateList, setShowCreateList] = useState(false);
  const [addSectionTrigger, setAddSectionTrigger] = useState(0);
  const [addTaskTrigger, setAddTaskTrigger] = useState(0);
  const [showCreateTask, setShowCreateTask] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeMemberPopover, setActiveMemberPopover] = useState(null); // { member, index }

  // List view toolbar state
  const [listFilters, setListFilters] = useState({ status: null, priority: null, assignee: null, dueDate: null });
  const [listSortBy, setListSortBy] = useState('none');
  const [listSortDir, setListSortDir] = useState('asc');
  const [listGroupBy, setListGroupBy] = useState(null);
  const [listColumns, setListColumns] = useState({ assignee: true, dueDate: true, status: true, estimatedTime: true, actualTime: true, priority: false });
  const [listSearch, setListSearch] = useState('');
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  const projectMenuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);

    // Try to get boardId from sidebar projects list (already in Redux) for parallel fetch
    const cachedProject = projects.find(p => p.id === projectId);
    const knownBoardId = cachedProject?.board?.id || currentProject?.board?.id;

    const projectPromise = dispatch(fetchProject(projectId)).unwrap();

    // Prefetch custom fields in parallel (don't block on it — best effort)
    const cfPromise = Promise.all([
      api.get(`/api/v1/custom-fields/project/${projectId}`),
      api.get(`/api/v1/custom-fields/project/${projectId}/values`),
    ]).then(([fieldsRes, valuesRes]) => {
      if (!cancelled) {
        const valMap = {};
        (valuesRes.data.data || []).forEach(v => { valMap[`${v.fieldId}-${v.taskId}`] = v.value; });
        setPrefetchedCF({ fields: fieldsRes.data.data || [], values: valMap });
      }
    }).catch(() => {});

    if (knownBoardId) {
      // Parallel: fire all at the same time
      const listsPromise = dispatch(fetchLists(knownBoardId)).unwrap();
      Promise.all([projectPromise, listsPromise, cfPromise])
        .then(() => { if (!cancelled) setInitialLoaded(true); })
        .catch(() => { if (!cancelled) setInitialLoaded(true); });
    } else {
      // Fallback: sequential for lists, parallel for custom fields
      projectPromise.then(async (project) => {
        if (cancelled) return;
        if (project?.board?.id) {
          await dispatch(fetchLists(project.board.id)).unwrap();
        }
        await cfPromise;
        if (!cancelled) setInitialLoaded(true);
      }).catch(() => {
        if (!cancelled) setInitialLoaded(true);
      });
    }

    // Reset local UI state
    setActiveMemberPopover(null);
    setShowProjectMenu(false);
    setEditingProjectName(false);

    return () => { cancelled = true; };
  }, [projectId, dispatch]);

  const [boardSubmitting, setBoardSubmitting] = useState(false);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!currentProject?.board?.id || !newListName.trim() || boardSubmitting) return;
    const name = newListName.trim();
    setBoardSubmitting(true);
    setShowCreateList(false);
    setNewListName('');
    try {
      await dispatch(createList({ boardId: currentProject.board.id, name })).unwrap();
    } finally {
      setBoardSubmitting(false);
    }
  };

  const handleCreateTask = async (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || boardSubmitting) return;
    const title = newTaskTitle.trim();
    setBoardSubmitting(true);
    setShowCreateTask(null);
    setNewTaskTitle('');
    try {
      await dispatch(createTask({ listId, taskData: { title } })).unwrap();
      if (currentProject?.board?.id) dispatch(fetchLists(currentProject.board.id));
    } finally {
      setBoardSubmitting(false);
    }
  };

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    dispatch(moveTaskAction({ taskId: draggableId, listId: destination.droppableId, position: destination.index }))
      .then(() => { if (currentProject?.board?.id) dispatch(fetchLists(currentProject.board.id)); });
  };

  const setView = (view) => setSearchParams(prev => { prev.set('view', view); return prev; });
  const openTask = (taskId) => setSearchParams(prev => { prev.set('task', taskId); return prev; });
  const closeTask = () => setSearchParams(prev => { prev.delete('task'); return prev; });

  const handleAvatarClick = (member, index) => {
    if (!isWorkspaceAdmin) return;
    // Toggle: if same member clicked again, close popover
    if (activeMemberPopover?.member?.userId === member.userId) {
      setActiveMemberPopover(null);
    } else {
      setActiveMemberPopover({ member, index });
    }
  };

  const handleDeleteProject = async () => {
    const ok = await confirm({ title: 'Delete project?', message: `"${currentProject?.name}" and all its tasks, sections, and data will be permanently deleted. This cannot be undone.`, confirmText: 'Delete Project', variant: 'danger' });
    if (!ok) return;
    await dispatch(deleteProject(projectId)).unwrap();
    navigate('/');
  };

  const handleRenameProject = async () => {
    if (!projectNameInput.trim() || projectNameInput === currentProject?.name) {
      setEditingProjectName(false);
      return;
    }
    await dispatch(updateProject({ projectId, data: { name: projectNameInput.trim() } }));
    setEditingProjectName(false);
  };

  const handleToggleVisibility = async () => {
    const newVis = currentProject?.visibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE';
    await dispatch(updateProject({ projectId, data: { visibility: newVis } }));
    setShowProjectMenu(false);
  };

  // Close project menu on outside click
  useEffect(() => {
    if (!showProjectMenu) return;
    const handler = (e) => { if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) setShowProjectMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProjectMenu]);

  if (!isReady) {
    return (
      <div className="h-full flex flex-col overflow-hidden animate-pulse">
        {/* Skeleton header */}
        <div className="bg-[var(--asana-surface)] px-6 pt-5 pb-3 border-b border-[var(--asana-border)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div>
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-1.5" />
                <div className="h-2.5 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="w-20 h-8 rounded-md bg-green-200 dark:bg-green-900/30" />
            </div>
          </div>
          <div className="flex space-x-4">
            {['w-12', 'w-10', 'w-12', 'w-16', 'w-20'].map((w, i) => (
              <div key={i} className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded`} />
            ))}
          </div>
        </div>
        {/* Skeleton content */}
        <div className="flex-1 p-6 bg-[var(--asana-bg)] space-y-3">
          <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-1">
            {/* Skeleton column header */}
            <div className="flex items-center border-b border-[var(--asana-border)] px-4 py-2.5">
              <div className="h-2.5 w-12 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
              <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-700 rounded ml-6" />
              <div className="h-2.5 w-14 bg-gray-200 dark:bg-gray-700 rounded ml-6" />
              <div className="h-2.5 w-12 bg-gray-200 dark:bg-gray-700 rounded ml-6" />
            </div>
            {/* Skeleton section */}
            <div className="px-4 py-2.5 border-b border-[var(--asana-border)]">
              <div className="h-3.5 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
            {/* Skeleton rows */}
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 border-b border-[var(--asana-border)]">
                <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 mr-3" />
                <div className={`h-3 bg-gray-200 dark:bg-gray-700 rounded`} style={{ width: `${35 + i * 10}%` }} />
              </div>
            ))}
            {/* Skeleton second section */}
            <div className="px-4 py-2.5 border-b border-[var(--asana-border)]">
              <div className="h-3.5 w-16 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
            {[...Array(2)].map((_, i) => (
              <div key={`s2-${i}`} className="flex items-center px-4 py-3 border-b border-[var(--asana-border)]">
                <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 mr-3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded" style={{ width: `${25 + i * 15}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const members = currentProject.members || [];
  // Use views from project config, fallback to defaults
  const projectViews = currentProject.views?.length > 0
    ? currentProject.views.map(v => v.charAt(0).toUpperCase() + v.slice(1))
    : ['Overview', 'List', 'Board', 'Timeline', 'Dashboard'];
  // Only keep views that exist in the project config
  const IMPLEMENTED_VIEWS = ['list', 'board'];
  const views = projectViews;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ── Project header ── */}
      <div className="bg-[var(--asana-surface)] px-3 sm:px-6 pt-4 sm:pt-5 border-b border-[var(--asana-border)]">
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-asana flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-sm flex-shrink-0"
              style={{ backgroundColor: currentProject.color || '#4573D2' }}
            >
              {currentProject.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                {editingProjectName ? (
                  <input type="text" value={projectNameInput} onChange={(e) => setProjectNameInput(e.target.value)}
                    autoFocus className="text-base font-bold bg-transparent border-b-2 border-asana-blue outline-none text-[var(--asana-text-primary)] py-0 px-0"
                    onBlur={handleRenameProject}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameProject(); if (e.key === 'Escape') setEditingProjectName(false); }} />
                ) : (
                  <h1 className={`text-base font-bold text-[var(--asana-text-primary)] ${canEditProject ? 'cursor-pointer hover:text-asana-blue transition-colors' : ''}`}
                    onClick={() => { if (canEditProject) { setProjectNameInput(currentProject.name); setEditingProjectName(true); } }}>
                    {currentProject.name}
                  </h1>
                )}
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  currentProject.visibility === 'PRIVATE'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {currentProject.visibility === 'PRIVATE' ? 'Private' : 'Public'}
                </span>
                {currentProject.createdBy?.name && (
                  <span className="text-[10px] text-[var(--asana-text-tertiary)] font-medium hidden sm:inline-flex items-center gap-1">
                    <span className="opacity-50">by</span> {currentProject.createdBy.name}
                  </span>
                )}

                {/* Project actions "..." menu */}
                {(canEditProject || canDeleteProject) && (
                  <div className="relative" ref={projectMenuRef}>
                    <button onClick={() => setShowProjectMenu(!showProjectMenu)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                      </svg>
                    </button>
                    {showProjectMenu && (
                      <div className="absolute top-full left-0 mt-1 w-52 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl z-50 py-1 animate-fade-in">
                        <button onClick={() => { setProjectNameInput(currentProject.name); setEditingProjectName(true); setShowProjectMenu(false); }}
                          className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Rename project
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(window.location.href); setShowProjectMenu(false); }}
                          className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Copy project link
                        </button>
                        <button onClick={handleToggleVisibility}
                          className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {currentProject.visibility === 'PRIVATE' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            )}
                          </svg>
                          {currentProject.visibility === 'PRIVATE' ? 'Make public' : 'Make private'}
                        </button>
                        <div className="border-t border-[var(--asana-border)] my-1" />
                        <button onClick={() => { setShowProjectMenu(false); handleDeleteProject(); }}
                          className="w-full flex items-center px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <svg className="w-4 h-4 mr-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete project
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0">
            {/* ── Member avatars with click popover ── */}
            <div className="hidden sm:flex items-center relative">
              <div className="flex -space-x-2">
                {members.slice(0, 5).map((m, i) => (
                  <div
                    key={m.userId || m.id}
                    className={`w-8 h-8 rounded-full border-2 border-[var(--asana-surface)] flex items-center justify-center text-white text-xs font-bold transition-all relative ${
                      isWorkspaceAdmin ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-asana-blue/40' : ''
                    } ${activeMemberPopover?.member?.userId === m.userId ? 'ring-2 ring-asana-blue scale-110' : ''}`}
                    style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length], zIndex: activeMemberPopover?.member?.userId === m.userId ? 20 : members.length - i }}
                    onClick={() => handleAvatarClick(m, i)}
                  >
                    {m.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                ))}
                {members.length > 5 && (
                  <div
                    className="w-8 h-8 rounded-full border-2 border-[var(--asana-surface)] bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-[var(--asana-text-secondary)] cursor-pointer hover:scale-110 transition-transform"
                    onClick={() => isWorkspaceAdmin && setShowShare(true)}
                  >
                    +{members.length - 5}
                  </div>
                )}
              </div>

              {/* Add member button */}
              {canInvite && (
                <button
                  onClick={() => setShowShare(true)}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[var(--asana-text-secondary)] hover:border-asana-blue hover:text-asana-blue transition-colors ml-1"
                  title="Add member"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}

              {/* Member popover */}
              {activeMemberPopover && canInvite && (
                <MemberPopover
                  member={activeMemberPopover.member}
                  color={MEMBER_COLORS[activeMemberPopover.index % MEMBER_COLORS.length]}
                  position={{ top: '44px', right: '0px' }}
                  onClose={() => setActiveMemberPopover(null)}
                />
              )}
            </div>

            {/* Share button */}
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center text-xs px-2 sm:px-3 py-1.5 rounded-asana bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="hidden sm:inline">Share</span>
            </button>


            {can('section.create') && (
              <button
                onClick={() => {
                  if (activeView === 'list') {
                    setAddSectionTrigger(prev => prev + 1);
                  } else {
                    setShowCreateList(true);
                  }
                }}
                className="asana-button-primary flex items-center text-xs px-3 py-1.5"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Add Section</span>
              </button>
            )}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex space-x-1 overflow-x-auto scrollbar-none">
          {views.map((view) => (
            <button
              key={view}
              onClick={() => setView(view.toLowerCase())}
              className={`px-4 py-2 text-sm font-medium transition-all relative rounded-t-md ${
                activeView === view.toLowerCase()
                  ? 'text-asana-blue'
                  : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
              }`}
            >
              {view}
              {activeView === view.toLowerCase() && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── List view toolbar ── */}
      {activeView === 'list' && (
        <ListToolbar
          filters={listFilters}
          onFiltersChange={setListFilters}
          sortBy={listSortBy}
          sortDir={listSortDir}
          onSortChange={(s, d) => { setListSortBy(s); setListSortDir(d); }}
          groupBy={listGroupBy}
          onGroupChange={setListGroupBy}
          columns={listColumns}
          onColumnsChange={setListColumns}
          members={members}
          canEdit={canEdit}
          canCreateTask={can('task.create')}
          hasActiveFilters={!!(listFilters.status || listFilters.priority || listFilters.assignee || listFilters.dueDate)}
          searchQuery={listSearch}
          onSearchChange={setListSearch}
          onAddTask={() => setAddTaskTrigger(prev => prev + 1)}
        />
      )}

      {/* ── View content ──
          List view manages its own internal scroll container; other views (overview,
          timeline, dashboard, gantt, workload) rely on this wrapper to scroll. We toggle
          overflow on activeView so @hello-pangea/dnd never sees nested scroll parents. */}
      <div className={`flex-1 ${activeView === 'list' ? 'overflow-hidden' : 'overflow-auto'} p-3 sm:p-6 bg-[var(--asana-bg)]`}>
        {activeView === 'board' ? (
          <div className="h-full overflow-x-auto pb-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex h-full space-x-4 items-start">
                {lists.map((list) => (
                  <div key={list.id} className="w-72 flex-shrink-0 flex flex-col max-h-full">
                    <div className="px-2 pb-2 flex items-center justify-between group">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">
                          {list.name}
                        </span>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)] rounded-full px-1.5 py-0.5 font-medium">
                          {list.tasks?.length || 0}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => dispatch(deleteList(list.id))}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-[var(--asana-text-secondary)] hover:text-red-500 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Tasks droppable */}
                    <Droppable droppableId={list.id} type="task">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto space-y-2 min-h-[80px] rounded-asana p-1 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-asana-blue/5 dark:bg-asana-blue/10' : ''
                          }`}
                        >
                          {list.tasks?.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => openTask(task.id)}
                                  className={`asana-card p-3.5 group cursor-pointer ${
                                    snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-asana-blue/30 z-50' : 'hover:-translate-y-0.5'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-[var(--asana-text-primary)] group-hover:text-asana-blue transition-colors line-clamp-2 flex-1">
                                      {task.title}
                                    </p>
                                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.LOW}`} />
                                  </div>

                                  <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center space-x-2">
                                      {task.assignees?.length > 0 && (
                                        <div className="flex -space-x-1.5">
                                          {task.assignees.slice(0, 3).map((a) => (
                                            <div
                                              key={a.user.id}
                                              className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-[9px] font-bold"
                                              style={{ backgroundColor: '#4573D2' }}
                                              title={a.user.name}
                                            >
                                              {a.user.name.charAt(0).toUpperCase()}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {task.dueDate && (
                                        <span className={`text-[10px] font-medium flex items-center px-1.5 py-0.5 rounded ${
                                          new Date(task.dueDate) < new Date()
                                            ? 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
                                            : 'text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700'
                                        }`}>
                                          <svg className="w-2.5 h-2.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </div>
                                    {task.subtasks?.length > 0 && (
                                      <span className="text-[10px] text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                                        {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>

                    {/* Add task */}
                    {canEdit && (
                      <div className="mt-2">
                        {showCreateTask === list.id ? (
                          <form onSubmit={(e) => handleCreateTask(e, list.id)} className="asana-card p-3 animate-fade-in">
                            <textarea
                              placeholder="Task name"
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 resize-none text-[var(--asana-text-primary)] placeholder-gray-400"
                              autoFocus
                              rows={2}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateTask(e, list.id); }
                                if (e.key === 'Escape') setShowCreateTask(null);
                              }}
                            />
                            <div className="flex justify-end space-x-2 mt-2 pt-2 border-t border-[var(--asana-border)]">
                              <button type="button" onClick={() => setShowCreateTask(null)} className="text-xs font-medium text-[var(--asana-text-secondary)] px-2 py-1 hover:text-[var(--asana-text-primary)] transition-colors">Cancel</button>
                              <button type="submit" className="asana-button-primary text-xs py-1 px-3">Add Task</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            onClick={() => setShowCreateTask(list.id)}
                            className="flex items-center text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs font-medium transition-colors p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 w-full"
                          >
                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add task
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add section */}
                {canEdit && (
                  <div className="w-72 flex-shrink-0">
                    {showCreateList ? (
                      <form onSubmit={handleCreateList} className="asana-card p-4 animate-fade-in">
                        <input
                          type="text"
                          placeholder="Section name"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          className="asana-input w-full text-sm mb-3"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Escape' && setShowCreateList(false)}
                        />
                        <div className="flex justify-end space-x-2">
                          <button type="button" onClick={() => setShowCreateList(false)} className="text-xs text-[var(--asana-text-secondary)] px-3 py-1 hover:text-[var(--asana-text-primary)]">Cancel</button>
                          <button type="submit" className="asana-button-primary text-xs py-1 px-4">Add Section</button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setShowCreateList(true)}
                        className="w-full flex items-center justify-center p-3 text-[var(--asana-text-secondary)] hover:text-asana-blue border-2 border-dashed border-[var(--asana-border)] hover:border-asana-blue/30 rounded-asana group transition-all"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium">Add Section</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </DragDropContext>
          </div>
        ) : activeView === 'list' ? (
          <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <ProjectListView
            lists={(() => {
              let processed = listGroupBy ? applyGrouping(lists, listGroupBy) : lists;
              processed = processed.map(l => ({
                ...l,
                tasks: applySort(applyFilters(l.tasks || [], listFilters, listSearch), listSortBy, listSortDir),
              }));
              return processed;
            })()}
            boardId={currentProject?.board?.id}
            onTaskClick={openTask}
            columns={listColumns}
            pendingItems={pendingItems}
            addPendingItem={addPendingItem}
            clearPendingItems={clearPendingItems}
            onCelebrate={celebrate}
            liveEdits={liveEdits}
            emitLiveEdit={emitLiveEdit}
            releaseEditLock={releaseEditLock}
            emitInstant={emitInstant}
            addSectionTrigger={addSectionTrigger}
            addTaskTrigger={addTaskTrigger}
            customFieldEvent={customFieldEvent}
            setCustomFieldCallback={setCustomFieldCallback}
            prefetchedCustomFields={prefetchedCF.fields}
            prefetchedFieldValues={prefetchedCF.values}
          />
          </div>
        ) : activeView === 'overview' ? (
          <OverviewView project={currentProject} lists={lists} members={members} />
        ) : activeView === 'timeline' ? (
          <TimelineView lists={lists} onTaskClick={openTask} />
        ) : activeView === 'dashboard' ? (
          <DashboardView lists={lists} members={members} />
        ) : activeView === 'gantt' ? (
          <GanttView lists={lists} onTaskClick={openTask} />
        ) : activeView === 'workload' ? (
          <WorkloadView lists={lists} members={members} />
        ) : null}
      </div>

      {/* ── Share modal ── */}
      {showShare && (
        <ShareModal
          projectId={projectId}
          emitInstant={emitInstant}
          onClose={() => {
            setShowShare(false);
            setSearchParams(prev => { prev.delete('share'); return prev; });
          }}
        />
      )}

      {/* ── Task detail panel ── */}
      {selectedTaskId && (() => {
        // Find task from lists for instant preview (no loading spinner)
        let previewTask = null;
        for (const list of lists) {
          const found = list.tasks?.find(t => t.id === selectedTaskId)
            || list.tasks?.flatMap(t => t.subtasks || []).find(s => s.id === selectedTaskId);
          if (found) { previewTask = { ...found, list: { id: list.id, name: list.name } }; break; }
        }
        return (
          <div className="absolute inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm animate-fade-in" onClick={closeTask} />
            <div className="w-full max-w-full sm:max-w-2xl bg-[var(--asana-surface)] shadow-2xl relative animate-slide-in-right h-full overflow-y-auto border-l border-[var(--asana-border)]">
              <TaskDetail taskId={selectedTaskId} isEmbedded={true} onClose={closeTask} previewTask={previewTask} emitInstant={emitInstant} />
            </div>
          </div>
        );
      })()}

      {/* Celebration animation */}
      <CelebrationComponent />
      {ConfirmDialog}
    </div>
  );
}

export default ProjectBoard;
