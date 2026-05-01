import { useState, useEffect, useRef, useCallback, Fragment, createContext, useContext } from 'react';
import { Check, X, Plus, ChevronDown, Pencil, Trash2, Clock, Timer, Calendar, Users, Hash, Type, CheckSquare, ListChecks, CircleDot, Link2, Flag, DollarSign, GripVertical, AlignLeft, Circle, Diamond, Star } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createTask, createSubtask, updateTask, assignUser, reassignUser, deleteTask, moveTask as moveTaskAction } from '../../store/slices/taskSlice';
import { fetchLists, createList, updateList, deleteList, moveTask as moveTaskOptimistic, optimisticMoveTaskAnywhere, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticRenameSection, optimisticReplaceItem } from '../../store/slices/boardSlice';
import { useRole } from '../../hooks/useRole';
import { useConfirm } from '../../hooks/useConfirm';
import api from '../../services/api';
import { useAutoSave, SaveIndicator } from '../../hooks/useAutoSave';
import TimeTracker from '../../components/TimeTracker';

const STATUS_CONFIG = {
  TODO:        { label: 'To do',       dot: '#94A3B8', cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700/70 dark:text-gray-200 ring-1 ring-inset ring-gray-300/50 dark:ring-gray-600/50' },
  IN_PROGRESS: { label: 'In progress', dot: '#3B82F6', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-1 ring-inset ring-blue-300/40 dark:ring-blue-700/40' },
  BLOCKED:     { label: 'Blocked',     dot: '#EF4444', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-1 ring-inset ring-red-300/40 dark:ring-red-700/40' },
  REVIEW:      { label: 'Review',      dot: '#F59E0B', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 ring-1 ring-inset ring-yellow-300/40 dark:ring-yellow-700/40' },
  NEXT_SPRINT: { label: 'Next sprint', dot: '#8B5CF6', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 ring-1 ring-inset ring-purple-300/40 dark:ring-purple-700/40' },
  DONE:        { label: 'Completed',   dot: '#22C55E', cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 ring-1 ring-inset ring-green-300/40 dark:ring-green-700/40' },
};

const PRIORITY_CONFIG = {
  HIGH:   { label: 'High',   dot: '#EF4444', icon: '🔴', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 ring-1 ring-inset ring-red-300/40 dark:ring-red-700/40' },
  MEDIUM: { label: 'Medium', dot: '#F59E0B', icon: '🟡', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-300/40 dark:ring-amber-700/40' },
  LOW:    { label: 'Low',    dot: '#22C55E', icon: '🟢', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-inset ring-emerald-300/40 dark:ring-emerald-700/40' },
};

/* ── Due-date helpers: overdue / today / relative ── */
function getDueMeta(dueDate, status) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDue   = new Date(due.getFullYear(),  due.getMonth(),  due.getDate());
  const diffDays = Math.round((startDue - startToday) / 86400000);
  const done = status === 'DONE';
  let tone = 'neutral';
  if (!done) {
    if (diffDays < 0) tone = 'overdue';
    else if (diffDays === 0) tone = 'today';
    else if (diffDays <= 2) tone = 'soon';
  }
  let rel;
  if (diffDays === 0) rel = 'Today';
  else if (diffDays === 1) rel = 'Tomorrow';
  else if (diffDays === -1) rel = 'Yesterday';
  else if (diffDays > 1 && diffDays <= 7) rel = `In ${diffDays}d`;
  else if (diffDays < -1 && diffDays >= -7) rel = `${-diffDays}d ago`;
  else rel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const toneCls = {
    overdue: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 ring-1 ring-inset ring-red-300/40 dark:ring-red-700/40 font-semibold',
    today:   'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-300/40 dark:ring-amber-700/40 font-semibold',
    soon:    'text-[var(--asana-text-primary)]',
    neutral: 'text-[var(--asana-text-secondary)]',
  }[tone];
  return { rel, tone, cls: toneCls, diffDays };
}

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

/* ── Uniform column width for all non-name columns ── */
const COL_W = 'w-[120px] flex-shrink-0';
/* ── Name column: frozen on left during horizontal scroll ── */
const NAME_COL = 'w-[520px] flex-shrink-0 sticky left-0 z-10 bg-[var(--asana-surface)]';

const DEFAULT_COL_W  = 120;
const DEFAULT_NAME_W = 520;

// Column widths context — avoids prop-drilling through TaskTreeNode → TaskRow
const ColWidthsCtx    = createContext(null);
const SetColWidthsCtx = createContext(null);

const COL_MIN_W = { name: DEFAULT_NAME_W };   // name can't go below its default
const COL_MAX_W = { name: 900 };              // name max 900px
const GLOBAL_MIN_W = DEFAULT_COL_W;           // all other cols: can't go below default (120px)
const GLOBAL_MAX_W = 400;                     // all other cols: max 400px

function ResizeHandle({ colKey }) {
  const setColWidths = useContext(SetColWidthsCtx);
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement.getBoundingClientRect().width;
    const minW   = COL_MIN_W[colKey] ?? GLOBAL_MIN_W;
    const maxW   = COL_MAX_W[colKey] ?? GLOBAL_MAX_W;
    const onMove = (mv) => setColWidths(prev => ({
      ...prev,
      [colKey]: Math.min(maxW, Math.max(minW, Math.round(startW + mv.clientX - startX))),
    }));
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colKey, setColWidths]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 opacity-0 hover:opacity-100 hover:bg-asana-blue/50 transition-opacity"
    />
  );
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
function AssigneePicker({ taskId, currentAssignees, members, onClose, onDone, emitInstant, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id), anchorRef }) {
  const dispatch = useAppDispatch();
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useClickOutside(ref, onClose);

  useEffect(() => {
    if (anchorRef?.current) {
      const r = anchorRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      setPos({
        top: spaceBelow < 220 ? Math.max(8, r.top - 220) : r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - 230),
      });
    }
  }, [anchorRef]);

  const q = search.toLowerCase();
  const filtered = (members || []).filter(m => {
    const user = m.user || m;
    if (!q) return true;
    return (user.name || '').toLowerCase().includes(q)
      || (user.email || '').toLowerCase().includes(q);
  });

  const handleAssign = async (userId) => {
    const user = (members || []).map(m => m.user || m).find(u => u.id === userId);
    if (user) {
      // Optimistic: replace all assignees with the new one
      dispatch(optimisticAssignUser({ taskId, user, replace: true }));
      emitInstant?.('task_reassigned', { taskId: resolveId(taskId), user });
    }
    onClose();
    queueOrRun(taskId, (realId) => dispatch(reassignUser({ taskId: realId, userId })));
  };

  return (
    <div ref={ref} className="fixed z-[200] w-56 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl animate-fade-in"
      style={{ top: pos.top, left: pos.left }}>
      <div className="p-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people..." autoFocus
          className="w-full px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-md border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400" />
      </div>
      <div className="max-h-48 overflow-y-auto">
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
function StatusPicker({ taskId, currentStatus, onClose, onDone, onCelebrate, emitInstant, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id), anchorRef }) {
  const dispatch = useAppDispatch();
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useClickOutside(ref, onClose);

  useEffect(() => {
    if (anchorRef?.current) {
      const r = anchorRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      setPos({
        top: spaceBelow < 200 ? Math.max(8, r.top - 200) : r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - 170),
      });
    }
  }, [anchorRef]);

  const handleChange = async (status) => {
    dispatch(optimisticUpdateTask({ taskId, data: { status } }));
    emitInstant?.('task_completed', { taskId: resolveId(taskId), status });
    if (status === 'DONE') onCelebrate?.();
    onClose();
    queueOrRun(taskId, (realId) => dispatch(updateTask({ taskId: realId, data: { status } })));
  };

  return (
    <div ref={ref} className="fixed z-[200] w-40 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in"
      style={{ top: pos.top, left: pos.left }}>
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
        <button key={key} onClick={() => handleChange(key)}
          className="w-full flex items-center px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <span className={`inline-block px-2.5 py-1 rounded text-[12px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
          {currentStatus === key && <Check className="w-3.5 h-3.5 ml-auto text-asana-blue" strokeWidth={2.5} />}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Editable Time Cell (for estimated/actual)
   ═══════════════════════════════════════════ */
const TIME_PRESETS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h',  minutes: 60 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h',  minutes: 120 },
  { label: '3h',  minutes: 180 },
  { label: '4h',  minutes: 240 },
  { label: '6h',  minutes: 360 },
  { label: '8h',  minutes: 480 },
];

function getTitleSuggestions(title) {
  if (!title) return [];
  const t = title.toLowerCase();
  if (/quick|fix|typo|minor|small|patch/.test(t))                         return [15, 30, 60];
  if (/meeting|call|sync|standup|discussion|demo/.test(t))                 return [30, 60, 90];
  if (/review|pr|code review|feedback/.test(t))                            return [30, 60, 120];
  if (/test|testing|qa|quality|spec/.test(t))                              return [60, 120, 180];
  if (/design|wireframe|mockup|prototype|ui|ux/.test(t))                   return [120, 180, 240];
  if (/research|investigate|analysis|explore|spike/.test(t))               return [120, 180, 240];
  if (/implement|develop|build|create|feature|integration/.test(t))        return [180, 240, 360, 480];
  if (/refactor|cleanup|clean up|optimiz|performance/.test(t))             return [120, 180, 240];
  if (/deploy|release|launch|migration/.test(t))                           return [60, 120, 180];
  if (/document|docs|readme|write/.test(t))                                return [60, 120, 180];
  return [];
}

function getTimeSuggestions(inputStr, taskTitle) {
  const str = inputStr.trim().toLowerCase();

  if (!str) {
    const smart = getTitleSuggestions(taskTitle)
      .map(m => TIME_PRESETS.find(p => p.minutes === m))
      .filter(Boolean);
    const smartMinutes = new Set(smart.map(s => s.minutes));
    const rest = TIME_PRESETS.filter(p => !smartMinutes.has(p.minutes));
    return { smart, presets: rest };
  }

  // Pure number → interpret as hours and minutes dynamically
  const numOnly = str.match(/^(\d+)$/);
  if (numOnly) {
    const n = parseInt(numOnly[1]);
    const dynamic = [];
    if (n >= 1 && n <= 24)  dynamic.push({ label: `${n}h`,        minutes: n * 60 });
    if (n >= 1 && n <= 12)  dynamic.push({ label: `${n}h 30m`,    minutes: n * 60 + 30 });
    if (n >= 1 && n <= 12)  dynamic.push({ label: `${n}h 15m`,    minutes: n * 60 + 15 });
    if (n >= 5 && n <= 300) dynamic.push({ label: `${n}m`,         minutes: n });
    // Dedup and cap
    const seen = new Set();
    return { smart: [], presets: dynamic.filter(d => { if (seen.has(d.minutes)) return false; seen.add(d.minutes); return true; }).slice(0, 6) };
  }

  // Partial text → filter presets
  const matched = TIME_PRESETS.filter(p =>
    p.label.startsWith(str) || p.label.replace(' ', '').startsWith(str.replace(' ', ''))
  );
  return { smart: [], presets: matched };
}

function TimeCell({ taskId, field, value, taskTitle = '', canEdit, onDone, queueOrRun = (_id, fn) => fn(_id), emitInstant, resolveId = (id) => id }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef(null);
  const ignoreBlur = useRef(false);

  const startEdit = () => {
    if (!canEdit) return;
    setInput(value != null ? formatTime(value) : '');
    setEditing(true);
    requestAnimationFrame(() => {
      if (wrapRef.current) {
        const r = wrapRef.current.getBoundingClientRect();
        setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
      }
    });
  };

  const applyMinutes = (mins) => {
    ignoreBlur.current = true;
    dispatch(optimisticUpdateTask({ taskId, data: { [field]: mins } }));
    emitInstant?.('task_field_updated', { taskId: resolveId(taskId), field, value: mins });
    setEditing(false);
    queueOrRun(taskId, (realId) => dispatch(updateTask({ taskId: realId, data: { [field]: mins } })));
  };

  const save = () => {
    if (ignoreBlur.current) { ignoreBlur.current = false; return; }
    applyMinutes(parseTime(input));
  };

  const { smart, presets } = getTimeSuggestions(input, taskTitle);
  const hasSuggestions = smart.length > 0 || presets.length > 0;

  if (editing) {
    return (
      <>
        <div ref={wrapRef} className="w-full">
          <input type="text" value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (wrapRef.current) {
                const r = wrapRef.current.getBoundingClientRect();
                setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
              }
            }}
            placeholder="e.g. 1h 30m" autoFocus
            className="w-full text-xs bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
            onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          />
        </div>
        {hasSuggestions && (
          <div className="fixed z-[9999] bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl py-1.5 overflow-hidden"
            style={{ top: dropPos.top, left: dropPos.left, minWidth: dropPos.width }}>
            {smart.length > 0 && (
              <>
                <p className="px-3 pt-0.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--asana-text-secondary)]">Suggested</p>
                <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                  {smart.map(s => (
                    <button key={s.minutes} onMouseDown={(e) => { e.preventDefault(); applyMinutes(s.minutes); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-asana-blue/10 text-asana-blue hover:bg-asana-blue/20 transition-colors">
                      {s.label}
                    </button>
                  ))}
                </div>
                {presets.length > 0 && <div className="h-px bg-[var(--asana-border)] mx-2 mb-1" />}
              </>
            )}
            {presets.length > 0 && (
              <>
                {!input && <p className="px-3 pt-0.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--asana-text-secondary)]">Quick pick</p>}
                <div className="flex flex-wrap gap-1 px-2 pb-1">
                  {presets.map(s => (
                    <button key={s.minutes} onMouseDown={(e) => { e.preventDefault(); applyMinutes(s.minutes); }}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-primary)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <span onClick={canEdit ? startEdit : undefined}
      className={`text-xs ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${value != null ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'}`}>
      {value != null ? formatTime(value) : '—'}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Task Row
   ═══════════════════════════════════════════ */
function TaskRow({ task, indent, members, canEdit, perm = {}, onTaskClick, onRefresh, hasSubtasks, isExpanded, onToggle, cols = {}, customFields = [], fieldValues = {}, onSetFieldValue, depth = 0, onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, resolveId = (id) => id, queueOrRun = (_id, fn) => fn(_id), onAddSubtaskHere, dragHandleProps = null, isDragging = false }) {
  const colWidths = useContext(ColWidthsCtx);
  const cw = (key) => ({ width: colWidths?.[key] ?? DEFAULT_COL_W, flexShrink: 0 });
  const dispatch = useAppDispatch();
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showBillableDrop, setShowBillableDrop] = useState(false);
  const [billableDropPos, setBillableDropPos] = useState({ top: 0, left: 0 });
  const assigneeCellRef = useRef(null);
  const statusCellRef = useRef(null);
  const billableBtnRef = useRef(null);
  const billableDropRef = useRef(null);
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

  useEffect(() => {
    if (!showBillableDrop) return;
    const handler = (e) => { if (billableDropRef.current && !billableDropRef.current.contains(e.target)) setShowBillableDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBillableDrop]);

  const toggleComplete = (e) => {
    e.stopPropagation();
    if (!perm.taskComplete || busy) return;
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    if (newStatus === 'DONE') { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600); onCelebrate?.(); }
    dispatch(optimisticUpdateTask({ taskId: task.id, data: { status: newStatus } }));
    emitInstant?.('task_completed', { taskId: resolveId(task.id), status: newStatus });
    queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { status: newStatus } })));
  };

  const handleDelete = (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    const canDel = indent ? perm.subtaskDelete : perm.taskDelete;
    if (!canDel || busy) return;
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
    if (!perm.taskEdit && !perm.taskDelete && !perm.taskComplete) return;
    e.preventDefault();
    e.stopPropagation();
    // Estimated menu size — refined after mount via the measurement effect below.
    const MENU_W = 208; // w-52
    const MENU_H = 380; // ~10 rows + dividers
    const PAD = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = e.clientX;
    let y = e.clientY;
    if (x + MENU_W + PAD > vw) x = vw - MENU_W - PAD;
    if (y + MENU_H + PAD > vh) y = vh - MENU_H - PAD;
    if (x < PAD) x = PAD;
    if (y < PAD) y = PAD;
    setContextMenu({ x, y });
  };

  // After the menu mounts, measure its actual size and re-clamp if the
  // estimate above was off (e.g., user is admin and sees more rows).
  useEffect(() => {
    if (!contextMenu || !contextRef.current) return;
    const rect = contextRef.current.getBoundingClientRect();
    const PAD = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = contextMenu;
    let changed = false;
    if (x + rect.width + PAD > vw) { x = vw - rect.width - PAD; changed = true; }
    if (y + rect.height + PAD > vh) { y = vh - rect.height - PAD; changed = true; }
    if (x < PAD) { x = PAD; changed = true; }
    if (y < PAD) { y = PAD; changed = true; }
    if (changed) setContextMenu({ x, y });
    // Intentionally only depend on the open/close transition, not x/y, to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu?.x === undefined ? null : 'open']);

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;

  return (
    <div className={`flex items-stretch border-b border-[var(--asana-border)]/30 hover:bg-blue-50/40 dark:hover:bg-[#1f2937]/70 hover:shadow-[inset_3px_0_0_0_#4573D2] cursor-pointer group transition-all duration-180 ease-asana w-max min-w-full ${justCompleted ? 'row-complete-flash' : ''}`}
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
              <Check className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" strokeWidth={2} />
              {task.status === 'DONE' ? 'Mark incomplete' : 'Mark complete'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setContextMenu(null); setEditingTitle(true); }}
              className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <Pencil className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" strokeWidth={1.75} />
              Rename
            </button>
            {/* Add task/subtask — always adds a child under this item */}
            {perm.subtaskCreate && onAddSubtaskHere && (
              <button onClick={(e) => { e.stopPropagation(); setContextMenu(null); onAddSubtaskHere(); }}
                className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <Plus className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" strokeWidth={2} />
                {task.taskType === 'MILESTONE' ? 'Add task' : 'Add subtask'}
              </button>
            )}
            <div className="border-t border-[var(--asana-border)] my-1" />
            {/* Convert to submenu */}
            <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Convert to</div>
            {[
              { type: 'DEFAULT_TASK', label: 'Task',      Icon: Circle  },
              { type: 'MILESTONE',    label: 'Milestone', Icon: Diamond },
              { type: 'APPROVAL',     label: 'Approval',  Icon: Star    },
            ].map(item => (
              <button key={item.type} onClick={(e) => { e.stopPropagation(); handleConvertTo(item.type); }}
                className={`w-full flex items-center px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 ${task.taskType === item.type ? 'text-asana-blue font-semibold' : 'text-[var(--asana-text-primary)]'}`}>
                <item.Icon className="w-4 h-4 mr-2.5 flex-shrink-0" strokeWidth={1.75} />
                {item.label}
                {task.taskType === item.type && <Check className="w-3.5 h-3.5 ml-auto text-asana-blue flex-shrink-0" strokeWidth={2.5} />}
              </button>
            ))}
            <div className="border-t border-[var(--asana-border)] my-1" />
            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/project/${task.list?.board?.project?.id || ''}?task=${task.id}`); setContextMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <Link2 className="w-4 h-4 mr-2.5 text-[var(--asana-text-secondary)]" strokeWidth={1.75} />
              Copy task link
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(e); setContextMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="w-4 h-4 mr-2.5" strokeWidth={1.75} />
              Delete task
            </button>
          </div>
        </>
      )}

      {/* ── Name ── */}
      <div className="flex-shrink-0 sticky left-0 z-10 bg-[var(--asana-surface)] flex items-center py-[3px] border-r border-[var(--asana-border)]/40"
        style={{ width: colWidths?.['name'] ?? DEFAULT_NAME_W, paddingLeft: `${depth * 1.5 + 0.25}rem`, paddingRight: '0.75rem' }}>
        {/* Drag handle (six-dot grip) — only on top-level draggable rows */}
        {dragHandleProps ? (
          <div
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            title="Drag to move"
            className="w-4 h-5 mr-1 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-gray-200/80 dark:hover:bg-gray-700/70 cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
            style={{ touchAction: 'none' }}
          >
            <GripVertical className="w-3.5 h-3.5 text-[var(--asana-text-secondary)]" strokeWidth={1.75} />
          </div>
        ) : (
          <span className="w-4 mr-1 flex-shrink-0" />
        )}
        {/* Expand arrow — shows for any task with subtasks at any depth */}
        {hasSubtasks ? (
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="mr-1.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
            <ChevronDown className={`w-3 h-3 text-[var(--asana-text-secondary)] transition-transform ${isExpanded ? '' : '-rotate-90'}`} strokeWidth={2.5} />
          </button>
        ) : <span className="w-[18px] mr-1.5 flex-shrink-0" />}

        {/* Task icon — Circle / Diamond / Approval with completion animation */}
        {isMilestone ? (
          <button onClick={toggleComplete}
            className={`w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center mr-3 relative transition-all duration-300 ${justCompleted ? 'celebrate-burst' : ''}`}>
            <div className={`w-[14px] h-[14px] rotate-45 rounded-[2px] border-2 flex items-center justify-center transition-all duration-300 ${justCompleted ? 'check-pop' : ''} ${task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-400 dark:border-gray-500 group-hover:border-green-400'}`}>
              {task.status === 'DONE' && (
                <Check className={`w-[8px] h-[8px] text-white -rotate-45 ${justCompleted ? 'check-draw' : ''}`} strokeWidth={4} />
              )}
            </div>
          </button>
        ) : isApproval ? (
          <button onClick={toggleComplete}
            className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-all duration-300 relative ${
              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-purple-400 dark:border-purple-500 group-hover:border-green-400'
            } ${justCompleted ? 'check-pop celebrate-burst' : ''}`}>
            {justCompleted && <span className="ripple-ring" />}
            <Check className={`w-2.5 h-2.5 ${task.status === 'DONE' ? 'text-white' : 'text-purple-400 dark:text-purple-500'} ${justCompleted ? 'check-draw' : ''}`} strokeWidth={2.5} />
          </button>
        ) : (
          <button onClick={toggleComplete}
            className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-all duration-300 relative ${
              task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
            } ${justCompleted ? 'check-pop celebrate-burst' : ''}`}>
            {justCompleted && <span className="ripple-ring" />}
            {task.status === 'DONE' && (
              <Check className={`w-2.5 h-2.5 text-white ${justCompleted ? 'check-draw' : ''}`} strokeWidth={3} />
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
              className={`text-[13px] bg-[var(--asana-surface)] border border-asana-blue rounded px-2 py-0.5 outline-none w-[320px] max-w-full ${isMilestone ? 'font-bold' : ''} text-[var(--asana-text-primary)]`} />
            <SaveIndicator status={titleAutoSave.saveStatus} />
          </>
        ) : (
          <span
            className={`text-[13px] truncate transition-all duration-150 rounded px-2 py-0.5 ${isMilestone ? 'font-bold' : ''} ${perm.taskEdit ? 'cursor-text hover:ring-1 hover:ring-gray-400 dark:hover:ring-gray-500' : ''} ${
              task.status === 'DONE'
                ? `text-[var(--asana-text-secondary)]`
                : 'text-[var(--asana-text-primary)]'
            }`}
            onClick={(e) => { if (!perm.taskEdit) return; e.stopPropagation(); setEditingTitle(true); }}>
            {liveEdits[`task-${task.id}-title`] || task.title}
          </span>
        )}
        {!indent && hasSubtasks && (
          <span className="ml-2 text-[12px] text-[var(--asana-text-secondary)] flex-shrink-0">
            {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
          </span>
        )}

      </div>

      {/* ── Assignee ── */}
      {cols.assignee && (
        <div ref={assigneeCellRef} className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center relative" style={cw('assignee')} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => perm.taskAssign && setShowAssigneePicker(true)}
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
              <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700/80 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
                <Users className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-asana-blue transition-colors" strokeWidth={1.5} />
              </div>
            )}
          </button>
          {showAssigneePicker && (
            <AssigneePicker taskId={task.id} currentAssignees={task.assignees} members={members}
              onClose={() => setShowAssigneePicker(false)} onDone={onRefresh} emitInstant={emitInstant} resolveId={resolveId} queueOrRun={queueOrRun} anchorRef={assigneeCellRef} />
          )}
        </div>
      )}

      {/* ── Due date ── */}
      {cols.dueDate && (() => {
        const meta = getDueMeta(task.dueDate, task.status);
        return (
        <div className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center relative" style={cw('dueDate')} onClick={(e) => e.stopPropagation()}>
          {perm.taskEdit ? (
            <div className="relative cursor-pointer" onClick={() => dateRef.current?.showPicker?.()}>
              <input ref={dateRef} type="date" value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                onChange={handleDateChange} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              {meta ? (
                <span title={new Date(task.dueDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  className={`text-[12px] px-2 py-0.5 rounded-md transition-colors duration-180 ${meta.cls}`}>
                  {meta.rel}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
                  <Calendar className="w-3.5 h-3.5 text-orange-400 dark:text-orange-500" strokeWidth={1.75} />
                  <span className="text-[11px] text-orange-400 dark:text-orange-500 font-medium">Set date</span>
                </div>
              )}
            </div>
          ) : meta ? (
            <span className={`text-[12px] px-2 py-0.5 rounded-md ${meta.cls}`}>{meta.rel}</span>
          ) : null}
        </div>
        );
      })()}

      {/* ── Status ── */}
      {cols.status && (
        <div ref={statusCellRef} className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center relative" style={cw('status')} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => perm.taskEdit && setShowStatusPicker(true)}
            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md truncate transition-all duration-180 hover:brightness-105 ${statusCfg.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusCfg.dot }} />
            {statusCfg.label}
          </button>
          {showStatusPicker && (
            <StatusPicker taskId={task.id} currentStatus={task.status}
              onClose={() => setShowStatusPicker(false)} onDone={onRefresh} onCelebrate={onCelebrate} emitInstant={emitInstant} resolveId={resolveId} queueOrRun={queueOrRun} anchorRef={statusCellRef} />
          )}
        </div>
      )}

      {/* ── Priority ── */}
      {cols.priority && (() => {
        const pcfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.LOW;
        return (
        <div className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center" style={cw('priority')} onClick={(e) => e.stopPropagation()}>
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${pcfg.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pcfg.dot }} />
            {pcfg.label}
          </span>
        </div>
        );
      })()}

      {/* ── Estimated time ── */}
      {cols.estimatedTime && (
        <div className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center" style={cw('estimatedTime')} onClick={(e) => e.stopPropagation()}>
          <TimeCell taskId={task.id} field="estimatedTime" value={task.estimatedTime} taskTitle={task.title} canEdit={perm.timeTrack} onDone={onRefresh} queueOrRun={queueOrRun} emitInstant={emitInstant} resolveId={resolveId} />
        </div>
      )}

      {/* ── Actual time (Time Tracker) ── */}
      {cols.actualTime && (
        <div className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center" style={cw('actualTime')} onClick={(e) => e.stopPropagation()}>
          <TimeTracker taskId={resolveId(task.id)} initialTotal={task.actualTime || 0} timerStartedAt={task.timerStartedAt} canEdit={perm.timeTrack} emitInstant={emitInstant} />
        </div>
      )}

      {/* ── Billable ── */}
      {cols.billable && (
        <div className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center" style={cw('billable')} onClick={(e) => e.stopPropagation()}>
          <button
            ref={billableBtnRef}
            onClick={() => {
              if (!perm.taskEdit) return;
              const r = billableBtnRef.current?.getBoundingClientRect();
              if (r) {
                const spaceBelow = window.innerHeight - r.bottom;
                setBillableDropPos({
                  top: spaceBelow < 140 ? null : r.bottom + 2,
                  bottom: spaceBelow < 140 ? window.innerHeight - r.top + 2 : null,
                  left: Math.min(r.left, window.innerWidth - 160),
                });
              }
              setShowBillableDrop(v => !v);
            }}
            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap transition-all duration-180 hover:brightness-105 ${
              task.billable === true
                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 ring-1 ring-inset ring-green-300/40 dark:ring-green-700/40'
                : task.billable === false
                  ? 'bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400 ring-1 ring-inset ring-gray-300/40 dark:ring-gray-600/40'
                  : 'bg-transparent text-gray-400 dark:text-gray-500'
            } ${perm.taskEdit ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {task.billable !== null && task.billable !== undefined && (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${task.billable === true ? 'bg-green-500' : 'bg-gray-400'}`} />
            )}
            {task.billable === true ? 'Billable' : task.billable === false ? 'Non-Billable' : '—'}
          </button>
          {showBillableDrop && (
            <div
              ref={billableDropRef}
              className="fixed z-[200] w-40 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in"
              style={{ top: billableDropPos.top ?? 'auto', bottom: billableDropPos.bottom ?? 'auto', left: billableDropPos.left }}
            >
              {[
                { value: null,  label: '—',            dot: null,           cls: 'text-gray-400 dark:text-gray-500' },
                { value: true,  label: 'Billable',     dot: 'bg-green-500', cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 ring-1 ring-inset ring-green-300/40 dark:ring-green-700/40' },
                { value: false, label: 'Non-Billable', dot: 'bg-gray-400',  cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400 ring-1 ring-inset ring-gray-300/40 dark:ring-gray-600/40' },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    setShowBillableDrop(false);
                    if (opt.value === task.billable) return;
                    dispatch(optimisticUpdateTask({ taskId: task.id, data: { billable: opt.value } }));
                    emitInstant?.('task_field_updated', { taskId: resolveId(task.id), field: 'billable', value: opt.value });
                    queueOrRun(task.id, (realId) => dispatch(updateTask({ taskId: realId, data: { billable: opt.value } })));
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md ${opt.cls}`}>
                    {opt.dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt.dot}`} />}
                    {opt.label}
                  </span>
                  {opt.value === task.billable && (
                    <Check className="w-3.5 h-3.5 text-asana-blue ml-auto flex-shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dynamic custom field cells ── */}
      {customFields.map(cf => (
        <div key={cf.id} className="flex-shrink-0 px-3 py-[3px] border-r border-[var(--asana-border)]/40 flex items-center" style={cw(cf.id)} onClick={(e) => e.stopPropagation()}>
          <CustomFieldCell
            field={{ ...cf, _members: cf.type === 'PEOPLE' ? members : undefined }}
            taskId={task.id}
            value={fieldValues[`${cf.id}-${task.id}`] || ''}
            canEdit={perm.fieldEdit}
            onChange={(val) => onSetFieldValue(cf.id, task.id, val)}
          />
        </div>
      ))}
      {/* Trailing spacer aligning with column header's "+ Add field" button on the right */}
      {perm.fieldCreate && <div className="w-9 flex-shrink-0" />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Color palette (matches real Asana)
   ═══════════════════════════════════════════ */
const OPTION_COLORS = [
  { name: 'red',        dot: '#EF4444', cls: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 ring-1 ring-inset ring-red-300/40 dark:ring-red-700/40' },
  { name: 'orange',     dot: '#F97316', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 ring-1 ring-inset ring-orange-300/40 dark:ring-orange-700/40' },
  { name: 'yellow',     dot: '#EAB308', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 ring-1 ring-inset ring-yellow-300/40 dark:ring-yellow-700/40' },
  { name: 'yellow-green', dot: '#84CC16', cls: 'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300 ring-1 ring-inset ring-lime-300/40 dark:ring-lime-700/40' },
  { name: 'green',      dot: '#22C55E', cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 ring-1 ring-inset ring-green-300/40 dark:ring-green-700/40' },
  { name: 'blue-green', dot: '#14B8A6', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 ring-1 ring-inset ring-teal-300/40 dark:ring-teal-700/40' },
  { name: 'aqua',       dot: '#0EA5E9', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 ring-1 ring-inset ring-sky-300/40 dark:ring-sky-700/40' },
  { name: 'blue',       dot: '#4573D2', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-1 ring-inset ring-blue-300/40 dark:ring-blue-700/40' },
  { name: 'indigo',     dot: '#6A67CE', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ring-1 ring-inset ring-indigo-300/40 dark:ring-indigo-700/40' },
  { name: 'purple',     dot: '#A855F7', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 ring-1 ring-inset ring-purple-300/40 dark:ring-purple-700/40' },
  { name: 'magenta',    dot: '#EC4899', cls: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300 ring-1 ring-inset ring-pink-300/40 dark:ring-pink-700/40' },
  { name: 'hot-pink',   dot: '#FB7185', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 ring-1 ring-inset ring-rose-300/40 dark:ring-rose-700/40' },
  { name: 'cool-gray',  dot: '#6B7280', cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700/70 dark:text-gray-200 ring-1 ring-inset ring-gray-300/50 dark:ring-gray-600/50' },
];

/* ═══════════════════════════════════════════
   Field Type Picker — 2-step: type → configure → create
   ═══════════════════════════════════════════ */
const FIELD_TYPES = [
  { type: 'SINGLE_SELECT',  label: 'Single-select',  Icon: CircleDot,   bg: 'bg-violet-100 dark:bg-violet-900/40',  fg: 'text-violet-600 dark:text-violet-400'  },
  { type: 'MULTI_SELECT',   label: 'Multi-select',   Icon: ListChecks,  bg: 'bg-blue-100 dark:bg-blue-900/40',      fg: 'text-blue-600 dark:text-blue-400'      },
  { type: 'DATE',           label: 'Date',           Icon: Calendar,    bg: 'bg-orange-100 dark:bg-orange-900/40',  fg: 'text-orange-600 dark:text-orange-400'  },
  { type: 'PEOPLE',         label: 'People',         Icon: Users,       bg: 'bg-pink-100 dark:bg-pink-900/40',      fg: 'text-pink-600 dark:text-pink-400'      },
  { type: 'TEXT',           label: 'Text',           Icon: AlignLeft,   bg: 'bg-gray-100 dark:bg-gray-700/60',      fg: 'text-gray-600 dark:text-gray-300'      },
  { type: 'NUMBER',         label: 'Number',         Icon: Hash,        bg: 'bg-teal-100 dark:bg-teal-900/40',      fg: 'text-teal-600 dark:text-teal-400'      },
  { type: 'CHECKBOX',       label: 'Checkbox',       Icon: CheckSquare, bg: 'bg-green-100 dark:bg-green-900/40',    fg: 'text-green-600 dark:text-green-400'    },
  { type: 'TIME_TRACKING',  label: 'Time tracking',  Icon: Timer,       bg: 'bg-amber-100 dark:bg-amber-900/40',    fg: 'text-amber-600 dark:text-amber-400'    },
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
          style={{ top: document.getElementById('add-field-btn')?.getBoundingClientRect().bottom + 4 || 200, right: Math.max(8, window.innerWidth - (document.getElementById('add-field-btn')?.getBoundingClientRect().right || window.innerWidth - 20)) }}>
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Field types</p>
          </div>
          <div className="max-h-80 overflow-y-auto pb-1">
            {FIELD_TYPES.map(ft => (
              <button key={ft.type} onClick={() => handleTypeSelect(ft)}
                className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 ${ft.bg}`}>
                  <ft.Icon className={`w-3.5 h-3.5 ${ft.fg}`} strokeWidth={2} />
                </span>
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
              <X className="w-5 h-5" strokeWidth={2} />
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
                  {selectedType && (
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center mr-2 flex-shrink-0 ${selectedType.bg}`}>
                      <selectedType.Icon className={`w-3 h-3 ${selectedType.fg}`} strokeWidth={2} />
                    </span>
                  )}
                  <span className="truncate flex-1 text-left">{selectedType?.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--asana-text-secondary)] ml-1 flex-shrink-0" strokeWidth={2} />
                </button>
                {showTypeDropdown && (
                  <div className="fixed z-[300] w-[180px] bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 max-h-52 overflow-y-auto"
                    style={{ top: typeDropdownRef.current?.getBoundingClientRect().bottom + 4, left: typeDropdownRef.current?.getBoundingClientRect().left }}>
                    {FIELD_TYPES.map(ft => (
                      <button key={ft.type} onClick={() => { setSelectedType(ft); setShowTypeDropdown(false); }}
                        className={`w-full flex items-center px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedType?.type === ft.type ? 'bg-asana-blue/5 text-asana-blue font-medium' : 'text-[var(--asana-text-primary)]'}`}>
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center mr-2 flex-shrink-0 ${ft.bg}`}>
                          <ft.Icon className={`w-3 h-3 ${ft.fg}`} strokeWidth={2} />
                        </span>
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
                        <X className="w-3.5 h-3.5" strokeWidth={2} />
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
// Asana-style time-input suggestions: when the user types a number or "Nh",
// offer interpretations they can click to log instantly.
function buildTimeSuggestionsLocal(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return [];
  const num = s.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n <= 0) return [];
    const out = [
      { label: `${n} min`, mins: n },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'}`, mins: n * 60 },
    ];
    [15, 30, 45].forEach((m) => {
      out.push({ label: `${n} ${n === 1 ? 'hour' : 'hours'} ${m} min`, mins: n * 60 + m });
    });
    return out;
  }
  const hOnly = s.match(/^(\d+)\s*h$/);
  if (hOnly) {
    const n = parseInt(hOnly[1], 10);
    return [
      { label: `${n} ${n === 1 ? 'hour' : 'hours'}`, mins: n * 60 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 15 min`, mins: n * 60 + 15 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 30 min`, mins: n * 60 + 30 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 45 min`, mins: n * 60 + 45 },
    ];
  }
  return [];
}

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
        className={`text-xs flex items-center w-full ${total > 0 || timerStart ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)]'}`}>
        {timerStart && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" />}
        {timerStart ? <span className="font-mono text-red-500 font-semibold">{timerDisplay}</span> : total > 0 ? fmtMins(total) : (
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
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
                    <Trash2 className="w-3 h-3" strokeWidth={1.75} />
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
                    <Timer className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} />
                    Start timer
                  </button>
                ) : (
                  <button onClick={handleStopTimer} className="flex items-center text-xs px-3 py-1.5 rounded-md bg-red-500 text-white font-medium hover:bg-red-600">Stop timer</button>
                )}
                {addingTime ? (
                  <div className="relative flex items-center space-x-1">
                    <input type="text" value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="1h 30m" autoFocus
                      className="w-24 text-xs px-2 py-1.5 bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-md outline-none text-[var(--asana-text-primary)] focus:ring-1 focus:ring-asana-blue"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTime(); if (e.key === 'Escape') { setAddingTime(false); setAddInput(''); } }} />
                    <button onClick={handleAddTime} className="text-xs text-asana-blue font-semibold">Add</button>
                    {(() => {
                      const sugs = buildTimeSuggestionsLocal(addInput);
                      if (!sugs.length) return null;
                      return (
                        <div className="absolute bottom-full left-0 mb-1 z-[100] w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-md shadow-lg py-1 animate-fade-in">
                          {sugs.map((sug) => (
                            <button key={sug.label}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const newEntries = [{ mins: sug.mins, date: new Date().toISOString(), note: 'Manual' }, ...entries];
                                const newTotal = total + sug.mins;
                                setTotal(newTotal); setEntries(newEntries); setAddInput(''); setAddingTime(false);
                                persist(newTotal, newEntries, timerStart);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-[var(--asana-text-primary)] hover:bg-asana-blue hover:text-white transition-colors">
                              {sug.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <button onClick={() => setAddingTime(true)} className="flex items-center text-xs px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
                    <Plus className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} />
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
        {value === 'true' && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </button>
    );
  }

  // SINGLE_SELECT — status-style badge + dropdown
  if (field.type === 'SINGLE_SELECT') {
    const selected = parsedOpts.find(o => o.value === value);
    const selColor = selected ? (OPTION_COLORS.find(c => c.name === selected.color) || OPTION_COLORS[0]) : null;

    return (
      <div className="relative w-full">
        <button ref={cellBtnRef} onClick={openDropdown} className="w-full text-left">
          {selected ? (
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md truncate hover:brightness-105 transition-all ${selColor.cls}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: selColor.dot }} />
              {selected.value}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-52 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-52 overflow-y-auto"
            style={{ top: dropPos.top ?? 'auto', bottom: dropPos.bottom ?? 'auto', left: dropPos.left }}>
            <button onClick={() => { onChange(''); setShowDropdown(false); }}
              className="w-full px-3 py-1.5 text-left text-[12px] text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">
              Clear
            </button>
            {parsedOpts.map((opt) => {
              const c = OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0];
              return (
                <button key={opt.value} onClick={() => { onChange(opt.value); setShowDropdown(false); }}
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${value === opt.value ? 'bg-asana-blue/5' : ''}`}>
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md ${c.cls}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
                    {opt.value}
                  </span>
                  {value === opt.value && <Check className="w-3.5 h-3.5 ml-auto text-asana-blue flex-shrink-0" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // MULTI_SELECT — status-style badges + dropdown; cell shows max 1 badge + "+N" to avoid row height increase
  if (field.type === 'MULTI_SELECT') {
    const selectedValues = value ? value.split(',').filter(Boolean) : [];
    const visibleValues = selectedValues.slice(0, 1);
    const extraCount = selectedValues.length - 1;
    return (
      <div className="relative w-full">
        <button ref={cellBtnRef} onClick={openDropdown} className="w-full text-left flex items-center gap-1 overflow-hidden min-w-0">
          {selectedValues.length > 0 ? (
            <>
              {visibleValues.map(v => {
                const opt = parsedOpts.find(o => o.value === v);
                const c = opt ? (OPTION_COLORS.find(oc => oc.name === opt.color) || OPTION_COLORS[0]) : OPTION_COLORS[0];
                return (
                  <span key={v} className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md min-w-0 overflow-hidden ${c.cls}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
                    <span className="truncate min-w-0">{v}</span>
                  </span>
                );
              })}
              {extraCount > 0 && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/70 text-gray-500 dark:text-gray-400 flex-shrink-0 whitespace-nowrap">
                  +{extraCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-[12px] text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-52 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-52 overflow-y-auto"
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
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isSelected ? 'bg-asana-blue/5' : ''}`}>
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md ${c.cls}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
                    {opt.value}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-asana-blue flex-shrink-0" strokeWidth={2.5} />}
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
        className="text-[12px] bg-transparent border-none p-0 text-[var(--asana-text-primary)] focus:ring-0 w-full cursor-pointer" />
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
              <span className="text-[12px] text-[var(--asana-text-primary)] truncate">{selectedName}</span>
            </>
          ) : (
            <span className="text-[12px] text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100">—</span>
          )}
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="fixed z-[200] w-48 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-2xl py-1 animate-fade-in max-h-48 overflow-y-auto"
            style={{ top: dropPos.top ?? 'auto', bottom: dropPos.bottom ?? 'auto', left: dropPos.left }}>
            <button onClick={() => { onChange(''); setShowDropdown(false); }}
              className="w-full px-3 py-1.5 text-left text-[12px] text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50">Clear</button>
            {(field._members || []).map(m => {
              const name = m.user?.name || m.name || '';
              return (
                <button key={name} onClick={() => { onChange(name); setShowDropdown(false); }}
                  className={`w-full flex items-center px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 ${value === name ? 'bg-asana-blue/5' : ''}`}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold mr-2"
                    style={{ backgroundColor: `hsl(${name.charCodeAt(0) * 15}, 60%, 50%)` }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[12px] text-[var(--asana-text-primary)]">{name}</span>
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
          className="text-[12px] bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full text-right"
          onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInput(value || ''); setEditing(false); } }} />
      );
    }
    const display = value ? (fmt === 'currency' ? `$${value}` : fmt === 'percentage' ? `${value}%` : value) : '';
    return (
      <span onClick={() => canEdit && setEditing(true)}
        className={`text-[12px] text-right block w-full ${value ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'} ${canEdit ? 'cursor-pointer' : ''}`}>
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
        className="text-[12px] bg-transparent border-none p-0 text-[var(--asana-text-primary)] outline-none w-full"
        onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInput(value || ''); setEditing(false); } }} />
    );
  }

  return (
    <span onClick={() => canEdit && setEditing(true)}
      className={`text-[12px] truncate block ${value ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'} ${canEdit ? 'cursor-pointer' : ''}`}>
      {value || '—'}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Recursive Task Tree Node — renders task + subtasks at any depth
   ═══════════════════════════════════════════ */
/**
 * Flatten a tree of tasks into a single ordered list of visible rows.
 * Only descends into children of expanded tasks (so collapsed parents hide their subtree).
 * Each entry carries depth + parentId so the renderer can indent and the
 * drag handler can compute the new parent on drop.
 */
function flattenTaskTree(tasks, expandedTasks, depth = 0, parentId = null) {
  const out = [];
  (tasks || []).forEach((t) => {
    out.push({ task: t, depth, parentId });
    if (expandedTasks[t.id] && t.subtasks?.length) {
      out.push(...flattenTaskTree(t.subtasks, expandedTasks, depth + 1, t.id));
    }
  });
  return out;
}

function TaskTreeNode({ task, depth, parentId, members, canEdit, perm, cols, customFields, fieldValues, onSetFieldValue, onTaskClick, onRefresh, expandedTasks, toggleTask, addingSubtaskTo, setAddingSubtaskTo, newSubtaskTitle, setNewSubtaskTitle, handleAddSubtask, pendingItems = [], onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, resolveId, queueOrRun, listId, dragProvided, dragSnapshot }) {
  const hasSubtasks = task.subtasks?.length > 0;
  const isExpanded = expandedTasks[task.id];

  return (
    <div
      ref={dragProvided.innerRef}
      {...dragProvided.draggableProps}
      data-just-created={task.id}
      className={`${dragSnapshot.isDragging ? 'shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18),0_2px_6px_-2px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] bg-[var(--asana-surface)] dark:bg-[#1f2937]' : 'w-max min-w-full'}`}
      style={{
        ...dragProvided.draggableProps.style,
        ...(dragSnapshot.isDragging ? { borderRadius: 6, zIndex: 9999 } : {}),
      }}
    >
      <TaskRow task={task} indent={depth > 0} members={members} canEdit={canEdit} perm={perm} cols={cols}
        customFields={customFields} fieldValues={fieldValues} onSetFieldValue={onSetFieldValue}
        onTaskClick={onTaskClick} onRefresh={onRefresh}
        hasSubtasks={hasSubtasks} isExpanded={isExpanded} onToggle={() => toggleTask(task.id)}
        depth={depth} onCelebrate={onCelebrate} liveEdits={liveEdits} emitLiveEdit={emitLiveEdit} emitInstant={emitInstant} releaseEditLock={releaseEditLock} resolveId={resolveId} queueOrRun={queueOrRun}
        dragHandleProps={dragProvided.dragHandleProps}
        isDragging={dragSnapshot.isDragging}
        onAddSubtaskHere={() => { if (!expandedTasks[task.id]) toggleTask(task.id); setAddingSubtaskTo({ listId, taskId: task.id }); setNewSubtaskTitle(''); }} />
    </div>
  );
}

/* Inline-rendered "Add subtask" footer for the flat list */
function AddSubtaskFooter({ task, depth, listId, addingSubtaskTo, setAddingSubtaskTo, newSubtaskTitle, setNewSubtaskTitle, handleAddSubtask, canEdit }) {
  const hasSubtasks = task.subtasks?.length > 0;
  return (
    <Fragment>
      {canEdit && (hasSubtasks || addingSubtaskTo?.taskId === task.id) && (
        <div className="border-b border-[var(--asana-border)]/30 w-max min-w-full">
          {addingSubtaskTo?.taskId === task.id ? (
            <form onSubmit={(e) => handleAddSubtask(e, listId, task.id)}
              className="sticky left-0 inline-flex items-center py-[3px] w-[400px] bg-[var(--asana-surface)]"
              style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.25}rem`, paddingRight: '0.75rem' }}>
              <span className="w-4 mr-1 flex-shrink-0" />
              <span className="w-[18px] mr-1.5 flex-shrink-0" />
              <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
              <input type="text" value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Add subtask..." autoFocus
                className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSubtaskTo(null); setNewSubtaskTitle(''); } }}
                onBlur={() => {
                  if (newSubtaskTitle.trim()) handleAddSubtask({ preventDefault: () => {} }, listId, task.id);
                  else { setAddingSubtaskTo(null); setNewSubtaskTitle(''); }
                }} />
            </form>
          ) : (
            <button onClick={() => setAddingSubtaskTo({ listId, taskId: task.id })}
              className="group/addsub sticky left-0 inline-flex items-center py-[3px] w-[400px] text-left text-[var(--asana-text-secondary)] hover:text-asana-blue bg-[var(--asana-surface)] text-xs transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.25}rem`, paddingRight: '0.75rem' }}>
              <span className="w-4 mr-1 flex-shrink-0" />
              <span className="w-[18px] mr-1.5 flex-shrink-0" />
              <span className="w-[18px] h-[18px] rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 group-hover/addsub:border-asana-blue flex items-center justify-center mr-3 flex-shrink-0 transition-colors">
                <Plus className="w-2.5 h-2.5" strokeWidth={2.5} />
              </span>
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
    <div className="flex items-stretch border-b border-[var(--asana-border)]/30 animate-pulse w-max min-w-full">
      <div className={`${NAME_COL} flex items-center py-[3px] border-r border-[var(--asana-border)]/40`}
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

function ProjectListView({ lists, boardId, projectId, onTaskClick, columns = {}, pendingItems = [], addPendingItem, clearPendingItems, onCelebrate, liveEdits = {}, emitLiveEdit, emitInstant, releaseEditLock, addSectionTrigger = 0, addTaskTrigger = 0, customFieldEvent, setCustomFieldCallback, prefetchedCustomFields = null, prefetchedFieldValues = null, saveViewTrigger = 0 }) {
  const cols = { assignee: true, dueDate: true, status: true, estimatedTime: true, actualTime: true, priority: false, billable: true, ...columns };
  const dispatch = useAppDispatch();
  const { canEdit, can, customRole, isWorkspaceAdmin } = useRole();
  const { confirm, ConfirmDialog } = useConfirm();
  const { currentProject } = useAppSelector((state) => state.project);
  const members = currentProject?.members || [];

  // Granular permission checks — used to gate specific UI elements.
  // Falls back to canEdit (the old blanket boolean) for roles without granular perms.
  const perm = {
    taskCreate:     can('task.create'),
    taskEdit:       can('task.edit'),
    taskDelete:     can('task.delete'),
    taskMove:       can('task.move'),
    taskAssign:     can('task.assign'),
    taskComplete:   can('task.complete'),
    subtaskCreate:  can('subtask.create'),
    subtaskDelete:  can('subtask.delete'),
    sectionCreate:  can('section.create'),
    sectionEdit:    can('section.edit'),
    sectionDelete:  can('section.delete'),
    fieldCreate:    can('field.create'),
    fieldDelete:    can('field.delete'),
    fieldEdit:      can('field.edit'),
    timeTrack:      can('time.track'),
    attachmentAdd:  can('attachment.add'),
  };

  // Column access filter: if the user's role has a `columns` map in its permissions,
  // only show fields that are explicitly allowed. Workspace admins and roles without
  // a columns map (e.g., system Editor) see everything.
  const columnAccessMap = (!isWorkspaceAdmin && customRole?.permissions?.columns) || null;

  const viewKey = projectId ? `listview:${projectId}:collapsed` : null;
  const [collapsedSections, setCollapsedSections] = useState(() => {
    if (!viewKey) return {};
    try { return JSON.parse(localStorage.getItem(viewKey) || '{}'); } catch { return {}; }
  });
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingTaskTo, setAddingTaskTo] = useState(null);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null);
  const [addingSection, setAddingSection] = useState(false);
  const addSectionInputRef = useRef(null);
  // Single unified scroll container — handles BOTH horizontal AND vertical scroll.
  // hello-pangea/dnd auto-detects this as the scroll parent for autoscroll & manual-scroll tracking.
  const scrollContainerRef = useRef(null);

  // Track which section the cursor is currently over (for T shortcut)
  const hoveredSectionRef = useRef(null);

  // Global keyboard shortcut: T → quick-add task in hovered section (fallback: first)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 't' || e.key === 'T') {
        if (!perm.taskCreate) return;
        const targetId = hoveredSectionRef.current
          && lists?.some(l => l.id === hoveredSectionRef.current)
            ? hoveredSectionRef.current
            : lists?.[0]?.id;
        if (targetId) {
          e.preventDefault();
          setAddingTaskTo(targetId);
          setNewTaskTitle('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, lists]);

  // Respond to "Add Section" button from header
  useEffect(() => {
    if (addSectionTrigger > 0) {
      setAddingSection(true);
      setNewSectionName('');
      setTimeout(() => addSectionInputRef.current?.focus(), 100);
    }
  }, [addSectionTrigger]);

  // Respond to "Add Task" button from toolbar — opens inline add in the first section
  useEffect(() => {
    if (addTaskTrigger > 0) {
      const firstList = lists?.[0];
      if (firstList) {
        setAddingTaskTo(firstList.id);
        setNewTaskTitle('');
      }
    }
  }, [addTaskTrigger, lists]);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customFieldsRaw, setCustomFieldsRaw] = useState(prefetchedCustomFields || []);
  const [fieldValues, setFieldValues] = useState(prefetchedFieldValues || {}); // { `${fieldId}-${taskId}`: value }
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const COL_DEFAULTS = {
    name: DEFAULT_NAME_W, assignee: DEFAULT_COL_W, dueDate: DEFAULT_COL_W,
    status: DEFAULT_COL_W, priority: DEFAULT_COL_W, estimatedTime: DEFAULT_COL_W,
    actualTime: DEFAULT_COL_W, billable: DEFAULT_COL_W,
  };
  const colWidthsKey = projectId ? `listview:${projectId}:colWidths` : null;
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = colWidthsKey && localStorage.getItem(colWidthsKey);
      return saved ? { ...COL_DEFAULTS, ...JSON.parse(saved) } : { ...COL_DEFAULTS };
    } catch { return { ...COL_DEFAULTS }; }
  });

  // Load from DB on mount (overrides localStorage with server truth)
  useEffect(() => {
    if (!projectId) return;
    api.get(`/api/v1/view-prefs/${projectId}`)
      .then(res => {
        const dbWidths = res.data?.colWidths;
        if (dbWidths && Object.keys(dbWidths).length > 0) {
          setColWidths(prev => ({ ...COL_DEFAULTS, ...dbWidths }));
          if (colWidthsKey) localStorage.setItem(colWidthsKey, JSON.stringify({ ...COL_DEFAULTS, ...dbWidths }));
        }
      })
      .catch(() => {/* silently fall back to localStorage */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist to localStorage and DB (debounced 800ms) whenever widths change
  const saveColWidthsTimer = useRef(null);
  useEffect(() => {
    if (colWidthsKey) localStorage.setItem(colWidthsKey, JSON.stringify(colWidths));
    if (!projectId) return;
    if (saveColWidthsTimer.current) clearTimeout(saveColWidthsTimer.current);
    saveColWidthsTimer.current = setTimeout(() => {
      api.put(`/api/v1/view-prefs/${projectId}`, { colWidths }).catch(() => {});
    }, 800);
    return () => { if (saveColWidthsTimer.current) clearTimeout(saveColWidthsTimer.current); };
  }, [colWidths, colWidthsKey, projectId]);
  const cw = useCallback((key) => colWidths[key] ?? DEFAULT_COL_W, [colWidths]);

  // Filter custom fields based on the user's role column permissions.
  // If columnAccessMap exists and a field's id is explicitly false, hide it.
  const customFields = columnAccessMap
    ? customFieldsRaw.filter(cf => columnAccessMap[cf.id] !== false)
    : customFieldsRaw;

  // Fetch custom fields + values
  const fetchCustomFields = useCallback(async () => {
    if (!projectId) return;
    try {
      const [fieldsRes, valuesRes] = await Promise.all([
        api.get(`/api/v1/custom-fields/project/${projectId}`),
        api.get(`/api/v1/custom-fields/project/${projectId}/values`),
      ]);
      setCustomFieldsRaw(fieldsRes.data.data || []);
      const valMap = {};
      (valuesRes.data.data || []).forEach(v => { valMap[`${v.fieldId}-${v.taskId}`] = v.value; });
      setFieldValues(valMap);
    } catch (e) { /* project might not exist yet */ }
  }, [projectId]);

  // Use prefetched data if available, otherwise fetch
  useEffect(() => {
    if (prefetchedCustomFields && prefetchedFieldValues) {
      setCustomFieldsRaw(prefetchedCustomFields);
      setFieldValues(prefetchedFieldValues);
    } else {
      setCustomFieldsRaw([]);
      setFieldValues({});
      fetchCustomFields();
    }
  }, [fetchCustomFields, prefetchedCustomFields, prefetchedFieldValues]);

  // Handle custom field events from other users via direct callback (instant, no React state cycle)
  useEffect(() => {
    setCustomFieldCallback?.((evt) => {
      if (!evt?.event) return;
      if (evt.event === 'custom_field_added' && evt.field) {
        setCustomFieldsRaw(prev => prev.some(f => f.id === evt.field.id) ? prev : [...prev, evt.field]);
      }
      if (evt.event === 'custom_field_deleted' && evt.fieldId) {
        setCustomFieldsRaw(prev => prev.filter(f => f.id !== evt.fieldId));
      }
      if (evt.event === 'custom_field_value_set' && evt.fieldId && evt.taskId) {
        setFieldValues(prev => ({ ...prev, [`${evt.fieldId}-${evt.taskId}`]: evt.value }));
      }
      if (evt.event === 'custom_field_replaced' && evt.tempId && evt.field) {
        setCustomFieldsRaw(prev => prev.map(f => f.id === evt.tempId ? evt.field : f));
      }
    });
    return () => setCustomFieldCallback?.(null);
  }, [setCustomFieldCallback]);

  const addCustomField = async (name, type, options) => {
    if (!projectId) return;
    const tempId = `temp-field-${Date.now()}`;
    const tempField = { id: tempId, name, type: type || 'TEXT', options: options || null, position: customFields.length };

    // 1. Optimistic local
    setCustomFieldsRaw(prev => [...prev, tempField]);
    // 2. Broadcast to others
    emitInstant?.('custom_field_added', { field: tempField });
    // 3. Background API — then broadcast real field to replace temp
    setShowFieldPicker(false);
    try {
      const res = await api.post(`/api/v1/custom-fields/project/${projectId}`, { name, type, options: options || null });
      const realField = res.data.data;
      // Replace temp with real locally
      setCustomFieldsRaw(prev => prev.map(f => f.id === tempId ? realField : f));
      // Broadcast real field to other users
      emitInstant?.('custom_field_replaced', { tempId, field: realField });
    } catch (e) { console.error('Failed to add field:', e); }
  };

  const deleteCustomField = async (fieldId) => {
    // 1. Optimistic local
    setCustomFieldsRaw(prev => prev.filter(f => f.id !== fieldId));
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

  // Persist collapsed state when Save View is triggered
  useEffect(() => {
    if (saveViewTrigger === 0 || !viewKey) return;
    try { localStorage.setItem(viewKey, JSON.stringify(collapsedSections)); } catch {}
  }, [saveViewTrigger]);

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

  // Track the most recently created item so we can scroll it into view after the next paint.
  const justCreatedRef = useRef(null);
  // Holds the flattened visible-row layout per section, refreshed on every render.
  // handleDragEnd reads this to compute the new parentId for a drop based on the
  // depth of the row immediately before/after the drop position.
  const flatRowsBySectionRef = useRef({});

  const handleAddTask = (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const title = newTaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    const task = { id: tempId, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [], position: 9999 };

    dispatch(optimisticAddTask({ listId, task }));
    emitInstant?.('task_added', { listId, task });
    justCreatedRef.current = tempId;
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
    justCreatedRef.current = tempId;
    setNewSectionName('');
    setAddingSection(false);
    dispatch(createList({ boardId, name })).unwrap().then((realSection) => {
      idMapRef.current[tempId] = realSection.id;
      dispatch(optimisticReplaceItem({ tempId, item: realSection }));
      emitInstant?.('section_replaced', { tempId, section: realSection });
      flushPendingOps(tempId, realSection.id);
    }).catch(() => {});
  };

  // Whenever lists change AND we just created something, scroll the new item into view.
  // We look up the just-created element by data-just-created attribute on the next paint.
  useEffect(() => {
    if (!justCreatedRef.current) return;
    const id = justCreatedRef.current;
    // Wait two frames so the optimistic update has actually been rendered to the DOM.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const el = scrollContainerRef.current?.querySelector(`[data-just-created="${id}"]`);
        if (el && scrollContainerRef.current) {
          // Use scrollIntoView with block:'nearest' so we don't scroll if it's already visible.
          el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } else if (scrollContainerRef.current) {
          // Fallback: scroll to the bottom of the container (new sections always appended at the end).
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
        }
        justCreatedRef.current = null;
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [lists]);

  // Recursively walk every task + subtask in the subtree.
  const walkTree = (tasks, fn) => {
    (tasks || []).forEach((t) => {
      fn(t);
      if (t.subtasks?.length) walkTree(t.subtasks, fn);
    });
  };

  // Sum a numeric field across all tasks AND nested subtasks in a section.
  // Previously this only counted top-level tasks, so subtask times were lost.
  const getSectionSum = (tasks, field) => {
    let sum = 0;
    walkTree(tasks, (t) => { sum += (t[field] || 0); });
    return sum;
  };

  // Sum a custom-field value across all tasks + subtasks in a tree.
  // Returns null if there are no contributing values.
  const getCustomFieldSum = (tasks, cf) => {
    let sum = 0;
    let any = false;
    walkTree(tasks, (t) => {
      const val = fieldValues[`${cf.id}-${t.id}`];
      if (val) {
        if (cf.type === 'TIME_TRACKING') {
          try { sum += (JSON.parse(val).total || 0); any = true; }
          catch { const n = parseInt(val); if (!isNaN(n)) { sum += n; any = true; } }
        } else if (cf.type === 'NUMBER') {
          const n = parseFloat(val);
          if (!isNaN(n)) { sum += n; any = true; }
        }
      }
    });
    return any ? sum : null;
  };

  // ── Drag-and-drop: move task/subtask between/within sections or parents (Asana-style)
  // droppableId formats (use "::" as separator since UUIDs contain "-"):
  //   "section::{listId}"               → top-level task list inside a section
  //   "parent::{taskId}::{listId}"      → subtask list under a parent task
  // Section droppable ids look like "section::{listId}". The flat-list refactor
  // means there is one Droppable per section that holds every visible row,
  // so we no longer need a 'parent' droppable id format.
  const parseSectionId = (id) => {
    const parts = id.split('::');
    return parts[0] === 'section' && parts.length === 2 ? parts[1] : null;
  };

  // Compute (parentId, indexAmongSiblings) at the destination position from the
  // flat layout. Uses neighbor depth disambiguation:
  //   • If the row ABOVE the drop is deeper than the row AT the drop, the drop
  //     is at the END of the deeper subtree → use the above row's parent.
  //   • Otherwise the drop is between siblings of the AT row → use AT's parent.
  // This matches Asana/Linear/Notion behavior.
  const resolveDestinationParent = (destListId, destIndex, draggedTaskId) => {
    const flat = (flatRowsBySectionRef.current[destListId] || []).filter(
      (r) => r.task.id !== draggedTaskId
    );
    const before = destIndex > 0 ? flat[destIndex - 1] : null;
    const at = destIndex < flat.length ? flat[destIndex] : null;

    let parentId = null;
    if (!at && !before) {
      parentId = null;                          // empty section
    } else if (!at) {
      parentId = before.parentId;               // dropped at very end → same parent as last row
    } else if (!before) {
      parentId = at.parentId;                   // dropped at very top → same parent as first row
    } else if (before.depth > at.depth) {
      parentId = before.parentId;               // end of deeper subtree
    } else {
      parentId = at.parentId;                   // between siblings (or jumping shallower)
    }

    // Position within the chosen parent's children: count how many of the
    // remaining flat rows that share `parentId` come BEFORE the drop point.
    let positionAmongSiblings = 0;
    for (let i = 0; i < destIndex && i < flat.length; i++) {
      if (flat[i].parentId === parentId) positionAmongSiblings++;
    }
    return { parentId, position: positionAmongSiblings };
  };

  const handleDragEnd = (result) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (type !== 'task') return;

    const srcListId = parseSectionId(source.droppableId);
    const dstListId = parseSectionId(destination.droppableId);
    if (!dstListId) return;

    const { parentId: destParentId, position: destSiblingIndex } = resolveDestinationParent(
      dstListId,
      destination.index,
      draggableId
    );

    // Cycle protection — block dropping a task into its own descendant chain.
    if (destParentId) {
      const flat = flatRowsBySectionRef.current[dstListId] || [];
      let cursor = destParentId;
      const guard = new Set();
      while (cursor && !guard.has(cursor)) {
        if (cursor === draggableId) return;
        guard.add(cursor);
        const row = flat.find((r) => r.task.id === cursor);
        cursor = row?.parentId || null;
      }
    }

    // ── Optimistic update — works for every move type because we resolved
    // destParentId from the flat layout above.
    dispatch(optimisticMoveTaskAnywhere({
      taskId: draggableId,
      destListId: dstListId,
      destParentId,
      destinationIndex: destSiblingIndex,
    }));

    // ── Broadcast to other clients via the existing instant_change channel.
    const emitPayload = {
      taskId: resolveId(draggableId),
      sourceListId: resolveId(srcListId),
      destinationListId: resolveId(dstListId),
      position: destSiblingIndex,
      parentId: destParentId ? resolveId(destParentId) : null,
    };
    console.log('[drag] emitInstant task_moved →', emitPayload);
    emitInstant?.('task_moved', emitPayload);

    // ── Persist via API (queued if the task still has a temp ID).
    queueOrRun(draggableId, (realTaskId) => {
      dispatch(moveTaskAction({
        taskId: realTaskId,
        listId: resolveId(dstListId),
        position: destSiblingIndex,
        parentId: destParentId ? resolveId(destParentId) : null,
      })).then((action) => {
        if (action?.error && boardId) {
          dispatch(fetchLists(boardId));
        }
      });
    });
  };

  return (
    <ColWidthsCtx.Provider value={colWidths}>
    <SetColWidthsCtx.Provider value={setColWidths}>
    <>
    <DragDropContext
      onDragEnd={handleDragEnd}
      autoScrollerOptions={{
        // Start auto-scrolling earlier (when within 18% of edge instead of default 25%)
        startFromPercentage: 0.18,
        // Reach max scroll speed sooner (within 8% of edge)
        maxScrollAtPercentage: 0.08,
        // Faster max scroll (default 28 px/frame)
        maxPixelScroll: 56,
        // Acceleration ramps up quickly so dragging to bottom feels responsive
        ease: (percentage) => Math.pow(percentage, 2),
        durationDampening: { stopDampeningAt: 1000, accelerateAt: 280 },
      }}
    >
    <div className="relative flex-1 flex flex-col min-h-0">
    <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)]/50 relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Single unified scroll viewport: header + body live inside one scroll container.
           This is the only element @hello-pangea/dnd needs to find — both axes scroll here,
           so autoscroll-on-drag and manual-scroll-during-drag both work correctly.
           Uses flex-1 + min-h-0 so it fills the parent's available height exactly. ── */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
      {/* ── Column headers (sticky top inside the scroll viewport).
           Background must live on the inner w-max element so it covers the FULL
           content width (not just the scroll container's visible viewport),
           otherwise newly-added columns scroll into a transparent area. ── */}
      <div className="sticky top-0 z-30 rounded-t-lg">
        <div className="flex items-stretch border-b border-[var(--asana-border)]/60 w-max min-w-full bg-[var(--asana-surface)]">
        {/* Name column header */}
        <div className="flex-shrink-0 sticky left-0 z-20 bg-[var(--asana-surface)] px-4 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center" style={{ width: cw('name') }}>
          <span className="text-[11px] font-medium text-[var(--asana-text-secondary)]">Name</span>
          <ResizeHandle colKey="name" />
        </div>
        {cols.assignee && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('assignee') }}><Users className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Assignee</span><ResizeHandle colKey="assignee" /></div>}
        {cols.dueDate && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('dueDate') }}><Calendar className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Due date</span><ResizeHandle colKey="dueDate" /></div>}
        {cols.status && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('status') }}><CircleDot className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Status</span><ResizeHandle colKey="status" /></div>}
        {cols.priority && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('priority') }}><Flag className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Priority</span><ResizeHandle colKey="priority" /></div>}
        {cols.estimatedTime && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('estimatedTime') }}><Clock className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Est. time</span><ResizeHandle colKey="estimatedTime" /></div>}
        {cols.actualTime && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('actualTime') }}><Timer className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Actual time</span><ResizeHandle colKey="actualTime" /></div>}
        {cols.billable && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 relative flex items-center gap-1.5" style={{ width: cw('billable') }}><DollarSign className="w-3 h-3 text-[var(--asana-text-secondary)] flex-shrink-0" strokeWidth={1.75} /><span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate">Billable</span><ResizeHandle colKey="billable" /></div>}

        {/* Dynamic custom field columns */}
        {customFields.map(cf => {
          const ft = FIELD_TYPES.find(f => f.type === cf.type);
          return (
          <div key={cf.id} className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center gap-1.5 group/col relative" style={{ width: cw(cf.id) }}>
            {ft && <ft.Icon className={`w-3 h-3 flex-shrink-0 ${ft.fg}`} strokeWidth={1.75} />}
            <span className="text-[11px] font-medium text-[var(--asana-text-secondary)] truncate flex-1 min-w-0">{cf.name}</span>
            {perm.fieldDelete && (
              <button onClick={() => deleteCustomField(cf.id)}
                className="opacity-0 group-hover/col:opacity-100 w-4 h-4 flex-shrink-0 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[var(--asana-text-secondary)] hover:text-red-500 transition-all">
                <X className="w-2.5 h-2.5" strokeWidth={2.5} />
              </button>
            )}
            <ResizeHandle colKey={cf.id} />
          </div>
          );
        })}

        {/* + Add field — pinned to right edge */}
        {perm.fieldCreate && (
          <button onClick={() => setShowFieldPicker(!showFieldPicker)}
            className="sticky right-0 w-9 flex-shrink-0 flex items-center justify-center bg-[var(--asana-surface)] border-b border-l border-[var(--asana-border)]/60 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
            title="Add field">
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
        </div>
      </div>

      {/* ── Sections (rendered directly inside the unified scroll viewport).
           w-max + min-w-full so the wrapper grows to match the widest data row,
           which makes `min-w-full` on every section header / add-task / sum row
           resolve to the FULL table content width (not just the visible viewport).
           Without this, section headers stop short on the right when many columns
           are present and the user has to horizontal-scroll to see them. ── */}
      <div className="w-max min-w-full">
        {lists.map((list) => {
          const estSum = getSectionSum(list.tasks, 'estimatedTime');
          const actSum = getSectionSum(list.tasks, 'actualTime');

          return (
            <Fragment key={list.id}>
              {/* Section header — sticky top while scrolling, with progress summary */}
              {(() => {
                const total = list.tasks?.length || 0;
                const done = (list.tasks || []).filter(t => t.status === 'DONE').length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
              <div onMouseEnter={() => { hoveredSectionRef.current = list.id; }}
                data-just-created={list.id}
                className="flex items-stretch border-b border-[var(--asana-border)]/60 bg-gradient-to-b from-gray-50/90 to-gray-50/40 dark:from-[#1a1f2b]/95 dark:to-[#151a23]/80 hover:from-gray-100/80 dark:hover:from-[#1f2533]/95 transition-all duration-180 group/section shadow-[0_1px_0_0_rgba(15,23,42,0.04)] w-max min-w-full">
                {/* Name cell — holds collapse arrow, title, count, progress bar (bg overrides parent gradient so frozen-left looks clean) */}
                <div className={`${NAME_COL} flex items-center px-4 py-3`}
                  style={{ background: 'inherit' }}>
                <button onClick={() => toggleSection(list.id)} className="mr-2.5 flex-shrink-0 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700/70 transition-colors">
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--asana-text-secondary)] transition-transform duration-180 ${collapsedSections[list.id] ? '-rotate-90' : ''}`} strokeWidth={2.5} />
                </button>

                {editingSectionId === list.id ? (
                  <input type="text" value={editingSectionName}
                    onChange={(e) => handleSectionNameChange(list.id, e.target.value)}
                    onBlur={() => handleStopEditingSection(list.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStopEditingSection(list.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                    autoFocus
                    className="text-base font-semibold bg-transparent border-b-2 border-asana-blue outline-none text-[var(--asana-text-primary)] py-0 px-0 flex-1 min-w-0" />
                ) : (
                  <span className={`text-[15px] font-semibold tracking-tight text-[var(--asana-text-primary)] truncate ${perm.sectionEdit ? 'cursor-text hover:text-asana-blue transition-colors' : ''}`}
                    onDoubleClick={(e) => { if (!perm.sectionEdit) return; e.stopPropagation(); setEditingSectionId(list.id); setEditingSectionName(list.name); }}
                    onClick={() => toggleSection(list.id)}>
                    {liveEdits[`section-${list.id}-name`] || list.name}
                  </span>
                )}

                <span className="ml-2.5 text-[10px] text-[var(--asana-text-secondary)] bg-gray-200/80 dark:bg-gray-700/70 rounded-full px-2 py-0.5 font-semibold flex-shrink-0">
                  {total}
                </span>

                {total > 0 && (
                  <div className="ml-3 flex items-center gap-2 flex-shrink-0">
                    <div className="w-24 h-1.5 rounded-full bg-gray-200/80 dark:bg-gray-700/60 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-asana"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100
                            ? 'linear-gradient(90deg,#22C55E,#16A34A)'
                            : 'linear-gradient(90deg,#4573D2,#6A67CE)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--asana-text-secondary)] tabular-nums">
                      {done}/{total} · {pct}%
                    </span>
                  </div>
                )}

                {(perm.sectionEdit || perm.sectionDelete) && editingSectionId !== list.id && (
                  <div className="ml-auto flex items-center space-x-0.5 opacity-0 group-hover/section:opacity-100 transition-all flex-shrink-0">
                    {perm.sectionEdit && (
                    <button onClick={(e) => { e.stopPropagation(); setEditingSectionId(list.id); setEditingSectionName(list.name); }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]" title="Rename">
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                    )}
                    {perm.sectionDelete && (
                    <button onClick={async (e) => { e.stopPropagation(); const ok = await confirm({ title: 'Delete section?', message: `"${list.name}" and all its tasks will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' }); if (!ok) return; emitInstant?.('section_deleted', { listId: resolveId(list.id) }); dispatch({ type: 'board/deleteList/fulfilled', payload: list.id }); queueOrRun(list.id, (realId) => dispatch(deleteList(realId))); }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--asana-text-secondary)] hover:text-red-500" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                    )}
                  </div>
                )}
                </div>
                {/* Empty placeholder cells — draw the same vertical column dividers as task rows.
                    `border-black/10` for light mode (dark divider on light gradient) and
                    `dark:border-white/10` for dark mode (light divider on dark gradient).
                    These contrast against ANY surface color, unlike the gray-700 we tried before
                    which blended into the section header's dark gradient. */}
                {cols.assignee && <div className={`${COL_W}`} />}
                {cols.dueDate && <div className={`${COL_W}`} />}
                {cols.status && <div className={`${COL_W}`} />}
                {cols.priority && <div className={`${COL_W}`} />}
                {cols.estimatedTime && <div className={`${COL_W}`} />}
                {cols.actualTime && <div className={`${COL_W}`} />}
                {customFields.map(cf => (
                  <div key={cf.id} className={`${COL_W}`} />
                ))}
                {/* Trailing spacer to match the column header's "+ Add field" button area on the right */}
                {canEdit && <div className="w-9 flex-shrink-0" />}
              </div>
                );
              })()}

              {!collapsedSections[list.id] && (() => {
                // Flatten all visible rows (tasks + expanded subtasks) into a single
                // ordered list. This is the only way @hello-pangea/dnd can reliably
                // handle hierarchical drag-and-drop — same-type nested Droppables
                // are not supported by the library, so we use ONE Droppable per
                // section and compute parentId on drop based on neighbor depth.
                const flatRows = flattenTaskTree(list.tasks, expandedTasks, 0, null);
                // Stash for handleDragEnd lookup (keyed by section listId).
                flatRowsBySectionRef.current[list.id] = flatRows;
                return (
                <div onMouseEnter={() => { hoveredSectionRef.current = list.id; }}>
                  <Droppable droppableId={`section::${list.id}`} type="task" ignoreContainerClipping>
                    {(dropProvided, dropSnapshot) => (
                      <div
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                        className={`min-h-[8px] transition-colors duration-180 ${dropSnapshot.isDraggingOver ? 'bg-blue-50/50 dark:bg-[#1f2937]/60 ring-1 ring-inset ring-asana-blue/30' : ''}`}
                      >
                        {flatRows.map(({ task, depth, parentId }, flatIndex) => {
                          const isTemp = typeof task.id === 'string' && task.id.startsWith('temp-');
                          return (
                            <Fragment key={task.id}>
                              <Draggable draggableId={String(task.id)} index={flatIndex} isDragDisabled={!perm.taskMove || isTemp}>
                                {(dragProvided, dragSnapshot) => (
                                  <TaskTreeNode task={task} depth={depth} parentId={parentId} listId={list.id}
                                    members={members} canEdit={canEdit} perm={perm} cols={cols}
                                    customFields={customFields} fieldValues={fieldValues} onSetFieldValue={setFieldValue}
                                    onTaskClick={onTaskClick} onRefresh={refetch}
                                    expandedTasks={expandedTasks} toggleTask={toggleTask}
                                    addingSubtaskTo={addingSubtaskTo} setAddingSubtaskTo={setAddingSubtaskTo}
                                    newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle}
                                    handleAddSubtask={handleAddSubtask} pendingItems={pendingItems} onCelebrate={onCelebrate}
                                    liveEdits={liveEdits} emitLiveEdit={emitLiveEdit} emitInstant={emitInstant} releaseEditLock={releaseEditLock}
                                    resolveId={resolveId} queueOrRun={queueOrRun}
                                    dragProvided={dragProvided} dragSnapshot={dragSnapshot} />
                                )}
                              </Draggable>
                              {/* Add-subtask footer is rendered as a sibling of the Draggable so
                                  it doesn't break the section's flat Draggable indexing. */}
                              {expandedTasks[task.id] && (
                                <AddSubtaskFooter task={task} depth={depth} listId={list.id} canEdit={perm.subtaskCreate}
                                  addingSubtaskTo={addingSubtaskTo} setAddingSubtaskTo={setAddingSubtaskTo}
                                  newSubtaskTitle={newSubtaskTitle} setNewSubtaskTitle={setNewSubtaskTitle}
                                  handleAddSubtask={handleAddSubtask} />
                              )}
                            </Fragment>
                          );
                        })}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  {/* Add task row */}
                  {perm.taskCreate && (
                    <div className="border-b border-[var(--asana-border)]/30 w-max min-w-full">
                      {addingTaskTo === list.id ? (
                        <form onSubmit={(e) => handleAddTask(e, list.id)}
                          className="sticky left-0 inline-flex items-center py-[7px] w-[400px] bg-[var(--asana-surface)]"
                          style={{ paddingLeft: '0.25rem', paddingRight: '0.75rem' }}>
                          <span className="w-4 mr-1 flex-shrink-0" />
                          <span className="w-[18px] mr-1.5 flex-shrink-0" />
                          <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
                          <input type="text" value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Write a task name, press Enter" autoFocus
                            className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                            onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle(''); } }}
                            onBlur={() => {
                              if (newTaskTitle.trim()) handleAddTask({ preventDefault: () => {} }, list.id);
                              else { setAddingTaskTo(null); setNewTaskTitle(''); }
                            }} />
                        </form>
                      ) : (
                        <button onClick={() => { setAddingTaskTo(list.id); setNewTaskTitle(''); }}
                          className="group/add sticky left-0 inline-flex items-center py-[3px] w-[400px] text-left text-[var(--asana-text-secondary)] hover:text-asana-blue hover:bg-blue-50/40 dark:hover:bg-[#1f2937]/60 bg-[var(--asana-surface)] text-xs font-medium transition-all duration-180"
                          style={{ paddingLeft: '0.25rem', paddingRight: '0.75rem' }}>
                          <span className="w-4 mr-1 flex-shrink-0" />
                          <span className="w-[18px] mr-1.5 flex-shrink-0" />
                          <span className="w-[18px] h-[18px] rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 group-hover/add:border-asana-blue flex items-center justify-center mr-3 flex-shrink-0 transition-colors">
                            <Plus className="w-2.5 h-2.5" strokeWidth={2.5} />
                          </span>
                          Add task
                          <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500 opacity-0 group-hover/add:opacity-100 transition-opacity">press T</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Section summary row (SUM) — recursive across subtasks */}
                  {(() => {
                    const cfSums = {};
                    customFields.forEach(cf => {
                      if (cf.type === 'TIME_TRACKING' || cf.type === 'NUMBER') {
                        const s = getCustomFieldSum(list.tasks, cf);
                        if (s != null && s > 0) cfSums[cf.id] = s;
                      }
                    });
                    const hasCfSums = Object.keys(cfSums).length > 0;
                    if (!(estSum > 0 || actSum > 0 || hasCfSums)) return null;
                    return (
                      <div className="flex items-stretch border-t-2 border-t-[var(--asana-border)] bg-gray-50/80 dark:bg-gray-800/40 w-max min-w-full">
                        <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-50/80 dark:bg-gray-800/40 px-4 py-1.5 flex items-center gap-2" style={{ width: colWidths['name'] ?? DEFAULT_NAME_W }}>
                          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">SUM</span>
                          <span className="text-[10px] text-[var(--asana-text-secondary)] truncate">{list.name}</span>
                        </div>
                        {cols.assignee && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['assignee'] ?? DEFAULT_COL_W }} />}
                        {cols.dueDate && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['dueDate'] ?? DEFAULT_COL_W }} />}
                        {cols.status && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['status'] ?? DEFAULT_COL_W }} />}
                        {cols.priority && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['priority'] ?? DEFAULT_COL_W }} />}
                        {cols.estimatedTime && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['estimatedTime'] ?? DEFAULT_COL_W }}><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{estSum > 0 ? formatTime(estSum) : ''}</span></div>}
                        {cols.actualTime && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['actualTime'] ?? DEFAULT_COL_W }}><span className="text-xs font-semibold text-[var(--asana-text-primary)]">{actSum > 0 ? formatTime(actSum) : ''}</span></div>}
                        {cols.billable && <div className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths['billable'] ?? DEFAULT_COL_W }} />}
                        {customFields.map(cf => {
                          const cfSum = cfSums[cf.id];
                          return (
                            <div key={cf.id} className="flex-shrink-0 px-3 py-1.5" style={{ width: colWidths[cf.id] ?? DEFAULT_COL_W }}>
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
                        {/* Trailing 36px spacer to align with column header's "+ Add field" button */}
                        {canEdit && <div className="w-9 flex-shrink-0" />}
                      </div>
                    );
                  })()}
                </div>
                );
              })()}
            </Fragment>
          );
        })}

        {/* Add section input — inside the table when active */}
        {addingSection && perm.sectionCreate && (
          <div className="px-4 py-2.5 border-b border-[var(--asana-border)]/30 sticky left-0">
            <form onSubmit={handleAddSection} className="flex items-center">
              <input type="text" value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                ref={addSectionInputRef}
                placeholder="Section name, press Enter" autoFocus
                className="text-sm font-bold bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400 flex-1"
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }}
                onBlur={() => { if (!newSectionName.trim()) { setAddingSection(false); setNewSectionName(''); } }} />
            </form>
          </div>
        )}

        {/* ── Grand Total row (all sections + all nested subtasks) ── */}
      {(() => {
        // Recursive sum across every section AND every subtask at any depth.
        let totalEst = 0;
        let totalAct = 0;
        lists.forEach((l) => walkTree(l.tasks, (t) => {
          totalEst += (t.estimatedTime || 0);
          totalAct += (t.actualTime || 0);
        }));

        // Custom field totals — also recursive across the full tree of every section.
        const cfTotals = {};
        customFields.forEach(cf => {
          if (cf.type === 'TIME_TRACKING' || cf.type === 'NUMBER') {
            let sum = 0;
            lists.forEach((l) => {
              const s = getCustomFieldSum(l.tasks, cf);
              if (s != null) sum += s;
            });
            if (sum > 0) cfTotals[cf.id] = sum;
          }
        });

        const hasTotals = totalEst > 0 || totalAct > 0 || Object.keys(cfTotals).length > 0;
        if (!hasTotals) return null;

        return (
          <div className="flex items-stretch border-t border-[var(--asana-border)]/50 bg-gray-100/50 dark:bg-gray-800/40 font-semibold w-max min-w-full">
            <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-100/50 dark:bg-gray-800/40 px-4 py-2 border-r border-[var(--asana-border)]/40 flex items-center" style={{ width: colWidths['name'] ?? DEFAULT_NAME_W }}>
              <span className="text-xs font-bold text-[var(--asana-text-primary)] uppercase tracking-wider">Total</span>
            </div>
            {cols.assignee && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40" style={{ width: colWidths['assignee'] ?? DEFAULT_COL_W }} />}
            {cols.dueDate && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40" style={{ width: colWidths['dueDate'] ?? DEFAULT_COL_W }} />}
            {cols.status && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40" style={{ width: colWidths['status'] ?? DEFAULT_COL_W }} />}
            {cols.priority && <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40" style={{ width: colWidths['priority'] ?? DEFAULT_COL_W }} />}
            {cols.estimatedTime && (
              <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center" style={{ width: colWidths['estimatedTime'] ?? DEFAULT_COL_W }}>
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{totalEst > 0 ? formatTime(totalEst) : ''}</span>
              </div>
            )}
            {cols.actualTime && (
              <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center" style={{ width: colWidths['actualTime'] ?? DEFAULT_COL_W }}>
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{totalAct > 0 ? formatTime(totalAct) : ''}</span>
              </div>
            )}
            {customFields.map(cf => (
              <div key={cf.id} className="flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]/40 flex items-center" style={{ width: colWidths[cf.id] ?? DEFAULT_COL_W }}>
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
      </div>

      {/* Field picker rendered as fixed overlay (outside scroll container) */}
      {showFieldPicker && canEdit && (
        <FieldTypePicker onSelect={addCustomField} onClose={() => setShowFieldPicker(false)} />
      )}
    </div>
    </div>

    {/* Add section button — outside table border, like real Asana */}
    {perm.sectionCreate && !addingSection && (
      <div className="px-1 py-2 mt-1">
        <button onClick={() => { setAddingSection(true); setNewSectionName(''); }}
          className="flex items-center text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] text-sm transition-colors px-3 py-1">
          <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
          Add section
        </button>
      </div>
    )}
    </DragDropContext>
    {ConfirmDialog}
  </>
  </SetColWidthsCtx.Provider>
  </ColWidthsCtx.Provider>
  );
}

export default ProjectListView;
