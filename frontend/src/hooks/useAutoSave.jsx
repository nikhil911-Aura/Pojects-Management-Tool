import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useAutoSave — karya-style auto-saving hook
 * Saves to DB on every keystroke (debounced), flushes on unmount/navigation/page close.
 */
export function useAutoSave({
  initialValue = '',
  onSave,
  onOptimistic,
  onBroadcast,
  debounceMs = 400,
  entityId,
}) {
  const [value, setValue] = useState(initialValue);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Refs keep current values accessible in cleanup/timers without stale closures
  const valueRef = useRef(value);
  const lastSavedRef = useRef(initialValue);
  const timerRef = useRef(null);
  const savedTimerRef = useRef(null);
  const onSaveRef = useRef(onSave);
  const onOptimisticRef = useRef(onOptimistic);
  const onBroadcastRef = useRef(onBroadcast);

  // Always keep refs current
  useEffect(() => { onSaveRef.current = onSave; });
  useEffect(() => { onOptimisticRef.current = onOptimistic; });
  useEffect(() => { onBroadcastRef.current = onBroadcast; });

  // Reset when switching to a different entity
  useEffect(() => {
    setValue(initialValue);
    valueRef.current = initialValue;
    lastSavedRef.current = initialValue;
    setSaveStatus('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, [entityId]);

  // Flush pending save on unmount (navigation away)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const pending = valueRef.current;
      const lastSaved = lastSavedRef.current;
      if (pending && pending !== lastSaved && pending.trim()) {
        onSaveRef.current?.(pending)?.catch?.(() => {});
      }
    };
  }, [entityId]);

  // Flush on page close / hard refresh
  useEffect(() => {
    const handleUnload = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = valueRef.current;
      const lastSaved = lastSavedRef.current;
      if (pending && pending !== lastSaved && pending.trim()) {
        onSaveRef.current?.(pending)?.catch?.(() => {});
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [entityId]);

  const handleChange = useCallback((newValue) => {
    setValue(newValue);
    valueRef.current = newValue;

    // Instant optimistic update
    onOptimisticRef.current?.(newValue);

    // Instant broadcast to other users
    onBroadcastRef.current?.(newValue);

    // Debounced DB save
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

    timerRef.current = setTimeout(async () => {
      const val = valueRef.current;
      if (!val?.trim() || val === lastSavedRef.current) { setSaveStatus('idle'); return; }
      try {
        await onSaveRef.current?.(val);
        lastSavedRef.current = val;
        setSaveStatus('saved');
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('error');
      }
    }, debounceMs);
  }, [debounceMs]);

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    const val = valueRef.current;
    if (!val?.trim() || val === lastSavedRef.current) return;
    setSaveStatus('saving');
    try {
      await onSaveRef.current?.(val);
      lastSavedRef.current = val;
      setSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  }, []);

  return { value, setValue: handleChange, saveStatus, flush };
}

export function SaveIndicator({ status }) {
  if (status === 'idle') return null;
  return (
    <span className={`text-[10px] font-medium whitespace-nowrap transition-opacity duration-300 ${
      status === 'saving' ? 'text-[var(--karya-text-secondary)] animate-pulse' :
      status === 'saved' ? 'text-green-500' :
      status === 'error' ? 'text-red-500' : ''
    }`}>
      {status === 'saving' && 'Saving...'}
      {status === 'saved' && 'Saved'}
      {status === 'error' && 'Save failed'}
    </span>
  );
}
