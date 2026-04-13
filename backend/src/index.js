import express from 'express';
import cors from 'cors';
import config from './core/config/index.js';
import logger from './core/logger/index.js';
import { errorHandler } from './core/middlewares/errorHandler.js';
import { requestLogger } from './core/middlewares/requestLogger.js';

// Routes
import authRoutes from './modules/auth/authRoutes.js';
import userRoutes from './modules/users/userRoutes.js';
import workspaceRoutes from './modules/workspace/workspaceRoutes.js';
import projectRoutes from './modules/projects/projectRoutes.js';
import listRoutes from './modules/lists/listRoutes.js';
import taskRoutes from './modules/tasks/taskRoutes.js';
import commentRoutes from './modules/comments/commentRoutes.js';
import activityRoutes from './modules/activity/activityRoutes.js';
import inviteRoutes from './modules/invites/inviteRoutes.js';
import customFieldRoutes from './modules/customFields/customFieldRoutes.js';
import timeTrackingRoutes from './modules/timeTracking/timeTrackingRoutes.js';
import reportRoutes from './modules/reports/reportRoutes.js';

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.22:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Attach socket ID from request header to req object
app.use((req, res, next) => { req.socketId = req.headers['x-socket-id'] || null; next(); });
app.use(requestLogger);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/lists', listRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/activities', activityRoutes);
app.use('/api/v1/invites', inviteRoutes);
app.use('/api/v1/custom-fields', customFieldRoutes);
app.use('/api/v1/time-tracking', timeTrackingRoutes);
app.use('/api/v1/reports', reportRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

import http from 'http';
import { initSocket } from './core/socket.js';

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Start server
const { port } = config;

server.listen(port, '0.0.0.0', () => {
  logger.info(`Server running on 0.0.0.0:${port} in ${config.nodeEnv} mode`);
});

export default app;
