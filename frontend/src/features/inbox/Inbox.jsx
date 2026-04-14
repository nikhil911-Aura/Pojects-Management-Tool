import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector } from '../../store/hooks';
import api from '../../services/api';
import io from 'socket.io-client';
import TaskDetail from '../tasks/TaskDetail';

// ── Action display config ───────────────────────────────────────────────────
const ACTION_CONFIG = {
  TASK_CREATED:    { label: 'created a task',           icon: 'plus',    color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  SUBTASK_CREATED: { label: 'added a subtask',          icon: 'plus',    color: 'text-blue-500',  bg: 'bg-blue-100 dark:bg-blue-900/30' },
  TASK_UPDATED:    { label: 'updated a task',            icon: 'edit',    color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  COMMENT_ADDED:   { label: 'commented on a task',       icon: 'comment', color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  TASK_COMPLETED:  { label: 'marked a task complete',    icon: 'check',   color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  TASK_ASSIGNED:   { label: 'assigned a task',           icon: 'user',    color: 'text-blue-500',  bg: 'bg-blue-100 dark:bg-blue-900/30' },
  TASK_DELETED:    { label: 'deleted a task',            icon: 'trash',   color: 'text-red-500',   bg: 'bg-red-100 dark:bg-red-900/30' },
  ATTACHMENT_ADDED:{ label: 'added an attachment',       icon: 'file',    color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
};

const DEFAULT_CONFIG = { label: 'performed an action', icon: 'bell', color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' };

function formatTimeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
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
    const label = dateStr === today ? 'Today' : dateStr === yesterday ? 'Yesterday' : new Date(item.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return Object.entries(groups);
}

// ── Main Component ──────────────────────────────────────────────────────────
function Inbox() {
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const workspaceId = currentWorkspace?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'comments' | 'updates' | 'assignments'

  // ── Fetch notifications ─────────────────────────────────────────────────
  const fetchInbox = useCallback(async (cursor = null) => {
    if (!workspaceId) return;
    const isLoadMore = !!cursor;
    isLoadMore ? setLoadingMore(true) : setLoading(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      params.append('limit', '30');
      const res = await api.get(`/api/v1/activities/workspace/${workspaceId}/inbox?${params}`);
      const data = res.data.data;

      setItems(prev => isLoadMore ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    } finally {
      isLoadMore ? setLoadingMore(false) : setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // ── Real-time updates via socket ────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const token = localStorage.getItem('accessToken');
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket'] });

    socket.on('connect', () => {
      socket.emit('join_workspace', workspaceId);
    });

    // Refresh inbox when relevant events occur
    const refreshEvents = [
      'task_created', 'task_updated', 'task_deleted',
      'user_assigned', 'user_removed', 'my_tasks_changed',
    ];
    refreshEvents.forEach(event => {
      socket.on(event, () => fetchInbox());
    });

    return () => socket.disconnect();
  }, [workspaceId, fetchInbox]);

  // ── Filter logic ────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'comments') return item.action === 'COMMENT_ADDED';
    if (filter === 'updates') return ['TASK_UPDATED', 'TASK_COMPLETED', 'TASK_CREATED', 'SUBTASK_CREATED'].includes(item.action);
    if (filter === 'assignments') return ['TASK_ASSIGNED', 'user_assigned'].includes(item.action);
    return true;
  });

  const grouped = groupByDate(filtered);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">Inbox</h1>
          <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Notifications and updates from your projects</p>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
            {items.length} notification{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-1 border-b border-[var(--asana-border)] mb-6">
        {[
          { key: 'all', label: 'All' },
          { key: 'comments', label: 'Comments' },
          { key: 'updates', label: 'Updates' },
          { key: 'assignments', label: 'Assignments' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-all relative ${
              filter === tab.key
                ? 'text-asana-blue'
                : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
            }`}
          >
            {tab.label}
            {filter === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start space-x-3 p-4 bg-[var(--asana-surface)] rounded-lg animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="font-semibold text-[var(--asana-text-primary)] text-base">You're all caught up</p>
          <p className="text-sm text-[var(--asana-text-secondary)] mt-1.5 max-w-xs">
            {filter === 'all'
              ? 'Notifications about task assignments, comments, and project updates will appear here.'
              : `No ${filter} notifications yet.`}
          </p>
        </div>
      )}

      {/* Notification list grouped by date */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([dateLabel, dateItems]) => (
            <div key={dateLabel}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-2 px-1">
                {dateLabel}
              </h3>
              <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl overflow-hidden divide-y divide-[var(--asana-border)]">
                {dateItems.map(item => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onTaskClick={setSelectedTaskId}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchInbox(nextCursor)}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-semibold text-asana-blue hover:bg-asana-blue/5 rounded-md transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Loading...
                  </span>
                ) : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Task detail modal */}
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

// ── Notification row ────────────────────────────────────────────────────────
function NotificationRow({ item, onTaskClick }) {
  const config = ACTION_CONFIG[item.action] || DEFAULT_CONFIG;
  const projectName = item.task?.list?.board?.project?.name;
  const projectColor = item.task?.list?.board?.project?.color || '#4573D2';
  const taskTitle = item.task?.title || 'a task';
  const isClickable = !!item.task?.id;

  // Build detail text from action details
  const detailText = (() => {
    const d = item.details;
    if (!d) return null;
    if (item.action === 'TASK_UPDATED' && d.changed) {
      return `Changed: ${d.changed.join(', ')}`;
    }
    if (item.action === 'COMMENT_ADDED') return 'Left a comment';
    if (d.title) return d.title;
    return null;
  })();

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${isClickable ? 'hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer' : ''}`}
      onClick={() => isClickable && onTaskClick(item.task.id)}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: `hsl(${(item.user?.name || '').charCodeAt(0) * 15}, 60%, 50%)` }}
        >
          {item.user?.name?.charAt(0).toUpperCase() || '?'}
        </div>
        {/* Action icon badge */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center ${config.bg} ring-2 ring-[var(--asana-surface)]`}>
          <ActionIcon type={config.icon} className={`w-2.5 h-2.5 ${config.color}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--asana-text-primary)] leading-snug">
          <span className="font-semibold">{item.user?.name || 'Someone'}</span>
          <span className="text-[var(--asana-text-secondary)]"> {config.label}</span>
        </p>

        {/* Task reference */}
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: projectColor }} />
          <p className="text-xs text-[var(--asana-text-secondary)] truncate">
            <span className="font-medium text-[var(--asana-text-primary)]">{taskTitle}</span>
            {projectName && <span> · {projectName}</span>}
          </p>
        </div>

        {/* Detail text */}
        {detailText && (
          <p className="text-[11px] text-[var(--asana-text-muted)] mt-0.5 truncate">{detailText}</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-[var(--asana-text-muted)] flex-shrink-0 mt-0.5">
        {formatTimeAgo(item.createdAt)}
      </span>
    </div>
  );
}

// ── Action icons ────────────────────────────────────────────────────────────
function ActionIcon({ type, className }) {
  const props = { className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' };
  switch (type) {
    case 'plus':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>;
    case 'edit':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
    case 'comment':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
    case 'check':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>;
    case 'user':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
    case 'trash':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
    case 'file':
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>;
    default:
      return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
  }
}

export default Inbox;
