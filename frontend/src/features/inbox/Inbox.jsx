import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector } from '../../store/hooks';
import api from '../../services/api';
import io from 'socket.io-client';
import TaskDetail from '../tasks/TaskDetail';

const STATUS_BADGE = {
  TODO:        { label: 'To do',        cls: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300' },
  IN_PROGRESS: { label: 'In progress',  cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  REVIEW:      { label: 'Review',       cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
  DONE:        { label: 'Completed',    cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
};

const PRIORITY_DOT = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-gray-300 dark:bg-gray-600',
};

function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDate(items) {
  const groups = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const item of items) {
    const dateStr = new Date(item.createdAt).toDateString();
    const label = dateStr === today ? 'Today'
      : dateStr === yesterday ? 'Yesterday'
      : new Date(item.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return Object.entries(groups);
}

function Inbox() {
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { user } = useAppSelector((state) => state.auth);
  const workspaceId = currentWorkspace?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'completed'

  const fetchInbox = useCallback(async (cursor = null) => {
    if (!workspaceId) return;
    const isMore = !!cursor;
    isMore ? setLoadingMore(true) : setLoading(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      params.append('limit', '30');
      const res = await api.get(`/api/v1/activities/workspace/${workspaceId}/inbox?${params}`);
      const data = res.data.data;
      setItems(prev => isMore ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    } finally {
      isMore ? setLoadingMore(false) : setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Mark inbox as seen when this page opens
  useEffect(() => {
    if (workspaceId) {
      api.post(`/api/v1/activities/workspace/${workspaceId}/inbox/mark-seen`).catch(() => {});
    }
  }, [workspaceId]);

  // Real-time: refresh when tasks are assigned/reassigned
  useEffect(() => {
    if (!workspaceId || !user?.id) return;
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const token = localStorage.getItem('accessToken');
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket'] });

    socket.on('connect', () => socket.emit('join_workspace', workspaceId));
    socket.on('my_tasks_changed', (data) => {
      if (data?.affectedUserIds?.includes(user.id)) fetchInbox();
    });

    return () => socket.disconnect();
  }, [workspaceId, user?.id, fetchInbox]);

  // Filter
  const filtered = items.filter(item => {
    const status = item.task?.status;
    if (filter === 'pending') return status !== 'DONE';
    if (filter === 'completed') return status === 'DONE';
    return true;
  });

  const counts = {
    all: items.length,
    pending: items.filter(i => i.task?.status !== 'DONE').length,
    completed: items.filter(i => i.task?.status === 'DONE').length,
  };

  const grouped = groupByDate(filtered);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--karya-text-primary)]">Inbox</h1>
          <p className="text-sm text-[var(--karya-text-secondary)] mt-1">Tasks assigned to you</p>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] font-bold text-[var(--karya-text-secondary)] bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
            {counts.pending} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-1 border-b border-[var(--karya-border)] mb-6">
        {[
          { key: 'all', label: 'All Tasks' },
          { key: 'pending', label: 'Pending' },
          { key: 'completed', label: 'Completed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-all relative ${
              filter === tab.key
                ? 'text-karya-blue'
                : 'text-[var(--karya-text-secondary)] hover:text-[var(--karya-text-primary)]'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                filter === tab.key ? 'bg-karya-blue/10 text-karya-blue' : 'bg-gray-100 dark:bg-gray-700 text-[var(--karya-text-secondary)]'
              }`}>
                {counts[tab.key]}
              </span>
            )}
            {filter === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-karya-blue rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-xl">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--karya-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="font-semibold text-[var(--karya-text-primary)]">No tasks here</p>
          <p className="text-sm text-[var(--karya-text-secondary)] mt-1.5 max-w-xs">
            {filter === 'completed' ? 'No completed tasks yet.' : filter === 'pending' ? 'No pending tasks — you\'re all caught up!' : 'Tasks assigned to you will appear here.'}
          </p>
        </div>
      )}

      {/* Task list grouped by date */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([dateLabel, dateItems]) => (
            <div key={dateLabel}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] mb-2 px-1">
                {dateLabel}
              </h3>
              <div className="bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-xl overflow-hidden divide-y divide-[var(--karya-border)]">
                {dateItems.map(item => {
                  const task = item.task;
                  if (!task) return null;
                  const projectName = task.list?.board?.project?.name;
                  const projectColor = task.list?.board?.project?.color || '#4573D2';
                  const projectId = task.list?.board?.projectId || task.list?.board?.project?.id;
                  const status = STATUS_BADGE[task.status] || STATUS_BADGE.TODO;
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

                  return (
                    <div
                      key={item.id || task.id}
                      className="flex items-center px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group transition-colors"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      {/* Status circle */}
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 ${
                        task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 group-hover:border-karya-blue'
                      }`}>
                        {task.status === 'DONE' && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>

                      {/* Task info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${task.status === 'DONE' ? 'text-[var(--karya-text-secondary)]' : 'text-[var(--karya-text-primary)]'} group-hover:text-karya-blue transition-colors`}>
                          {task.title}
                        </p>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: projectColor }} />
                          <p className="text-[11px] text-[var(--karya-text-secondary)] truncate">
                            {projectName}{task.list?.name ? ` · ${task.list.name}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                        {task.dueDate && (
                          <span className={`text-[11px] font-medium ${isOverdue ? 'text-red-500' : 'text-[var(--karya-text-secondary)]'}`}>
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.LOW}`} />
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${status.cls}`}>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-[var(--karya-text-muted)]">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchInbox(nextCursor)}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-semibold text-karya-blue hover:bg-karya-blue/5 rounded-md transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Task detail modal */}
      {selectedTaskId && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedTaskId(null)} />
          <div className="w-full max-w-2xl bg-[var(--karya-surface)] shadow-2xl relative animate-slide-in-right h-full overflow-y-auto border-l border-[var(--karya-border)]">
            <TaskDetail taskId={selectedTaskId} isEmbedded onClose={() => setSelectedTaskId(null)} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Inbox;
