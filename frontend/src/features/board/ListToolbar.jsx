import { useState, useRef, useEffect } from 'react';

function useClickOutside(ref, handler) {
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) handler(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [ref, handler]);
}

/* ── Dropdown wrapper ── */
function Dropdown({ children, onClose }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  return (
    <div ref={ref} className="absolute top-full right-0 mt-1 bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-lg shadow-xl z-50 animate-fade-in min-w-[220px]">
      {children}
    </div>
  );
}

/* ═════════════════════════════════════════════
   Filter Panel
   ═════════════════════════════════════════════ */
function FilterPanel({ filters, onChange, members, onClose }) {
  const setFilter = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <Dropdown onClose={onClose}>
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <span className="text-xs font-bold text-[var(--karya-text-primary)]">Filter by</span>
      </div>

      {/* Status */}
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <label className="text-[10px] font-semibold text-[var(--karya-text-secondary)] uppercase tracking-wider">Status</label>
        <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value || null)}
          className="w-full mt-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-md px-2 py-1.5 text-[var(--karya-text-primary)] outline-none focus:ring-1 focus:ring-karya-blue">
          <option value="">All</option>
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="REVIEW">Review</option>
          <option value="DONE">Completed</option>
        </select>
      </div>

      {/* Priority */}
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <label className="text-[10px] font-semibold text-[var(--karya-text-secondary)] uppercase tracking-wider">Priority</label>
        <select value={filters.priority || ''} onChange={(e) => setFilter('priority', e.target.value || null)}
          className="w-full mt-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-md px-2 py-1.5 text-[var(--karya-text-primary)] outline-none focus:ring-1 focus:ring-karya-blue">
          <option value="">All</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Assignee */}
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <label className="text-[10px] font-semibold text-[var(--karya-text-secondary)] uppercase tracking-wider">Assignee</label>
        <select value={filters.assignee || ''} onChange={(e) => setFilter('assignee', e.target.value || null)}
          className="w-full mt-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-md px-2 py-1.5 text-[var(--karya-text-primary)] outline-none focus:ring-1 focus:ring-karya-blue">
          <option value="">All</option>
          <option value="__unassigned__">Unassigned</option>
          {(members || []).map(m => {
            const u = m.user || m;
            return <option key={u.id} value={u.id}>{u.name}</option>;
          })}
        </select>
      </div>

      {/* Due date */}
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <label className="text-[10px] font-semibold text-[var(--karya-text-secondary)] uppercase tracking-wider">Due date</label>
        <select value={filters.dueDate || ''} onChange={(e) => setFilter('dueDate', e.target.value || null)}
          className="w-full mt-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-md px-2 py-1.5 text-[var(--karya-text-primary)] outline-none focus:ring-1 focus:ring-karya-blue">
          <option value="">Any time</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="this_week">Due this week</option>
          <option value="no_date">No due date</option>
        </select>
      </div>

      {/* Clear */}
      <div className="px-3 py-2">
        <button onClick={() => onChange({ status: null, priority: null, assignee: null, dueDate: null })}
          className="text-xs text-karya-blue hover:underline">Clear all filters</button>
      </div>
    </Dropdown>
  );
}

/* ═════════════════════════════════════════════
   Sort Panel
   ═════════════════════════════════════════════ */
function SortPanel({ sortBy, sortDir, onChange, onClose }) {
  const options = [
    { value: 'none', label: 'None (manual)' },
    { value: 'title', label: 'Alphabetical' },
    { value: 'dueDate', label: 'Due date' },
    { value: 'priority', label: 'Priority' },
    { value: 'status', label: 'Status' },
    { value: 'createdAt', label: 'Created date' },
    { value: 'assignee', label: 'Assignee' },
  ];

  return (
    <Dropdown onClose={onClose}>
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <span className="text-xs font-bold text-[var(--karya-text-primary)]">Sort by</span>
      </div>
      {options.map(opt => (
        <button key={opt.value}
          onClick={() => {
            if (sortBy === opt.value) onChange(opt.value, sortDir === 'asc' ? 'desc' : 'asc');
            else onChange(opt.value, 'asc');
          }}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${sortBy === opt.value ? 'text-karya-blue font-semibold' : 'text-[var(--karya-text-primary)]'}`}>
          <span>{opt.label}</span>
          {sortBy === opt.value && (
            <svg className={`w-3.5 h-3.5 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          )}
        </button>
      ))}
    </Dropdown>
  );
}

/* ═════════════════════════════════════════════
   Group Panel
   ═════════════════════════════════════════════ */
function GroupPanel({ groupBy, onChange, onClose }) {
  const options = [
    { value: 'none', label: 'None (sections)' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'dueDate', label: 'Due date' },
  ];

  return (
    <Dropdown onClose={onClose}>
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <span className="text-xs font-bold text-[var(--karya-text-primary)]">Group by</span>
      </div>
      {options.map(opt => (
        <button key={opt.value}
          onClick={() => { onChange(opt.value === 'none' ? null : opt.value); onClose(); }}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${groupBy === opt.value || (!groupBy && opt.value === 'none') ? 'text-karya-blue font-semibold' : 'text-[var(--karya-text-primary)]'}`}>
          <span>{opt.label}</span>
          {(groupBy === opt.value || (!groupBy && opt.value === 'none')) && (
            <svg className="w-3.5 h-3.5 text-karya-blue" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}
    </Dropdown>
  );
}

/* ═════════════════════════════════════════════
   Options Panel (show/hide columns)
   ═════════════════════════════════════════════ */
function OptionsPanel({ columns, onChange, onClose }) {
  const toggle = (key) => onChange({ ...columns, [key]: !columns[key] });

  const allCols = [
    { key: 'assignee', label: 'Assignee' },
    { key: 'dueDate', label: 'Due date' },
    { key: 'status', label: 'Status' },
    { key: 'estimatedTime', label: 'Estimated time' },
    { key: 'actualTime', label: 'Actual time' },
    { key: 'priority', label: 'Priority' },
    { key: 'billable', label: 'Billable' },
  ];

  return (
    <Dropdown onClose={onClose}>
      <div className="px-3 py-2 border-b border-[var(--karya-border)]">
        <span className="text-xs font-bold text-[var(--karya-text-primary)]">Show columns</span>
      </div>
      {allCols.map(col => (
        <button key={col.key} onClick={() => toggle(col.key)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-[var(--karya-text-primary)]">
          <span>{col.label}</span>
          <div className={`w-8 h-4 rounded-full transition-colors flex items-center ${columns[col.key] !== false ? 'bg-karya-blue' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${columns[col.key] !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>
      ))}
    </Dropdown>
  );
}

/* ═════════════════════════════════════════════
   Save View Button
   ═════════════════════════════════════════════ */
function SaveViewButton({ onSave, hasSaved }) {
  const [flash, setFlash] = useState(false);

  const handleClick = () => {
    onSave();
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  };

  return (
    <button
      onClick={handleClick}
      title="Save current section layout as your default view"
      className={`flex items-center text-[11px] px-2.5 py-1.5 rounded-md border transition-all ${
        flash
          ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
          : hasSaved
            ? 'border-karya-blue/40 bg-karya-blue/5 text-karya-blue'
            : 'border-[var(--karya-border)] text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-[var(--karya-text-primary)]'
      }`}
    >
      {flash ? (
        <>
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5H6V3m6 14a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          Save view
        </>
      )}
    </button>
  );
}

/* ═════════════════════════════════════════════
   Main Toolbar
   ═════════════════════════════════════════════ */
function ListToolbar({ filters, onFiltersChange, sortBy, sortDir, onSortChange, groupBy, onGroupChange, columns, onColumnsChange, members, canEdit, canCreateTask, hasActiveFilters, searchQuery, onSearchChange, onAddTask, onSaveView, hasSavedView }) {
  const [openPanel, setOpenPanel] = useState(null); // 'filter' | 'sort' | 'group' | 'options' | 'search' | null
  const searchInputRef = useRef(null);

  const toggle = (panel) => setOpenPanel(prev => prev === panel ? null : panel);

  const toolbarButtons = [
    {
      key: 'filter',
      label: 'Filter',
      icon: 'M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm2 4a1 1 0 011-1h10a1 1 0 010 2H6a1 1 0 01-1-1zm2 4a1 1 0 011-1h6a1 1 0 010 2H8a1 1 0 01-1-1z',
      active: hasActiveFilters,
    },
    {
      key: 'sort',
      label: 'Sort',
      icon: 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12',
      active: sortBy && sortBy !== 'none',
    },
    {
      key: 'group',
      label: 'Group',
      icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
      active: !!groupBy,
    },
    {
      key: 'options',
      label: 'Options',
      icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
      active: false,
    },
  ];

  return (
    <div className="bg-[var(--karya-surface)] px-6 py-2 border-b border-[var(--karya-border)] flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {canCreateTask && onAddTask && (
          <button
            onClick={onAddTask}
            className="flex items-center text-sm font-semibold text-[var(--karya-text-primary)] hover:text-karya-blue transition-colors group/add"
          >
            <svg className="w-4 h-4 mr-1.5 text-[var(--karya-text-secondary)] group-hover/add:text-karya-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add task
            <svg className="w-3 h-3 ml-1 text-[var(--karya-text-secondary)] group-hover/add:text-karya-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center space-x-1">
        {toolbarButtons.map(({ key, label, icon, active }) => (
          <div key={key} className="relative">
            <button
              onClick={() => toggle(key)}
              className={`flex items-center text-[11px] px-2.5 py-1.5 rounded-md transition-colors ${
                active
                  ? 'bg-karya-blue/10 text-karya-blue font-semibold'
                  : openPanel === key
                    ? 'bg-gray-100 dark:bg-gray-800 text-[var(--karya-text-primary)]'
                    : 'text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-[var(--karya-text-primary)]'
              }`}
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
              {label}
              {active && <span className="w-1.5 h-1.5 rounded-full bg-karya-blue ml-1.5" />}
            </button>

            {openPanel === 'filter' && key === 'filter' && (
              <FilterPanel filters={filters} onChange={onFiltersChange} members={members} onClose={() => setOpenPanel(null)} />
            )}
            {openPanel === 'sort' && key === 'sort' && (
              <SortPanel sortBy={sortBy} sortDir={sortDir} onChange={(s, d) => { onSortChange(s, d); setOpenPanel(null); }} onClose={() => setOpenPanel(null)} />
            )}
            {openPanel === 'group' && key === 'group' && (
              <GroupPanel groupBy={groupBy} onChange={onGroupChange} onClose={() => setOpenPanel(null)} />
            )}
            {openPanel === 'options' && key === 'options' && (
              <OptionsPanel columns={columns} onChange={onColumnsChange} onClose={() => setOpenPanel(null)} />
            )}
          </div>
        ))}

        {/* Save View */}
        {onSaveView && (
          <SaveViewButton onSave={onSaveView} hasSaved={hasSavedView} />
        )}

        {/* Search toggle / inline input */}
        {openPanel === 'search' ? (
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-1 space-x-1.5 animate-fade-in">
            <svg className="w-3.5 h-3.5 text-[var(--karya-text-secondary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search in project..."
              autoFocus
              className="bg-transparent border-none outline-none text-xs text-[var(--karya-text-primary)] placeholder-gray-400 w-36 py-0"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { onSearchChange(''); setOpenPanel(null); }
              }}
            />
            {searchQuery && (
              <button onClick={() => onSearchChange('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button onClick={() => { onSearchChange(''); setOpenPanel(null); }} className="text-[var(--karya-text-secondary)] hover:text-[var(--karya-text-primary)] flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenPanel('search')}
            className={`flex items-center text-[11px] px-2 py-1.5 rounded-md transition-colors ${
              searchQuery ? 'bg-karya-blue/10 text-karya-blue' : 'text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && <span className="w-1.5 h-1.5 rounded-full bg-karya-blue ml-1" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════
   Data transformation helpers
   ═════════════════════════════════════════════ */
const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const STATUS_ORDER = { TODO: 0, IN_PROGRESS: 1, REVIEW: 2, DONE: 3 };

export function applyFilters(tasks, filters, searchQuery) {
  if (!filters && !searchQuery) return tasks;
  return tasks.filter(t => {
    // Text search — match title or description
    if (searchQuery?.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    if (!filters) return true;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.assignee) {
      if (filters.assignee === '__unassigned__') {
        if (t.assignees?.length > 0) return false;
      } else {
        if (!t.assignees?.some(a => (a.user?.id || a.userId) === filters.assignee)) return false;
      }
    }
    if (filters.dueDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (filters.dueDate === 'overdue' && (!due || due >= today)) return false;
      if (filters.dueDate === 'today' && (!due || due.toDateString() !== today.toDateString())) return false;
      if (filters.dueDate === 'this_week' && (!due || due < today || due > endOfWeek)) return false;
      if (filters.dueDate === 'no_date' && due) return false;
    }
    return true;
  });
}

export function applySort(tasks, sortBy, sortDir) {
  if (!sortBy || sortBy === 'none') return tasks;
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...tasks].sort((a, b) => {
    let av, bv;
    switch (sortBy) {
      case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
      case 'dueDate': av = a.dueDate || '9999'; bv = b.dueDate || '9999'; break;
      case 'priority': av = PRIORITY_ORDER[a.priority] ?? 99; bv = PRIORITY_ORDER[b.priority] ?? 99; break;
      case 'status': av = STATUS_ORDER[a.status] ?? 99; bv = STATUS_ORDER[b.status] ?? 99; break;
      case 'createdAt': av = a.createdAt || ''; bv = b.createdAt || ''; break;
      case 'assignee': av = a.assignees?.[0]?.user?.name?.toLowerCase() || 'zzz'; bv = b.assignees?.[0]?.user?.name?.toLowerCase() || 'zzz'; break;
      default: return 0;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export function applyGrouping(lists, groupBy) {
  if (!groupBy) return lists;

  // Flatten all tasks from all lists
  const allTasks = lists.flatMap(l => (l.tasks || []).map(t => ({ ...t, _listId: l.id })));

  const groups = {};
  allTasks.forEach(task => {
    let key;
    switch (groupBy) {
      case 'status':
        key = task.status || 'TODO';
        break;
      case 'priority':
        key = task.priority || 'LOW';
        break;
      case 'assignee':
        key = task.assignees?.[0]?.user?.name || 'Unassigned';
        break;
      case 'dueDate': {
        if (!task.dueDate) { key = 'No due date'; break; }
        const d = new Date(task.dueDate);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (d < today) key = 'Overdue';
        else if (d.toDateString() === today.toDateString()) key = 'Today';
        else {
          const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
          key = d <= endOfWeek ? 'This week' : 'Later';
        }
        break;
      }
      default:
        key = 'Other';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  });

  // Convert to list-like structure
  return Object.entries(groups).map(([name, tasks]) => ({
    id: `group-${name}`,
    name,
    tasks,
    _isGroup: true,
  }));
}

export default ListToolbar;
