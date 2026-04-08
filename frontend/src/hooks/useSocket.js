import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import { fetchLists, optimisticUpdateTask, optimisticRenameSection, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticDeleteTask, optimisticAssignUser, optimisticReplaceItem, optimisticMoveTaskAnywhere } from '../store/slices/boardSlice';
import { fetchTask } from '../store/slices/taskSlice';
import { fetchProject } from '../store/slices/projectSlice';
import { setApiSocketId } from '../services/api';

export const useSocket = (projectId, boardId) => {
  const dispatch = useAppDispatch();
  const socketRef = useRef(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [liveEdits, setLiveEdits] = useState({});
  const [customFieldEvent, setCustomFieldEvent] = useState(null);
  const customFieldCounterRef = useRef(0);
  const customFieldCallbackRef = useRef(null);
  const editLockRef = useRef(false);
  const editLockTimerRef = useRef(null);
  const timersRef = useRef([]); // track all timeouts for cleanup

  // Safe timeout — tracked for cleanup on unmount
  const safeTimeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  const addPendingItem = useCallback((item) => {
    setPendingItems(prev => [...prev, { ...item, id: `pending-${Date.now()}-${Math.random()}` }]);
    if (socketRef.current?.connected) {
      socketRef.current.emit('pending_item', { projectId, ...item });
    }
  }, [projectId]);

  const acquireEditLock = useCallback(() => {
    editLockRef.current = true;
    if (editLockTimerRef.current) clearTimeout(editLockTimerRef.current);
  }, []);

  const releaseEditLock = useCallback((delayMs = 5000) => {
    if (editLockTimerRef.current) clearTimeout(editLockTimerRef.current);
    editLockTimerRef.current = setTimeout(() => {
      editLockRef.current = false;
    }, delayMs);
  }, []);

  const emitLiveEdit = useCallback((data) => {
    acquireEditLock();
    if (socketRef.current?.connected) {
      socketRef.current.emit('live_edit', { projectId, ...data });
    }
  }, [projectId, acquireEditLock]);

  const emitInstant = useCallback((event, data) => {
    const connected = socketRef.current?.connected;
    console.log('[socket emit] instant_change', { event, projectId, connected, socketId: socketRef.current?.id });
    if (connected) {
      socketRef.current.emit('instant_change', { projectId, event, ...data });
    } else {
      console.warn('[socket emit] DROPPED — socket not connected', { event });
    }
  }, [projectId]);

  const clearPendingItems = useCallback(() => { setPendingItems([]); }, []);

  useEffect(() => {
    if (!projectId) return;

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      withCredentials: true, reconnection: true, reconnectionAttempts: 5,
      reconnectionDelay: 2000, timeout: 5000,
      transports: ['polling', 'websocket'], upgrade: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected', { socketId: socket.id, projectId, transport: socket.io.engine.transport.name });
      socket.emit('join_project', projectId);
      setApiSocketId(socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected', { reason });
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error', err?.message);
    });

    // ── Backend events — long-delay safety net only ──
    // instant_change already handles all real-time UI updates.
    // Backend events fire AFTER DB write — use them ONLY as a delayed consistency check
    // to catch anything instant_change might have missed (e.g., network glitch).
    // The delay must be long enough that instant_change has already applied.
    const safetyRefetch = (() => {
      let timer = null;
      return () => {
        if (editLockRef.current) return; // don't overwrite active edits
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (editLockRef.current) return;
          if (boardId) dispatch(fetchLists(boardId));
        }, 8000); // 8s — long enough that instant_change has settled
        timersRef.current.push(timer);
      };
    })();

    socket.on('task_created', () => { try { setPendingItems([]); } catch {} });
    socket.on('task_deleted', () => {});
    socket.on('task_updated', (data) => {
      // Apply field-level update from backend (sender excluded via x-socket-id)
      try {
        if (data?.id) {
          dispatch(optimisticUpdateTask({ taskId: data.id, data }));
        }
      } catch {}
    });
    // Backend emits this AFTER persisting the move. Apply it immediately as a
    // primary live-update path (the instant_change channel is also used, but
    // this is the authoritative server emission). safetyRefetch is still
    // scheduled as a long-delay consistency check.
    socket.on('task_moved', (data) => {
      try {
        console.log('[socket recv] backend task_moved ←', data);
        if (data?.taskId && data?.toList) {
          dispatch(optimisticMoveTaskAnywhere({
            taskId: data.taskId,
            destListId: data.toList,
            destParentId: data.parentId || null,
            destinationIndex: typeof data.position === 'number' ? data.position : 0,
          }));
        }
      } catch (err) { console.error('[socket recv] task_moved handler error', err); }
      safetyRefetch();
    });
    socket.on('section_created', () => {});
    socket.on('section_updated', () => {});
    socket.on('section_deleted', () => {});

    // Backend member events — these only fire for OTHER users (sender excluded)
    // They serve as fallback if instant_change was missed
    socket.on('member_added', () => { try { dispatch(fetchProject(projectId)); } catch {} });
    socket.on('member_removed', () => { try { dispatch(fetchProject(projectId)); } catch {} });
    socket.on('member_role_changed', () => { try { dispatch(fetchProject(projectId)); } catch {} });
    socket.on('project_settings_changed', () => { try { dispatch(fetchProject(projectId)); } catch {} });
    socket.on('project_deleted', () => { window.location.href = '/'; });

    // ── Instant changes from other users — primary real-time channel ──
    socket.on('instant_change', (data) => {
      try {
        if (!data?.event) return;
        const { event } = data;

        // Task CRUD
        if (event === 'task_added' && data.listId && data.task) {
          dispatch(optimisticAddTask({ listId: data.listId, task: data.task }));
        }
        if (event === 'subtask_added' && data.taskId && data.subtask) {
          dispatch(optimisticAddSubtask({ listId: data.listId, taskId: data.taskId, subtask: data.subtask }));
        }
        if (event === 'task_deleted' && data.taskId) {
          dispatch(optimisticDeleteTask(data.taskId));
        }

        // Replace temp items with real data from DB (atomic — single dispatch)
        if (event === 'task_replaced' && data.tempId && data.task) {
          dispatch(optimisticReplaceItem({ tempId: data.tempId, item: data.task }));
        }
        if (event === 'subtask_replaced' && data.tempId && data.subtask) {
          dispatch(optimisticReplaceItem({ tempId: data.tempId, item: data.subtask }));
        }
        if (event === 'section_replaced' && data.tempId && data.section) {
          dispatch(optimisticReplaceItem({ tempId: data.tempId, item: data.section }));
        }
        if (event === 'custom_field_replaced' && data.tempId && data.field) {
          // Handled by customFieldCallback
        }

        // Section CRUD
        if (event === 'section_added' && data.section) {
          dispatch(optimisticAddSection({ section: data.section }));
        }
        if (event === 'section_deleted' && data.listId) {
          dispatch({ type: 'board/deleteList/fulfilled', payload: data.listId });
        }

        // Task field updates
        if (event === 'task_completed' && data.taskId) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { status: data.status } }));
        }
        if (event === 'task_field_updated' && data.taskId && data.field) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { [data.field]: data.value } }));
        }
        if (event === 'task_assigned' && data.taskId && data.user) {
          dispatch(optimisticAssignUser({ taskId: data.taskId, user: data.user }));
        }

        // Drag-and-drop move from another user — apply instantly via the same
        // recursive reducer used by the local drag (handles all 5 move cases).
        if (event === 'task_moved' && data.taskId && data.destinationListId) {
          console.log('[socket recv] instant_change task_moved ←', data);
          dispatch(optimisticMoveTaskAnywhere({
            taskId: data.taskId,
            destListId: data.destinationListId,
            destParentId: data.parentId || null,
            destinationIndex: typeof data.position === 'number' ? data.position : 0,
          }));
        }

        // Custom fields
        if (event === 'custom_field_added' || event === 'custom_field_deleted' || event === 'custom_field_value_set' || event === 'custom_field_replaced') {
          customFieldCounterRef.current++;
          const evt = { ...data, _seq: customFieldCounterRef.current };
          setCustomFieldEvent(evt);
          customFieldCallbackRef.current?.(evt);
        }

        // Member operations
        if (event === 'member_added_instant' && data.member) {
          dispatch({ type: 'project/addProjectMember/fulfilled', payload: { projectId, member: data.member } });
        }
        if (event === 'member_removed_instant' && data.userId) {
          dispatch({ type: 'project/removeProjectMember/fulfilled', payload: { projectId, memberId: data.userId } });
        }
        if (event === 'member_role_changed_instant' && data.userId) {
          dispatch({ type: 'project/updateProjectMemberRole/fulfilled', payload: { projectId, member: { userId: data.userId, projectRole: data.projectRole } } });
        }

        // Timer / Time tracking
        if (event === 'timer_started' && data.taskId) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { timerStartedAt: data.startedAt, timerStartedBy: data.startedBy } }));
        }
        if (event === 'timer_stopped' && data.taskId) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { timerStartedAt: null, timerStartedBy: null, actualTime: data.totalMinutes || 0 } }));
        }
        if (event === 'time_entry_added' && data.taskId && data.totalMinutes !== undefined) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { actualTime: data.totalMinutes } }));
        }
        if (event === 'time_entry_deleted' && data.taskId && data.totalMinutes !== undefined) {
          dispatch(optimisticUpdateTask({ taskId: data.taskId, data: { actualTime: data.totalMinutes } }));
        }
      } catch (err) {
        console.error('Socket instant_change error:', err);
      }
    });

    // Pending items from other users
    socket.on('pending_item', (item) => {
      try {
        setPendingItems(prev => [...prev, { ...item, id: `remote-${Date.now()}-${Math.random()}` }]);
        safeTimeout(() => {
          setPendingItems(prev => prev.filter(p => !p.id.startsWith('remote-')));
        }, 3000);
      } catch {}
    });

    // Live edit from other users
    socket.on('live_edit', (data) => {
      try {
        if (!data?.entityType || !data?.entityId || data?.field === undefined) return;
        const key = `${data.entityType}-${data.entityId}-${data.field}`;

        setLiveEdits(prev => ({ ...prev, [key]: data.value }));

        if (data.entityType === 'task' && data.field === 'title') {
          dispatch(optimisticUpdateTask({ taskId: data.entityId, data: { title: data.value } }));
        }
        if (data.entityType === 'section' && data.field === 'name') {
          dispatch(optimisticRenameSection({ listId: data.entityId, name: data.value }));
        }

        safeTimeout(() => {
          setLiveEdits(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
        }, 3000);
      } catch {}
    });

    return () => {
      // Clean up ALL tracked timeouts
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (editLockTimerRef.current) clearTimeout(editLockTimerRef.current);

      socket.emit('leave_project', projectId);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [projectId, boardId, dispatch]);

  const setCustomFieldCallback = useCallback((cb) => { customFieldCallbackRef.current = cb; }, []);

  return {
    socket: socketRef.current, pendingItems, addPendingItem, clearPendingItems,
    liveEdits, emitLiveEdit, emitInstant, customFieldEvent, setCustomFieldCallback,
    acquireEditLock, releaseEditLock
  };
};
