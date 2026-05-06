import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchTask, updateTask, createSubtask, deleteTask, assignUser, addAttachment, removeAttachment } from '../../store/slices/taskSlice';
import { optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticAddSubtask } from '../../store/slices/boardSlice';
import { fetchProject } from '../../store/slices/projectSlice';
import api from '../../services/api';
import { useRole } from '../../hooks/useRole';
import { useConfirm } from '../../hooks/useConfirm';
import { useCelebration } from '../../components/Celebration';
import { useAutoSave, SaveIndicator } from '../../hooks/useAutoSave';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'VERIFIED'];

/**
 * Milestone Projects section — shows all projects this milestone is linked to
 * with a + button to add it to another project.
 */
function MilestoneProjects({ taskId }) {
  const { projects } = useAppSelector((state) => state.project);
  const currentTask = useAppSelector((state) => state.task.currentTask);
  const { can } = useRole();
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef(null);

  // Fetch linked projects — re-runs when taskId changes or when socket signals an update
  const milestoneSignal = currentTask?._milestoneProjectsUpdated;
  useEffect(() => {
    if (!taskId) return;
    api.get(`/api/v1/tasks/${taskId}/milestone-projects`)
      .then(res => setLinkedProjects(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId, milestoneSignal]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const linkedProjectIds = new Set(linkedProjects.map(p => p.projectId));
  const availableProjects = (projects || []).filter(
    p => !linkedProjectIds.has(p.id) && search ? p.name.toLowerCase().includes(search.toLowerCase()) : !linkedProjectIds.has(p.id)
  );

  const handleAdd = async (projectId) => {
    setAdding(true);
    try {
      const res = await api.post(`/api/v1/tasks/${taskId}/milestone-projects`, { projectId });
      setLinkedProjects(prev => [...prev, res.data.data]);
      setShowPicker(false);
      setSearch('');
    } catch (err) {
      console.error('Failed to add milestone to project:', err);
    } finally {
      setAdding(false);
    }
  };

  if (loading) return null;

  return (
    <div className="pt-4 border-t border-[var(--karya-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <h3 className="text-xs font-bold text-[var(--karya-text-secondary)] uppercase tracking-wider">Projects</h3>
          <span className="text-[10px] font-bold text-karya-blue bg-karya-blue/10 px-1.5 py-0.5 rounded-full">
            {linkedProjects.length}
          </span>
        </div>
        {can('milestone.multiproject') && (
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-xs font-medium text-karya-blue hover:underline flex items-center"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add to project
          </button>

          {showPicker && (
            <div className="absolute right-0 top-full mt-1 z-[100] w-64 bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-xl shadow-2xl overflow-hidden animate-fade-in">
              <div className="p-2 border-b border-[var(--karya-border)]">
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..." autoFocus
                  className="w-full px-2.5 py-1.5 text-xs bg-[var(--karya-bg)] border border-[var(--karya-border)] rounded-md text-[var(--karya-text-primary)] outline-none focus:border-karya-blue placeholder-[var(--karya-text-muted)]"
                />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {availableProjects.length === 0 ? (
                  <p className="text-xs text-[var(--karya-text-muted)] text-center py-3">
                    {search ? 'No matching projects' : 'Already in all projects'}
                  </p>
                ) : (
                  availableProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleAdd(p.id)}
                      disabled={adding}
                      className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50"
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold mr-2.5 flex-shrink-0"
                        style={{ backgroundColor: p.color || '#4573D2' }}>
                        {p.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-[var(--karya-text-primary)] truncate">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Linked projects list */}
      <div className="space-y-1">
        {linkedProjects.map(lp => (
          <div key={lp.projectId} className="flex items-center space-x-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group/mp">
            <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: lp.projectColor || '#4573D2' }} />
            <span className="text-sm text-[var(--karya-text-primary)] truncate flex-1">{lp.projectName}</span>
            {lp.isHome ? (
              <span className="text-[9px] text-[var(--karya-text-muted)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">Home</span>
            ) : can('milestone.remove') && (
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/api/v1/tasks/${taskId}/milestone-projects/${lp.projectId}`);
                    setLinkedProjects(prev => prev.filter(p => p.projectId !== lp.projectId));
                  } catch (err) { console.error('Failed to remove:', err); }
                }}
                className="opacity-0 group-hover/mp:opacity-100 p-0.5 rounded text-[var(--karya-text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
                title="Remove from this project"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
const STATUS_LABELS = { TODO: 'To do', IN_PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Completed', VERIFIED: 'Verified' };
const STATUS_COLORS = {
  TODO: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  REVIEW: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  VERIFIED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};
const PRIORITY_COLORS = {
  HIGH: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  MEDIUM: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400',
  LOW: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
};

function formatTime(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h 00m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function parseTime(input) {
  if (!input || !input.trim()) return null;
  const str = input.trim().toLowerCase();
  // "1h 30m" / "1h 30"
  const hm = str.match(/^(\d+)\s*h\s*(\d+)\s*m?$/);
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  // "1.5h" / "2.25h" (decimal hours)
  const decH = str.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (decH) return Math.round(parseFloat(decH[1]) * 60);
  // "90m"
  const mOnly = str.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (mOnly) return Math.round(parseFloat(mOnly[1]));
  // Bare decimal "1.5" → hours
  const dec = str.match(/^(\d+\.\d+)$/);
  if (dec) return Math.round(parseFloat(dec[1]) * 60);
  const num = parseInt(str);
  if (!isNaN(num)) return num;
  return null;
}

/* ── Assignee Picker for task detail ── */
function DetailAssigneePicker({ taskId, members, onClose, onDone, onOptimisticAssign, emitInstant }) {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((state) => state.auth.user);
  const ref = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = (members || [])
    .filter(m => (m.user?.name || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aIsMe = (a.user?.id || a.id) === currentUser?.id ? -1 : 0;
      const bIsMe = (b.user?.id || b.id) === currentUser?.id ? -1 : 0;
      return aIsMe - bIsMe;
    });

  const handleAssign = (userId) => {
    const user = (members || []).map(m => m.user || m).find(u => u.id === userId);
    if (user) {
      onOptimisticAssign?.(user);
      dispatch(optimisticAssignUser({ taskId, user }));
      emitInstant?.('task_assigned', { taskId, user });
    }
    onClose();
    dispatch(assignUser({ taskId, userId }));
  };

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-60 bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-lg shadow-xl animate-fade-in">
      <div className="p-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people..."
          autoFocus className="w-full px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-md border-none outline-none text-[var(--karya-text-primary)] placeholder-gray-400" />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {/* Unassign option */}
        <button onClick={() => handleAssign(null)} className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs text-[var(--karya-text-secondary)]">
          <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center mr-2.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          No assignee
        </button>
        {filtered.map((m) => {
          const u = m.user || m;
          return (
            <button key={u.id} onClick={() => handleAssign(u.id)}
              className="w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold mr-2.5"
                style={{ backgroundColor: `hsl(${(u.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}>
                {u.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-[var(--karya-text-primary)] truncate">{u.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Editable Time Field ── */
const DEFAULT_TIME_SUGGESTIONS = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
  { label: '1h 30m', mins: 90 },
  { label: '2h', mins: 120 },
  { label: '3h', mins: 180 },
  { label: '4h', mins: 240 },
  { label: '6h', mins: 360 },
  { label: '8h', mins: 480 },
];

// Dynamic suggestions based on user input.
// - "1" → [1 min, 1 hour, 1h 15m, 1h 30m, 1h 45m]
// - "1h" → [1 hour, 1h 15m, 1h 30m, 1h 45m]
// - "1.5" or "1.5h" → [1h 30m]
// - "" → default list
function buildTimeSuggestions(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return DEFAULT_TIME_SUGGESTIONS;

  const fmt = (m) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0 && min > 0) return `${h}h ${String(min).padStart(2, '0')}m`;
    if (h > 0) return `${h}h`;
    return `${min}m`;
  };

  // Pure integer → offer minute and hour interpretations + 15-min steps
  const num = s.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n <= 0) return [];
    const out = [
      { label: `${n}m`, mins: n },
      { label: `${n}h`, mins: n * 60 },
    ];
    [15, 30, 45].forEach((m) => out.push({ label: `${n}h ${m}m`, mins: n * 60 + m }));
    return out;
  }
  // Decimal "1.5" or "1.5h" → convert to h + m
  const decMatch = s.match(/^(\d+\.\d+)\s*h?$/);
  if (decMatch) {
    const totalMins = Math.round(parseFloat(decMatch[1]) * 60);
    return totalMins > 0 ? [{ label: fmt(totalMins), mins: totalMins }] : [];
  }
  // "Nh" → +15 increments
  const hOnly = s.match(/^(\d+)\s*h$/);
  if (hOnly) {
    const n = parseInt(hOnly[1], 10);
    return [
      { label: `${n}h`, mins: n * 60 },
      { label: `${n}h 15m`, mins: n * 60 + 15 },
      { label: `${n}h 30m`, mins: n * 60 + 30 },
      { label: `${n}h 45m`, mins: n * 60 + 45 },
    ];
  }
  // Try full parse and confirm
  const parsed = parseTime(s);
  if (parsed != null && parsed > 0) return [{ label: fmt(parsed), mins: parsed }];
  return [];
}

function TimeField({ label, taskId, field, value, canEdit, onUpdate, onOptimistic }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const startEdit = () => {
    if (!canEdit) return;
    setInput(value != null ? formatTime(value) : '');
    setEditing(true);
    setShowSuggestions(true);
  };

  const commit = (mins) => {
    onOptimistic?.(field, mins);
    dispatch(optimisticUpdateTask({ taskId, data: { [field]: mins } }));
    setEditing(false);
    setShowSuggestions(false);
    dispatch(updateTask({ taskId, data: { [field]: mins } })).then(() => onUpdate());
  };

  const save = () => commit(parseTime(input));

  // Dynamic suggestions based on what the user is typing
  const filtered = buildTimeSuggestions(input);

  return (
    <div className="flex items-center relative">
      <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">{label}</span>
      {editing ? (
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
            placeholder="e.g. 1h 30m"
            autoFocus
            className="w-full bg-transparent border-b border-karya-blue/40 py-1 px-1.5 text-sm text-[var(--karya-text-primary)] outline-none"
            onBlur={() => setTimeout(save, 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setEditing(false); setShowSuggestions(false); }
            }}
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute left-0 top-full mt-1 w-40 bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-lg shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
              {filtered.map(s => (
                <button
                  key={s.label}
                  onMouseDown={(e) => { e.preventDefault(); commit(s.mins); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--karya-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between"
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-[10px] text-[var(--karya-text-secondary)]">{s.mins} min</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span onClick={startEdit}
          className={`text-sm p-1.5 rounded transition-colors flex-1 ${canEdit ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''} ${value != null ? 'text-[var(--karya-text-primary)]' : 'text-[var(--karya-text-secondary)]'}`}>
          {value != null ? formatTime(value) : 'No time set'}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   TaskDetail Component
   ═══════════════════════════════════════════ */
function TaskDetail({ taskId: propTaskId, isEmbedded = false, onClose, previewTask = null, emitInstant }) {
  const { taskId: paramTaskId } = useParams();
  const taskId = propTaskId || paramTaskId;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentTask } = useAppSelector((state) => state.task);
  const { currentProject } = useAppSelector((state) => state.project);
  const { lists } = useAppSelector((state) => state.board);
  const { user } = useAppSelector((state) => state.auth);
  const { canEdit, canComment, can } = useRole();
  const canDeleteTask = can('task.delete');
  const canCreateSubtask = can('subtask.create');
  const canDeleteSubtask = can('subtask.delete');
  const canAddAttachment = can('attachment.add');
  const canDeleteAttachment = can('attachment.delete');
  const canAssign = can('task.assign');
  const canComplete = can('task.complete');
  const { confirm, ConfirmDialog } = useConfirm();
  const members = currentProject?.members || [];

  // Find task from board lists (has optimistic updates from list view)
  const boardTask = (() => {
    for (const list of lists) {
      const found = list.tasks?.find(t => t.id === taskId);
      if (found) return { ...found, list: { id: list.id, name: list.name } };
      for (const t of (list.tasks || [])) {
        const sub = t.subtasks?.find(s => s.id === taskId);
        if (sub) return { ...sub, list: { id: list.id, name: list.name } };
      }
    }
    return null;
  })();

  // Merge: boardTask has optimistic field updates (status, title, etc.) from the list view,
  // while currentTask has rich data (attachments, comments, activity) from fetchTask.
  // Merge both so the detail panel shows everything.
  const fullCurrentTask = currentTask?.id === taskId ? currentTask : null;
  const baseTask = (() => {
    if (boardTask && fullCurrentTask) {
      // Board task wins for core fields (has optimistic updates), but inherit
      // rich fields that only exist on the full fetch.
      return {
        ...fullCurrentTask,
        ...boardTask,
        attachments: fullCurrentTask.attachments || boardTask.attachments,
        comments: fullCurrentTask.comments || boardTask.comments,
        activityLogs: fullCurrentTask.activityLogs || boardTask.activityLogs,
        subtasks: boardTask.subtasks?.length > 0 ? boardTask.subtasks : fullCurrentTask.subtasks,
      };
    }
    return boardTask || fullCurrentTask || previewTask;
  })();
  const isFullyLoaded = !!fullCurrentTask;

  // Local optimistic overlay — merges over fetched data for instant UI
  const [optimistic, setOptimistic] = useState({});
  const task = baseTask ? { ...baseTask, ...optimistic } : null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Auto-save title
  const titleAutoSave = useAutoSave({
    initialValue: task?.title || '',
    entityId: taskId,
    onSave: async (val) => { await dispatch(updateTask({ taskId, data: { title: val } })).unwrap(); },
    onOptimistic: (val) => { setOptimistic(prev => ({ ...prev, title: val })); dispatch(optimisticUpdateTask({ taskId, data: { title: val } })); },
    debounceMs: 400,
  });

  // Auto-save description
  const descAutoSave = useAutoSave({
    initialValue: task?.description || '',
    entityId: taskId,
    onSave: async (val) => { await dispatch(updateTask({ taskId, data: { description: val } })).unwrap(); },
    onOptimistic: (val) => setOptimistic(prev => ({ ...prev, description: val })),
    debounceMs: 500,
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [activeTab, setActiveTab] = useState('comments');
  const [justCompleted, setJustCompleted] = useState(false);
  const { celebrate, CelebrationComponent } = useCelebration();
  const [localComments, setLocalComments] = useState(null); // optimistic comments
  const [localSubtasks, setLocalSubtasks] = useState(null); // optimistic subtasks

  useEffect(() => {
    if (taskId) dispatch(fetchTask(taskId));
    setOptimistic({});
    setLocalComments(null);
    setLocalSubtasks(null);
  }, [taskId, dispatch]);

  // If the task's project doesn't match the currently loaded project,
  // fetch it so useRole() can resolve permissions correctly.
  // This happens when opening from My Tasks or search (no project context).
  useEffect(() => {
    const taskProjectId = fullCurrentTask?.list?.board?.project?.id;
    if (taskProjectId && currentProject?.id !== taskProjectId) {
      dispatch(fetchProject(taskProjectId));
    }
  }, [fullCurrentTask?.list?.board?.project?.id, currentProject?.id, dispatch]);

  useEffect(() => {
    if (currentTask?.id === taskId) {
      setOptimistic({});
      setLocalComments(null);
      setLocalSubtasks(null);
    }
  }, [currentTask, taskId]);

  // Optimistic update — instant UI + instant broadcast + background API
  const handleUpdate = (field, value) => {
    setOptimistic(prev => ({ ...prev, [field]: value }));
    dispatch(optimisticUpdateTask({ taskId, data: { [field]: value } }));
    emitInstant?.('task_field_updated', { taskId, field, value });
    dispatch(updateTask({ taskId, data: { [field]: value } }));
  };

  const refetchTask = () => dispatch(fetchTask(taskId));

  const handleAddSubtask = (e) => {
    e.preventDefault();
    if (!canCreateSubtask || !newSubtask.trim()) return;
    const title = newSubtask.trim();
    const listId = task.listId || task.list?.id;
    const tempSubtask = { id: `temp-${Date.now()}`, title, status: 'TODO', priority: 'LOW', taskType: 'DEFAULT_TASK', assignees: [], subtasks: [] };

    // 1. Local optimistic (modal)
    setLocalSubtasks(prev => [...(prev || task?.subtasks || []), tempSubtask]);
    // 2. Board optimistic (list view behind modal)
    dispatch(optimisticAddSubtask({ listId, taskId, subtask: tempSubtask }));
    // 3. Instant broadcast to other users
    emitInstant?.('subtask_added', { listId, taskId, subtask: tempSubtask });
    // 4. Clear input
    setNewSubtask('');
    // 5. Background DB save — then broadcast real subtask to replace temp
    const tempId = tempSubtask.id;
    dispatch(createSubtask({ listId, taskId, subtaskData: { title } })).unwrap().then((realSub) => {
      emitInstant?.('subtask_replaced', { tempId, taskId, subtask: realSub });
    }).catch(() => {});
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const tempComment = { id: `temp-${Date.now()}`, content: newComment.trim(), user: { id: user?.id, name: user?.name }, createdAt: new Date().toISOString(), userId: user?.id };
    setLocalComments(prev => [tempComment, ...(prev || task?.comments || [])]);
    const content = newComment.trim();
    setNewComment('');
    api.post(`/api/v1/comments/task/${taskId}`, { content }).then(() => refetchTask());
  };

  const handleDeleteComment = (commentId) => {
    setLocalComments(prev => (prev || task?.comments || []).filter(c => c.id !== commentId));
    api.delete(`/api/v1/comments/${commentId}`).then(() => refetchTask());
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!canAddAttachment || !file) return;
    setIsUploading(true);
    try { await dispatch(addAttachment({ taskId, file })).unwrap(); }
    catch (err) { console.error('Upload failed:', err); }
    finally { setIsUploading(false); }
  };

  const handleDeleteTask = async () => {
    if (!canDeleteTask) return;
    if (await confirm({ title: 'Delete task?', message: 'This task and all its subtasks will be permanently deleted.', confirmText: 'Delete', variant: 'danger' })) {
      dispatch(optimisticDeleteTask(taskId));
      emitInstant?.('task_deleted', { taskId });
      if (isEmbedded) onClose();
      else navigate(-1);
      dispatch(deleteTask(taskId));
    }
  };

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-karya-blue" />
      </div>
    );
  }

  const projectName = task.list?.board?.project?.name || currentProject?.name || '';

  return (
    <div className={`flex flex-col h-full bg-[var(--karya-surface)] ${!isEmbedded ? 'max-w-3xl mx-auto my-8 shadow-2xl rounded-karya-lg border border-[var(--karya-border)]' : ''}`}>
      {/* ── Header ── */}
      <div className="px-6 py-3 border-b border-[var(--karya-border)] flex items-center justify-between sticky top-0 bg-[var(--karya-surface)] z-10">
        <div className="flex items-center space-x-3">
          {/* Breadcrumb */}
          <span className="text-[11px] text-[var(--karya-text-secondary)] truncate max-w-[200px]">
            {projectName} {task.list?.name ? `› ${task.list.name}` : ''}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              if (!canComplete) return;
              const newStatus = task.status === 'VERIFIED' ? 'TODO' : 'VERIFIED';
              if (newStatus === 'VERIFIED') { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600); celebrate(); }
              handleUpdate('status', newStatus);
            }}
            disabled={!canComplete}
            className={`flex items-center px-3 py-1.5 rounded-md border text-xs font-semibold transition-all duration-300 ${
              task.status === 'VERIFIED' ? 'bg-green-500 text-white border-green-500' : 'text-[var(--karya-text-secondary)] border-[var(--karya-border)] hover:border-green-400 hover:text-green-500'
            } ${justCompleted ? 'check-pop' : ''} ${!canComplete ? 'cursor-default opacity-70' : ''}`}
          >
            <svg className={`w-3.5 h-3.5 mr-1 ${justCompleted ? 'check-draw' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {task.status === 'VERIFIED' ? 'Verified' : 'Mark verified'}
          </button>
          {canDeleteTask && (
            <button onClick={handleDeleteTask} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-[var(--karya-text-secondary)] hover:text-red-500 transition-colors" title="Delete">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {isEmbedded && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-[var(--karya-text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* ── Title ── */}
          {canEdit && isEditingTitle ? (
            <div className="flex items-center space-x-2">
              <input type="text" value={titleAutoSave.value}
                onChange={(e) => titleAutoSave.setValue(e.target.value)}
                onBlur={() => { titleAutoSave.flush(); setIsEditingTitle(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { titleAutoSave.flush(); setIsEditingTitle(false); } if (e.key === 'Escape') setIsEditingTitle(false); }}
                className="text-xl font-bold w-full bg-transparent border-none p-0 focus:ring-0 text-[var(--karya-text-primary)] outline-none" autoFocus />
              <SaveIndicator status={titleAutoSave.saveStatus} />
            </div>
          ) : (
            <h1 onClick={() => canEdit && setIsEditingTitle(true)}
              className={`text-xl font-bold text-[var(--karya-text-primary)] rounded px-1 -ml-1 min-h-[1.5em] ${canEdit ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}`}>
              {task.title}
            </h1>
          )}

          {/* ── Fields grid ── */}
          <div className="space-y-3">
            {/* Assignee */}
            <div className="flex items-center relative">
              <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Assignee</span>
              <button onClick={() => canAssign && setShowAssigneePicker(true)}
                className={`flex items-center space-x-2 p-1.5 rounded transition-colors flex-1 min-w-0 ${canAssign ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : ''}`}>
                {task.assignees?.length > 0 ? (
                  <>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: `hsl(${(task.assignees[0].user?.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}>
                      {task.assignees[0].user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-[var(--karya-text-primary)] truncate">{task.assignees[0].user?.name}</span>
                  </>
                ) : (
                  <div className="flex items-center space-x-2 text-[var(--karya-text-secondary)]">
                    <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <span className="text-xs">No assignee</span>
                  </div>
                )}
              </button>
              {showAssigneePicker && (
                <DetailAssigneePicker taskId={taskId} members={members}
                  onClose={() => setShowAssigneePicker(false)} onDone={refetchTask}
                  onOptimisticAssign={(user) => setOptimistic(prev => ({ ...prev, assignees: [{ user }] }))}
                  emitInstant={emitInstant} />
              )}
            </div>

            {/* Due Date */}
            <div className="flex items-center">
              <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Due date</span>
              <div className="flex items-center p-1.5 rounded transition-colors flex-1">
                <svg className="w-4 h-4 text-[var(--karya-text-secondary)] mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input type="date" value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => canEdit && handleUpdate('dueDate', e.target.value || null)} readOnly={!canEdit}
                  className={`bg-transparent border-none p-0 text-sm text-[var(--karya-text-primary)] focus:ring-0 flex-1 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`} />
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center">
              <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Priority</span>
              <select value={task.priority || 'LOW'} onChange={(e) => handleUpdate('priority', e.target.value)} disabled={!canEdit}
                className={`border border-[var(--karya-border)] p-1.5 px-2.5 rounded-md text-xs font-semibold focus:ring-1 focus:ring-karya-blue/30 focus:border-karya-blue/30 outline-none bg-[var(--karya-bg)] text-[var(--karya-text-primary)] ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}>
                <option value="HIGH" className="bg-[var(--karya-surface)] text-[var(--karya-text-primary)]">🔴 High</option>
                <option value="MEDIUM" className="bg-[var(--karya-surface)] text-[var(--karya-text-primary)]">🟡 Medium</option>
                <option value="LOW" className="bg-[var(--karya-surface)] text-[var(--karya-text-primary)]">🔵 Low</option>
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center">
              <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Status</span>
              <select value={task.status || 'TODO'} onChange={(e) => { if (e.target.value === 'VERIFIED') { setJustCompleted(true); setTimeout(() => setJustCompleted(false), 600); celebrate(); } handleUpdate('status', e.target.value); }} disabled={!canEdit}
                className={`border border-[var(--karya-border)] p-1.5 px-2.5 rounded-md text-xs font-semibold focus:ring-1 focus:ring-karya-blue/30 focus:border-karya-blue/30 outline-none bg-[var(--karya-bg)] text-[var(--karya-text-primary)] ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="bg-[var(--karya-surface)] text-[var(--karya-text-primary)]">{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Section */}
            <div className="flex items-center">
              <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Section</span>
              <span className="text-sm text-[var(--karya-text-primary)] p-1.5">{task.list?.name || '—'}</span>
            </div>

            {/* Estimated time */}
            <TimeField label="Estimated time" taskId={taskId} field="estimatedTime" value={task.estimatedTime} canEdit={canEdit} onUpdate={refetchTask} onOptimistic={(f, v) => setOptimistic(prev => ({ ...prev, [f]: v }))} />

            {/* Actual time */}
            <TimeField label="Actual time" taskId={taskId} field="actualTime" value={task.actualTime} canEdit={canEdit} onUpdate={refetchTask} onOptimistic={(f, v) => setOptimistic(prev => ({ ...prev, [f]: v }))} />

            {/* Created */}
            {task.createdAt && (
              <div className="flex items-center">
                <span className="w-28 text-[var(--karya-text-secondary)] text-xs font-medium flex-shrink-0">Created</span>
                <span className="text-xs text-[var(--karya-text-secondary)] p-1.5">
                  {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {/* ── Description ── */}
          <div className="pt-4 border-t border-[var(--karya-border)]">
            <h3 className="text-xs font-bold text-[var(--karya-text-secondary)] uppercase tracking-wider mb-2">Description</h3>
            <div className="relative">
              <textarea placeholder={canEdit ? 'What is this task about?' : ''} value={descAutoSave.value}
                onChange={(e) => canEdit && descAutoSave.setValue(e.target.value)}
                onBlur={() => descAutoSave.flush()}
                readOnly={!canEdit}
                className={`w-full bg-[var(--karya-bg)] border border-[var(--karya-border)] p-3 text-sm text-[var(--karya-text-primary)] placeholder-gray-400 rounded-lg min-h-[80px] resize-none transition-all outline-none ${canEdit ? 'focus:ring-1 focus:ring-karya-blue/30 focus:border-karya-blue/30' : 'cursor-default'}`} />
              <div className="absolute top-2 right-2"><SaveIndicator status={descAutoSave.saveStatus} /></div>
            </div>
          </div>

          {/* ── Subtasks ── */}
          <div className="pt-4 border-t border-[var(--karya-border)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[var(--karya-text-secondary)] uppercase tracking-wider">
                Subtasks {(localSubtasks || task.subtasks)?.length > 0 && <span className="ml-1 font-normal">{(localSubtasks || task.subtasks).filter(s => s.status === 'DONE' || s.status === 'VERIFIED').length}/{(localSubtasks || task.subtasks).length}</span>}
              </h3>
            </div>
            <div className="space-y-1">
              {(localSubtasks || task.subtasks)?.map((sub) => (
                <div key={sub.id} className="flex items-center space-x-3 py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 group transition-colors">
                  <button onClick={() => {
                    const newStatus = sub.status === 'VERIFIED' ? 'TODO' : 'VERIFIED';
                    if (newStatus === 'VERIFIED') celebrate();
                    setLocalSubtasks(prev => (prev || task.subtasks || []).map(s => s.id === sub.id ? { ...s, status: newStatus } : s));
                    dispatch(optimisticUpdateTask({ taskId: sub.id, data: { status: newStatus } }));
                    emitInstant?.('task_completed', { taskId: sub.id, status: newStatus });
                    dispatch(updateTask({ taskId: sub.id, data: { status: newStatus } }));
                  }}
                    className={`w-[16px] h-[16px] rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      sub.status === 'VERIFIED' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                    }`}>
                    {sub.status === 'VERIFIED' && <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </button>
                  <span className={`text-sm flex-1 ${sub.status === 'VERIFIED' ? 'line-through text-[var(--karya-text-secondary)]' : 'text-[var(--karya-text-primary)]'}`}>{sub.title}</span>
                  {sub.assignees?.length > 0 && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                      style={{ backgroundColor: `hsl(${(sub.assignees[0].user?.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}>
                      {sub.assignees[0].user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {canDeleteSubtask && (
                    <button onClick={() => {
                      setLocalSubtasks(prev => (prev || task.subtasks || []).filter(s => s.id !== sub.id));
                      dispatch(optimisticDeleteTask(sub.id));
                      emitInstant?.('task_deleted', { taskId: sub.id });
                      dispatch(deleteTask(sub.id));
                    }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--karya-text-secondary)] hover:text-red-500 rounded transition-all">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              {canCreateSubtask && (
                <form onSubmit={handleAddSubtask} className="flex items-center space-x-3 py-1.5 px-2">
                  <svg className="w-4 h-4 text-[var(--karya-text-secondary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <input type="text" placeholder="Add subtask..." value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)}
                    className="flex-1 bg-transparent border-none py-0 text-sm focus:ring-0 text-[var(--karya-text-primary)] placeholder-gray-400 outline-none" />
                </form>
              )}
            </div>
          </div>

          {/* ── Milestone Projects — only for MILESTONE type tasks ── */}
          {task.taskType === 'MILESTONE' && (
            <MilestoneProjects taskId={taskId} />
          )}

          {/* ── Attachments ── */}
          <div className="pt-4 border-t border-[var(--karya-border)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[var(--karya-text-secondary)] uppercase tracking-wider">Attachments</h3>
              {canAddAttachment && (
                <label className={`cursor-pointer text-xs font-medium text-karya-blue hover:underline ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                  {isUploading ? 'Uploading...' : '+ Add file'}
                </label>
              )}
            </div>
            {task.attachments?.length > 0 && (
              <div className="space-y-2">
                {task.attachments.map((att) => (
                  <div key={att.id} className="flex items-center p-2.5 border border-[var(--karya-border)] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group transition-all">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-3 text-[var(--karya-text-secondary)] flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--karya-text-primary)] truncate block hover:text-karya-blue">{att.filename}</a>
                      <span className="text-[10px] text-[var(--karya-text-secondary)]">{(att.size / 1024).toFixed(1)} KB</span>
                    </div>
                    {canDeleteAttachment && (
                      deletingAttachmentId === att.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <button onClick={async () => {
                          setDeletingAttachmentId(att.id);
                          try { await dispatch(removeAttachment({ taskId, attachmentId: att.id })).unwrap(); }
                          catch {} finally { setDeletingAttachmentId(null); }
                        }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--karya-text-secondary)] hover:text-red-500 rounded transition-all">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Comments & Activity ── */}
          <div className="pt-4 border-t border-[var(--karya-border)]">
            {/* Tabs */}
            <div className="flex items-center space-x-4 mb-4">
              <button onClick={() => setActiveTab('comments')}
                className={`text-xs font-bold pb-1.5 border-b-2 transition-colors ${activeTab === 'comments' ? 'border-karya-blue text-[var(--karya-text-primary)]' : 'border-transparent text-[var(--karya-text-secondary)] hover:text-[var(--karya-text-primary)]'}`}>
                Comments
              </button>
              <button onClick={() => setActiveTab('activity')}
                className={`text-xs font-bold pb-1.5 border-b-2 transition-colors ${activeTab === 'activity' ? 'border-karya-blue text-[var(--karya-text-primary)]' : 'border-transparent text-[var(--karya-text-secondary)] hover:text-[var(--karya-text-primary)]'}`}>
                All activity
              </button>
            </div>

            {/* Comment input */}
            {canComment && activeTab === 'comments' && (
              <div className="flex space-x-3 mb-4">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: `hsl(${(user?.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}>
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 border border-[var(--karya-border)] rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-karya-blue/30 focus-within:border-karya-blue/30 transition-all bg-[var(--karya-bg)]">
                  <textarea placeholder="Add a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    className="w-full bg-transparent p-3 text-sm focus:ring-0 resize-none min-h-[60px] border-none text-[var(--karya-text-primary)] placeholder-gray-400 outline-none" />
                  {newComment.trim() && (
                    <div className="flex justify-end px-3 pb-2">
                      <button onClick={handleAddComment} className="karya-button-primary text-xs py-1 px-3">Comment</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Comments list */}
            {activeTab === 'comments' && (isFullyLoaded || localComments) && (
              <div className="space-y-4">
                {(localComments || task.comments || []).map((comment) => (
                  <div key={comment.id} className="flex space-x-3 group">
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: `hsl(${(comment.user?.name?.charCodeAt(0) ?? 65) * 15}, 60%, 50%)` }}>
                      {comment.user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-[var(--karya-text-primary)]">{comment.user?.name}</span>
                        <span className="text-[10px] text-[var(--karya-text-secondary)]">{new Date(comment.createdAt).toLocaleString()}</span>
                        {(canEdit || comment.userId === user?.id) && (
                          <button onClick={() => handleDeleteComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 text-[var(--karya-text-secondary)] hover:text-red-500 transition-all">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-[var(--karya-text-primary)] mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}
                {(localComments || task.comments || []).length === 0 && (
                  <p className="text-xs text-[var(--karya-text-secondary)] text-center py-4">No comments yet</p>
                )}
              </div>
            )}

            {/* Activity log */}
            {activeTab === 'activity' && isFullyLoaded && (
              <div className="space-y-3">
                {(task.activityLogs || []).map((log) => (
                  <div key={log.id} className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--karya-text-secondary)]" />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--karya-text-primary)]">
                        <span className="font-semibold">{log.user?.name}</span>
                        <span className="text-[var(--karya-text-secondary)] ml-1">
                          {log.action === 'TASK_CREATED' ? 'created this task' :
                           log.action === 'TASK_UPDATED' ? 'updated this task' :
                           log.action === 'SUBTASK_CREATED' ? 'added a subtask' :
                           log.action.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </p>
                      <p className="text-[10px] text-[var(--karya-text-secondary)]">{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {(task.activityLogs || []).length === 0 && (
                  <p className="text-xs text-[var(--karya-text-secondary)] text-center py-4">No activity yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <CelebrationComponent />
      {ConfirmDialog}
    </div>
  );
}

export default TaskDetail;
