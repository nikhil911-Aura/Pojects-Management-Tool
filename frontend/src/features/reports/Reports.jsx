import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  setGroupBy 
} from '../../store/slices/reportSlice';
import { useRole } from '../../hooks/useRole';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' }
];

const GROUP_BY_OPTIONS = [
  { value: 'person_project', label: 'Person + Project' },
  { value: 'project', label: 'Project' },
  { value: 'person', label: 'Person' }
];

function Reports() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { currentWorkspace } = useAppSelector(state => state.workspace);
  const { projects } = useAppSelector(state => state.project);
  const { timesheetData, teamData, summary, filters, loading, exportLoading, emailLoading } = useAppSelector(state => state.report);
  const { isWorkspaceAdmin, isOwner } = useRole();

  const [activeTab, setActiveTab] = useState('timesheet');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);

  const canViewTeam = isWorkspaceAdmin || isOwner;
  const effectiveWorkspaceId = workspaceId || currentWorkspace?.id;

  useEffect(() => {
    if (!effectiveWorkspaceId) return;
    if (activeTab === 'timesheet') {
      dispatch(fetchMyTimesheet({ workspaceId: effectiveWorkspaceId, filters }));
    } else if (activeTab === 'team' && canViewTeam) {
      dispatch(fetchTeamReport({ workspaceId: effectiveWorkspaceId, filters }));
      dispatch(fetchReportSummary({ workspaceId: effectiveWorkspaceId, filters }));
    }
  }, [effectiveWorkspaceId, activeTab, filters.period, filters.startDate, filters.endDate, filters.projectIds, filters.userIds, filters.groupBy, canViewTeam]);

  const handlePeriodChange = (period) => {
    dispatch(setDateFilter({ period }));
  };

  const handleProjectFilter = (projectIds) => {
    dispatch(setProjectFilter(projectIds));
  };

  const handleUserFilter = (userIds) => {
    dispatch(setUserFilter(userIds));
  };

  const handleGroupByChange = (groupBy) => {
    dispatch(setGroupBy(groupBy));
  };

  const handleExport = () => {
    if (!effectiveWorkspaceId) return;
    dispatch(exportReport({ workspaceId: effectiveWorkspaceId, filters }));
  };

  const handleEmailReport = () => {
    if (!effectiveWorkspaceId || !selectedRecipients.length) return;
    dispatch(emailReport({ 
      workspaceId: effectiveWorkspaceId, 
      filters, 
      recipients: selectedRecipients 
    })).then(() => {
      setShowEmailModal(false);
      setSelectedRecipients([]);
    });
  };

  const timesheetSummary = useMemo(() => {
    if (!timesheetData?.grouped) return { totalHours: 0, byDate: {} };
    
    let totalMinutes = 0;
    const byDate = {};

    Object.entries(timesheetData.grouped).forEach(([date, projects]) => {
      let dayMinutes = 0;
      Object.values(projects).forEach(({ tasks }) => {
        Object.values(tasks).forEach(({ entries }) => {
          entries.forEach(e => {
            dayMinutes += e.minutes;
            totalMinutes += e.minutes;
          });
        });
      });
      byDate[date] = dayMinutes;
    });

    return { totalHours: (totalMinutes / 60).toFixed(2), byDate };
  }, [timesheetData]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-asana-border">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-[var(--asana-text-primary)]">Reports</h1>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('timesheet')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'timesheet' 
                  ? 'bg-white dark:bg-gray-700 text-[var(--asana-text-primary)] shadow-sm' 
                  : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
              }`}
            >
              My Timesheet
            </button>
            {canViewTeam && (
              <button
                onClick={() => setActiveTab('team')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'team' 
                    ? 'bg-white dark:bg-gray-700 text-[var(--asana-text-primary)] shadow-sm' 
                    : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
                }`}
              >
                Team Reports
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={filters.period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="px-3 py-1.5 border border-asana-border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-[var(--asana-text-primary)] focus:outline-none focus:ring-2 focus:ring-asana-blue"
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          <select
            value={filters.projectIds[0] || ''}
            onChange={(e) => handleProjectFilter(e.target.value ? [e.target.value] : [])}
            className="px-3 py-1.5 border border-asana-border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-[var(--asana-text-primary)] focus:outline-none focus:ring-2 focus:ring-asana-blue"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md text-sm font-medium transition-colors disabled:opacity-50 text-[var(--asana-text-primary)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-asana-blue hover:bg-opacity-90 text-white rounded-md text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Email Report</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'timesheet' ? (
          <MyTimesheetView 
            data={timesheetData} 
            summary={timesheetSummary}
            loading={loading}
            onTaskClick={(taskId) => navigate(`/task/${taskId}`)}
          />
        ) : canViewTeam ? (
          <TeamReportsView 
            data={teamData}
            summary={summary}
            filters={filters}
            loading={loading}
            onGroupByChange={handleGroupByChange}
            onUserFilterChange={handleUserFilter}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--asana-text-secondary)]">
            You don't have permission to view team reports.
          </div>
        )}
      </div>

      {showEmailModal && (
        <EmailModal 
          recipients={selectedRecipients}
          onRecipientsChange={setSelectedRecipients}
          onSend={handleEmailReport}
          onClose={() => setShowEmailModal(false)}
          loading={emailLoading}
        />
      )}
    </div>
  );
}

function MyTimesheetView({ data, summary, loading, onTaskClick }) {
  const [expandedDates, setExpandedDates] = useState({});

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  if (loading && !data) {
    return <div className="animate-pulse space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>;
  }

  if (!data?.grouped || Object.keys(data.grouped).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-medium text-[var(--asana-text-primary)]">No time entries found for this period.</p>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Start tracking time on tasks to see your timesheet here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
        <div>
          <span className="text-sm text-[var(--asana-text-secondary)]">Total Hours This Period</span>
          <p className="text-2xl font-bold text-asana-blue">{summary.totalHours}h</p>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(data.grouped)
          .sort(([a], [b]) => new Date(b) - new Date(a))
          .map(([date, projects]) => (
            <div key={date} className="border border-asana-border dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleDate(date)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <svg 
                    className={`w-4 h-4 transition-transform ${expandedDates[date] ? 'rotate-90' : ''} text-[var(--asana-text-secondary)]`} 
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-[var(--asana-text-primary)]">
                    {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <span className="text-sm text-[var(--asana-text-secondary)]">
                  {((summary.byDate[date] || 0) / 60).toFixed(2)}h
                </span>
              </button>

              {expandedDates[date] && (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {Object.values(projects).map(({ project, tasks }) => (
                    <div key={project.id} className="p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: project.color || '#4573D2' }} />
                        <span className="font-medium text-[var(--asana-text-primary)]">{project.name}</span>
                      </div>
                      <div className="space-y-2 pl-5">
                        {Object.values(tasks).map(({ task, entries }) => (
                          <div 
                            key={task.id}
                            onClick={() => onTaskClick(task.id)}
                            className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <span className="text-[var(--asana-text-primary)]">{task.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                task.status === 'DONE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                task.status === 'IN_PROGRESS' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                task.status === 'REVIEW' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                              }`}>
                                {task.status}
                              </span>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-[var(--asana-text-secondary)]">
                              <span>{entries.reduce((sum, e) => sum + e.minutes, 0)} min</span>
                              <span>{entries.length} entries</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function TeamReportsView({ data, summary, filters, loading, onGroupByChange, onUserFilterChange }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading && !data.length) {
    return <div className="animate-pulse space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>;
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="font-medium text-[var(--asana-text-primary)]">No team data found for this period.</p>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Team members need to log time to see reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
          <span className="text-sm text-[var(--asana-text-secondary)]">Total Hours</span>
          <p className="text-2xl font-bold text-asana-blue">{summary?.totalHours?.toFixed(2) || 0}h</p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
          <span className="text-sm text-[var(--asana-text-secondary)]">Top Contributor</span>
          <p className="text-lg font-semibold text-[var(--asana-text-primary)]">{summary?.topContributor?.userName || '-'}</p>
          <span className="text-sm text-[var(--asana-text-secondary)]">{summary?.topContributor?.totalHours || 0}h</span>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
          <span className="text-sm text-[var(--asana-text-secondary)]">Most Active Project</span>
          <p className="text-lg font-semibold text-[var(--asana-text-primary)]">{summary?.mostActiveProject?.projectName || '-'}</p>
          <span className="text-sm text-[var(--asana-text-secondary)]">{summary?.mostActiveProject?.totalHours || 0}h</span>
        </div>
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
          <span className="text-sm text-[var(--asana-text-secondary)]">Completion Rate</span>
          <p className="text-2xl font-bold text-[var(--asana-text-primary)]">{summary?.completionRate?.rate || 0}%</p>
        </div>
      </div>

      <div className="flex items-center space-x-4 mb-4">
        <label className="text-sm font-medium text-[var(--asana-text-primary)]">Group by:</label>
        <select
          value={filters.groupBy}
          onChange={(e) => onGroupByChange(e.target.value)}
          className="px-3 py-1.5 border border-asana-border dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-[var(--asana-text-primary)] focus:outline-none focus:ring-2 focus:ring-asana-blue"
        >
          {GROUP_BY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {data.map((item, idx) => {
          const key = item.user?.id ? `${item.user.id}_${item.project?.id}` : item.projectId || item.userId;
          const title = filters.groupBy === 'project' 
            ? item.project?.name 
            : filters.groupBy === 'person' 
              ? item.user?.name 
              : `${item.user?.name} - ${item.project?.name}`;
          
          return (
            <div key={key || idx} className="border border-asana-border dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <svg 
                    className={`w-4 h-4 transition-transform ${expandedGroups[key] ? 'rotate-90' : ''} text-[var(--asana-text-secondary)]`} 
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-[var(--asana-text-primary)]">{title}</span>
                </div>
                <span className="text-sm text-[var(--asana-text-secondary)]">{item.totalHours}h</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailModal({ recipients, onRecipientsChange, onSend, onClose, loading }) {
  const [customEmail, setCustomEmail] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleAddEmail = () => {
    if (customEmail && customEmail.includes('@')) {
      onRecipientsChange([...recipients, customEmail]);
      setCustomEmail('');
      setShowCustomInput(false);
    }
  };

  const handleRemoveEmail = (email) => {
    onRecipientsChange(recipients.filter(r => r !== email));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-96 p-6 border border-asana-border dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-4 text-[var(--asana-text-primary)]">Email Report</h3>
        
        <div className="space-y-3 mb-4">
          {recipients.map(email => (
            <div key={email} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <span className="text-sm text-[var(--asana-text-primary)]">{email}</span>
              <button onClick={() => handleRemoveEmail(email)} className="text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {!showCustomInput ? (
          <button
            onClick={() => setShowCustomInput(true)}
            className="w-full py-2 text-sm text-asana-blue border border-dashed border-asana-blue rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            + Add custom email
          </button>
        ) : (
          <div className="flex space-x-2">
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 border border-asana-border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-[var(--asana-text-primary)]"
            />
            <button onClick={handleAddEmail} className="px-3 py-2 bg-asana-blue text-white rounded text-sm">
              Add
            </button>
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]">
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={recipients.length === 0 || loading}
            className="px-4 py-2 bg-asana-blue text-white rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Reports;