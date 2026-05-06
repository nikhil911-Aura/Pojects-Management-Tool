import { useEffect, useRef } from 'react';

/**
 * A beautiful confirmation modal replacing all native window.confirm() dialogs.
 *
 * Props:
 *   isOpen       — boolean
 *   title        — heading text (e.g. "Delete task?")
 *   message      — body text (e.g. "This action cannot be undone.")
 *   confirmText  — button label (default "Confirm")
 *   cancelText   — button label (default "Cancel")
 *   variant      — 'danger' | 'warning' | 'info' (controls icon + button color)
 *   onConfirm()  — called when the user confirms
 *   onCancel()   — called when the user cancels or clicks outside
 */
export default function ConfirmModal({
  isOpen,
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  // Auto-focus the confirm button on open (so Enter key confirms)
  useEffect(() => {
    if (isOpen) setTimeout(() => confirmRef.current?.focus(), 50);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const iconMap = {
    danger: (
      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>
    ),
    warning: (
      <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    ),
    info: (
      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
  };

  const btnColorMap = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    info: 'bg-karya-blue hover:brightness-110 focus:ring-karya-blue',
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onCancel}>
      <div
        className="bg-[var(--karya-surface)] rounded-xl shadow-2xl border border-[var(--karya-border)] w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-6 text-center">
          {iconMap[variant]}
          <h3 className="text-base font-bold text-[var(--karya-text-primary)] mb-1.5">{title}</h3>
          {message && <p className="text-sm text-[var(--karya-text-secondary)] leading-relaxed">{message}</p>}
        </div>
        <div className="flex items-center border-t border-[var(--karya-border)] divide-x divide-[var(--karya-border)]">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-sm font-medium text-[var(--karya-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${btnColorMap[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
