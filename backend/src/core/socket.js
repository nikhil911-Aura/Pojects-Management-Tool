import { Server } from 'socket.io';
import logger from './logger/index.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://192.168.1.26:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://192.168.1.26:5173'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join a project room
    socket.on('join_project', (projectId) => {
      socket.join(`project_${projectId}`);
    });

    socket.on('leave_project', (projectId) => {
      socket.leave(`project_${projectId}`);
    });

    // Join a workspace room
    socket.on('join_workspace', (workspaceId) => {
      socket.join(`workspace_${workspaceId}`);
    });

    socket.on('leave_workspace', (workspaceId) => {
      socket.leave(`workspace_${workspaceId}`);
    });

    // Broadcast pending items to other users in the same project
    socket.on('pending_item', (data) => {
      if (data?.projectId) {
        socket.to(`project_${data.projectId}`).emit('pending_item', data);
      }
    });

    // Live typing — broadcast character-by-character edits to other users
    socket.on('live_edit', (data) => {
      if (data?.projectId) {
        socket.to(`project_${data.projectId}`).emit('live_edit', data);
      }
    });

    // Instant structural changes — broadcast directly to other users (no API round-trip)
    socket.on('instant_change', (data) => {
      if (data?.projectId) {
        socket.to(`project_${data.projectId}`).emit('instant_change', data);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// ── Project-level events ──
// excludeSocketId: if provided, that socket won't receive the event (the sender)
export const emitToProject = (projectId, event, data, excludeSocketId) => {
  if (!io) return;
  if (excludeSocketId) {
    io.to(`project_${projectId}`).except(excludeSocketId).emit(event, data);
  } else {
    io.to(`project_${projectId}`).emit(event, data);
  }
};

// ── Workspace-level events ──
export const emitToWorkspace = (workspaceId, event, data, excludeSocketId) => {
  if (!io) return;
  if (excludeSocketId) {
    io.to(`workspace_${workspaceId}`).except(excludeSocketId).emit(event, data);
  } else {
    io.to(`workspace_${workspaceId}`).emit(event, data);
  }
};
