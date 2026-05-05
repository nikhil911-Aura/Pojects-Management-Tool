import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchMyTasks } from '../../store/slices/taskSlice';
import { useRole } from '../../hooks/useRole';
import TaskDetail from './TaskDetail';
import io from 'socket.io-client';

const TABS = ['All Tasks', 'Upcoming', 'Overdue', 'Completed'];

const STATUS_STYLE = {
  TODO: 'text-[var(--asana-text-secondary)]',
  IN_PROGRESS: 'text-asana-blue',
  REVIEW: 'text-yellow-600 dark:text-yellow-400',
  DONE: 'text-green-600 dark:text-green-400',
};
const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Completed' };

const PRIORITY_DOT = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-gray-300 dark:bg-gray-600',
};

function MyTasks() {
  const dispatch = useAppDispatch();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { myTasks, teamTasks, myTasksLoading: loading } = useAppSelector((state) => state.task);
  const { isWorkspaceAdmin } = useRole();
  const [activeTab, setActiveTab] = useState('All Tasks');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamTab, setTeamTab] = useState('All Tasks');
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (currentWorkspace?.id) {
      dispatch(fetchMyTasks({ workspaceId: currentWorkspace.id }));
    }
  }, [currentWorkspace?.id, dispatch]);

  // Real-time: listen for my_tasks_changed on the workspace room
  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return;

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const token = localStorage.getItem('accessToken');
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join_workspace', currentWorkspace.id);
    });

    socket.on('my_tasks_changed', (data) => {
      // Refetch if the current user is affected, or if admin (team tasks might change)
      const affected = data?.affectedUserIds || [];
      if (affected.includes(user.id) || isWorkspaceAdmin) {
        dispatch(fetchMyTasks({ workspaceId: currentWorkspace.id }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentWorkspace?.id, user?.id, isWorkspaceAdmin, dispatch]);

  const filterTasks = (tasks, tab) => {
    return tasks.filter(task => {
      const now = new Date();
      const due = task.dueDate ? new Date(task.dueDate) : null;
      switch (tab) {
        case 'Upcoming': return task.status !== 'DONE' && due && due >= now;
        case 'Overdue': return task.status !== 'DONE' && due && due < now;
        case 'Completed': return task.status === 'DONE';
        default: return true;
      }
    });
  };

  const countTasks = (tasks) => ({
    'All Tasks': tasks.length,
    'Upcoming': tasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== 'DONE' && d && d >= new Date(); }).length,
    'Overdue': tasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== 'DONE' && d && d < new Date(); }).length,
    'Completed': tasks.filter(t => t.status === 'DONE').length,
  });

  const myFiltered = filterTasks(myTasks, activeTab);
  const myCounts = countTasks(myTasks);

  // Team tasks: filter by search + tab
  const teamFiltered = filterTasks(teamTasks, teamTab).filter(t => {
    if (!teamSearch) return true;
    const q = teamSearch.toLowerCase();
    return t.title?.toLowerCase().includes(q)
      || t.assignees?.some(a => a.user?.name?.toLowerCase().includes(q))
      || t.list?.board?.project?.name?.toLowerCase().includes(q);
  });
  const teamCounts = countTasks(teamTasks);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* ── My Tasks section ── */}
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">My Tasks</h1>
          <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Tasks assigned to you across all projects</p>
        </div>

        <TabBar tabs={TABS} active={activeTab} counts={myCounts} onChange={setActiveTab} />

        {loading && myTasks.length === 0 ? (
          <LoadingSkeleton />
        ) : myFiltered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <TaskList tasks={myFiltered} onTaskClick={setSelectedTaskId} />
        )}
      </div>

      {/* ── Team Tasks section (OWNER/ADMIN only) ── */}
      {isWorkspaceAdmin && teamTasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--asana-text-primary)]">Team Tasks</h2>
              <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">
                All tasks assigned to workspace members ({teamTasks.length} total)
              </p>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by task, person, or project..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-[var(--asana-border)] rounded-md text-xs bg-[var(--asana-surface)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30 w-72"
              />
            </div>
          </div>

          <TabBar tabs={TABS} active={teamTab} counts={teamCounts} onChange={setTeamTab} />

          {loading && teamTasks.length === 0 ? (
            <LoadingSkeleton />
          ) : teamFiltered.length === 0 ? (
            <EmptyState tab={teamTab} message="No team tasks match your filters" />
          ) : (
            <TaskList tasks={teamFiltered} onTaskClick={setSelectedTaskId} showAssignee />
          )}
        </div>
      )}

      {/* ── Task detail modal (portal to body so it's above everything) ── */}
      {selectedTaskId && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedTaskId(null)} />
          <div className="w-full max-w-2xl bg-[var(--asana-surface)] shadow-2xl relative animate-slide-in-right h-full overflow-y-auto border-l border-[var(--asana-border)]">
            <TaskDetail taskId={selectedTaskId} isEmbedded onClose={() => setSelectedTaskId(null)} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, counts, onChange }) {
  return (
    <div className="flex space-x-1 border-b border-[var(--asana-border)] mb-5">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-4 py-2 text-sm font-medium transition-all relative ${
            active === tab
              ? 'text-asana-blue'
              : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
          }`}
        >
          {tab}
          {counts[tab] > 0 && (
            <span className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
              active === tab ? 'bg-asana-blue/10 text-asana-blue' : 'bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)]'
            }`}>
              {counts[tab]}
            </span>
          )}
          {active === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />}
        </button>
      ))}
    </div>
  );
}

// ── Task list ───────────────────────────────────────────────────────────────
function TaskList({ tasks, onTaskClick, showAssignee = false }) {
  return (
    <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl divide-y divide-[var(--asana-border)] overflow-hidden">
      {tasks.map(task => {
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';
        const projectId = task.list?.board?.projectId || task.list?.board?.project?.id;
        const projectName = task.list?.board?.project?.name;
        const projectColor = task.list?.board?.project?.color || '#4573D2';
        const assignee = task.assignees?.[0]?.user;

        return (
          <div
            key={task.id}
            className="flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group transition-colors"
            onClick={() => onTaskClick(task.id)}
          >
            {/* Status circle */}
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${
              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 group-hover:border-asana-blue'
            }`}>
              {task.status === 'DONE' && (
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Assignee avatar (team view only) */}
            {showAssignee && assignee && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mr-3"
                style={{ backgroundColor: `hsl(${(assignee.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}
                title={assignee.name}
              >
                {assignee.name?.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${task.status === 'DONE' ? 'text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'} group-hover:text-asana-blue transition-colors truncate`}>
                {task.title}
              </p>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: projectColor }} />
                <p className="text-[11px] text-[var(--asana-text-secondary)] truncate">
                  {projectName}{task.list?.name ? ` · ${task.list.name}` : ''}
                  {showAssignee && assignee && <span className="ml-1.5">· {assignee.name}</span>}
                </p>
              </div>
            </div>

            {/* Right side info */}
            <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
              {task.dueDate && (
                <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-[var(--asana-text-secondary)]'}`}>
                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <div className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.LOW}`} title={task.priority} />
              <span className={`text-xs font-medium min-w-[70px] text-right ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABEL[task.status] || task.status?.replace('_', ' ')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ tab, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
        <svg className="w-7 h-7 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-[var(--asana-text-primary)]">
        {tab === 'Completed' ? 'No completed tasks yet' : "You're all caught up!"}
      </p>
      <p className="text-xs text-[var(--asana-text-secondary)] mt-1">
        {message || (tab === 'All Tasks' ? 'Tasks assigned to you will appear here' : `No ${tab.toLowerCase()} tasks`)}
      </p>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

export default MyTasks;
