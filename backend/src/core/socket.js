import { Server } from 'socket.io';
import logger from './logger/index.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173', // Common Vite default
        'http://127.0.0.1:5173'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('join_project', (projectId) => {
      socket.join(`project_${projectId}`);
      logger.info(`User ${socket.id} joined project_${projectId}`);
    });

    socket.on('leave_project', (projectId) => {
      socket.leave(`project_${projectId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitToProject = (projectId, event, data) => {
  if (io) {
    io.to(`project_${projectId}`).emit(event, data);
  }
};
