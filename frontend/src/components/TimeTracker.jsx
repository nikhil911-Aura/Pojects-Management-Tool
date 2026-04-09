import { useState, useEffect, useRef } from 'react';
import { useAppDispatch } from '../store/hooks';
import { optimisticUpdateTask } from '../store/slices/boardSlice';
import api from '../services/api';

function formatMins(m) {
  if (!m || m <= 0) return '0h 00m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

// Parse "1h 30m" / "1h" / "90m" / "90" into minutes. Returns 0 on no match.
function parseTimeString(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return 0;
  const hm = s.match(/^(\d+)\s*h\s*(\d+)\s*m?$/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  const ho = s.match(/^(\d+)\s*h$/);
  if (ho) return parseInt(ho[1], 10) * 60;
  const mo = s.match(/^(\d+)\s*m$/);
  if (mo) return parseInt(mo[1], 10);
  const num = parseInt(s, 10);
  if (!isNaN(num)) return num;
  return 0;
}

// Build Asana-style suggestions from the typed input. If the user typed a
// bare number N, offer "N min", "N hours", "N hours 15 min", etc. If they're
// already typing "Nh ...", refine the minute portion. Returns an array of
// { label, mins } — empty if nothing meaningful to suggest.
function buildTimeSuggestions(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return [];
  // Pure number → offer minute / hour interpretations + the four 15-min steps.
  const num = s.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n <= 0) return [];
    const out = [
      { label: `${n} min`, mins: n },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'}`, mins: n * 60 },
    ];
    [15, 30, 45].forEach((m) => {
      out.push({ label: `${n} ${n === 1 ? 'hour' : 'hours'} ${m} min`, mins: n * 60 + m });
    });
    return out;
  }
  // "Nh" → suggest the +15 increments.
  const hOnly = s.match(/^(\d+)\s*h$/);
  if (hOnly) {
    const n = parseInt(hOnly[1], 10);
    return [
      { label: `${n} ${n === 1 ? 'hour' : 'hours'}`, mins: n * 60 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 15 min`, mins: n * 60 + 15 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 30 min`, mins: n * 60 + 30 },
      { label: `${n} ${n === 1 ? 'hour' : 'hours'} 45 min`, mins: n * 60 + 45 },
    ];
  }
  // "Nh M" partial → just confirm the full parse.
  const partial = parseTimeString(s);
  if (partial > 0) {
    return [{ label: formatMins(partial), mins: partial }];
  }
  return [];
}

/**
 * TimeTracker — Asana-style time tracking cell
 * Shows total time, expandable popup with entries, timer, and add time.
 */
export default function TimeTracker({ taskId, initialTotal = 0, timerStartedAt = null, canEdit, emitInstant }) {
  const isTempId = taskId?.startsWith?.('temp-');
  const dispatch = useAppDispatch();
  const [total, setTotal] = useState(initialTotal);
  const [entries, setEntries] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [timerStart, setTimerStart] = useState(timerStartedAt ? new Date(timerStartedAt) : null);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [addingTime, setAddingTime] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editInput, setEditInput] = useState('');
  const popupRef = useRef(null);
  const btnRef = useRef(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const timerIntervalRef = useRef(null);

  // Sync initial props
  useEffect(() => { setTotal(initialTotal); }, [initialTotal]);

  // Update both local state and Redux (so SUM row updates)
  const updateTotal = (newTotal) => {
    setTotal(newTotal);
    dispatch(optimisticUpdateTask({ taskId, data: { actualTime: newTotal } }));
  };
  useEffect(() => { setTimerStart(timerStartedAt ? new Date(timerStartedAt) : null); }, [timerStartedAt]);

  // Live timer tick
  useEffect(() => {
    if (timerStart) {
      const tick = () => setElapsed(Math.floor((Date.now() - new Date(timerStart).getTime()) / 1000));
      tick();
      timerIntervalRef.current = setInterval(tick, 1000);
      return () => clearInterval(timerIntervalRef.current);
    } else {
      setElapsed(0);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, [timerStart]);

  // Close popup on outside click
  useEffect(() => {
    if (!showPopup) return;
    const handler = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setShowPopup(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopup]);

  // Fetch entries when popup opens
  const fetchEntries = async () => {
    if (isTempId) { setEntries([]); return; }
    try {
      const res = await api.get(`/api/v1/time-tracking/task/${taskId}/entries`);
      setEntries(res.data.data);
    } catch (e) { setEntries([]); }
  };

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const popupHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < popupHeight;
      setPopupPos({
        top: openAbove ? null : rect.bottom + 4,
        bottom: openAbove ? (window.innerHeight - rect.top + 4) : null,
        left: Math.min(rect.left, window.innerWidth - 300),
      });
    }
    setShowPopup(true);
    fetchEntries();
  };

  // Start timer
  const handleStartTimer = async () => {
    const now = new Date();
    setTimerStart(now);
    emitInstant?.('timer_started', { taskId, startedAt: now.toISOString() });
    if (!isTempId) { try { await api.post(`/api/v1/time-tracking/task/${taskId}/timer/start`); } catch (e) { console.error(e); } }
  };

  // Stop timer
  const handleStopTimer = async () => {
    const elapsedMins = Math.max(1, Math.round(elapsed / 60));
    const newTotal = total + elapsedMins;
    setTimerStart(null);
    updateTotal(newTotal);
    emitInstant?.('timer_stopped', { taskId, totalMinutes: newTotal });
    if (!isTempId) { try {
      await api.post(`/api/v1/time-tracking/task/${taskId}/timer/stop`);
      fetchEntries();
    } catch (e) { console.error(e); } }
  };

  // Add manual time
  const handleAddTime = async () => {
    const str = addInput.trim().toLowerCase();
    let mins = 0;
    const hm = str.match(/^(\d+)\s*h\s*(\d+)\s*m?$/);
    const ho = str.match(/^(\d+)\s*h$/);
    const mo = str.match(/^(\d+)\s*m$/);
    if (hm) mins = parseInt(hm[1]) * 60 + parseInt(hm[2]);
    else if (ho) mins = parseInt(ho[1]) * 60;
    else if (mo) mins = parseInt(mo[1]);
    else if (!isNaN(parseInt(str))) mins = parseInt(str);
    if (mins <= 0) return;

    const newTotal = total + mins;
    updateTotal(newTotal);
    setAddInput('');
    setAddingTime(false);
    emitInstant?.('time_entry_added', { taskId, totalMinutes: newTotal });
    if (!isTempId) { try {
      await api.post(`/api/v1/time-tracking/task/${taskId}/entries`, { minutes: mins });
      fetchEntries();
    } catch (e) { console.error(e); } }
  };

  // Quick-add: log a fixed number of minutes from a preset chip.
  // Same code path as handleAddTime but skips the input parsing and auto-close.
  const handleQuickAdd = async (mins) => {
    if (!mins || mins <= 0) return;
    const newTotal = total + mins;
    updateTotal(newTotal);
    emitInstant?.('time_entry_added', { taskId, totalMinutes: newTotal });
    if (!isTempId) {
      try {
        await api.post(`/api/v1/time-tracking/task/${taskId}/entries`, { minutes: mins });
        fetchEntries();
      } catch (e) { console.error(e); }
    }
  };

  // Delete entry
  const handleDeleteEntry = async (entryId, entryMins) => {
    setEntries(prev => (prev || []).filter(e => e.id !== entryId));
    const newTotal = Math.max(0, total - entryMins);
    updateTotal(newTotal);
    emitInstant?.('time_entry_deleted', { taskId, entryId, totalMinutes: newTotal });
    try { await api.delete(`/api/v1/time-tracking/entries/${entryId}`); } catch (e) { console.error(e); }
  };

  // Update entry
  const handleUpdateEntry = async (entryId, oldMins) => {
    const str = editInput.trim().toLowerCase();
    let mins = 0;
    const hm = str.match(/^(\d+)\s*h\s*(\d+)\s*m?$/);
    const ho = str.match(/^(\d+)\s*h$/);
    const mo = str.match(/^(\d+)\s*m$/);
    if (hm) mins = parseInt(hm[1]) * 60 + parseInt(hm[2]);
    else if (ho) mins = parseInt(ho[1]) * 60;
    else if (mo) mins = parseInt(mo[1]);
    else if (!isNaN(parseInt(str))) mins = parseInt(str);
    if (mins <= 0) { setEditingId(null); return; }

    updateTotal(total - oldMins + mins);
    setEntries(prev => (prev || []).map(e => e.id === entryId ? { ...e, minutes: mins } : e));
    setEditingId(null);
    try { await api.put(`/api/v1/time-tracking/entries/${entryId}`, { minutes: mins }); } catch (e) { console.error(e); }
  };

  const timerDisplay = timerStart ? (() => {
    const s = elapsed % 60;
    const m = Math.floor(elapsed / 60) % 60;
    const h = Math.floor(elapsed / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })() : null;

  const timerMins = timerStart ? Math.floor(elapsed / 60) : 0;
  const displayTotal = total + timerMins;

  // Timer cell display: show HH:MM:SS when running, else total
  const cellText = timerStart ? (() => {
    const s = elapsed % 60;
    const m = Math.floor(elapsed / 60) % 60;
    const h = Math.floor(elapsed / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })() : (total > 0 ? formatMins(total) : null);

  return (
    <div className="relative">
      {/* Cell display */}
      <button ref={btnRef} onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        className={`text-xs flex items-center w-full ${cellText || timerStart ? 'text-[var(--asana-text-primary)]' : 'text-[var(--asana-text-secondary)] opacity-0 group-hover:opacity-100'}`}>
        {timerStart && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5 flex-shrink-0" />
        )}
        {cellText ? (
          <span className={timerStart ? 'font-mono text-red-500 font-semibold' : ''}>{cellText}</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </button>

      {/* Popup */}
      {showPopup && (
        <div ref={popupRef} className="fixed z-[200] w-72 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl animate-fade-in"
          style={{ top: popupPos.top ?? 'auto', bottom: popupPos.bottom ?? 'auto', left: popupPos.left }}
          onClick={(e) => e.stopPropagation()}>

          {/* Entries list */}
          <div className="max-h-48 overflow-y-auto">
            {(entries || []).map(entry => (
              <div key={entry.id} className="flex items-center px-4 py-2.5 border-b border-[var(--asana-border)] hover:bg-gray-50 dark:hover:bg-gray-800/30 group/entry">
                {editingId === entry.id ? (
                  <input type="text" value={editInput} onChange={(e) => setEditInput(e.target.value)} autoFocus
                    className="text-sm font-semibold bg-transparent border-b border-asana-blue outline-none text-[var(--asana-text-primary)] w-20"
                    onBlur={() => handleUpdateEntry(entry.id, entry.minutes)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateEntry(entry.id, entry.minutes); if (e.key === 'Escape') setEditingId(null); }} />
                ) : (
                  <span className="text-sm font-semibold text-[var(--asana-text-primary)] flex-1">{formatMins(entry.minutes)}</span>
                )}
                <div className="flex items-center space-x-2 ml-auto">
                  {canEdit && editingId !== entry.id && (
                    <div className="flex items-center space-x-1 opacity-0 group-hover/entry:opacity-100">
                      <button onClick={() => { setEditingId(entry.id); setEditInput(formatMins(entry.minutes)); }}
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--asana-text-secondary)]">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDeleteEntry(entry.id, entry.minutes)}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--asana-text-secondary)] hover:text-red-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-[var(--asana-text-secondary)]">
                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                    style={{ backgroundColor: `hsl(${(entry.user?.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                    {entry.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                </div>
              </div>
            ))}
            {entries?.length === 0 && !timerStart && (
              <p className="text-xs text-[var(--asana-text-secondary)] text-center py-4">No time logged yet</p>
            )}
          </div>

          {/* Timer display */}
          {timerStart && (
            <div className="px-4 py-2.5 border-b border-[var(--asana-border)] bg-red-50/50 dark:bg-red-900/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-mono font-bold text-red-600 dark:text-red-400">{timerDisplay}</span>
                </div>
                <button onClick={handleStopTimer}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30">
                  Stop
                </button>
              </div>
            </div>
          )}

          {/* Total + actions */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[var(--asana-text-primary)]">
                {formatMins(total)}{timerStart && <span className="text-red-500 ml-1">+ {formatMins(timerMins)}</span>}
                <span className="text-[10px] font-normal text-[var(--asana-text-secondary)] uppercase ml-1.5">Total</span>
              </span>
            </div>

            {canEdit && (
              <div className="flex items-center space-x-2">
                {!timerStart ? (
                  <button onClick={handleStartTimer}
                    className="flex items-center text-xs px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start timer
                  </button>
                ) : (
                  <button onClick={handleStopTimer}
                    className="flex items-center text-xs px-3 py-1.5 rounded-md bg-red-500 text-white font-medium hover:bg-red-600">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop timer
                  </button>
                )}

                {addingTime ? (
                  <div className="relative flex items-center space-x-1">
                    <input type="text" value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="1h 30m" autoFocus
                      className="w-24 text-xs px-2 py-1.5 bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-md outline-none text-[var(--asana-text-primary)] focus:ring-1 focus:ring-asana-blue"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTime(); if (e.key === 'Escape') { setAddingTime(false); setAddInput(''); } }} />
                    <button onClick={handleAddTime} className="text-xs text-asana-blue font-semibold">Add</button>
                    {/* Suggestion dropdown — Asana-style. Appears as the user
                        types and clicking a row instantly logs that duration. */}
                    {(() => {
                      const suggestions = buildTimeSuggestions(addInput);
                      if (suggestions.length === 0) return null;
                      return (
                        <div className="absolute bottom-full left-0 mb-1 z-[100] w-44 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-md shadow-lg py-1 animate-fade-in">
                          {suggestions.map((sug) => (
                            <button
                              key={sug.label}
                              onMouseDown={(e) => {
                                // Use mousedown so the click fires before the input loses focus
                                e.preventDefault();
                                handleQuickAdd(sug.mins);
                                setAddInput('');
                                setAddingTime(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-[var(--asana-text-primary)] hover:bg-asana-blue hover:text-white transition-colors"
                            >
                              {sug.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <button onClick={() => setAddingTime(true)}
                    className="flex items-center text-xs px-3 py-1.5 rounded-md border border-[var(--asana-border)] text-[var(--asana-text-primary)] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add time
                  </button>
                )}
              </div>
            )}

            {/* Quick-add time chips — one click logs a common duration.
                Mirrors the suggestion row Asana shows in its time tracking popup. */}
            {canEdit && !addingTime && (
              <div className="mt-3 pt-3 border-t border-[var(--asana-border)]">
                <p className="text-[10px] uppercase tracking-wider text-[var(--asana-text-secondary)] font-semibold mb-1.5">
                  Quick add
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '15m', mins: 15 },
                    { label: '30m', mins: 30 },
                    { label: '45m', mins: 45 },
                    { label: '1h',  mins: 60 },
                    { label: '1h 30m', mins: 90 },
                    { label: '2h',  mins: 120 },
                    { label: '4h',  mins: 240 },
                    { label: '8h',  mins: 480 },
                  ].map((preset) => (
                    <button
                      key={preset.mins}
                      onClick={() => handleQuickAdd(preset.mins)}
                      className="px-2 py-1 text-[11px] rounded-md bg-gray-100 dark:bg-gray-800 text-[var(--asana-text-primary)] hover:bg-asana-blue hover:text-white transition-colors font-medium"
                    >
                      +{preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
