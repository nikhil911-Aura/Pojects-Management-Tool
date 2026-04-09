import { useState, useCallback } from 'react';

/**
 * Hook that replaces window.confirm() with a beautiful modal.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *
 *   // In an event handler:
 *   const ok = await confirm({
 *     title: 'Delete task?',
 *     message: 'This cannot be undone.',
 *     confirmText: 'Delete',
 *     variant: 'danger',
 *   });
 *   if (!ok) return;
 *   // ... proceed with deletion
 *
 *   // In JSX (must render once):
 *   return <>{ConfirmDialog}</>
 */
export function useConfirm() {
  const [state, setState] = useState(null); // { resolve, title, message, ... }

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  // Lazy-import to avoid circular deps — ConfirmModal is a simple component
  // that doesn't import anything from the hook's consumers.
  const ConfirmDialog = state ? (
    <ConfirmModalInline
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, ConfirmDialog };
}

// Inline version to avoid import issues — identical to ConfirmModal.jsx
function ConfirmModalInline({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
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
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-amber-600 hover:bg-amber-700',
    info: 'bg-asana-blue hover:brightness-110',
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onCancel}>
      <div className="bg-[var(--asana-surface)] rounded-xl shadow-2xl border border-[var(--asana-border)] w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-6 text-center">
          {iconMap[variant]}
          <h3 className="text-base font-bold text-[var(--asana-text-primary)] mb-1.5">{title}</h3>
          {message && <p className="text-sm text-[var(--asana-text-secondary)] leading-relaxed">{message}</p>}
        </div>
        <div className="flex items-center border-t border-[var(--asana-border)] divide-x divide-[var(--asana-border)]">
          <button onClick={onCancel}
            className="flex-1 px-4 py-3 text-sm font-medium text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded-bl-xl">
            {cancelText}
          </button>
          <button onClick={onConfirm} autoFocus
            className={`flex-1 px-4 py-3 text-sm font-semibold text-white transition-colors rounded-br-xl ${btnColorMap[variant]}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default useConfirm;
