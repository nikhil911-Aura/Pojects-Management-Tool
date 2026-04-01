import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import { fetchLists } from '../store/slices/boardSlice';
import { fetchTask } from '../store/slices/taskSlice';

export const useSocket = (projectId, boardId) => {
  const dispatch = useAppDispatch();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!projectId) return;

    const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      timeout: 5000,
      // Suppress connection errors from the console — backend may not be running
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_project', projectId);
    });

    socket.on('connect_error', () => {
      // Silently swallow — backend may not be running in dev
    });

    socket.on('task_created', () => {
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

    return () => {
      socket.emit('leave_project', projectId);
      socket.off('connect');
      socket.off('connect_error');
      socket.off('task_created');
      socket.off('task_updated');
      socket.off('task_deleted');
      socket.off('task_moved');
      socket.disconnect();
    };
  }, [projectId, boardId, dispatch]);

  return socketRef.current;
};
