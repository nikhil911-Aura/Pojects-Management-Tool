import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import { fetchLists } from '../store/slices/boardSlice';
import { fetchTask } from '../store/slices/taskSlice';

export const useSocket = (projectId, boardId) => {
  const dispatch = useAppDispatch();
  const socketRef = useRef(null);
  const [pendingItems, setPendingItems] = useState([]);
  // pendingItems: [{ id, type: 'task'|'subtask'|'section', listId?, taskId?, title }]

  const addPendingItem = useCallback((item) => {
    setPendingItems(prev => [...prev, { ...item, id: `pending-${Date.now()}-${Math.random()}` }]);
    // Emit to other users
    if (socketRef.current?.connected) {
      socketRef.current.emit('pending_item', { projectId, ...item });
    }
  }, [projectId]);

  const clearPendingItems = useCallback(() => {
    setPendingItems([]);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 3000,
      timeout: 5000,
      transports: ['polling', 'websocket'],
      upgrade: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_project', projectId);
    });

    socket.on('connect_error', () => {});

    socket.on('task_created', () => {
      setPendingItems([]);
      if (boardId) dispatch(fetchLists(boardId));
    });

    socket.on('task_updated', ({ taskId }) => {
      if (taskId) dispatch(fetchTask(taskId));
      if (boardId) dispatch(fetchLists(boardId));
    });

    socket.on('task_deleted', () => {
      if (boardId) dispatch(fetchLists(boardId));
    });

    socket.on('task_moved', () => {
      if (boardId) dispatch(fetchLists(boardId));
    });

    // Receive pending items from other users
    socket.on('pending_item', (item) => {
      setPendingItems(prev => [...prev, { ...item, id: `remote-${Date.now()}-${Math.random()}` }]);
      // Auto-clear after 3s (real data will arrive via task_created)
      setTimeout(() => {
        setPendingItems(prev => prev.filter(p => !p.id.startsWith('remote-')));
      }, 3000);
    });

    return () => {
      socket.emit('leave_project', projectId);
      socket.off('connect');
      socket.off('connect_error');
      socket.off('task_created');
      socket.off('task_updated');
      socket.off('task_deleted');
      socket.off('task_moved');
      socket.off('pending_item');
      socket.disconnect();
    };
  }, [projectId, boardId, dispatch]);

  return { socket: socketRef.current, pendingItems, addPendingItem, clearPendingItems };
};
