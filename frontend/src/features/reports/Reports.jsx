import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchMyTimesheet,
  fetchTeamReport,
  fetchReportSummary,
  exportReport,
  emailReport,
  setDateFilter,
  setProjectFilter,
  setUserFilter,
  setGroupBy,
} from '../../store/slices/reportSlice';
import { useRole } from '../../hooks/useRole';

// ── Period options ──────────────────────────────────────────────────────────
const PERIODS = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: 'week',       label: 'This Week' },
  { value: 'last_week',  label: 'Last Week' },
  { value: 'month',      label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom',     label: 'Custom Range' },
];

const GROUP_BY_OPTIONS = [
  { value: 'person_project', label: 'Person + Project' },
  { value: 'project',        label: 'Project' },
  { value: 'person',         label: 'Person' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtHrs = (mins) => {
  if (!mins) return '0h 00m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const STATUS_BADGE = {
  TODO:        'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  REVIEW:      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  DONE:        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};
const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Completed' };

// ────────────────────────────────────────────────────────────────────────────
function Reports() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { projects } = useAppSelector((state) => state.project);
  const {
    timesheetData,
    teamData,
    summary,
    filters,
    loadingTimesheet,
    loadingTeam,
    loadingSummary,
    exportLoading,
    emailLoading,
  } = useAppSelector((state) => state.report);
  const { isWorkspaceAdmin } = useRole();

  const [activeTab, setActiveTab] = useState('timesheet'); // 'timesheet' | 'team'
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(filters.period === 'custom');

  const workspaceId = currentWorkspace?.id;
  const canViewTeam = isWorkspaceAdmin;

  // ── Fetch data when tab or filters change ────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    if (activeTab === 'timesheet') {
      dispatch(fetchMyTimesheet({ workspaceId, filters }));
    } else if (canViewTeam) {
      dispatch(fetchTeamReport({ workspaceId, filters }));
    }
    dispatch(fetchReportSummary({ workspaceId, filters }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, activeTab, filters.period, filters.startDate, filters.endDate, filters.projectIds, filters.userIds, filters.groupBy]);

  // ── Filter handlers ──────────────────────────────────────────────────────
  const handlePeriodChange = (period) => {
    if (period === 'custom') {
      setShowCustomRange(true);
      dispatch(setDateFilter({ period: null, startDate: filters.startDate, endDate: filters.endDate }));
    } else {
      setShowCustomRange(false);
      dispatch(setDateFilter({ period }));
    }
  };

  const handleCustomRange = (startDate, endDate) => {
    dispatch(setDateFilter({ period: null, startDate, endDate }));
  };

  // ── Export & email ───────────────────────────────────────────────────────
  const handleExport = (format = 'xlsx') => {
    dispatch(exportReport({
      workspaceId,
      filters,
      scope: activeTab === 'team' ? 'team' : undefined,
      format,
    }));
  };

  // ── Title ────────────────────────────────────────────────────────────────
  const title = activeTab === 'timesheet' ? 'My Work Report' : 'Team Work Report';

  return (
    <div className="flex flex-col h-full bg-[var(--asana-bg)]">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-[var(--asana-border)] bg-[var(--asana-surface)]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-[var(--asana-text-primary)]">{title}</h1>
            <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">
              Showing time logged on completed tasks
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <ExportMenu loading={exportLoading} onExport={handleExport} />
            <button
              onClick={() => setShowEmailModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-asana-blue hover:bg-blue-600 text-white text-xs font-medium transition-colors shadow-sm"
              title="Email this report"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Email Report</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center space-x-1 mb-5">
          <TabButton active={activeTab === 'timesheet'} onClick={() => setActiveTab('timesheet')}>
            My Timesheet
          </TabButton>
          {canViewTeam && (
            <TabButton active={activeTab === 'team'} onClick={() => setActiveTab('team')}>
              Team Reports
            </TabButton>
          )}
        </div>

        {/* Filters row */}
        <div className="flex items-end flex-wrap gap-3">
          <FilterField label="Date Range">
            <select
              value={showCustomRange ? 'custom' : filters.period || 'week'}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--asana-border)] rounded-md text-xs font-medium bg-[var(--asana-surface)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30 focus:border-asana-blue/30 cursor-pointer min-w-[140px]"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value} className="bg-[var(--asana-surface)] text-[var(--asana-text-primary)]">{p.label}</option>
              ))}
            </select>
          </FilterField>

          {showCustomRange && (
            <>
              <FilterField label="From">
                <input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => handleCustomRange(e.target.value, filters.endDate)}
                  className="px-2.5 py-1.5 border border-[var(--asana-border)] rounded-md text-xs font-medium bg-[var(--asana-surface)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30"
                />
              </FilterField>
              <FilterField label="To">
                <input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => handleCustomRange(filters.startDate, e.target.value)}
                  className="px-2.5 py-1.5 border border-[var(--asana-border)] rounded-md text-xs font-medium bg-[var(--asana-surface)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30"
                />
              </FilterField>
            </>
          )}

          {activeTab === 'team' && canViewTeam && (
            <FilterField label="Group By">
              <select
                value={filters.groupBy}
                onChange={(e) => dispatch(setGroupBy(e.target.value))}
                className="px-2.5 py-1.5 border border-[var(--asana-border)] rounded-md text-xs font-medium bg-[var(--asana-surface)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30 cursor-pointer min-w-[160px]"
              >
                {GROUP_BY_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value} className="bg-[var(--asana-surface)] text-[var(--asana-text-primary)]">{g.label}</option>
                ))}
              </select>
            </FilterField>
          )}

          <FilterField label="Projects">
            <MultiSelectDropdown
              label="All Projects"
              options={(projects || []).map((p) => ({ value: p.id, label: p.name, color: p.color }))}
              selected={filters.projectIds}
              onChange={(ids) => dispatch(setProjectFilter(ids))}
            />
          </FilterField>

          {activeTab === 'team' && canViewTeam && (
            <FilterField label="Members">
              <MultiSelectDropdown
                label="All Members"
                options={(currentWorkspace?.members || []).map((m) => ({
                  value: m.userId || m.user?.id,
                  label: m.user?.name || m.email || 'Unknown',
                }))}
                selected={filters.userIds}
                onChange={(ids) => dispatch(setUserFilter(ids))}
              />
            </FilterField>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
          {/* Summary cards */}
          <SummaryCards summary={summary} loading={loadingSummary} canViewTeam={canViewTeam && activeTab === 'team'} />

          {/* Report content */}
          {activeTab === 'timesheet' ? (
            <ReportSections
              data={timesheetData}
              loading={loadingTimesheet}
              onTaskClick={(taskId) => navigate(`/task/${taskId}`)}
              groupBy="my"
            />
          ) : canViewTeam ? (
            <ReportSections
              data={teamData}
              loading={loadingTeam}
              onTaskClick={(taskId) => navigate(`/task/${taskId}`)}
              groupBy={filters.groupBy}
            />
          ) : (
            <EmptyState
              icon="lock"
              title="No access"
              message="You don't have permission to view team reports."
            />
          )}
        </div>
      </div>

      {showEmailModal && (
        <EmailReportModal
          workspaceMembers={currentWorkspace?.members || []}
          loading={emailLoading}
          onClose={() => setShowEmailModal(false)}
          onSend={async ({ recipients, message }) => {
            const result = await dispatch(emailReport({ workspaceId, filters, recipients, message }));
            if (!result.error) setShowEmailModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Export menu (Excel / CSV) ───────────────────────────────────────────────
function ExportMenu({ loading, onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-medium transition-colors disabled:opacity-50"
        title="Download report"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>{loading ? 'Exporting…' : 'Download'}</span>
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl py-1 z-50 animate-fade-in">
          <button
            onClick={() => { onExport('xlsx'); setOpen(false); }}
            className="w-full flex items-center space-x-2.5 text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <span className="w-6 h-6 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-[10px] font-bold text-green-700 dark:text-green-400">
              XLS
            </span>
            <div>
              <p className="font-medium text-[var(--asana-text-primary)]">Excel (.xlsx)</p>
              <p className="text-[10px] text-[var(--asana-text-secondary)]">Styled report</p>
            </div>
          </button>
          <button
            onClick={() => { onExport('csv'); setOpen(false); }}
            className="w-full flex items-center space-x-2.5 text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <span className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-[10px] font-bold text-gray-700 dark:text-gray-300">
              CSV
            </span>
            <div>
              <p className="font-medium text-[var(--asana-text-primary)]">CSV (.csv)</p>
              <p className="text-[10px] text-[var(--asana-text-secondary)]">Plain text</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab button ──────────────────────────────────────────────────────────────
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
        active
          ? 'bg-asana-blue/10 text-asana-blue'
          : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

// ── Filter field wrapper ────────────────────────────────────────────────────
function FilterField({ label, children }) {
  return (
    <div className="flex flex-col">
      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Multi-select dropdown ───────────────────────────────────────────────────
function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  const buttonText = selected.length === 0
    ? label
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label || label
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-2 px-2.5 py-1.5 border border-[var(--asana-border)] rounded-md text-xs font-medium bg-[var(--asana-surface)] text-[var(--asana-text-primary)] hover:border-asana-blue/40 transition-colors min-w-[160px]"
      >
        <span className="truncate">{buttonText}</span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-60 max-h-72 overflow-auto bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg shadow-xl py-1">
          {selected.length > 0 && (
            <button
              onClick={() => { onChange([]); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-asana-blue hover:bg-gray-50 dark:hover:bg-gray-800/50 font-semibold"
            >
              Clear selection
            </button>
          )}
          {options.length === 0 && (
            <p className="text-xs text-[var(--asana-text-secondary)] px-3 py-2">No options</p>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="w-full flex items-center space-x-2 text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <input
                type="checkbox"
                readOnly
                checked={selected.includes(opt.value)}
                className="w-3.5 h-3.5 rounded border-[var(--asana-border)] text-asana-blue cursor-pointer"
              />
              {opt.color && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: opt.color }} />}
              <span className="text-[var(--asana-text-primary)] truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary cards ───────────────────────────────────────────────────────────
function SummaryCards({ summary, loading, canViewTeam }) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }
  if (!summary) return null;

  const cards = [
    {
      label: 'Total Hours',
      value: `${(summary.totalHours || 0).toFixed(2)}h`,
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40',
      text: 'text-asana-blue',
    },
    {
      label: 'Entries Logged',
      value: summary.totalEntries || 0,
      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40',
      text: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Completion Rate',
      value: `${summary.completionRate?.rate || 0}%`,
      sub: `${summary.completionRate?.completed || 0}/${summary.completionRate?.total || 0}`,
      bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/40',
      text: 'text-purple-600 dark:text-purple-400',
    },
  ];

  if (canViewTeam) {
    cards.push({
      label: 'Top Contributor',
      value: summary.topContributor?.userName || '—',
      sub: summary.topContributor ? `${summary.topContributor.totalHours}h` : '',
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40',
      text: 'text-amber-700 dark:text-amber-400',
    });
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`p-4 rounded-lg border ${c.bg}`}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">
            {c.label}
          </div>
          <div className={`text-xl font-bold mt-1 truncate ${c.text}`}>{c.value}</div>
          {c.sub && <div className="text-[11px] text-[var(--asana-text-secondary)] mt-0.5">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Report sections (collapsible groups with task table) ────────────────────
function ReportSections({ data, loading, onTaskClick, groupBy }) {
  const [expanded, setExpanded] = useState({});
  const [copied, setCopied] = useState(null);

  if (loading && !data) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const groups = data?.groups || [];

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="No completed tasks in this period"
        message="Try changing the date range or project filters."
      />
    );
  }

  // Auto-expand first group
  const isExpanded = (key) => (expanded[key] !== undefined ? expanded[key] : groups[0]?.key === key || groups[0]?.project?.id === key);
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !isExpanded(key) }));

  const copyToClipboard = (group) => {
    const lines = [];
    const title = group.user && group.project
      ? `${group.user.name} — ${group.project.name}`
      : group.user?.name || group.project?.name || 'Group';
    lines.push(`## ${title}  (${fmtHrs(group.totalMinutes)})`);
    (group.tasks || []).forEach((t) => {
      lines.push(`• ${t.title}  —  ${fmtHrs(t.totalMinutes)}`);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(group.key || group.project?.id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupKey = group.key || group.project?.id || group.user?.id;
        const open = isExpanded(groupKey);
        const headerTitle = renderGroupTitle(group);

        return (
          <div
            key={groupKey}
            className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl overflow-hidden shadow-sm"
          >
            {/* Group header */}
            <button
              onClick={() => toggle(groupKey)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <svg
                  className={`w-3.5 h-3.5 transition-transform flex-shrink-0 text-[var(--asana-text-secondary)] ${open ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                {headerTitle}
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                <span className="text-[11px] font-semibold text-asana-blue bg-asana-blue/10 px-2.5 py-1 rounded-full">
                  Total: {fmtHrs(group.totalMinutes)}
                </span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(group); }}
                  className="p-1.5 rounded-md text-[var(--asana-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[var(--asana-text-primary)] transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === groupKey ? (
                    <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </span>
              </div>
            </button>

            {/* Tasks table */}
            {open && (
              <div className="border-t border-[var(--asana-border)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                      <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Task</th>
                      <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Section</th>
                      <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Status</th>
                      <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Due Date</th>
                      <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Entries</th>
                      <th className="text-right font-semibold text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] px-4 py-2.5">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.tasks || []).map((task) => (
                      <tr
                        key={task.id}
                        onClick={() => onTaskClick(task.id)}
                        className="border-t border-[var(--asana-border)] hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center space-x-2">
                            {task.projectColor && (
                              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: task.projectColor }} />
                            )}
                            <span className="text-[var(--asana-text-primary)] font-medium truncate">{task.title}</span>
                          </div>
                          {task.projectName && groupBy === 'person' && (
                            <span className="text-[10px] text-[var(--asana-text-secondary)] ml-4">{task.projectName}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--asana-text-secondary)]">{task.section || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[task.status] || STATUS_BADGE.TODO}`}>
                            {STATUS_LABEL[task.status] || task.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--asana-text-secondary)]">
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--asana-text-secondary)]">{task.entries?.length || 0}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[var(--asana-text-primary)]">
                          {fmtHrs(task.totalMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Grand total */}
      {data?.grandTotalMinutes != null && (
        <div className="flex items-center justify-end px-4 py-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-[var(--asana-border)]">
          <span className="text-xs font-semibold text-[var(--asana-text-secondary)] mr-3">Grand Total:</span>
          <span className="text-sm font-bold text-asana-blue">{fmtHrs(data.grandTotalMinutes)}</span>
        </div>
      )}
    </div>
  );
}

// ── Group title rendering ───────────────────────────────────────────────────
function renderGroupTitle(group) {
  if (group.user && group.project) {
    return (
      <div className="flex items-center space-x-2 min-w-0">
        <Avatar name={group.user.name} />
        <span className="text-sm font-semibold text-[var(--asana-text-primary)] truncate">{group.user.name}</span>
        <span className="text-[var(--asana-text-secondary)]">·</span>
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: group.project.color || '#4573D2' }} />
        <span className="text-sm font-medium text-[var(--asana-text-primary)] truncate">{group.project.name}</span>
      </div>
    );
  }
  if (group.user) {
    return (
      <div className="flex items-center space-x-2 min-w-0">
        <Avatar name={group.user.name} />
        <span className="text-sm font-semibold text-[var(--asana-text-primary)] truncate">{group.user.name}</span>
        {(group.taskCount != null) && (
          <span className="text-[10px] text-[var(--asana-text-secondary)] ml-1">
            {group.taskCount} task{group.taskCount === 1 ? '' : 's'} · {group.projectCount || 0} project{group.projectCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    );
  }
  if (group.project) {
    return (
      <div className="flex items-center space-x-2 min-w-0">
        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: group.project.color || '#4573D2' }} />
        <span className="text-sm font-semibold text-[var(--asana-text-primary)] truncate">{group.project.name}</span>
        {(group.taskCount != null) && (
          <span className="text-[10px] text-[var(--asana-text-secondary)] ml-1">
            {group.taskCount} task{group.taskCount === 1 ? '' : 's'} · {group.memberCount || 0} member{group.memberCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    );
  }
  return null;
}

// ── Avatar circle ───────────────────────────────────────────────────────────
function Avatar({ name }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const hue = (name || '').charCodeAt(0) * 15;
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: `hsl(${hue}, 60%, 50%)` }}
    >
      {initial}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
        {icon === 'clock' && (
          <svg className="w-7 h-7 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {icon === 'lock' && (
          <svg className="w-7 h-7 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold text-[var(--asana-text-primary)]">{title}</p>
      <p className="text-xs text-[var(--asana-text-secondary)] mt-1">{message}</p>
    </div>
  );
}

// ── Email modal ─────────────────────────────────────────────────────────────
// Two recipient sources:
//   1. Workspace members (with select-all toggle)
//   2. Custom emails (free-form input, validated)
function EmailReportModal({ workspaceMembers, onClose, onSend, loading }) {
  const [selectedMembers, setSelectedMembers] = useState([]); // emails of workspace members
  const [customEmails, setCustomEmails] = useState([]);       // free-form emails
  const [emailInput, setEmailInput] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Build deduped member options (skip self if you want)
  const memberOptions = useMemo(() => {
    return workspaceMembers
      .map((m) => ({
        id: m.userId || m.user?.id,
        name: m.user?.name,
        email: m.user?.email,
      }))
      .filter((m) => m.email);
  }, [workspaceMembers]);

  const filtered = memberOptions.filter(
    (m) =>
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
  );

  const allFilteredEmails = filtered.map((m) => m.email);
  const allSelected = filtered.length > 0 && allFilteredEmails.every((e) => selectedMembers.includes(e));
  const someSelected = !allSelected && allFilteredEmails.some((e) => selectedMembers.includes(e));

  const toggleMember = (email) => {
    setSelectedMembers((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedMembers((prev) => prev.filter((e) => !allFilteredEmails.includes(e)));
    } else {
      setSelectedMembers((prev) => Array.from(new Set([...prev, ...allFilteredEmails])));
    }
  };

  const addCustomEmail = (raw) => {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError(`Invalid email: ${value}`);
      return;
    }
    if (customEmails.includes(value) || selectedMembers.includes(value)) {
      setError('Already added');
      return;
    }
    setCustomEmails((prev) => [...prev, value]);
    setEmailInput('');
    setError('');
  };

  const removeCustomEmail = (email) => {
    setCustomEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCustomEmail(emailInput);
    } else if (e.key === 'Backspace' && !emailInput && customEmails.length) {
      removeCustomEmail(customEmails[customEmails.length - 1]);
    }
  };

  const allRecipients = useMemo(
    () => Array.from(new Set([...selectedMembers, ...customEmails])),
    [selectedMembers, customEmails]
  );

  const handleSend = () => {
    setError('');
    if (allRecipients.length === 0) {
      setError('Add at least one recipient');
      return;
    }
    if (allRecipients.length > 20) {
      setError('Too many recipients (max 20 per send)');
      return;
    }
    onSend({ recipients: allRecipients, message: message.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
      <div className="bg-[var(--asana-surface)] rounded-2xl shadow-2xl w-full max-w-2xl border border-[var(--asana-border)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Gradient header */}
        <div className="px-6 py-5 bg-gradient-to-br from-asana-blue to-indigo-600 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Email Report</div>
              <h3 className="text-lg font-bold mt-0.5">Send Work Report</h3>
              <p className="text-[12px] opacity-90 mt-1">
                Pick workspace members or add custom email addresses · Max 20 recipients
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/20 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── Custom email input (chips style) ── */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-1.5">
              Recipients
            </label>
            <div className="border border-[var(--asana-border)] rounded-lg p-2 bg-[var(--asana-bg)] focus-within:ring-2 focus-within:ring-asana-blue/20 focus-within:border-asana-blue/40 transition-all">
              <div className="flex flex-wrap gap-1.5 items-center">
                {/* Selected member chips */}
                {selectedMembers.map((email) => {
                  const m = memberOptions.find((x) => x.email === email);
                  return (
                    <span key={email} className="inline-flex items-center gap-1 bg-asana-blue/10 text-asana-blue text-xs font-medium px-2 py-1 rounded-md">
                      <span>{m?.name || email}</span>
                      <button onClick={() => toggleMember(email)} className="hover:bg-asana-blue/20 rounded p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
                {/* Custom email chips */}
                {customEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium px-2 py-1 rounded-md">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    <span>{email}</span>
                    <button onClick={() => removeCustomEmail(email)} className="hover:bg-purple-200 dark:hover:bg-purple-800/40 rounded p-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setError(''); }}
                  onKeyDown={handleEmailKeyDown}
                  onBlur={() => emailInput && addCustomEmail(emailInput)}
                  placeholder={allRecipients.length ? 'Add more...' : 'Type an email and press Enter'}
                  className="flex-1 min-w-[180px] bg-transparent text-xs text-[var(--asana-text-primary)] placeholder-[var(--asana-text-muted)] outline-none border-none py-1 px-1"
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-[var(--asana-text-secondary)]">
                Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[9px]">Enter</kbd> or comma to add
              </p>
              <p className="text-[10px] text-[var(--asana-text-secondary)]">
                <span className={`font-bold ${allRecipients.length > 20 ? 'text-red-500' : 'text-asana-blue'}`}>{allRecipients.length}</span> / 20
              </p>
            </div>
          </div>

          {/* ── Workspace members list ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">
                Workspace Members ({memberOptions.length})
              </label>
              <button
                onClick={toggleSelectAll}
                className="text-[11px] font-semibold text-asana-blue hover:underline"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="relative mb-2">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search members…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-[var(--asana-border)] rounded-md text-xs bg-[var(--asana-bg)] text-[var(--asana-text-primary)] focus:outline-none focus:ring-1 focus:ring-asana-blue/30 focus:border-asana-blue/30"
              />
            </div>

            <div className="border border-[var(--asana-border)] rounded-lg max-h-56 overflow-y-auto divide-y divide-[var(--asana-border)]">
              {filtered.length === 0 && (
                <p className="text-xs text-[var(--asana-text-secondary)] text-center py-6">No members found</p>
              )}
              {filtered.map((m) => {
                const checked = selectedMembers.includes(m.email);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(m.email)}
                      className="w-3.5 h-3.5 rounded text-asana-blue cursor-pointer"
                    />
                    <Avatar name={m.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--asana-text-primary)] truncate">{m.name}</p>
                      <p className="text-[10px] text-[var(--asana-text-secondary)] truncate">{m.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Personal message ── */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-1.5">
              Message <span className="font-normal normal-case text-[10px]">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              placeholder="Add a personal note that will appear at the top of the email..."
              rows={3}
              className="w-full px-3 py-2 border border-[var(--asana-border)] rounded-lg text-xs bg-[var(--asana-bg)] text-[var(--asana-text-primary)] placeholder-[var(--asana-text-muted)] focus:outline-none focus:ring-2 focus:ring-asana-blue/20 focus:border-asana-blue/40 resize-none"
            />
            <p className="text-[10px] text-[var(--asana-text-secondary)] mt-1 text-right">{message.length} / 1000</p>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs rounded-md">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 dark:bg-gray-800/30 border-t border-[var(--asana-border)] flex items-center justify-between">
          <p className="text-[11px] text-[var(--asana-text-secondary)]">
            {allRecipients.length > 0 && (
              <>
                Sending to <span className="font-bold text-[var(--asana-text-primary)]">{allRecipients.length}</span> recipient{allRecipients.length === 1 ? '' : 's'}
              </>
            )}
          </p>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-[var(--asana-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={allRecipients.length === 0 || loading || allRecipients.length > 20}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-asana-blue text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>Send Report</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;
