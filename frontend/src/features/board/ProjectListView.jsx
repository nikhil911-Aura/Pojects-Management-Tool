import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createTask, createSubtask, updateTask, assignUser, deleteTask } from '../../store/slices/taskSlice';
import { fetchLists, createList, updateList, deleteList, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticRenameSection } from '../../store/slices/boardSlice';
import { useRole } from '../../hooks/useRole';
import api from '../../services/api';

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
function AssigneePicker({ taskId, currentAssignees, members, onClose, onDone }) {
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
    if (user) dispatch(optimisticAssignUser({ taskId, user }));
    onClose();
    dispatch(assignUser({ taskId, userId })).then(() => onDone());
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
function StatusPicker({ taskId, currentStatus, onClose, onDone }) {
  const dispatch = useAppDispatch();
  const ref = useRef(null);
  useClickOutside(ref, onClose);

  const handleChange = async (status) => {
    dispatch(optimisticUpdateTask({ taskId, data: { status } }));
    onClose();
    dispatch(updateTask({ taskId, data: { status } })).then(() => onDone());
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
function TimeCell({ taskId, field, value, canEdit, onDone }) {
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
    dispatch(updateTask({ taskId, data: { [field]: mins } })).then(() => onDone());
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
function TaskRow({ task, indent, members, canEdit, onTaskClick, onRefresh, hasSubtasks, isExpanded, onToggle, cols = {}, customFields = [], fieldValues = {}, onSetFieldValue, depth = 0 }) {
  const dispatch = useAppDispatch();
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
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
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { status: newStatus } }));
    dispatch(updateTask({ taskId: task.id, data: { status: newStatus } })).then(() => onRefresh());
  };

  const handleDelete = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (!canEdit || busy) return;
    dispatch(optimisticDeleteTask(task.id));
    dispatch(deleteTask(task.id)).then(() => onRefresh());
  };

  const handleConvertTo = (type) => {
    setContextMenu(null);
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { taskType: type } }));
    dispatch(updateTask({ taskId: task.id, data: { taskType: type } })).then(() => onRefresh());
  };

  const handleDateChange = (e) => {
    const val = e.target.value;
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { dueDate: val || null } }));
    dispatch(updateTask({ taskId: task.id, data: { dueDate: val || null } })).then(() => onRefresh());
  };

  const handleContextMenu = (e) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;

  return (
    <div className="flex items-stretch border-b border-[var(--asana-border)] hover:bg-gray-50/80 dark:hover:bg-[#2a2e35] cursor-pointer group transition-colors"
      onClick={() => onTaskClick(task.id)}
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
      <div className="flex-1 min-w-0 flex items-center py-[7px] border-r border-[var(--asana-border)]"
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

        {/* Task icon — Circle for tasks, Diamond for milestones, Star for approvals */}
        {isMilestone ? (
          <button onClick={toggleComplete} className="flex-shrink-0 mr-3">
            <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
              <rect x="9" y="1" width="10" height="10" rx="1.5"
                transform="rotate(45 9 1)"
                className={`transition-colors ${task.status === 'DONE' ? 'fill-green-500 stroke-green-500' : 'fill-transparent stroke-gray-400 dark:stroke-gray-500 group-hover:stroke-green-400'}`}
                strokeWidth="2" />
              {task.status === 'DONE' && (
                <path d="M6.5 9.5L8 11L11.5 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              )}
            </svg>
          </button>
        ) : isApproval ? (
          <button onClick={toggleComplete} className="flex-shrink-0 mr-3">
            <svg width="18" height="18" viewBox="0 0 20 20" className="flex-shrink-0">
              <circle cx="10" cy="10" r="7"
                className={`transition-colors ${task.status === 'DONE' ? 'fill-green-500 stroke-green-500' : 'fill-transparent stroke-purple-400 dark:stroke-purple-500 group-hover:stroke-green-400'}`}
                strokeWidth="2" />
              <path d="M7 10l2 2 4-4" stroke={task.status === 'DONE' ? 'white' : 'currentColor'}
                className={task.status === 'DONE' ? '' : 'text-purple-400'}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        ) : (
          <button onClick={toggleComplete}
            className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${
              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
            }`}>
            {task.status === 'DONE' && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        )}

        {/* Title — bold for milestones */}
        <span className={`text-sm truncate ${isMilestone ? 'font-bold' : ''} ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>
          {task.title}
        </span>
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
        <div className="w-[130px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center relative" onClick={(e) => e.stopPropagation()}>
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
              onClose={() => setShowAssigneePicker(false)} onDone={onRefresh} />
          )}
        </div>
      )}

      {/* ── Due date ── */}
      {cols.dueDate && (
        <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center relative" onClick={(e) => e.stopPropagation()}>
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
        <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => canEdit && setShowStatusPicker(true)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded truncate ${statusCfg.cls}`}>
            {statusCfg.label}
          </button>
          {showStatusPicker && (
            <StatusPicker taskId={task.id} currentStatus={task.status}
              onClose={() => setShowStatusPicker(false)} onDone={onRefresh} />
          )}
        </div>
      )}

      {/* ── Priority ── */}
      {cols.priority && (
        <div className="w-[100px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center" onClick={(e) => e.stopPropagation()}>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            task.priority === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
            task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' :
            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}>{task.priority || 'LOW'}</span>
        </div>
      )}

      {/* ── Estimated time ── */}
      {cols.estimatedTime && (
        <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center" onClick={(e) => e.stopPropagation()}>
          <TimeCell taskId={task.id} field="estimatedTime" value={task.estimatedTime} canEdit={canEdit} onDone={onRefresh} />
        </div>
      )}

      {/* ── Actual time ── */}
      {cols.actualTime && (
        <div className="w-[110px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center" onClick={(e) => e.stopPropagation()}>
          <TimeCell taskId={task.id} field="actualTime" value={task.actualTime} canEdit={canEdit} onDone={onRefresh} />
        </div>
      )}

      {/* ── Dynamic custom field cells ── */}
      {customFields.map(cf => (
        <div key={cf.id} className="w-[120px] px-3 py-[7px] flex-shrink-0 border-r border-[var(--asana-border)] flex items-center" onClick={(e) => e.stopPropagation()}>
          <CustomFieldCell
            field={cf}
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
    const fieldOptions = (t === 'SINGLE_SELECT' || t === 'MULTI_SELECT') ? options
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
                  <div className="absolute top-full left-0 mt-1 w-full bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl z-10 py-1 max-h-52 overflow-y-auto">
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
function CustomFieldCell({ field, taskId, value, canEdit, onChange }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const save = () => { onChange(input); setEditing(false); };
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
        <button onClick={() => canEdit && setShowDropdown(!showDropdown)} className="w-full text-left">
          {selected ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: selColor?.bg, color: selColor?.text }}>
              {selected.value}
            </span>
          ) : (
            <span className="text-xs text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="absolute z-50 top-full left-0 mt-1 w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl py-1 animate-fade-in">
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
        <button onClick={() => canEdit && setShowDropdown(!showDropdown)} className="w-full text-left flex flex-wrap gap-0.5">
          {selectedValues.length > 0 ? selectedValues.map(v => {
            const opt = parsedOpts.find(o => o.value === v);
            const c = opt ? (OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0]) : OPTION_COLORS[12];
            return <span key={v} className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>{v}</span>;
          }) : <span className="text-xs text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="absolute z-50 top-full left-0 mt-1 w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl py-1 animate-fade-in">
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

  // NUMBER — with format support
  if (field.type === 'NUMBER') {
    const fmt = parsedOpts[0]?.format || 'number';
    if (editing) {
      return (
        <input type="number" value={input} onChange={(e) => setInput(e.target.value)} autoFocus
          className="text-xs bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full text-right"
          onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
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

  // TEXT, TIME_TRACKING, PEOPLE — inline text editing
  if (editing) {
    return (
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} autoFocus
        className="text-xs bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full"
        onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
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
function TaskTreeNode({ task, depth, listId, members, canEdit, cols, customFields, fieldValues, onSetFieldValue, onTaskClick, onRefresh, expandedTasks, toggleTask, addingSubtaskTo, setAddingSubtaskTo, newSubtaskTitle, setNewSubtaskTitle, handleAddSubtask, pendingItems = [] }) {
  const hasSubtasks = task.subtasks?.length > 0;
  const isExpanded = expandedTasks[task.id];

  return (
    <Fragment>
      <TaskRow task={task} indent={depth > 0} members={members} canEdit={canEdit} cols={cols}
        customFields={customFields} fieldValues={fieldValues} onSetFieldValue={onSetFieldValue}
        onTaskClick={onTaskClick} onRefresh={onRefresh}
        hasSubtasks={hasSubtasks} isExpanded={isExpanded} onToggle={() => toggleTask(task.id)}
        depth={depth} />

      {/* Recursively render subtasks */}
      {isExpanded && task.subtasks?.map((sub) => (
        <TaskTreeNode key={sub.id} task={sub} depth={depth + 1} listId={listId}
          members={members} canEdit={canEdit} cols={cols}
          customFields={customFields} fieldValues={fieldValues} onSetFieldValue={onSetFieldValue}
          onTaskClick={onTaskClick} onRefresh={onRefresh}
          expandedTasks={expandedTasks} toggleTask={toggleTask}
          addingSubtaskTo={addingSubtaskTo} setAddingSubtaskTo={setAddingSubtaskTo}
          newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle}
          handleAddSubtask={handleAddSubtask} pendingItems={pendingItems} />
      ))}

      {/* Add subtask input */}
      {isExpanded && canEdit && (
        <div className="border-b border-[var(--asana-border)]">
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
    <div className="flex items-stretch border-b border-[var(--asana-border)] animate-pulse">
      <div className="flex-1 min-w-0 flex items-center py-[7px] border-r border-[var(--asana-border)]"
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

function ProjectListView({ lists, boardId, onTaskClick, columns = {}, pendingItems = [], addPendingItem, clearPendingItems }) {
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

  useEffect(() => { fetchCustomFields(); }, [fetchCustomFields]);

  const addCustomField = async (name, type, options) => {
    if (!projectId) return;
    try {
      await api.post(`/api/v1/custom-fields/project/${projectId}`, { name, type, options: options || null });
      fetchCustomFields();
    } catch (e) { console.error('Failed to add field:', e); }
    setShowFieldPicker(false);
  };

  const deleteCustomField = async (fieldId) => {
    try {
      await api.delete(`/api/v1/custom-fields/${fieldId}`);
      fetchCustomFields();
    } catch (e) { console.error('Failed to delete field:', e); }
  };

  const setFieldValue = async (fieldId, taskId, value) => {
    // Optimistic
    setFieldValues(prev => ({ ...prev, [`${fieldId}-${taskId}`]: value }));
    try {
      await api.put(`/api/v1/custom-fields/${fieldId}/task/${taskId}`, { value });
    } catch (e) { console.error('Failed to set field value:', e); }
  };

  const toggleSection = (id) => setCollapsedSections(p => ({ ...p, [id]: !p[id] }));

  const handleRenameSection = (listId) => {
    const name = editingSectionName.trim();
    if (!name || name === lists.find(l => l.id === listId)?.name) {
      setEditingSectionId(null);
      return;
    }
    dispatch(optimisticRenameSection({ listId, name }));
    setEditingSectionId(null);
    dispatch(updateList({ listId, data: { name } }));
  };
  const toggleTask = (id) => setExpandedTasks(p => ({ ...p, [id]: !p[id] }));
  const refetch = () => {
    if (boardId) dispatch(fetchLists(boardId));
  };

  const handleAddTask = async (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || submitting) return;
    const title = newTaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    setSubmitting(true);
    setNewTaskTitle('');
    setAddingTaskTo(null);

    // Optimistic: add fake task instantly
    dispatch(optimisticAddTask({
      listId,
      task: { id: tempId, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [], position: 9999 }
    }));
    addPendingItem?.({ type: 'task', listId, title });

    try {
      await dispatch(createTask({ listId, taskData: { title } })).unwrap();
      refetch(); // sync with real server data
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSubtask = async (e, listId, taskId) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || submitting) return;
    const title = newSubtaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    setSubmitting(true);
    setNewSubtaskTitle('');
    setAddingSubtaskTo(null);
    setExpandedTasks(p => ({ ...p, [taskId]: true }));

    // Optimistic: add fake subtask instantly
    dispatch(optimisticAddSubtask({
      listId, taskId,
      subtask: { id: tempId, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [], position: 9999 }
    }));
    addPendingItem?.({ type: 'subtask', listId, taskId, title });

    try {
      await dispatch(createSubtask({ listId, taskId, subtaskData: { title } })).unwrap();
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSection = async (e) => {
    e.preventDefault();
    if (!newSectionName.trim() || !boardId || submitting) return;
    const name = newSectionName.trim();
    const tempId = `temp-section-${Date.now()}`;
    setSubmitting(true);
    setNewSectionName('');
    setAddingSection(false);

    // Optimistic: add fake section instantly
    dispatch(optimisticAddSection({
      section: { id: tempId, name, tasks: [], position: 9999 }
    }));
    addPendingItem?.({ type: 'section', title: name });

    try {
      await dispatch(createList({ boardId, name })).unwrap();
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate section sums
  const getSectionSum = (tasks, field) => {
    return (tasks || []).reduce((sum, t) => sum + (t[field] || 0), 0);
  };

  return (
    <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] overflow-x-auto">
      {/* ── Column headers ── */}
      <div className="flex items-stretch border-b border-[var(--asana-border)] bg-[var(--asana-surface)] sticky top-0 z-10">
        <div className="flex-1 min-w-0 px-4 py-2 border-r border-[var(--asana-border)]">
          <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Name</span>
        </div>
        {cols.assignee && <div className="w-[130px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Assignee</span></div>}
        {cols.dueDate && <div className="w-[110px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Due date</span></div>}
        {cols.status && <div className="w-[110px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Status</span></div>}
        {cols.priority && <div className="w-[100px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Priority</span></div>}
        {cols.estimatedTime && <div className="w-[110px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Estimated ti...</span></div>}
        {cols.actualTime && <div className="w-[110px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[11px] font-semibold text-[var(--asana-text-secondary)]">Actual time</span></div>}

        {/* Dynamic custom field columns */}
        {customFields.map(cf => (
          <div key={cf.id} className="w-[120px] px-3 py-2 flex-shrink-0 border-r border-[var(--asana-border)] group/col">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)] truncate">{cf.name}</span>
              {canEdit && (
                <button onClick={() => deleteCustomField(cf.id)}
                  className="opacity-0 group-hover/col:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[var(--asana-text-secondary)] hover:text-red-500 transition-all">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* + Add field button */}
        {canEdit && (
          <div className="w-[36px] px-1.5 py-2 flex-shrink-0 flex items-center justify-center">
            <button id="add-field-btn" onClick={() => setShowFieldPicker(!showFieldPicker)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Sections ── */}
      <div className="min-w-[900px]">
        {lists.map((list) => {
          const estSum = getSectionSum(list.tasks, 'estimatedTime');
          const actSum = getSectionSum(list.tasks, 'actualTime');

          return (
            <Fragment key={list.id}>
              {/* Section header — click arrow to collapse, double-click name to rename */}
              <div className="flex items-center px-4 py-2 border-b border-[var(--asana-border)] hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group/section">
                <button onClick={() => toggleSection(list.id)} className="mr-2 flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                  <svg className={`w-3 h-3 text-[var(--asana-text-secondary)] transition-transform ${collapsedSections[list.id] ? '-rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {editingSectionId === list.id ? (
                  <input type="text" value={editingSectionName}
                    onChange={(e) => setEditingSectionName(e.target.value)}
                    onBlur={() => handleRenameSection(list.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSection(list.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                    autoFocus
                    className="text-sm font-bold bg-transparent border-b-2 border-asana-blue outline-none text-[var(--asana-text-primary)] py-0 px-0 flex-1 min-w-0" />
                ) : (
                  <span className={`text-sm font-bold text-[var(--asana-text-primary)] truncate ${canEdit ? 'cursor-text hover:text-asana-blue' : ''}`}
                    onDoubleClick={(e) => { if (!canEdit) return; e.stopPropagation(); setEditingSectionId(list.id); setEditingSectionName(list.name); }}
                    onClick={() => toggleSection(list.id)}>
                    {list.name}
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
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete section "${list.name}" and all its tasks?`)) dispatch(deleteList(list.id)); }}
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
                      handleAddSubtask={handleAddSubtask} pendingItems={pendingItems} />
                  ))}

                  {/* Add task row */}
                  {canEdit && (
                    <div className="border-b border-[var(--asana-border)]">
                      {addingTaskTo === list.id ? (
                        <form onSubmit={(e) => handleAddTask(e, list.id)} className="flex items-center px-4 py-[7px]">
                          <span className="w-[18px] mr-1.5 flex-shrink-0" />
                          <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
                          <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
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
                  {(cols.estimatedTime || cols.actualTime) && (estSum > 0 || actSum > 0) && (
                    <div className="flex items-stretch border-b border-[var(--asana-border)] bg-gray-50/50 dark:bg-gray-800/20">
                      <div className="flex-1 min-w-0 px-4 py-1.5 border-r border-[var(--asana-border)]" />
                      {cols.assignee && <div className="w-[130px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]" />}
                      {cols.dueDate && <div className="w-[110px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]" />}
                      {cols.status && <div className="w-[110px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-[10px] font-semibold text-[var(--asana-text-secondary)] uppercase">SUM</span></div>}
                      {cols.priority && <div className="w-[100px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]" />}
                      {cols.estimatedTime && <div className="w-[110px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{estSum > 0 ? formatTime(estSum) : ''}</span></div>}
                      {cols.actualTime && <div className="w-[110px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]"><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{actSum > 0 ? formatTime(actSum) : ''}</span></div>}
                      {customFields.map(cf => <div key={cf.id} className="w-[120px] px-3 py-1.5 flex-shrink-0 border-r border-[var(--asana-border)]" />)}
                    </div>
                  )}
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
                <input type="text" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Section name..." autoFocus
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
      </div>

      {/* Field picker rendered as fixed overlay (outside scroll container) */}
      {showFieldPicker && canEdit && (
        <FieldTypePicker onSelect={addCustomField} onClose={() => setShowFieldPicker(false)} />
      )}
    </div>
  );
}

export default ProjectListView;
