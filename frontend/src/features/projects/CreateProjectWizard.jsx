import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createProject } from '../../store/slices/projectSlice';
import { useRole } from '../../hooks/useRole';

const PROJECT_COLORS = [
  '#4573D2', '#FC636B', '#37A169', '#D69E2E', '#6A67CE',
  '#3BE8B0', '#F97316', '#EC4899', '#0EA5E9', '#8B5CF6',
];

const DEFAULT_VIEWS = [
  { key: 'overview', label: 'Overview', desc: 'Align on project info and resources', required: false, default: true },
  { key: 'list', label: 'List', desc: 'Organize tasks in a powerful table', required: true, default: true },
  { key: 'board', label: 'Board', desc: 'Track work in a Kanban view', required: false, default: true },
  { key: 'timeline', label: 'Timeline', desc: 'Schedule work over time', required: false, default: true },
  { key: 'dashboard', label: 'Dashboard', desc: 'Monitor project metrics and insights', required: false, default: true },
  { key: 'gantt', label: 'Gantt', desc: 'Track dependencies and baselines', required: false, default: false },
  { key: 'workload', label: 'Workload', desc: 'See how busy your team is based on tasks and subtasks', required: false, default: false },
];

const PRIVACY_OPTIONS = [
  {
    value: 'PUBLIC',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    label: 'Organization',
    desc: 'Everyone in your organization can find and access this project.',
  },
  {
    value: 'SHARED',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    label: 'Shared with team',
    desc: 'Only this team and invited members can find and access this project.',
  },
  {
    value: 'PRIVATE',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    label: 'Private to members',
    desc: 'Only invited members can find and access this project.',
  },
];

function CreateProjectWizard({ isOpen, onClose }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { isGuest } = useRole();

  const [step, setStep] = useState(1); // 1 = details, 2 = views
  const [creating, setCreating] = useState(false);
  const [showPrivacyDropdown, setShowPrivacyDropdown] = useState(false);

  // Guests can only create Private projects
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[0],
    visibility: isGuest ? 'PRIVATE' : 'SHARED',
  });

  const [selectedViews, setSelectedViews] = useState(() => {
    const initial = {};
    DEFAULT_VIEWS.forEach((v) => {
      initial[v.key] = v.required || v.default;
    });
    return initial;
  });

  const toggleView = (key) => {
    const view = DEFAULT_VIEWS.find((v) => v.key === key);
    if (view?.required) return;
    setSelectedViews((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreate = async () => {
    if (!currentWorkspace?.id || !projectData.name.trim() || creating) return;
    setCreating(true);

    const backendVisibility = projectData.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
    const isPrivate = projectData.visibility === 'PRIVATE';

    try {
      const result = await dispatch(createProject({
        workspaceId: currentWorkspace.id,
        projectData: {
          name: projectData.name.trim(),
          description: projectData.description?.trim() || undefined,
          color: projectData.color,
          visibility: backendVisibility,
          views: Object.keys(selectedViews).filter((k) => selectedViews[k]),
        },
      })).unwrap();

      onClose();
      resetForm();
      const dest = `/project/${result.id}`;
      navigate(isPrivate ? `${dest}?share=1` : dest);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setProjectData({ name: '', description: '', color: PROJECT_COLORS[0], visibility: 'PUBLIC' });
    setSelectedViews(() => {
      const initial = {};
      DEFAULT_VIEWS.forEach((v) => {
        initial[v.key] = v.required || v.default;
      });
      return initial;
    });
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const currentPrivacy = PRIVACY_OPTIONS.find((p) => p.value === projectData.visibility);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      {step === 1 ? (
        /* ── STEP 1: Project details ── */
        <div className="bg-[var(--asana-surface)] rounded-2xl shadow-2xl w-full max-w-[880px] max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-fade-in mx-3 sm:mx-0">
          {/* Left panel — Form */}
          <div className="w-full md:w-[420px] flex-shrink-0 p-5 sm:p-8 flex flex-col overflow-y-auto">
            {/* Back arrow placeholder (for consistency with Asana) */}
            <button onClick={handleClose} className="self-start mb-6 p-1 -ml-1 text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <h1 className="text-2xl font-bold text-[var(--asana-text-primary)] mb-8">New project</h1>

            <div className="space-y-5 flex-1">
              {/* Project name */}
              <div>
                <label className="block text-xs font-medium text-[var(--asana-text-secondary)] mb-1.5">Project name</label>
                <input
                  type="text"
                  value={projectData.name}
                  onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                  placeholder=""
                  className="w-full px-3 py-2.5 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg text-sm text-[var(--asana-text-primary)] focus:outline-none focus:border-asana-blue focus:ring-1 focus:ring-asana-blue transition-colors"
                  autoFocus
                />
              </div>

              {/* Team + Privacy row */}
              <div className="flex space-x-3">
                {/* Select a team (static for now) */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[var(--asana-text-secondary)] mb-1.5">Select a team</label>
                  <div className="relative">
                    <div className="flex items-center px-3 py-2.5 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg text-sm text-[var(--asana-text-primary)] cursor-default">
                      <span className="truncate">{currentWorkspace?.name || 'Workspace'}</span>
                      <svg className="w-4 h-4 ml-auto text-[var(--asana-text-secondary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Privacy dropdown */}
                <div className="flex-1 relative">
                  <label className="block text-xs font-medium text-[var(--asana-text-secondary)] mb-1.5">Privacy</label>
                  <button
                    type="button"
                    onClick={() => !isGuest && setShowPrivacyDropdown(!showPrivacyDropdown)}
                    className={`w-full flex items-center px-3 py-2.5 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-lg text-sm text-[var(--asana-text-primary)] transition-colors ${
                      isGuest ? 'opacity-70 cursor-not-allowed' : 'hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className="text-[var(--asana-text-secondary)] mr-2">{currentPrivacy?.icon}</span>
                    <span className="truncate">{currentPrivacy?.label}</span>
                    {!isGuest && (
                      <svg className="w-4 h-4 ml-auto text-[var(--asana-text-secondary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  {isGuest && (
                    <p className="text-[10px] text-[var(--asana-text-secondary)] mt-1">Guests can only create private projects</p>
                  )}

                  {showPrivacyDropdown && !isGuest && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPrivacyDropdown(false)} />
                      <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-xl z-20 py-1 animate-fade-in">
                        {PRIVACY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setProjectData({ ...projectData, visibility: opt.value });
                              setShowPrivacyDropdown(false);
                            }}
                            className={`w-full flex items-start px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                              projectData.visibility === opt.value ? 'bg-asana-blue/5 dark:bg-asana-blue/10' : ''
                            }`}
                          >
                            <span className="text-[var(--asana-text-secondary)] mt-0.5 mr-3 flex-shrink-0">{opt.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center">
                                <span className="text-sm font-semibold text-[var(--asana-text-primary)]">{opt.label}</span>
                                {projectData.visibility === opt.value && (
                                  <svg className="w-4 h-4 text-asana-blue ml-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5 leading-snug">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-medium text-[var(--asana-text-secondary)] mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setProjectData({ ...projectData, color })}
                      className={`w-7 h-7 rounded-full transition-all ${projectData.color === color ? 'ring-2 ring-offset-2 ring-offset-[var(--asana-surface)] ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Continue button */}
            <button
              onClick={() => setStep(2)}
              disabled={!projectData.name.trim()}
              className="w-full mt-6 py-3 text-sm font-semibold asana-button-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            >
              Continue
            </button>
          </div>

          {/* Right panel — Preview */}
          <div className="flex-1 bg-gray-900/40 dark:bg-gray-900/60 p-6 hidden md:flex flex-col overflow-hidden border-l border-[var(--asana-border)]">
            <ProjectPreview name={projectData.name} color={projectData.color} />
          </div>
        </div>
      ) : (
        /* ── STEP 2: Choose views ── */
        <div className="bg-[var(--asana-surface)] rounded-2xl shadow-2xl w-full max-w-[880px] max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-fade-in mx-3 sm:mx-0">
          {/* Left panel — View selection */}
          <div className="w-full md:w-[420px] flex-shrink-0 p-5 sm:p-8 flex flex-col overflow-y-auto">
            <h2 className="text-xl font-bold text-[var(--asana-text-primary)] mb-1">Choose views for your project</h2>
            <p className="text-xs text-[var(--asana-text-secondary)] mb-6">Asana recommended</p>

            <div className="grid grid-cols-2 gap-3 flex-1">
              {DEFAULT_VIEWS.map((view) => {
                const isSelected = selectedViews[view.key];
                return (
                  <button
                    key={view.key}
                    type="button"
                    onClick={() => toggleView(view.key)}
                    className={`relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-asana-blue bg-asana-blue/5 dark:bg-asana-blue/10'
                        : 'border-[var(--asana-border)] hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <div className={`absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-asana-blue text-white' : 'border border-gray-300 dark:border-gray-600'
                    }`}>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    <span className={`text-sm font-bold ${isSelected ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-primary)]'}`}>
                      {view.label}
                      {view.required && <span className="text-[10px] font-normal text-[var(--asana-text-secondary)] ml-1">(required)</span>}
                    </span>
                    <span className="text-[11px] text-[var(--asana-text-secondary)] leading-snug mt-1">{view.desc}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-asana-blue cursor-pointer hover:underline mt-4 mb-5">Show more views</p>

            {/* Navigation buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 text-sm font-semibold border border-[var(--asana-border)] rounded-lg text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-3 text-sm font-semibold asana-button-primary disabled:opacity-50 rounded-lg"
              >
                {creating ? 'Creating...' : 'Create project'}
              </button>
            </div>
          </div>

          {/* Right panel — Preview */}
          <div className="flex-1 bg-gray-900/40 dark:bg-gray-900/60 p-6 hidden md:flex flex-col overflow-hidden border-l border-[var(--asana-border)]">
            <ProjectPreview name={projectData.name} color={projectData.color} views={selectedViews} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Live preview panel (right side) ── */
function ProjectPreview({ name, color, views }) {
  const viewKeys = views ? Object.keys(views).filter((k) => views[k]) : ['overview', 'list', 'board', 'timeline', 'dashboard'];
  const viewLabels = viewKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));

  return (
    <div className="bg-[var(--asana-surface)] rounded-xl shadow-lg overflow-hidden flex flex-col h-full border border-[var(--asana-border)]">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--asana-border)]">
        <div className="flex items-center space-x-3 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: color || '#4573D2' }}
          >
            {name ? name.charAt(0).toUpperCase() : 'P'}
          </div>
          <span className="font-bold text-sm text-[var(--asana-text-primary)]">{name || 'Project name'}</span>
        </div>
        {/* View tabs */}
        <div className="flex space-x-4">
          {viewLabels.map((label, i) => (
            <span
              key={label}
              className={`text-xs pb-2 ${
                i === (viewLabels.includes('List') ? viewLabels.indexOf('List') : 0)
                  ? 'text-[var(--asana-text-primary)] font-semibold border-b-2 border-asana-blue'
                  : 'text-[var(--asana-text-secondary)]'
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Skeleton list preview */}
      <div className="flex-1 px-5 py-3 space-y-0 overflow-hidden">
        {/* Section header skeleton */}
        <div className="mb-3">
          <div className="h-3 w-20 rounded bg-gray-300/30 dark:bg-gray-600/30 mb-3" />
        </div>

        {/* Skeleton rows */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center py-2.5 border-b border-[var(--asana-border)]/30">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300/40 dark:border-gray-600/40 mr-3 flex-shrink-0" />
            <div className="h-2.5 rounded bg-gray-300/30 dark:bg-gray-600/30 flex-1 max-w-[60%]" />
            <div className="ml-auto flex items-center space-x-4">
              <div className="w-6 h-6 rounded-full bg-gray-300/20 dark:bg-gray-600/20" />
              <div className="w-6 h-6 rounded bg-gray-300/20 dark:bg-gray-600/20" />
              <div className="h-4 w-14 rounded bg-red-400/20 dark:bg-red-400/15" />
              <div className="h-4 w-12 rounded bg-purple-400/20 dark:bg-purple-400/15" />
            </div>
          </div>
        ))}

        {/* Second section */}
        <div className="mt-4 mb-3">
          <div className="h-3 w-16 rounded bg-gray-300/30 dark:bg-gray-600/30 mb-3" />
        </div>

        {[...Array(4)].map((_, i) => (
          <div key={`s2-${i}`} className="flex items-center py-2.5 border-b border-[var(--asana-border)]/30">
            <div className={`w-4 h-4 rounded-full border-2 mr-3 flex-shrink-0 ${i < 2 ? 'border-green-500/50 bg-green-500/30' : 'border-gray-300/40 dark:border-gray-600/40'}`} />
            <div className="h-2.5 rounded bg-gray-300/30 dark:bg-gray-600/30 flex-1" style={{ maxWidth: `${40 + i * 8}%` }} />
            <div className="ml-auto flex items-center space-x-4">
              <div className="w-6 h-6 rounded-full bg-gray-300/20 dark:bg-gray-600/20" />
              <div className="w-6 h-6 rounded bg-gray-300/20 dark:bg-gray-600/20" />
              <div className="h-4 w-14 rounded bg-green-400/20 dark:bg-green-400/15" />
              {i % 2 === 0 && <div className="h-4 w-12 rounded bg-pink-400/20 dark:bg-pink-400/15" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CreateProjectWizard;
