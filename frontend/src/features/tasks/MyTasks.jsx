import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { searchTasks } from '../../store/slices/taskSlice';
import { useNavigate } from 'react-router-dom';

const TABS = ['All Tasks', 'Upcoming', 'Overdue', 'Completed'];

const STATUS_STYLE = {
  TODO: 'text-[var(--asana-text-secondary)]',
  IN_PROGRESS: 'text-asana-blue',
  REVIEW: 'text-yellow-600 dark:text-yellow-400',
  DONE: 'text-green-600 dark:text-green-400',
};

const PRIORITY_DOT = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-gray-300 dark:bg-gray-600',
};

function MyTasks() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { user } = useAppSelector((state) => state.auth);
  const { searchResults: tasks } = useAppSelector((state) => state.task);
  const [activeTab, setActiveTab] = useState('All Tasks');

  useEffect(() => {
    if (currentWorkspace?.id) {
      dispatch(searchTasks({ workspaceId: currentWorkspace.id, query: '' }));
    }
  }, [currentWorkspace, dispatch]);

  const myTasks = tasks.filter(t => t.assignees?.some(a => a.user?.id === user?.id || a.userId === user?.id));

  const filtered = myTasks.filter(task => {
    const now = new Date();
    const due = task.dueDate ? new Date(task.dueDate) : null;
    switch (activeTab) {
      case 'Upcoming': return task.status !== 'DONE' && due && due >= now;
      case 'Overdue': return task.status !== 'DONE' && due && due < now;
      case 'Completed': return task.status === 'DONE';
      default: return true;
    }
  });

  const counts = {
    'All Tasks': myTasks.length,
    'Upcoming': myTasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== 'DONE' && d && d >= new Date(); }).length,
    'Overdue': myTasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== 'DONE' && d && d < new Date(); }).length,
    'Completed': myTasks.filter(t => t.status === 'DONE').length,
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">My Tasks</h1>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Tasks assigned to you across all projects</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-[var(--asana-border)] mb-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-all relative ${
              activeTab === tab
                ? 'text-asana-blue'
                : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
            }`}
          >
            {tab}
            {counts[tab] > 0 && (
              <span className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                activeTab === tab ? 'bg-asana-blue/10 text-asana-blue' : 'bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)]'
              }`}>
                {counts[tab]}
              </span>
            )}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="font-medium text-[var(--asana-text-primary)]">
            {activeTab === 'Completed' ? "No completed tasks yet" : "You're all caught up!"}
          </p>
          <p className="text-sm text-[var(--asana-text-secondary)] mt-1">
            {activeTab === 'All Tasks' ? 'Tasks assigned to you will appear here' : `No ${activeTab.toLowerCase()} tasks`}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana-lg divide-y divide-[var(--asana-border)] overflow-hidden">
          {filtered.map(task => {
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';
            return (
              <div
                key={task.id}
                className="flex items-center px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group transition-colors"
                onClick={() => navigate(`/project/${task.list?.board?.projectId}?task=${task.id}`)}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${
                  task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 group-hover:border-asana-blue'
                }`}>
                  {task.status === 'DONE' && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'} group-hover:text-asana-blue transition-colors truncate`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-[var(--asana-text-secondary)] truncate mt-0.5">{task.list?.name}</p>
                </div>

                <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
                  {task.dueDate && (
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-[var(--asana-text-secondary)]'}`}>
                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  <div className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.LOW}`} />
                  <span className={`text-xs font-medium ${STATUS_STYLE[task.status]}`}>
                    {task.status?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MyTasks;
