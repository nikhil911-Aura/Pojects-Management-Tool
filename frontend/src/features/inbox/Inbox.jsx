function Inbox() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--asana-text-primary)]">Inbox</h1>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-1">Notifications and updates from your projects</p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center bg-[var(--asana-surface)] border border-asana-border rounded-asana-lg">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="font-semibold text-[var(--asana-text-primary)] text-lg">You're all caught up</p>
        <p className="text-sm text-[var(--asana-text-secondary)] mt-2 max-w-xs">
          Notifications about task assignments, comments, and project updates will appear here.
        </p>
      </div>
    </div>
  );
}

export default Inbox;
