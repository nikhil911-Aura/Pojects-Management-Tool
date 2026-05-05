import { useTheme } from '../../context/ThemeContext';
import { useAppSelector } from '../../store/hooks';

function SettingsRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-karya-border last:border-0">
      <div className="mr-8">
        <p className="text-sm font-medium text-[var(--karya-text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--karya-text-secondary)] mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-karya-blue/30 ${
        checked ? 'bg-karya-blue' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--karya-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--karya-text-secondary)] mt-1">Manage your preferences</p>
      </div>

      {/* Appearance */}
      <div className="bg-[var(--karya-surface)] border border-karya-border rounded-karya-lg px-6 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] pt-5 pb-2">Appearance</h2>
        <SettingsRow
          label="Dark mode"
          description="Switch between light and dark themes"
        >
          <Toggle checked={theme === 'dark'} onChange={toggleTheme} />
        </SettingsRow>
      </div>

      {/* Workspace */}
      <div className="bg-[var(--karya-surface)] border border-karya-border rounded-karya-lg px-6 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] pt-5 pb-2">Workspace</h2>
        <SettingsRow label="Current workspace" description="Active workspace for your session">
          <span className="text-sm font-medium text-[var(--karya-text-primary)] bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
            {currentWorkspace?.name || '—'}
          </span>
        </SettingsRow>
        <SettingsRow label="Notifications" description="Email notifications for task updates">
          <Toggle checked={true} onChange={() => {}} />
        </SettingsRow>
      </div>

      {/* Account */}
      <div className="bg-[var(--karya-surface)] border border-karya-border rounded-karya-lg px-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] pt-5 pb-2">Account</h2>
        <SettingsRow label="Language" description="Interface language">
          <span className="text-sm text-[var(--karya-text-secondary)]">English</span>
        </SettingsRow>
        <SettingsRow label="Timezone" description="Used for due dates and reminders">
          <span className="text-sm text-[var(--karya-text-secondary)]">
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
        </SettingsRow>
      </div>
    </div>
  );
}

export default Settings;
