import { useState, useMemo } from 'react';

/* ═══════════════════════════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════════════════════════ */
const STATUS_COLORS = { TODO: '#6b7280', IN_PROGRESS: '#3b82f6', REVIEW: '#eab308', DONE: '#22c55e' };
const STATUS_LABELS = { TODO: 'To do', IN_PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Completed' };
const PRIORITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6' };
const BAR_COLORS = ['#4573D2', '#FC636B', '#37A169', '#D69E2E', '#6A67CE', '#3BE8B0', '#F97316', '#EC4899'];

function getAllTasks(lists) {
  return (lists || []).flatMap(l => l.tasks || []);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ProgressBar({ value, max, color = '#4573D2', height = 8 }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW VIEW
   ═══════════════════════════════════════════════════════════ */
export function OverviewView({ project, lists, members }) {
  const tasks = getAllTasks(lists);
  const done = tasks.filter(t => t.status === 'DONE').length;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length;
  const total = tasks.length;

  return (
    <div className="max-w-4xl space-y-6 pb-8">
      {/* Project info */}
      <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--asana-text-primary)]">{project.name}</h2>
            <p className="text-sm text-[var(--asana-text-secondary)] mt-1">{project.description || 'Add a project description...'}</p>
          </div>
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${project.visibility === 'PRIVATE' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
            {project.visibility}
          </span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total tasks', value: total, color: '#4573D2' },
          { label: 'Completed', value: done, color: '#22c55e' },
          { label: 'In progress', value: tasks.filter(t => t.status === 'IN_PROGRESS').length, color: '#3b82f6' },
          { label: 'Overdue', value: overdue, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-4">
            <p className="text-[10px] font-bold uppercase text-[var(--asana-text-secondary)] tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Project progress</h3>
          <span className="text-sm font-bold text-[var(--asana-text-primary)]">{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
        </div>
        <ProgressBar value={done} max={total} color="#22c55e" height={10} />
        <p className="text-xs text-[var(--asana-text-secondary)] mt-2">{done} of {total} tasks completed</p>
      </div>

      {/* Sections breakdown */}
      <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-6">
        <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Sections</h3>
        <div className="space-y-3">
          {(lists || []).map((list, i) => {
            const lt = list.tasks?.length || 0;
            const ld = list.tasks?.filter(t => t.status === 'DONE').length || 0;
            return (
              <div key={list.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--asana-text-primary)]">{list.name}</span>
                  <span className="text-[10px] text-[var(--asana-text-secondary)]">{ld}/{lt}</span>
                </div>
                <ProgressBar value={ld} max={lt} color={BAR_COLORS[i % BAR_COLORS.length]} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Members */}
      <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-6">
        <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Project members</h3>
        <div className="space-y-2.5">
          {(members || []).map(m => (
            <div key={m.userId || m.id} className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: `hsl(${(m.user?.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                {m.user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--asana-text-primary)]">{m.user?.name}</p>
                <p className="text-[10px] text-[var(--asana-text-secondary)]">{m.user?.email}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)]">{m.projectRole}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TIMELINE VIEW
   ═══════════════════════════════════════════════════════════ */
export function TimelineView({ lists, onTaskClick }) {
  const tasks = getAllTasks(lists);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate date range — include both createdAt and dueDate so all bars fit
  const allDates = [];
  allDates.push(today.getTime());
  tasks.forEach(t => {
    if (t.createdAt) allDates.push(new Date(t.createdAt).getTime());
    if (t.dueDate) allDates.push(new Date(t.dueDate).getTime());
  });
  const minDate = new Date(Math.min(...allDates));
  const maxDate = allDates.length > 1
    ? new Date(Math.max(...allDates, addDays(today, 14).getTime()))
    : addDays(today, 30);

  const startDate = addDays(minDate, -3);
  const endDate = addDays(maxDate, 7);
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const dayWidth = 40;

  const getPosition = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const days = Math.ceil((d - startDate) / (1000 * 60 * 60 * 24));
    return days * dayWidth;
  };

  // Generate week headers
  const weeks = [];
  let d = new Date(startDate);
  while (d <= endDate) {
    weeks.push(new Date(d));
    d = addDays(d, 7);
  }

  // Generate day columns
  const days = [];
  d = new Date(startDate);
  while (d <= endDate) {
    days.push(new Date(d));
    d = addDays(d, 1);
  }

  return (
    <div className="h-full overflow-auto bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)]">
      <div className="min-w-max">
        {/* Header — week labels */}
        <div className="flex border-b border-[var(--asana-border)] sticky top-0 bg-[var(--asana-surface)] z-10">
          <div className="w-52 flex-shrink-0 px-3 py-2 border-r border-[var(--asana-border)]">
            <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase">Task</span>
          </div>
          <div className="flex">
            {days.map((day, i) => {
              const isToday = day.toDateString() === today.toDateString();
              const isMonday = day.getDay() === 1;
              return (
                <div key={i} className={`flex flex-col items-center justify-center border-r border-[var(--asana-border)]/30 ${isToday ? 'bg-asana-blue/5' : ''}`}
                  style={{ width: dayWidth }}>
                  {isMonday && <span className="text-[9px] font-medium text-[var(--asana-text-secondary)]">{formatDate(day)}</span>}
                  <span className={`text-[9px] ${isToday ? 'font-bold text-asana-blue' : 'text-[var(--asana-text-secondary)]'}`}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task rows */}
        {(lists || []).map((list, li) => (
          <div key={list.id}>
            {/* Section header */}
            <div className="flex border-b border-[var(--asana-border)]">
              <div className="w-52 flex-shrink-0 px-3 py-1.5 bg-gray-50/50 dark:bg-gray-800/30">
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{list.name}</span>
              </div>
              <div style={{ width: totalDays * dayWidth }} className="bg-gray-50/50 dark:bg-gray-800/30" />
            </div>

            {(list.tasks || []).map((task, ti) => {
              const color = BAR_COLORS[(li * 5 + ti) % BAR_COLORS.length];
              const hasDue = !!task.dueDate;
              const isMilestone = task.taskType === 'MILESTONE';

              // Calculate bar position from createdAt → dueDate
              const taskStart = new Date(task.createdAt || today);
              taskStart.setHours(0, 0, 0, 0);
              const taskEnd = hasDue ? new Date(task.dueDate) : addDays(taskStart, 1);
              taskEnd.setHours(0, 0, 0, 0);

              const daySpan = Math.max(1, Math.ceil((taskEnd - taskStart) / (1000 * 60 * 60 * 24)));
              const barLeft = isMilestone && hasDue ? getPosition(task.dueDate) : getPosition(taskStart);
              const barWidth = isMilestone ? 0 : daySpan * dayWidth;

              return (
                <div key={task.id} className="flex border-b border-[var(--asana-border)]/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 group">
                  <div className="w-52 flex-shrink-0 px-3 py-2 flex items-center space-x-2 border-r border-[var(--asana-border)] cursor-pointer"
                    onClick={() => onTaskClick(task.id)}>
                    {isMilestone ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" className="flex-shrink-0">
                        <rect x="6" y="0" width="7" height="7" rx="1" transform="rotate(45 6 0)"
                          className={task.status === 'DONE' ? 'fill-green-500' : 'fill-transparent stroke-gray-400'} strokeWidth="1.5" />
                      </svg>
                    ) : (
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${task.status === 'DONE' ? 'bg-green-500' : 'border-2 border-gray-300 dark:border-gray-600'}`} />
                    )}
                    <span className={`text-xs truncate ${isMilestone ? 'font-bold' : ''} ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>{task.title}</span>
                  </div>
                  <div className="relative" style={{ width: totalDays * dayWidth, height: 32 }}>
                    <div className="absolute top-0 bottom-0 w-px bg-asana-blue/40 z-10" style={{ left: getPosition(today) }} />
                    {isMilestone ? (
                      /* Diamond marker for milestones */
                      <svg width="16" height="16" viewBox="0 0 16 16" className="absolute cursor-pointer hover:scale-125 transition-transform"
                        style={{ left: barLeft - 8, top: 8 }} onClick={() => onTaskClick(task.id)}>
                        <rect x="8" y="1" width="9" height="9" rx="1" transform="rotate(45 8 1)"
                          fill={color + (task.status === 'DONE' ? '80' : 'ff')} />
                      </svg>
                    ) : (
                      <div className="absolute top-1.5 h-5 rounded-full cursor-pointer hover:opacity-80 transition-opacity flex items-center px-2"
                        style={{ left: Math.max(0, barLeft), width: barWidth, backgroundColor: color + (task.status === 'DONE' ? '60' : 'cc') }}
                        onClick={() => onTaskClick(task.id)}>
                        <span className="text-[9px] text-white font-medium truncate">{task.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD VIEW
   ═══════════════════════════════════════════════════════════ */
function ChartBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center space-x-3">
      <span className="text-xs text-[var(--asana-text-secondary)] w-24 text-right truncate">{label}</span>
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-500 flex items-center px-2" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}>
          {pct > 15 && <span className="text-[10px] text-white font-bold">{value}</span>}
        </div>
        {pct <= 15 && value > 0 && <span className="absolute left-[calc(var(--w)+8px)] top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--asana-text-primary)]" style={{ '--w': `${pct}%`, left: `calc(${pct}% + 8px)` }}>{value}</span>}
      </div>
    </div>
  );
}

export function DashboardView({ lists, members }) {
  const tasks = getAllTasks(lists);
  const total = tasks.length;

  // By status
  const byStatus = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    label, value: tasks.filter(t => t.status === key).length, color: STATUS_COLORS[key],
  }));

  // By priority
  const byPriority = [
    { label: 'High', value: tasks.filter(t => t.priority === 'HIGH').length, color: PRIORITY_COLORS.HIGH },
    { label: 'Medium', value: tasks.filter(t => t.priority === 'MEDIUM').length, color: PRIORITY_COLORS.MEDIUM },
    { label: 'Low', value: tasks.filter(t => t.priority === 'LOW').length, color: PRIORITY_COLORS.LOW },
  ];

  // By assignee
  const assigneeMap = {};
  tasks.forEach(t => {
    if (t.assignees?.length > 0) {
      t.assignees.forEach(a => {
        const name = a.user?.name || 'Unknown';
        assigneeMap[name] = (assigneeMap[name] || 0) + 1;
      });
    } else {
      assigneeMap['Unassigned'] = (assigneeMap['Unassigned'] || 0) + 1;
    }
  });
  const byAssignee = Object.entries(assigneeMap).map(([name, count], i) => ({
    label: name, value: count, color: BAR_COLORS[i % BAR_COLORS.length],
  })).sort((a, b) => b.value - a.value);

  // By section
  const bySection = (lists || []).map((l, i) => ({
    label: l.name, value: l.tasks?.length || 0, color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  // Completion over sections (donut-like display)
  const done = tasks.filter(t => t.status === 'DONE').length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-5xl pb-8">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total tasks', value: total, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { label: 'Completed', value: `${pctDone}%`, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Overdue', value: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Unassigned', value: tasks.filter(t => !t.assignees?.length).length, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-5 flex items-center space-x-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--asana-text-primary)]">{value}</p>
              <p className="text-[10px] text-[var(--asana-text-secondary)] uppercase font-semibold tracking-wider">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* By Status */}
        <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-5">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Tasks by status</h3>
          <div className="space-y-3">
            {byStatus.map(d => <ChartBar key={d.label} {...d} max={total} />)}
          </div>
        </div>

        {/* By Priority */}
        <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-5">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Tasks by priority</h3>
          <div className="space-y-3">
            {byPriority.map(d => <ChartBar key={d.label} {...d} max={total} />)}
          </div>
        </div>

        {/* By Assignee */}
        <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-5">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Tasks by assignee</h3>
          <div className="space-y-3">
            {byAssignee.map(d => <ChartBar key={d.label} {...d} max={total} />)}
          </div>
        </div>

        {/* By Section */}
        <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] p-5">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-4">Tasks by section</h3>
          <div className="space-y-3">
            {bySection.map(d => <ChartBar key={d.label} {...d} max={total} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GANTT VIEW
   ═══════════════════════════════════════════════════════════ */
export function GanttView({ lists, onTaskClick }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Date range: 2 months
  const startDate = addDays(today, -14);
  const endDate = addDays(today, 60);
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const dayWidth = 28;

  const getLeft = (date) => {
    const days = Math.ceil((new Date(date) - startDate) / (1000 * 60 * 60 * 24));
    return days * dayWidth;
  };

  // Month headers
  const months = [];
  let m = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (m <= endDate) {
    months.push({ date: new Date(m), left: getLeft(m) });
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }

  return (
    <div className="h-full overflow-auto bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)]">
      <div style={{ minWidth: totalDays * dayWidth + 220 }}>
        {/* Month headers */}
        <div className="flex border-b border-[var(--asana-border)] sticky top-0 bg-[var(--asana-surface)] z-10 h-8">
          <div className="w-[220px] flex-shrink-0 border-r border-[var(--asana-border)]" />
          <div className="relative flex-1" style={{ width: totalDays * dayWidth }}>
            {months.map((mo, i) => (
              <span key={i} className="absolute text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase top-2"
                style={{ left: mo.left }}>
                {mo.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        {(lists || []).map((list, li) => (
          <div key={list.id}>
            <div className="flex border-b border-[var(--asana-border)] bg-gray-50/50 dark:bg-gray-800/20">
              <div className="w-[220px] flex-shrink-0 px-3 py-1.5 border-r border-[var(--asana-border)]">
                <span className="text-xs font-bold text-[var(--asana-text-primary)]">{list.name}</span>
              </div>
              <div style={{ width: totalDays * dayWidth }} />
            </div>
            {(list.tasks || []).map((task, ti) => {
              const color = BAR_COLORS[(li + ti) % BAR_COLORS.length];
              const isMilestone = task.taskType === 'MILESTONE';
              const due = task.dueDate ? new Date(task.dueDate) : null;
              const taskStart = isMilestone ? (due || today) : (task.createdAt ? new Date(new Date(task.createdAt).setHours(0,0,0,0)) : (due ? addDays(due, -1) : today));
              const taskEnd = due || addDays(today, 2);
              const left = getLeft(taskStart);
              const width = isMilestone ? 0 : Math.max(getLeft(taskEnd) - left, dayWidth * 2);

              return (
                <div key={task.id} className="flex border-b border-[var(--asana-border)]/40 hover:bg-gray-50/50 dark:hover:bg-gray-800/10">
                  <div className="w-[220px] flex-shrink-0 px-3 py-2 flex items-center space-x-2 border-r border-[var(--asana-border)] cursor-pointer"
                    onClick={() => onTaskClick(task.id)}>
                    {isMilestone ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" className="flex-shrink-0">
                        <rect x="6" y="0" width="7" height="7" rx="1" transform="rotate(45 6 0)"
                          className={task.status === 'DONE' ? 'fill-green-500' : 'fill-transparent stroke-gray-400'} strokeWidth="1.5" />
                      </svg>
                    ) : (
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${task.status === 'DONE' ? 'bg-green-500' : 'border-2 border-gray-300 dark:border-gray-600'}`} />
                    )}
                    <span className={`text-[11px] truncate ${isMilestone ? 'font-bold' : ''} ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>{task.title}</span>
                    {due && <span className="text-[9px] text-[var(--asana-text-secondary)] ml-auto flex-shrink-0">{formatDate(due)}</span>}
                  </div>
                  <div className="relative flex items-center" style={{ width: totalDays * dayWidth, height: 32 }}>
                    <div className="absolute top-0 bottom-0 w-px bg-red-400/30" style={{ left: getLeft(today) }} />
                    {isMilestone ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" className="absolute cursor-pointer hover:scale-125 transition-transform"
                        style={{ left: left - 7, top: 9 }} onClick={() => onTaskClick(task.id)}>
                        <rect x="7" y="0.5" width="8" height="8" rx="1" transform="rotate(45 7 0.5)"
                          fill={color + (task.status === 'DONE' ? '80' : 'ff')} />
                      </svg>
                    ) : (
                      <div className="absolute h-4 rounded cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ left: Math.max(0, left), width, backgroundColor: color + (task.status === 'DONE' ? '50' : 'bb'), top: 8 }}
                        onClick={() => onTaskClick(task.id)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WORKLOAD VIEW
   ═══════════════════════════════════════════════════════════ */
export function WorkloadView({ lists, members }) {
  const tasks = getAllTasks(lists);

  // Build per-member data
  const memberData = useMemo(() => {
    const data = {};

    // Initialize all members
    (members || []).forEach(m => {
      const name = m.user?.name || 'Unknown';
      data[name] = { name, email: m.user?.email, total: 0, done: 0, inProgress: 0, overdue: 0, estimatedMins: 0, actualMins: 0, tasks: [] };
    });
    data['Unassigned'] = { name: 'Unassigned', email: '', total: 0, done: 0, inProgress: 0, overdue: 0, estimatedMins: 0, actualMins: 0, tasks: [] };

    tasks.forEach(t => {
      const assignees = t.assignees?.length > 0 ? t.assignees.map(a => a.user?.name || 'Unknown') : ['Unassigned'];
      assignees.forEach(name => {
        if (!data[name]) data[name] = { name, email: '', total: 0, done: 0, inProgress: 0, overdue: 0, estimatedMins: 0, actualMins: 0, tasks: [] };
        data[name].total++;
        data[name].tasks.push(t);
        if (t.status === 'DONE') data[name].done++;
        if (t.status === 'IN_PROGRESS') data[name].inProgress++;
        if (t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE') data[name].overdue++;
        if (t.estimatedTime) data[name].estimatedMins += t.estimatedTime;
        if (t.actualTime) data[name].actualMins += t.actualTime;
      });
    });

    return Object.values(data).filter(d => d.name !== 'Unassigned' || d.total > 0).sort((a, b) => b.total - a.total);
  }, [tasks, members]);

  const maxTasks = Math.max(...memberData.map(d => d.total), 1);

  const fmtTime = (mins) => {
    if (!mins) return '0h';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="space-y-4 max-w-5xl pb-8">
      <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] overflow-x-auto">
        {/* Header */}
        <div className="grid grid-cols-[200px_1fr_80px_80px_80px_100px] border-b border-[var(--asana-border)] bg-gray-50/50 dark:bg-gray-800/30 px-4 py-2">
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase">Member</span>
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase">Workload</span>
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase text-center">Tasks</span>
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase text-center">Done</span>
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase text-center">Overdue</span>
          <span className="text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase text-center">Est. time</span>
        </div>

        {memberData.map((d, i) => {
          const pct = maxTasks > 0 ? (d.total / maxTasks) * 100 : 0;
          const isOverloaded = d.total > 10;
          return (
            <div key={d.name} className="grid grid-cols-[200px_1fr_80px_80px_80px_100px] items-center border-b border-[var(--asana-border)] px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
              <div className="flex items-center space-x-2.5">
                {d.name !== 'Unassigned' ? (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}>
                    {d.name.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <span className="text-[10px] text-[var(--asana-text-secondary)]">?</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--asana-text-primary)] truncate">{d.name}</p>
                  {d.email && <p className="text-[9px] text-[var(--asana-text-secondary)] truncate">{d.email}</p>}
                </div>
              </div>
              <div className="px-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 overflow-hidden relative">
                  <div className="h-full rounded-full transition-all duration-500 flex items-center"
                    style={{ width: `${pct}%`, backgroundColor: isOverloaded ? '#ef4444' : d.overdue > 0 ? '#eab308' : '#22c55e' }}>
                  </div>
                  {d.inProgress > 0 && (
                    <div className="absolute top-0 h-full rounded-full opacity-30"
                      style={{ width: `${(d.inProgress / maxTasks) * 100}%`, backgroundColor: '#3b82f6' }} />
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-[var(--asana-text-primary)] text-center">{d.total}</p>
              <p className="text-xs font-bold text-green-500 text-center">{d.done}</p>
              <p className={`text-xs font-bold text-center ${d.overdue > 0 ? 'text-red-500' : 'text-[var(--asana-text-secondary)]'}`}>{d.overdue}</p>
              <p className="text-xs text-[var(--asana-text-secondary)] text-center">{fmtTime(d.estimatedMins)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
