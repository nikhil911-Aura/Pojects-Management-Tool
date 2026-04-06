import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createTask, createSubtask, updateTask, assignUser, deleteTask } from '../../store/slices/taskSlice';
import { fetchLists, createList, updateList, deleteList, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticRenameSection, optimisticReplaceItem } from '../../store/slices/boardSlice';
import { useRole } from '../../hooks/useRole';
import api from '../../services/api';
import { useAutoSave, SaveIndicator } from '../../hooks/useAutoSave';
import TimeTracker from '../../components/TimeTracker';

const STATUS_CONFIG = {
  TODO:        { label: 'To do',       cls: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  REVIEW:      { label: 'Review',      cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' },
  DONE:        { label: 'Completed',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
};

/* ── Helper: format minutes to "Xh Ym" ── */
function formatTime(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h 00m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ── Helper: parse "1h 30m" or "90" to minutes ── */
function parseTime(input) {
  if (!input || !input.trim()) return null;
  const str = input.trim().toLowerCase();
  // Try "Xh Ym" format
  const hm = str.match(/^(\d+)\s*h\s*(\d+)\s*m?$/);
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  // Try "Xh" format
  const hOnly = str.match(/^(\d+)\s*h$/);
  if (hOnly) return parseInt(hOnly[1]) * 60;
  // Try "Xm" format
  const mOnly = str.match(/^(\d+)\s*m$/);
  if (mOnly) return parseInt(mOnly[1]);
  // Try plain number (minutes)
  const num = parseInt(str);
  if (!isNaN(num)) return num;
  return null;
}

/* ═══════════════════════════════════════════
   Dropdown used outside click hook
   ═══════════════════════════════════════════ */
function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => { if (ref.current && !ref.current.contains(e.target)) handler(); };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

/* ═══════════════════════════════════════════
   Assignee Picker
   ═══════════════════════════════════════════ */
function AssigneePicker({ taskId, currentAssignees, members, onClose, onDone, emitInstant, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id) }) {
  const dispatch = useAppDispatch();
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  useClickOutside(ref, onClose);

  const assignedIds = (currentAssignees || []).map(a => a.user?.id || a.userId);
  const filtered = (members || []).filter(m =>
    !assignedIds.includes(m.user?.id || m.userId) &&
    (m.user?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = async (userId) => {
    const user = (members || []).map(m => m.user || m).find(u => u.id === userId);
    if (user) {
      dispatch(optimisticAssignUser({ taskId, user }));
      emitInstant?.('task_assigned', { taskId: resolveId(taskId), user });
    }
    onClose();
    queueOrRun(taskId, (realId) => dispatch(assignUser({ taskId: realId, userId })));
  };

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-56 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl animate-fade-in">
      <div className="p-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people..." autoFocus
          className="w-full px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-md border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400" />
      </div>
      <div className="max-h-40 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-[var(--asana-text-secondary)] text-center py-3">No members found</p>
        ) : filtered.map((m) => {
          const user = m.user || m;
          return (
            <button key={user.id} onClick={() => handleAssign(user.id)}
              className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold mr-2.5 flex-shrink-0"
                style={{ backgroundColor: `hsl(${user.name?.charCodeAt(0) * 15}, 60%, 50%)` }}>
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-[var(--asana-text-primary)] truncate">{user.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Status Picker
   ═══════════════════════════════════════════ */
function StatusPicker({ taskId, currentStatus, onClose, onDone, onCelebrate, emitInstant, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id) }) {
  const dispatch = useAppDispatch();
  const ref = useRef(null);
  useClickOutside(ref, onClose);

  const handleChange = async (status) => {
    dispatch(optimisticUpdateTask({ taskId, data: { status } }));
    emitInstant?.('task_completed', { taskId: resolveId(taskId), status });
    if (status === 'DONE') onCelebrate?.();
    onClose();
    queueOrRun(taskId, (realId) => dispatch(updateTask({ taskId: realId, data: { status } })));
  };

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-40 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl py-1 animate-fade-in">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
        <button key={key} onClick={() => handleChange(key)}
          className="w-full flex items-center px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
          {currentStatus === key && (
            <svg className="w-3.5 h-3.5 ml-auto text-asana-blue" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Editable Time Cell (for estimated/actual)
   ═══════════════════════════════════════════ */
function TimeCell({ taskId, field, value, canEdit, onDone, queueOrRun = (_id, fn) => fn(_id) }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  const startEdit = () => {
    if (!canEdit) return;
    setInput(value != null ? formatTime(value) : '');
    setEditing(true);
  };

  const save = () => {
    const mins = parseTime(input);
    dispatch(optimisticUpdateTask({ taskId, data: { [field]: mins } }));
    setEditing(false);
    queueOrRun(taskId, (realId) => dispatch(updateTask({ taskId: realId, data: { [field]: mins } })).then(() => onDone()));
  };

  if (editing) {
    return (
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
        placeholder="e.g. 1h 30m" autoFocus
        className="w-full text-xs bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <span onClick={startEdit} className={`text-xs cursor-pointer ${value != null ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'}`}>
      {value != null ? formatTime(value) : '—'}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Task Row
   ═══════════════════════════════════════════ */
function TaskRow({ task, indent, members, canEdit, onTaskClick, onRefresh, hasSubtasks, isExpanded, onToggle, cols = {}, customFields = [], fieldValues = {}, onSetFieldValue, depth = 0, onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id) }) {
  const dispatch = useAppDispatch();
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleAutoSave = useAutoSave({
    initialValue: task.title,
    entityId: task.id,
    onSave: async (val) => { queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { title: val } }))); },
    onOptimistic: (val) => dispatch(optimisticUpdateTask({ taskId: task.id, data: { title: val } })),
    onBroadcast: (val) => emitLiveEdit?.({ entityType: 'task', entityId: task.id, field: 'title', value: val }),
    debounceMs: 400,
  });
  const dateRef = useRef(null);
  const contextRef = useRef(null);

  const isMilestone = task.taskType === 'MILESTONE';
  const isApproval = task.taskType === 'APPROVAL';

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => { if (contextRef.current && !contextRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const toggleComplete = (e) => {
    e.stopPropagation();
    if (!canEdit || busy) return;
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    if (newStatus === 'DONE') { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600); onCelebrate?.(); }
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { status: newStatus } }));
    emitInstant?.('task_completed', { taskId: resolveId(task.id), status: newStatus });
    queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { status: newStatus } })));
  };

  const handleDelete = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (!canEdit || busy) return;
    dispatch(optimisticDeleteTask(task.id));
    emitInstant?.('task_deleted', { taskId: resolveId(task.id) });
    queueOrRun(task.id, (realId) => dispatch(deleteTask(realId)));
  };

  const handleConvertTo = (type) => {
    setContextMenu(null);
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { taskType: type } }));
    emitInstant?.('task_field_updated', { taskId: resolveId(task.id), field: 'taskType', value: type });
    queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { taskType: type } })));
  };

  const handleDateChange = (e) => {
    const val = e.target.value;
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { dueDate: val || null } }));
    emitInstant?.('task_field_updated', { taskId: resolveId(task.id), field: 'dueDate', value: val || null });
    queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { dueDate: val || null } })));
  };

  const handleStopEditing = () => {
    titleAutoSave.flush();
    setEditingTitle(false);
  };

  const handleContextMenu = (e) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;

  return (
    <div className={`flex items-stretch border-b border-[var(--asana-border)]/30 hover:bg-gray-50/50 dark:hover:bg-[#2a2e35]/50 cursor-pointer group transition-colors ${justCompleted ? 'row-complete-flash' : ''}`}
      onClick={() => { if (!editingTitle) onTaskClick(task.id); }}
      onContextMenu={handleContextMenu}>

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div ref={contextRef} className="fixed z-[81] w-52 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in"
            style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={(e) => { e.stopPropagation(); toggleComplete(e); setContextMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {task.status === 'DONE' ? 'Mark incomplete' : 'Mark complete'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setContextMenu(null); setEditingTitle(true); }}
              className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Rename
            </button>
            <div className="border-t border-[var(--asana-border)] my-1" />
            {/* Convert to submenu */}
            <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Convert to</div>
            {[
              { type: 'DEFAULT_TASK', label: 'Task', icon: <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" /> },
              { type: 'MILESTONE', label: 'Milestone', icon: <rect x="4" y="4" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45 10 10)" /> },
              { type: 'APPROVAL', label: 'Approval', icon: <path d="M10 3l2.5 5h5.5l-4.5 3.5 1.5 5.5L10 14l-5 3 1.5-5.5L2 8h5.5z" fill="none" stroke="currentColor" strokeWidth="1.5" /> },
            ].map(item => (
              <button key={item.type} onClick={(e) => { e.stopPropagation(); handleConvertTo(item.type); }}
                className={`w-full flex items-center px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 ${task.taskType === item.type ? 'text-asana-blue font-semibold' : 'text-[var(--asana-text-primary)]'}`}>
                <svg className="w-4 h-4 mr-2.5" viewBox="0 0 20 20" fill="none">{item.icon}</svg>
                {item.label}
                {task.taskType === item.type && <svg className="w-3.5 h-3.5 ml-auto text-asana-blue" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
              </button>
            ))}
            <div className="border-t border-[var(--asana-border)] my-1" />
            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/project/${task.list?.board?.project?.id || ''}?task=${task.id}`); setContextMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <svg className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Copy task link
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(e); setContextMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <svg className="w-4 h-4 mr-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete task
            </button>
          </div>
        </>
      )}

      {/* ── Name ── */}
      <div className="w-[45%] min-w-[200px] flex-shrink-0 flex items-center py-[8px] border-r border-[var(--asana-border)]/40"
        style={{ paddingLeft: `${depth * 1.5 + 1}rem`, paddingRight: '0.75rem' }}>
        {/* Expand arrow — shows for any task with subtasks at any depth */}
        {hasSubtasks ? (
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="mr-1.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
            <svg className={`w-3 h-3 text-[var(--asana-text-secondary)] transition-transform ${isExpanded ? '' : '-rotate-90'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : <span className="w-[18px] mr-1.5 flex-shrink-0" />}

        {/* Task icon — Circle / Diamond / Approval with completion animation */}
        {isMilestone ? (
          <button onClick={toggleComplete} className={`flex-shrink-0 mr-3 relative ${justCompleted ? 'celebrate-burst' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" className={`flex-shrink-0 ${justCompleted ? 'check-pop' : ''}`}>
              <rect x="9" y="1" width="10" height="10" rx="1.5"
                transform="rotate(45 9 1)"
                className={`transition-all duration-300 ${task.status === 'DONE' ? 'fill-green-500 stroke-green-500' : 'fill-transparent stroke-gray-400 dark:stroke-gray-500 group-hover:stroke-green-400'}`}
                strokeWidth="2" />
              {task.status === 'DONE' && (
                <path d="M6.5 9.5L8 11L11.5 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
                  className={justCompleted ? 'check-draw' : ''} />
              )}
            </svg>
          </button>
        ) : isApproval ? (
          <button onClick={toggleComplete} className={`flex-shrink-0 mr-3 relative ${justCompleted ? 'celebrate-burst' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 20 20" className={`flex-shrink-0 ${justCompleted ? 'check-pop' : ''}`}>
              <circle cx="10" cy="10" r="7"
                className={`transition-all duration-300 ${task.status === 'DONE' ? 'fill-green-500 stroke-green-500' : 'fill-transparent stroke-purple-400 dark:stroke-purple-500 group-hover:stroke-green-400'}`}
                strokeWidth="2" />
              <path d="M7 10l2 2 4-4" stroke={task.status === 'DONE' ? 'white' : 'currentColor'}
                className={`${task.status === 'DONE' ? '' : 'text-purple-400'} ${justCompleted ? 'check-draw' : ''}`}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        ) : (
          <button onClick={toggleComplete}
            className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-all duration-300 relative ${
              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
            } ${justCompleted ? 'check-pop celebrate-burst' : ''}`}>
            {task.status === 'DONE' && (
              <svg className={`w-2.5 h-2.5 text-white ${justCompleted ? 'check-draw' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 10l4 4L15 6" className={justCompleted ? 'check-draw' : ''} />
              </svg>
            )}
          </button>
        )}

        {/* Title — double-click to rename, bold for milestones */}
        {editingTitle ? (
          <>
            <input type="text" value={titleAutoSave.value}
              onChange={(e) => titleAutoSave.setValue(e.target.value)}
              onBlur={handleStopEditing}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStopEditing(); if (e.key === 'Escape') setEditingTitle(false); }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className={`text-sm bg-transparent border-b-2 border-asana-blue outline-none py-0 px-0 flex-1 min-w-0 ${isMilestone ? 'font-bold' : ''} text-[var(--asana-text-primary)]`} />
            <SaveIndicator status={titleAutoSave.saveStatus} />
          </>
        ) : (
          <span
            className={`text-sm truncate transition-colors duration-300 ${isMilestone ? 'font-bold' : ''} ${canEdit ? 'cursor-text' : ''} ${
              task.status === 'DONE'
                ? `text-[var(--asana-text-secondary)] ${justCompleted ? 'strike-animate' : 'line-through'}`
                : 'text-[var(--asana-text-primary)]'
            }`}
            onClick={(e) => { if (!canEdit) return; e.stopPropagation(); setEditingTitle(true); }}>
            {liveEdits[`task-${task.id}-title`] || task.title}
          </span>
        )}
        {!indent && hasSubtasks && (
          <span className="ml-2 text-[10px] text-[var(--asana-text-secondary)] flex-shrink-0">
            {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
          </span>
        )}

        {/* Delete button (hover) */}
        {canEdit && (
          <button onClick={handleDelete}
            className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--asana-text-secondary)] hover:text-red-500 transition-all flex-shrink-0"
            title="Delete task">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Assignee ── */}
      {cols.assignee && (
        <div className="flex-1 min-w-[90px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => canEdit && setShowAssigneePicker(true)}
            className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md px-1 py-0.5 -mx-1 transition-colors w-full">
            {task.assignees?.length > 0 ? (
              <>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: `hsl(${task.assignees[0].user?.name?.charCodeAt(0) * 15}, 60%, 50%)` }}>
                  {task.assignees[0].user?.name?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-[var(--asana-text-primary)] truncate">{task.assignees[0].user?.name}</span>
              </>
            ) : (
              <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-3 h-3 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </button>
          {showAssigneePicker && (
            <AssigneePicker taskId={task.id} currentAssignees={task.assignees} members={members}
              onClose={() => setShowAssigneePicker(false)} onDone={onRefresh} emitInstant={emitInstant} resolveId={resolveId} queueOrRun={queueOrRun} />
          )}
        </div>
      )}

      {/* ── Due date ── */}
      {cols.dueDate && (
        <div className="flex-1 min-w-[80px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center relative" onClick={(e) => e.stopPropagation()}>
          {canEdit ? (
            <div className="relative cursor-pointer" onClick={() => dateRef.current?.showPicker?.()}>
              <input ref={dateRef} type="date" value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                onChange={handleDateChange} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              {task.dueDate ? (
                <span className={`text-xs ${new Date(task.dueDate) < new Date() ? 'text-red-500 font-medium' : 'text-[var(--asana-text-secondary)]'}`}>
                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              ) : (
                <svg className="w-4 h-4 text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
          ) : task.dueDate ? (
            <span className="text-xs text-[var(--asana-text-secondary)]">{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          ) : null}
        </div>
      )}

      {/* ── Status ── */}
      {cols.status && (
        <div className="flex-1 min-w-[80px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => canEdit && setShowStatusPicker(true)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded truncate ${statusCfg.cls}`}>
            {statusCfg.label}
          </button>
          {showStatusPicker && (
            <StatusPicker taskId={task.id} currentStatus={task.status}
              onClose={() => setShowStatusPicker(false)} onDone={onRefresh} onCelebrate={onCelebrate} emitInstant={emitInstant} resolveId={resolveId} queueOrRun={queueOrRun} />
          )}
        </div>
      )}

      {/* ── Priority ── */}
      {cols.priority && (
        <div className="flex-1 min-w-[70px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center" onClick={(e) => e.stopPropagation()}>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            task.priority === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
            task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' :
            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}>{task.priority || 'LOW'}</span>
        </div>
      )}

      {/* ── Estimated time ── */}
      {cols.estimatedTime && (
        <div className="flex-1 min-w-[75px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center" onClick={(e) => e.stopPropagation()}>
          <TimeCell taskId={task.id} field="estimatedTime" value={task.estimatedTime} canEdit={canEdit} onDone={onRefresh} queueOrRun={queueOrRun} />
        </div>
      )}

      {/* ── Actual time (Time Tracker) ── */}
      {cols.actualTime && (
        <div className="flex-1 min-w-[75px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center" onClick={(e) => e.stopPropagation()}>
          <TimeTracker taskId={resolveId(task.id)} initialTotal={task.actualTime || 0} timerStartedAt={task.timerStartedAt} canEdit={canEdit} emitInstant={emitInstant} />
        </div>
      )}

      {/* ── Dynamic custom field cells ── */}
      {customFields.map(cf => (
        <div key={cf.id} className="flex-1 min-w-[80px] px-3 py-[8px] border-r border-[var(--asana-border)]/40 flex items-center" onClick={(e) => e.stopPropagation()}>
          <CustomFieldCell
            field={{ ...cf, _members: cf.type === 'PEOPLE' ? members : undefined }}
            taskId={task.id}
            value={fieldValues[`${cf.id}-${task.id}`] || ''}
            canEdit={canEdit}
            onChange={(val) => onSetFieldValue(cf.id, task.id, val)}
          />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Color palette (matches real Asana)
   ═══════════════════════════════════════════ */
const OPTION_COLORS = [
  { name: 'red', bg: '#FBD4D0', text: '#CC2D12', dot: '#E8503A' },
  { name: 'orange', bg: '#FFE0CC', text: '#C75300', dot: '#F97316' },
  { name: 'yellow', bg: '#FFF3CC', text: '#9B7700', dot: '#EAB308' },
  { name: 'yellow-green', bg: '#E6F7D2', text: '#527A00', dot: '#84CC16' },
  { name: 'green', bg: '#D3F5E4', text: '#0E7B46', dot: '#22C55E' },
  { name: 'blue-green', bg: '#CCF0F0', text: '#0A6B6B', dot: '#14B8A6' },
  { name: 'aqua', bg: '#CCE5FF', text: '#0055B8', dot: '#0EA5E9' },
  { name: 'blue', bg: '#D6DBFF', text: '#2B38A0', dot: '#4573D2' },
  { name: 'indigo', bg: '#E0D6FF', text: '#5029A0', dot: '#6A67CE' },
  { name: 'purple', bg: '#F0D6FF', text: '#8129A0', dot: '#A855F7' },
  { name: 'magenta', bg: '#FFD6EB', text: '#A01F5C', dot: '#EC4899' },
  { name: 'hot-pink', bg: '#FFD6D6', text: '#A01F1F', dot: '#FC636B' },
  { name: 'cool-gray', bg: '#E5E7EB', text: '#4B5563', dot: '#6B7280' },
];

/* ═══════════════════════════════════════════
   Field Type Picker — 2-step: type → configure → create
   ═══════════════════════════════════════════ */
const FIELD_TYPES = [
  { type: 'SINGLE_SELECT', label: 'Single-select', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { type: 'MULTI_SELECT', label: 'Multi-select', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { type: 'DATE', label: 'Date', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { type: 'PEOPLE', label: 'People', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { type: 'TEXT', label: 'Text', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { type: 'NUMBER', label: 'Number', icon: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14' },
  { type: 'CHECKBOX', label: 'Checkbox', icon: 'M5 13l4 4L19 7' },
  { type: 'TIME_TRACKING', label: 'Time tracking', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

function FieldTypePicker({ onSelect, onClose }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'modal'
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState(FIELD_TYPES[4]); // default TEXT
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [options, setOptions] = useState([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionColor, setNewOptionColor] = useState(OPTION_COLORS[0]);
  const [numberFormat, setNumberFormat] = useState('number');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef(null);

  useEffect(() => {
    if (!showTypeDropdown) return;
    const handler = (e) => { if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setShowTypeDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTypeDropdown]);

  const handleTypeSelect = (ft) => {
    setSelectedType(ft);
    if (!name) setName('');
    setStep('modal');
  };

  const addOption = () => {
    if (!newOptionName.trim()) return;
    setOptions([...options, { value: newOptionName.trim(), color: newOptionColor.name }]);
    setNewOptionName('');
    setNewOptionColor(OPTION_COLORS[(options.length + 1) % OPTION_COLORS.length]);
  };

  const removeOption = (idx) => setOptions(options.filter((_, i) => i !== idx));

  const handleCreate = () => {
    const t = selectedType?.type || 'TEXT';
    // Auto-add any pending option that wasn't submitted yet
    let finalOptions = [...options];
    if ((t === 'SINGLE_SELECT' || t === 'MULTI_SELECT') && newOptionName.trim()) {
      finalOptions.push({ value: newOptionName.trim(), color: newOptionColor.name });
    }
    const fieldOptions = (t === 'SINGLE_SELECT' || t === 'MULTI_SELECT') ? finalOptions
      : t === 'NUMBER' ? [{ format: numberFormat }] : null;
    onSelect(name.trim() || selectedType?.label || 'Field', t, fieldOptions);
  };

  const isSelectType = selectedType?.type === 'SINGLE_SELECT' || selectedType?.type === 'MULTI_SELECT';

  // ── STEP 1: Type picker dropdown ──
  if (step === 'pick') {
    return (
      <>
        <div className="fixed inset-0 z-[90]" onClick={onClose} />
        <div className="fixed z-[91] w-56 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl animate-fade-in"
          style={{ top: document.getElementById('add-field-btn')?.getBoundingClientRect().bottom + 4 || 200, left: Math.min(document.getElementById('add-field-btn')?.getBoundingClientRect().left || 200, window.innerWidth - 240) }}>
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Field types</p>
          </div>
          <div className="max-h-80 overflow-y-auto pb-1">
            {FIELD_TYPES.map(ft => (
              <button key={ft.type} onClick={() => handleTypeSelect(ft)}
                className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <svg className="w-4 h-4 text-[var(--asana-text-secondary)] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ft.icon} />
                </svg>
                <span className="text-sm text-[var(--asana-text-primary)]">{ft.label}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── STEP 2: Add field modal ──
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--asana-surface)] rounded-xl shadow-2xl w-full max-w-[480px] animate-fade-in border border-[var(--asana-border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--asana-border)]">
          <h2 className="text-base font-bold text-[var(--asana-text-primary)]">Add field</h2>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-[var(--asana-text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Field title + Field type row */}
          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[var(--asana-text-primary)] mb-1.5">
                Field title <span className="text-red-500">*</span>
              </label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Phone Number, Address..."
                autoFocus
                className="w-full px-3 py-2 text-sm bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg outline-none text-[var(--asana-text-primary)] placeholder-gray-400 focus:ring-1 focus:ring-asana-blue focus:border-asana-blue" />
            </div>
            <div className="w-[160px]">
              <label className="block text-xs font-semibold text-[var(--asana-text-primary)] mb-1.5">Field type</label>
              <div className="relative" ref={typeDropdownRef}>
                <button onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                  className="w-full flex items-center px-3 py-2 bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg text-sm text-[var(--asana-text-primary)] hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                  <svg className="w-4 h-4 text-[var(--asana-text-secondary)] mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={selectedType?.icon} />
                  </svg>
                  <span className="truncate flex-1 text-left">{selectedType?.label}</span>
                  <svg className="w-3.5 h-3.5 text-[var(--asana-text-secondary)] ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTypeDropdown && (
                  <div className="fixed z-[300] w-[180px] bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 max-h-52 overflow-y-auto"
                    style={{ top: typeDropdownRef.current?.getBoundingClientRect().bottom + 4, left: typeDropdownRef.current?.getBoundingClientRect().left }}>
                    {FIELD_TYPES.map(ft => (
                      <button key={ft.type} onClick={() => { setSelectedType(ft); setShowTypeDropdown(false); }}
                        className={`w-full flex items-center px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedType?.type === ft.type ? 'bg-asana-blue/5 text-asana-blue font-medium' : 'text-[var(--asana-text-primary)]'}`}>
                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ft.icon} />
                        </svg>
                        {ft.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description toggle */}
          {!showDesc ? (
            <button onClick={() => setShowDesc(true)} className="text-xs text-asana-blue hover:underline">+ Add a description</button>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-[var(--asana-text-primary)] mb-1.5">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this field..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg outline-none text-[var(--asana-text-primary)] placeholder-gray-400 resize-none focus:ring-1 focus:ring-asana-blue" />
            </div>
          )}

          {/* ── Type-specific config ── */}

          {/* Single/Multi select options */}
          {isSelectType && (
            <div>
              <label className="block text-xs font-semibold text-[var(--asana-text-primary)] mb-2">Options</label>
              <div className="space-y-1.5">
                {options.map((opt, i) => {
                  const c = OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0];
                  return (
                    <div key={i} className="flex items-center space-x-2 group/opt">
                      <button onClick={() => {
                        const ci = OPTION_COLORS.findIndex(oc => oc.name === opt.color);
                        const next = [...options]; next[i] = { ...opt, color: OPTION_COLORS[(ci + 1) % OPTION_COLORS.length].name };
                        setOptions(next);
                      }} className="w-4 h-4 rounded-full flex-shrink-0 hover:ring-2 hover:ring-gray-300 transition-all" style={{ backgroundColor: c.dot }} title="Change color" />
                      <span className="text-sm text-[var(--asana-text-primary)] flex-1">{opt.value}</span>
                      <button onClick={() => removeOption(i)} className="opacity-0 group-hover/opt:opacity-100 text-[var(--asana-text-secondary)] hover:text-red-500 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
                {/* Add option row */}
                <div className="flex items-center space-x-2 pt-1">
                  <button className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-[var(--asana-border)] hover:ring-2 hover:ring-gray-300 transition-all"
                    style={{ backgroundColor: newOptionColor.dot }}
                    onClick={() => { const idx = OPTION_COLORS.findIndex(c => c.name === newOptionColor.name); setNewOptionColor(OPTION_COLORS[(idx + 1) % OPTION_COLORS.length]); }}
                    title="Click to change color" />
                  <input type="text" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)}
                    placeholder="Add an option..."
                    className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                    onKeyDown={(e) => { if (e.key === 'Enter' && newOptionName.trim()) addOption(); }} />
                  {newOptionName.trim() && (
                    <button onClick={addOption} className="text-asana-blue text-xs font-semibold hover:underline">Add</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Number format */}
          {selectedType?.type === 'NUMBER' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--asana-text-primary)] mb-2">Number format</label>
              <div className="flex space-x-2">
                {[
                  { value: 'number', label: 'Number', sub: '123' },
                  { value: 'percentage', label: 'Percentage', sub: '%' },
                  { value: 'currency', label: 'Currency', sub: '$' },
                ].map(f => (
                  <button key={f.value} onClick={() => setNumberFormat(f.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                      numberFormat === f.value
                        ? 'border-asana-blue bg-asana-blue/5 text-asana-blue'
                        : 'border-[var(--asana-border)] text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}>
                    <span className="block text-sm font-bold">{f.sub}</span>
                    <span className="block mt-0.5">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-[var(--asana-border)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--asana-text-primary)] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim()}
            className="px-5 py-2 text-sm font-semibold asana-button-primary rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            Create field
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Custom Field Cell — Asana-style rendering
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   Custom Field Time Tracker — stores data as JSON in custom field value
   Format: { total: minutes, entries: [{ mins, date, note }], timerStart: ISO|null }
   ═══════════════════════════════════════════ */
function CustomFieldTimeTracker({ taskId, value, canEdit, onChange }) {
  const parsed = (() => {
    try { const p = JSON.parse(value || '{}'); return { total: p.total || 0, entries: p.entries || [], timerStart: p.timerStart || null }; }
    catch { return { total: parseInt(value) || 0, entries: value && parseInt(value) > 0 ? [{ mins: parseInt(value), date: new Date().toISOString(), note: 'Manual' }] : [], timerStart: null }; }
  })();

  const [total, setTotal] = useState(parsed.total);
  const [entries, setEntries] = useState(parsed.entries);
  const [timerStart, setTimerStart] = useState(parsed.timerStart);
  const [elapsed, setElapsed] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [addingTime, setAddingTime] = useState(false);
  const [addInput, setAddInput] = useState('');
  const popupRef = useRef(null);
  const btnRef = useRef(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  // Persist to custom field value as JSON
  const persist = (t, e, ts) => {
    onChange(JSON.stringify({ total: t, entries: e, timerStart: ts }));
  };

  // Timer tick
  useEffect(() => {
    if (!timerStart) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerStart]);

  // Close popup
  useEffect(() => {
    if (!showPopup) return;
    const handler = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setShowPopup(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopup]);

  // Sync from prop
  useEffect(() => {
    try { const p = JSON.parse(value || '{}'); setTotal(p.total || 0); setEntries(p.entries || []); setTimerStart(p.timerStart || null); } catch {}
  }, [value]);

  const parseMins = (str) => {
    const s = str.trim().toLowerCase();
    const hm = s.match(/^(\d+)\s*h\s*(\d+)\s*m?$/); if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
    const ho = s.match(/^(\d+)\s*h$/); if (ho) return parseInt(ho[1]) * 60;
    const mo = s.match(/^(\d+)\s*m$/); if (mo) return parseInt(mo[1]);
    const n = parseInt(s); return isNaN(n) ? 0 : n;
  };

  const fmtMins = (m) => { if (!m) return '0m'; const h = Math.floor(m / 60); const min = m % 60; return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`; };

  const handleStartTimer = () => { const now = new Date().toISOString(); setTimerStart(now); persist(total, entries, now); };
  const handleStopTimer = () => {
    const mins = Math.max(1, Math.round(elapsed / 60));
    const newEntries = [{ mins, date: new Date().toISOString(), note: 'Timer' }, ...entries];
    const newTotal = total + mins;
    setTimerStart(null); setTotal(newTotal); setEntries(newEntries); setElapsed(0);
    persist(newTotal, newEntries, null);
  };
  const handleAddTime = () => {
    const mins = parseMins(addInput); if (mins <= 0) return;
    const newEntries = [{ mins, date: new Date().toISOString(), note: 'Manual' }, ...entries];
    const newTotal = total + mins;
    setTotal(newTotal); setEntries(newEntries); setAddInput(''); setAddingTime(false);
    persist(newTotal, newEntries, timerStart);
  };
  const handleDeleteEntry = (idx) => {
    const e = entries[idx]; const newEntries = entries.filter((_, i) => i !== idx);
    const newTotal = Math.max(0, total - (e?.mins || 0));
    setTotal(newTotal); setEntries(newEntries);
    persist(newTotal, newEntries, timerStart);
  };

  const timerMins = timerStart ? Math.floor(elapsed / 60) : 0;
  const timerDisplay = timerStart ? `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}` : null;

  return (
    <div className="relative w-full">
      <button ref={btnRef} onClick={(e) => { e.stopPropagation(); if (btnRef.current) { const r = btnRef.current.getBoundingClientRect(); const spaceBelow = window.innerHeight - r.bottom; const openAbove = spaceBelow < 300; setPopupPos({ top: openAbove ? null : r.bottom + 4, bottom: openAbove ? (window.innerHeight - r.top + 4) : null, left: Math.min(r.left, window.innerWidth - 300) }); } setShowPopup(true); }}
        className={`text-xs flex items-center w-full ${total > 0 || timerStart ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'}`}>
        {timerStart && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" />}
        {timerStart ? <span className="font-mono text-red-500 font-semibold">{timerDisplay}</span> : total > 0 ? fmtMins(total) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )}
      </button>
      {showPopup && (
        <div ref={popupRef} className="fixed z-[200] w-72 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl animate-fade-in"
          style={{ top: popupPos.top ?? 'auto', bottom: popupPos.bottom ?? 'auto', left: popupPos.left }}
          onClick={(e) => e.stopPropagation()}>
          <div className="max-h-48 overflow-y-auto">
            {entries.map((e, i) => (
              <div key={i} className="flex items-center px-4 py-2.5 border-b border-[var(--asana-border)] group/entry">
                <span className="text-sm font-semibold text-[var(--asana-text-primary)] flex-1">{fmtMins(e.mins)}</span>
                {canEdit && (
                  <button onClick={() => handleDeleteEntry(i)} className="opacity-0 group-hover/entry:opacity-100 p-0.5 text-[var(--asana-text-secondary)] hover:text-red-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
                <span className="text-[10px] text-[var(--asana-text-secondary)] ml-2">{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
            {entries.length === 0 && !timerStart && <p className="text-xs text-[var(--asana-text-secondary)] text-center py-4">No time logged</p>}
          </div>
          {timerStart && (
            <div className="px-4 py-2.5 border-b border-[var(--asana-border)] bg-red-50/50 dark:bg-red-900/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-sm font-mono font-bold text-red-600 dark:text-red-400">{timerDisplay}</span></div>
                <button onClick={handleStopTimer} className="text-xs font-semibold text-red-600 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30">Stop</button>
              </div>
            </div>
          )}
          <div className="px-4 py-3">
            <div className="mb-2"><span className="text-sm font-semibold text-[var(--asana-text-primary)]">{fmtMins(total + timerMins)}</span> <span className="text-[10px] text-[var(--asana-text-secondary)] uppercase">Total</span></div>
            {canEdit && (
              <div className="flex items-center space-x-2">
                {!timerStart ? (
                  <button onClick={handleStartTimer} className="flex items-center text-xs px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Start timer
                  </button>
                ) : (
                  <button onClick={handleStopTimer} className="flex items-center text-xs px-3 py-1.5 rounded-md bg-red-500 text-white font-medium hover:bg-red-600">Stop timer</button>
                )}
                {addingTime ? (
                  <div className="flex items-center space-x-1">
                    <input type="text" value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="1h 30m" autoFocus
                      className="w-20 text-xs px-2 py-1.5 bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-md outline-none text-[var(--asana-text-primary)] focus:ring-1 focus:ring-asana-blue"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTime(); if (e.key === 'Escape') setAddingTime(false); }} />
                    <button onClick={handleAddTime} className="text-xs text-asana-blue font-semibold">Add</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingTime(true)} className="flex items-center text-xs px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add time
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomFieldCell({ field, taskId, value, canEdit, onChange }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const cellBtnRef = useRef(null);
  const debounceRef = useRef(null);

  // Sync input from parent when not editing (e.g., live edits from other users)
  useEffect(() => {
    if (!editing) setInput(value || '');
  }, [value, editing]);

  // Debounced onChange for text/number — only saves + broadcasts after user pauses typing
  const debouncedOnChange = useCallback((val) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { onChange(val); }, 400);
  }, [onChange]);

  // Cleanup debounce timer
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  const openDropdown = () => {
    if (!canEdit) return;
    if (cellBtnRef.current) {
      const r = cellBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      setDropPos({
        top: spaceBelow < 200 ? null : r.bottom + 2,
        bottom: spaceBelow < 200 ? (window.innerHeight - r.top + 2) : null,
        left: Math.min(r.left, window.innerWidth - 200),
      });
    }
    setShowDropdown(!showDropdown);
  };
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const save = () => { if (debounceRef.current) clearTimeout(debounceRef.current); onChange(input); setEditing(false); };
  const opts = field.options ? (typeof field.options === 'string' ? JSON.parse(field.options) : field.options) : [];
  const parsedOpts = Array.isArray(opts) ? opts : [];

  // CHECKBOX
  if (field.type === 'CHECKBOX') {
    return (
      <button onClick={() => canEdit && onChange(value === 'true' ? 'false' : 'true')}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${value === 'true' ? 'bg-asana-blue border-asana-blue' : 'border-gray-300 dark:border-gray-600'} ${canEdit ? 'cursor-pointer' : ''}`}>
        {value === 'true' && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
      </button>
    );
  }

  // SINGLE_SELECT — colored pill display + dropdown
  if (field.type === 'SINGLE_SELECT') {
    const selected = parsedOpts.find(o => o.value === value);
    const selColor = selected ? (OPTION_COLORS.find(c => c.name === selected.color) || OPTION_COLORS[0]) : null;

    return (
      <div className="relative w-full">
        <button ref={cellBtnRef} onClick={openDropdown} className="w-full text-left">
          {selected ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: selColor?.bg, color: selColor?.text }}>
              {selected.value}
            </span>
          ) : (
            <span className="text-xs text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-52 overflow-y-auto"
            style={{ top: dropPos.top ?? 'auto', bottom: dropPos.bottom ?? 'auto', left: dropPos.left }}>
            {/* Clear option */}
            <button onClick={() => { onChange(''); setShowDropdown(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              Clear
            </button>
            {parsedOpts.map((opt) => {
              const c = OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0];
              return (
                <button key={opt.value} onClick={() => { onChange(opt.value); setShowDropdown(false); }}
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 ${value === opt.value ? 'bg-asana-blue/5' : ''}`}>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>
                    {opt.value}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // MULTI_SELECT — multiple colored pills
  if (field.type === 'MULTI_SELECT') {
    const selectedValues = value ? value.split(',').filter(Boolean) : [];
    return (
      <div className="relative w-full">
        <button ref={cellBtnRef} onClick={openDropdown} className="w-full text-left flex flex-wrap gap-0.5">
          {selectedValues.length > 0 ? selectedValues.map(v => {
            const opt = parsedOpts.find(o => o.value === v);
            const c = opt ? (OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0]) : OPTION_COLORS[12];
            return <span key={v} className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>{v}</span>;
          }) : <span className="text-xs text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-52 overflow-y-auto"
            style={{ top: dropPos.top ?? 'auto', bottom: dropPos.bottom ?? 'auto', left: dropPos.left }}>
            {parsedOpts.map(opt => {
              const c = OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0];
              const isSelected = selectedValues.includes(opt.value);
              return (
                <button key={opt.value}
                  onClick={() => {
                    const next = isSelected ? selectedValues.filter(v => v !== opt.value) : [...selectedValues, opt.value];
                    onChange(next.join(','));
                  }}
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isSelected ? 'bg-asana-blue/5' : ''}`}>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>{opt.value}</span>
                  {isSelected && <svg className="w-3 h-3 ml-auto text-asana-blue" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // DATE
  if (field.type === 'DATE') {
    return (
      <input type="date" value={value || ''} onChange={(e) => canEdit && onChange(e.target.value)} readOnly={!canEdit}
        className="text-xs bg-transparent border-none p-0 text-[var(--asana-text-primary)] focus:ring-0 w-full cursor-pointer" />
    );
  }

  // PEOPLE — member picker (like assignee)
  if (field.type === 'PEOPLE') {
    const selectedName = value || '';
    return (
      <div className="relative w-full">
        <button ref={cellBtnRef} onClick={openDropdown} className="w-full text-left flex items-center">
          {selectedName ? (
            <>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold mr-1.5 flex-shrink-0"
                style={{ backgroundColor: `hsl(${selectedName.charCodeAt(0) * 15}, 60%, 50%)` }}>
                {selectedName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-[var(--asana-text-primary)] truncate">{selectedName}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-48 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-48 overflow-y-auto"
            style={{ top: dropPos.top ?? 'auto', bottom: dropPos.bottom ?? 'auto', left: dropPos.left }}>
            <button onClick={() => { onChange(''); setShowDropdown(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">Clear</button>
            {(field._members || []).map(m => {
              const name = m.user?.name || m.name || '';
              return (
                <button key={name} onClick={() => { onChange(name); setShowDropdown(false); }}
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 ${value === name ? 'bg-asana-blue/5' : ''}`}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold mr-2"
                    style={{ backgroundColor: `hsl(${name.charCodeAt(0) * 15}, 60%, 50%)` }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-[var(--asana-text-primary)]">{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // NUMBER — with format support (debounced save — 400ms after last keystroke)
  if (field.type === 'NUMBER') {
    const fmt = parsedOpts[0]?.format || 'number';
    if (editing) {
      return (
        <input type="number" value={input} onChange={(e) => { setInput(e.target.value); debouncedOnChange(e.target.value); }} autoFocus
          className="text-xs bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full text-right"
          onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInput(value || ''); setEditing(false); } }} />
      );
    }
    const display = value ? (fmt === 'currency' ? `$${value}` : fmt === 'percentage' ? `${value}%` : value) : '';
    return (
      <span onClick={() => canEdit && setEditing(true)}
        className={`text-xs text-right block w-full ${value ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'} ${canEdit ? 'cursor-pointer' : ''}`}>
        {display || '—'}
      </span>
    );
  }

  // TIME_TRACKING — full Asana-style timer + entries (uses custom field value as storage)
  if (field.type === 'TIME_TRACKING') {
    return (
      <CustomFieldTimeTracker
        taskId={taskId}
        value={value}
        canEdit={canEdit}
        onChange={onChange}
      />
    );
  }

  // TEXT — inline text editing (debounced save — 400ms after last keystroke)
  if (editing) {
    return (
      <input type="text" value={input} onChange={(e) => { setInput(e.target.value); debouncedOnChange(e.target.value); }} autoFocus
        className="text-xs bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full"
        onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInput(value || ''); setEditing(false); } }} />
    );
  }

  return (
    <span onClick={() => canEdit && setEditing(true)}
      className={`text-xs truncate block ${value ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'} ${canEdit ? 'cursor-pointer' : ''}`}>
      {value || '—'}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Recursive Task Tree Node — renders task + subtasks at any depth
   ═══════════════════════════════════════════ */
function TaskTreeNode({ task, depth, listId, members, canEdit, cols, customFields, fieldValues, onSetFieldValue, onTaskClick, onRefresh, expandedTasks, toggleTask, addingSubtaskTo, setAddingSubtaskTo, newSubtaskTitle, setNewSubtaskTitle, handleAddSubtask, pendingItems = [], onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, resolveId, queueOrRun }) {
  const hasSubtasks = task.subtasks?.length > 0;
  const isExpanded = expandedTasks[task.id];

  return (
    <Fragment>
      <TaskRow task={task} indent={depth > 0} members={members} canEdit={canEdit} cols={cols}
        customFields={customFields} fieldValues={fieldValues} onSetFieldValue={onSetFieldValue}
        onTaskClick={onTaskClick} onRefresh={onRefresh}
        hasSubtasks={hasSubtasks} isExpanded={isExpanded} onToggle={() => toggleTask(task.id)}
        depth={depth} onCelebrate={onCelebrate} liveEdits={liveEdits} emitLiveEdit={emitLiveEdit} emitInstant={emitInstant} releaseEditLock={releaseEditLock} resolveId={resolveId} queueOrRun={queueOrRun} />

      {/* Recursively render subtasks */}
      {isExpanded && task.subtasks?.map((sub) => (
        <TaskTreeNode key={sub.id} task={sub} depth={depth + 1} listId={listId}
          members={members} canEdit={canEdit} cols={cols}
          customFields={customFields} fieldValues={fieldValues} onSetFieldValue={onSetFieldValue}
          onTaskClick={onTaskClick} onRefresh={onRefresh}
          expandedTasks={expandedTasks} toggleTask={toggleTask}
          addingSubtaskTo={addingSubtaskTo} setAddingSubtaskTo={setAddingSubtaskTo}
          newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle}
          handleAddSubtask={handleAddSubtask} pendingItems={pendingItems} onCelebrate={onCelebrate} liveEdits={liveEdits} emitLiveEdit={emitLiveEdit} emitInstant={emitInstant} releaseEditLock={releaseEditLock} resolveId={resolveId} queueOrRun={queueOrRun} />
      ))}

      {/* Add subtask input */}
      {isExpanded && canEdit && (
        <div className="border-b border-[var(--asana-border)]/30">
          {addingSubtaskTo?.taskId === task.id ? (
            <form onSubmit={(e) => handleAddSubtask(e, listId, task.id)} className="flex items-center py-[6px]"
              style={{ paddingLeft: `${(depth + 1) * 1.5 + 2.5}rem`, paddingRight: '1.5rem' }}>
              <div className="w-[16px] h-[16px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
              <input type="text" value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Add subtask..." autoFocus
                className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSubtaskTo(null); setNewSubtaskTitle(''); } }}
                onBlur={() => { if (!newSubtaskTitle.trim()) { setAddingSubtaskTo(null); setNewSubtaskTitle(''); } }} />
            </form>
          ) : (
            <button onClick={() => setAddingSubtaskTo({ listId, taskId: task.id })}
              className="flex items-center py-[6px] w-full text-left text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 1.5 + 2.5}rem`, paddingRight: '1.5rem' }}>
              Add subtask...
            </button>
          )}
        </div>
      )}
    </Fragment>
  );
}

/* ═══════════════════════════════════════════
   Main ProjectListView
   ═══════════════════════════════════════════ */
/* ── Inline skeleton row for pending items ── */
function PendingRow({ title, type, depth = 0 }) {
  return (
    <div className="flex items-stretch border-b border-[var(--asana-border)]/30 animate-pulse">
      <div className="w-[45%] min-w-[200px] flex-shrink-0 flex items-center py-[8px] border-r border-[var(--asana-border)]/40"
        style={{ paddingLeft: `${depth * 1.5 + 1}rem`, paddingRight: '0.75rem' }}>
        <span className="w-[18px] mr-1.5 flex-shrink-0" />
        {type === 'section' ? (
          <div className="h-3.5 w-28 bg-gray-300/40 dark:bg-gray-600/40 rounded" />
        ) : (
          <>
            <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200/50 dark:border-gray-700/50 flex-shrink-0 mr-3" />
            <div className="h-3 bg-gray-200/50 dark:bg-gray-700/50 rounded" style={{ width: `${Math.min(title?.length * 8 || 120, 250)}px` }} />
          </>
        )}
      </div>
      <div className="w-[130px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)]" />
      <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)]" />
      <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)]">
        {type !== 'section' && <div className="h-5 w-12 bg-gray-200/40 dark:bg-gray-700/40 rounded" />}
      </div>
    </div>
  );
}

function ProjectListView({ lists, boardId, onTaskClick, columns = {}, pendingItems = [], addPendingItem, clearPendingItems, onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, addSectionTrigger = 0, customFieldEvent, setCustomFieldCallback }) {
  const cols = { assignee: true, dueDate: true, status: true, estimatedTime: true, actualTime: true, priority: false, ...columns };
  const dispatch = useAppDispatch();
  const { canEdit } = useRole();
  const { currentProject } = useAppSelector((state) => state.project);
  const members = currentProject?.members || [];

  const [collapsedSections, setCollapsedSections] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null);
  const [addingSection, setAddingSection] = useState(false);
  const addSectionInputRef = useRef(null);

  // Respond to "Add Section" button from header
  useEffect(() => {
    if (addSectionTrigger > 0) {
      setAddingSection(true);
      setNewSectionName('');
      setTimeout(() => addSectionInputRef.current?.focus(), 100);
    }
  }, [addSectionTrigger]);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customFields, setCustomFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({}); // { `${fieldId}-${taskId}`: value }
  const [showFieldPicker, setShowFieldPicker] = useState(false);

  const projectId = currentProject?.id;

  // Fetch custom fields + values
  const fetchCustomFields = useCallback(async () => {
    if (!projectId) return;
    try {
      const [fieldsRes, valuesRes] = await Promise.all([
        api.get(`/api/v1/custom-fields/project/${projectId}`),
        api.get(`/api/v1/custom-fields/project/${projectId}/values`),
      ]);
      setCustomFields(fieldsRes.data.data || []);
      const valMap = {};
      (valuesRes.data.data || []).forEach(v => { valMap[`${v.fieldId}-${v.taskId}`] = v.value; });
      setFieldValues(valMap);
    } catch (e) { /* project might not exist yet */ }
  }, [projectId]);

  // Clear stale custom fields when project changes, then fetch fresh
  useEffect(() => {
    setCustomFields([]);
    setFieldValues({});
    fetchCustomFields();
  }, [fetchCustomFields]);

  // Handle custom field events from other users via direct callback (instant, no React state cycle)
  useEffect(() => {
    setCustomFieldCallback?.((evt) => {
      if (!evt?.event) return;
      if (evt.event === 'custom_field_added' && evt.field) {
        setCustomFields(prev => prev.some(f => f.id === evt.field.id) ? prev : [...prev, evt.field]);
      }
      if (evt.event === 'custom_field_deleted' && evt.fieldId) {
        setCustomFields(prev => prev.filter(f => f.id !== evt.fieldId));
      }
      if (evt.event === 'custom_field_value_set' && evt.fieldId && evt.taskId) {
        setFieldValues(prev => ({ ...prev, [`${evt.fieldId}-${evt.taskId}`]: evt.value }));
      }
      if (evt.event === 'custom_field_replaced' && evt.tempId && evt.field) {
        setCustomFields(prev => prev.map(f => f.id === evt.tempId ? evt.field : f));
      }
    });
    return () => setCustomFieldCallback?.(null);
  }, [setCustomFieldCallback]);

  const addCustomField = async (name, type, options) => {
    if (!projectId) return;
    const tempId = `temp-field-${Date.now()}`;
    const tempField = { id: tempId, name, type: type || 'TEXT', options: options || null, position: customFields.length };

    // 1. Optimistic local
    setCustomFields(prev => [...prev, tempField]);
    // 2. Broadcast to others
    emitInstant?.('custom_field_added', { field: tempField });
    // 3. Background API — then broadcast real field to replace temp
    setShowFieldPicker(false);
    try {
      const res = await api.post(`/api/v1/custom-fields/project/${projectId}`, { name, type, options: options || null });
      const realField = res.data.data;
      // Replace temp with real locally
      setCustomFields(prev => prev.map(f => f.id === tempId ? realField : f));
      // Broadcast real field to other users
      emitInstant?.('custom_field_replaced', { tempId, field: realField });
    } catch (e) { console.error('Failed to add field:', e); }
  };

  const deleteCustomField = async (fieldId) => {
    // 1. Optimistic local
    setCustomFields(prev => prev.filter(f => f.id !== fieldId));
    // 2. Broadcast to others
    emitInstant?.('custom_field_deleted', { fieldId });
    // 3. Background API
    try {
      await api.delete(`/api/v1/custom-fields/${fieldId}`);
    } catch (e) { console.error('Failed to delete field:', e); }
  };

  const setFieldValue = async (fieldId, taskId, value) => {
    // Optimistic local
    setFieldValues(prev => ({ ...prev, [`${fieldId}-${taskId}`]: value }));
    // Broadcast to others
    emitInstant?.('custom_field_value_set', { fieldId, taskId: resolveId(taskId), value });
    // Background API — queue if task still has temp ID
    queueOrRun(taskId, async (realId) => {
      try {
        await api.put(`/api/v1/custom-fields/${fieldId}/task/${realId}`, { value });
      } catch (e) { console.error('Failed to set field value:', e); }
    });
  };

  const toggleSection = (id) => setCollapsedSections(p => ({ ...p, [id]: !p[id] }));

  const sectionSaveTimerRef = useRef(null);

  const handleSectionNameChange = (listId, name) => {
    setEditingSectionName(name);
    dispatch(optimisticRenameSection({ listId, name }));
    emitLiveEdit?.({ entityType: 'section', entityId: listId, field: 'name', value: name });

    if (sectionSaveTimerRef.current) clearTimeout(sectionSaveTimerRef.current);
    sectionSaveTimerRef.current = setTimeout(() => {
      if (name.trim()) queueOrRun(listId, (realId) => dispatch(updateList({ listId: realId, data: { name: name.trim() } })));
    }, 400);
  };

  const handleStopEditingSection = (listId) => {
    if (sectionSaveTimerRef.current) clearTimeout(sectionSaveTimerRef.current);
    const name = editingSectionName.trim();
    if (name && name !== lists.find(l => l.id === listId)?.name) {
      queueOrRun(listId, (realId) => dispatch(updateList({ listId: realId, data: { name } })));
    }
    setEditingSectionId(null);
  };
  const toggleTask = (id) => setExpandedTasks(p => ({ ...p, [id]: !p[id] }));
  const refetch = () => { if (boardId) dispatch(fetchLists(boardId)); };

  // ── Temp ID → Real ID mapping + pending operations queue ──
  // When a task/subtask/section is created optimistically, it gets a temp ID.
  // Any edits made before the API returns are queued and replayed once the real ID is available.
  const idMapRef = useRef({}); // { 'temp-123': 'uuid-abc', ... }
  const pendingOpsRef = useRef({}); // { 'temp-123': [() => dispatch(updateTask(...)), ...] }

  const resolveId = (id) => idMapRef.current[id] || id;

  // Queue an API operation for a temp ID — will execute immediately if real ID is ready
  const queueOrRun = (tempOrRealId, makeApiCall) => {
    const realId = idMapRef.current[tempOrRealId] || tempOrRealId;
    if (!realId.startsWith('temp-')) {
      // Real ID available — execute immediately
      makeApiCall(realId);
    } else {
      // Still temp — queue for later
      if (!pendingOpsRef.current[tempOrRealId]) pendingOpsRef.current[tempOrRealId] = [];
      pendingOpsRef.current[tempOrRealId].push(makeApiCall);
    }
  };

  // Flush all queued operations for a temp ID once its real ID is known
  const flushPendingOps = (tempId, realId) => {
    const ops = pendingOpsRef.current[tempId];
    if (ops?.length) {
      ops.forEach(fn => fn(realId));
      delete pendingOpsRef.current[tempId];
    }
  };

  const handleAddTask = (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const title = newTaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    const task = { id: tempId, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [], position: 9999 };

    dispatch(optimisticAddTask({ listId, task }));
    emitInstant?.('task_added', { listId, task });
    setNewTaskTitle('');
    dispatch(createTask({ listId, taskData: { title } })).unwrap().then((realTask) => {
      idMapRef.current[tempId] = realTask.id;
      dispatch(optimisticReplaceItem({ tempId, item: realTask }));
      emitInstant?.('task_replaced', { tempId, listId, task: realTask });
      flushPendingOps(tempId, realTask.id);
    }).catch(() => {});
  };

  const handleAddSubtask = (e, listId, taskId) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const title = newSubtaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    const subtask = { id: tempId, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [], position: 9999 };

    dispatch(optimisticAddSubtask({ listId, taskId, subtask }));
    emitInstant?.('subtask_added', { listId, taskId, subtask });
    setNewSubtaskTitle('');
    setExpandedTasks(p => ({ ...p, [taskId]: true }));

    // The parent task might have a temp ID — resolve it before API call
    const doCreate = (resolvedParentId) => {
      const resolvedListId = resolveId(listId);
      dispatch(createSubtask({ listId: resolvedListId, taskId: resolvedParentId, subtaskData: { title } })).unwrap().then((realSub) => {
        idMapRef.current[tempId] = realSub.id;
        dispatch(optimisticReplaceItem({ tempId, item: realSub }));
        emitInstant?.('subtask_replaced', { tempId, taskId, subtask: realSub });
        flushPendingOps(tempId, realSub.id);
      }).catch(() => {});
    };
    queueOrRun(taskId, doCreate);
  };

  const handleAddSection = (e) => {
    e.preventDefault();
    if (!newSectionName.trim() || !boardId) return;
    const name = newSectionName.trim();
    const tempId = `temp-section-${Date.now()}`;
    const section = { id: tempId, name, tasks: [], position: 9999 };

    dispatch(optimisticAddSection({ section }));
    emitInstant?.('section_added', { section });
    setNewSectionName('');
    setAddingSection(false);
    dispatch(createList({ boardId, name })).unwrap().then((realSection) => {
      idMapRef.current[tempId] = realSection.id;
      dispatch(optimisticReplaceItem({ tempId, item: realSection }));
      emitInstant?.('section_replaced', { tempId, section: realSection });
      flushPendingOps(tempId, realSection.id);
    }).catch(() => {});
  };

  // Calculate section sums
  const getSectionSum = (tasks, field) => {
    return (tasks || []).reduce((sum, t) => sum + (t[field] || 0), 0);
  };

  return (
    <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)]/50 overflow-x-auto relative">
      {/* + Add field — absolute top-right corner */}
      {canEdit && (
        <button id="add-field-btn" onClick={() => setShowFieldPicker(!showFieldPicker)}
          className="absolute top-0 right-0 z-20 w-8 h-[33px] flex items-center justify-center bg-[var(--asana-surface)] border-l border-b border-[var(--asana-border)]/40 rounded-tr-lg rounded-bl-lg text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Add field">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
      {/* ── Column headers ── */}
      <div className="flex items-stretch border-b border-[var(--asana-border)]/60 bg-[var(--asana-surface)] sticky top-0 z-10">
        <div className="w-[45%] min-w-[200px] px-4 py-2 border-r border-[var(--asana-border)]/40 flex-shrink-0">
          <span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Name</span>
        </div>
        {cols.assignee && <div className="flex-1 min-w-[90px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Assignee</span></div>}
        {cols.dueDate && <div className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Due date</span></div>}
        {cols.status && <div className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Status</span></div>}
        {cols.priority && <div className="flex-1 min-w-[70px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Priority</span></div>}
        {cols.estimatedTime && <div className="flex-1 min-w-[75px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Estimated ti...</span></div>}
        {cols.actualTime && <div className="flex-1 min-w-[75px] px-3 py-2 border-r border-[var(--asana-border)]/40"><span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Actual time</span></div>}

        {/* Dynamic custom field columns */}
        {customFields.map(cf => (
          <div key={cf.id} className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center group/col">
            <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)] truncate flex-1">{cf.name}</span>
              {canEdit && (
                <button onClick={() => deleteCustomField(cf.id)}
                  className="opacity-0 group-hover/col:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[var(--asana-text-secondary)] hover:text-red-500 transition-all ml-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
          </div>
        ))}

      </div>

      {/* ── Sections ── */}
      <div className="min-w-[900px]">
        {lists.map((list) => {
          const estSum = getSectionSum(list.tasks, 'estimatedTime');
          const actSum = getSectionSum(list.tasks, 'actualTime');

          return (
            <Fragment key={list.id}>
              {/* Section header — click arrow to collapse, double-click name to rename */}
              <div className="flex items-center px-4 py-2 border-b border-[var(--asana-border)]/40 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group/section">
                <button onClick={() => toggleSection(list.id)} className="mr-2 flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                  <svg className={`w-3 h-3 text-[var(--asana-text-secondary)] transition-transform ${collapsedSections[list.id] ? '-rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {editingSectionId === list.id ? (
                  <input type="text" value={editingSectionName}
                    onChange={(e) => handleSectionNameChange(list.id, e.target.value)}
                    onBlur={() => handleStopEditingSection(list.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStopEditingSection(list.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                    autoFocus
                    className="text-sm font-bold bg-transparent border-b-2 border-asana-blue outline-none text-[var(--asana-text-primary)] py-0 px-0 flex-1 min-w-0" />
                ) : (
                  <span className={`text-sm font-bold text-[var(--asana-text-primary)] truncate ${canEdit ? 'cursor-text hover:text-asana-blue' : ''}`}
                    onDoubleClick={(e) => { if (!canEdit) return; e.stopPropagation(); setEditingSectionId(list.id); setEditingSectionName(list.name); }}
                    onClick={() => toggleSection(list.id)}>
                    {liveEdits[`section-${list.id}-name`] || list.name}
                  </span>
                )}

                <span className="ml-2 text-[10px] text-[var(--asana-text-secondary)] bg-gray-200/80 dark:bg-gray-700 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
                  {list.tasks?.length || 0}
                </span>

                {canEdit && editingSectionId !== list.id && (
                  <div className="ml-auto flex items-center space-x-0.5 opacity-0 group-hover/section:opacity-100 transition-all flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEditingSectionId(list.id); setEditingSectionName(list.name); }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]" title="Rename">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete section "${list.name}" and all its tasks?`)) { emitInstant?.('section_deleted', { listId: resolveId(list.id) }); dispatch({ type: 'board/deleteList/fulfilled', payload: list.id }); queueOrRun(list.id, (realId) => dispatch(deleteList(realId))); } }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--asana-text-secondary)] hover:text-red-500" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {!collapsedSections[list.id] && (
                <>
                  {list.tasks?.map((task) => (
                    <TaskTreeNode key={task.id} task={task} depth={0} listId={list.id}
                      members={members} canEdit={canEdit} cols={cols}
                      customFields={customFields} fieldValues={fieldValues} onSetFieldValue={setFieldValue}
                      onTaskClick={onTaskClick} onRefresh={refetch}
                      expandedTasks={expandedTasks} toggleTask={toggleTask}
                      addingSubtaskTo={addingSubtaskTo} setAddingSubtaskTo={setAddingSubtaskTo}
                      newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle}
                      handleAddSubtask={handleAddSubtask} pendingItems={pendingItems} onCelebrate={onCelebrate} liveEdits={liveEdits} emitLiveEdit={emitLiveEdit} emitInstant={emitInstant} releaseEditLock={releaseEditLock} resolveId={resolveId} queueOrRun={queueOrRun} />
                  ))}

                  {/* Add task row */}
                  {canEdit && (
                    <div className="border-b border-[var(--asana-border)]/30">
                      {addingTaskTo === list.id ? (
                        <form onSubmit={(e) => handleAddTask(e, list.id)} className="flex items-center px-4 py-[7px]">
                          <span className="w-[18px] mr-1.5 flex-shrink-0" />
                          <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
                          <input type="text" value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Write a task name, press Enter" autoFocus
                            className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                            onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle(''); } }}
                            onBlur={() => { if (!newTaskTitle.trim()) { setAddingTaskTo(null); setNewTaskTitle(''); } }} />
                        </form>
                      ) : (
                        <button onClick={() => { setAddingTaskTo(list.id); setNewTaskTitle(''); }}
                          className="flex items-center px-4 py-[7px] w-full text-left text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors">
                          <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add task...
                        </button>
                      )}
                    </div>
                  )}

                  {/* Section summary row (SUM) */}
                  {(() => {
                    const cfSums = {};
                    customFields.forEach(cf => {
                      if (cf.type === 'TIME_TRACKING' || cf.type === 'NUMBER') {
                        let sum = 0;
                        (list.tasks || []).forEach(t => {
                          const val = fieldValues[`${cf.id}-${t.id}`];
                          if (val) {
                            if (cf.type === 'TIME_TRACKING') {
                              try { sum += (JSON.parse(val).total || 0); } catch { sum += (parseInt(val) || 0); }
                            } else { sum += (parseFloat(val) || 0); }
                          }
                        });
                        if (sum > 0) cfSums[cf.id] = sum;
                      }
                    });
                    const hasCfSums = Object.keys(cfSums).length > 0;
                    if (!(estSum > 0 || actSum > 0 || hasCfSums)) return null;
                    return (
                      <div className="flex items-stretch border-b border-[var(--asana-border)]/30 bg-gray-50/50 dark:bg-gray-800/20">
                        <div className="w-[45%] min-w-[200px] flex-shrink-0 px-4 py-1.5 border-r border-[var(--asana-border)]/40" />
                        {cols.assignee && <div className="flex-1 min-w-[90px] px-3 py-1.5 border-r border-[var(--asana-border)]/40" />}
                        {cols.dueDate && <div className="flex-1 min-w-[80px] px-3 py-1.5 border-r border-[var(--asana-border)]/40" />}
                        {cols.status && <div className="flex-1 min-w-[80px] px-3 py-1.5 border-r border-[var(--asana-border)]/40"><span className="text-[10px] font-semibold text-[var(--asana-text-secondary)] uppercase">SUM</span></div>}
                        {cols.priority && <div className="flex-1 min-w-[70px] px-3 py-1.5 border-r border-[var(--asana-border)]/40" />}
                        {cols.estimatedTime && <div className="flex-1 min-w-[75px] px-3 py-1.5 border-r border-[var(--asana-border)]/40"><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{estSum > 0 ? formatTime(estSum) : ''}</span></div>}
                        {cols.actualTime && <div className="flex-1 min-w-[75px] px-3 py-1.5 border-r border-[var(--asana-border)]/40"><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{actSum > 0 ? formatTime(actSum) : ''}</span></div>}
                        {customFields.map(cf => {
                          const cfSum = cfSums[cf.id];
                          return (
                            <div key={cf.id} className="flex-1 min-w-[80px] px-3 py-1.5 border-r border-[var(--asana-border)]/40">
                              {cfSum ? (
                                <span className="text-xs font-semibold text-[var(--asana-text-primary)]">
                                  {cf.type === 'TIME_TRACKING' ? formatTime(cfSum) :
                                   cf.type === 'NUMBER' ? (() => {
                                     const opts = typeof cf.options === 'string' ? JSON.parse(cf.options || '[]') : (cf.options || []);
                                     const fmt = opts[0]?.format || 'number';
                                     return fmt === 'currency' ? `$${cfSum}` : fmt === 'percentage' ? `${cfSum}%` : String(cfSum);
                                   })() : String(cfSum)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </Fragment>
          );
        })}

        {/* Add section */}
        {canEdit && (
          <div className="px-4 py-2.5">
            {addingSection ? (
              <form onSubmit={handleAddSection} className="flex items-center space-x-2">
                <input type="text" value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  ref={addSectionInputRef}
                  placeholder="Section name, press Enter" autoFocus
                  className="text-sm font-bold bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400 flex-1"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }}
                  onBlur={() => { if (!newSectionName.trim()) { setAddingSection(false); setNewSectionName(''); } }} />
              </form>
            ) : (
              <button onClick={() => { setAddingSection(true); setNewSectionName(''); }}
                className="flex items-center text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors">
                <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add section
              </button>
            )}
          </div>
        )}
        {/* ── Grand Total row (all sections combined) ── */}
      {(() => {
        const allTasks = lists.flatMap(l => l.tasks || []);
        const totalEst = allTasks.reduce((s, t) => s + (t.estimatedTime || 0), 0);
        const totalAct = allTasks.reduce((s, t) => s + (t.actualTime || 0), 0);

        // Custom field totals
        const cfTotals = {};
        customFields.forEach(cf => {
          if (cf.type === 'TIME_TRACKING' || cf.type === 'NUMBER') {
            let sum = 0;
            allTasks.forEach(t => {
              const val = fieldValues[`${cf.id}-${t.id}`];
              if (val) {
                if (cf.type === 'TIME_TRACKING') {
                  try { sum += (JSON.parse(val).total || 0); } catch { sum += (parseInt(val) || 0); }
                } else { sum += (parseFloat(val) || 0); }
              }
            });
            if (sum > 0) cfTotals[cf.id] = sum;
          }
        });

        const hasTotals = totalEst > 0 || totalAct > 0 || Object.keys(cfTotals).length > 0;
        if (!hasTotals) return null;

        return (
          <div className="flex items-stretch border-t border-[var(--asana-border)]/50 bg-gray-100/50 dark:bg-gray-800/40 font-semibold">
            <div className="w-[45%] min-w-[200px] flex-shrink-0 px-4 py-2 border-r border-[var(--asana-border)]/40 flex items-center">
              <span className="text-xs font-bold text-[var(--asana-text-primary)] uppercase tracking-wider">Total</span>
            </div>
            {cols.assignee && <div className="flex-1 min-w-[90px] px-3 py-2 border-r border-[var(--asana-border)]/40" />}
            {cols.dueDate && <div className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40" />}
            {cols.status && <div className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40" />}
            {cols.priority && <div className="flex-1 min-w-[70px] px-3 py-2 border-r border-[var(--asana-border)]/40" />}
            {cols.estimatedTime && (
              <div className="flex-1 min-w-[75px] px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center">
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{totalEst > 0 ? formatTime(totalEst) : ''}</span>
              </div>
            )}
            {cols.actualTime && (
              <div className="flex-1 min-w-[75px] px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center">
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{totalAct > 0 ? formatTime(totalAct) : ''}</span>
              </div>
            )}
            {customFields.map(cf => (
              <div key={cf.id} className="flex-1 min-w-[80px] px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center">
                {cfTotals[cf.id] ? (
                  <span className="text-xs font-bold text-[var(--asana-text-primary)]">
                    {cf.type === 'TIME_TRACKING' ? formatTime(cfTotals[cf.id]) :
                     cf.type === 'NUMBER' ? (() => {
                       const opts = typeof cf.options === 'string' ? JSON.parse(cf.options || '[]') : (cf.options || []);
                       const fmt = opts[0]?.format || 'number';
                       return fmt === 'currency' ? `$${cfTotals[cf.id]}` : fmt === 'percentage' ? `${cfTotals[cf.id]}%` : String(cfTotals[cf.id]);
                     })() : String(cfTotals[cf.id])}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        );
      })()}
      </div>

      {/* Field picker rendered as fixed overlay (outside scroll container) */}
      {showFieldPicker && canEdit && (
        <FieldTypePicker onSelect={addCustomField} onClose={() => setShowFieldPicker(false)} />
      )}
    </div>
  );
}

export default ProjectListView;
